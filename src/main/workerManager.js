import { Worker } from 'worker_threads'
import { join }   from 'path'
import { stat }   from 'fs/promises'
import { storeBlob }                                         from './vorn/store.js'
import { releaseLock }                                       from './vorn/lockFile.js'
import { setTaskCancelFn, updateTaskProgress }               from './vorn/taskManager.js'
import { logger }                                            from './vorn/logger.js'
import { dbGetFile, dbUpsertFileMany, dbPruneOrphans }       from './vorn/db.js'

export const ctx = {
  activeWorkers: new Map(), // taskId → { worker, cancelFlag }
  activeStore:   null,
  storeWatcher:  null,
  appClosing:    false,
}

function _send(mainWindow, channel, payload) {
  if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

// ── Store health poller ───────────────────────────────────────────────────────

export function startStoreWatch(mainWindow) {
  if (ctx.storeWatcher !== null) {
    logger.warn('startStoreWatch: watcher già attivo, stop forzato')
  }
  stopStoreWatch()
  ctx.storeWatcher = setInterval(() => {
    if (ctx.appClosing || !ctx.activeStore) return stopStoreWatch()
    stat(ctx.activeStore).catch(e => { logger.warn(`Store health check failed (${e.code ?? e.message})`); triggerDisconnect(mainWindow) })
  }, 1000)
}

export function stopStoreWatch() {
  if (ctx.storeWatcher) { clearInterval(ctx.storeWatcher); ctx.storeWatcher = null }
}

export function triggerDisconnect(mainWindow) {
  if (!ctx.activeStore) return
  logger.warn(`Store disconnected: ${ctx.activeStore}`)
  stopStoreWatch()
  for (const { worker, cancelFlag } of ctx.activeWorkers.values()) {
    Atomics.store(cancelFlag, 0, 1)
    worker.postMessage({ type: 'store-disconnected' }) // cancella subito le store-request pending
    setTimeout(() => { worker.terminate().catch(() => { /* già morto */ }) }, 5000)
  }
  ctx.activeWorkers.clear()
  releaseLock(ctx.activeStore)
  ctx.activeStore = null
  _send(mainWindow, 'vorn:store-disconnected', undefined)
}

// ── Worker spawn ──────────────────────────────────────────────────────────────

export function spawnWorker(workerFile, workerData, taskId, mainWindow, onDone) {
  const cancelBuffer = new SharedArrayBuffer(4)
  const cancelFlag   = new Int32Array(cancelBuffer)

  const worker = new Worker(join(__dirname, workerFile), {
    workerData: { ...workerData, cancelBuffer }
  })

  ctx.activeWorkers.set(taskId, { worker, cancelFlag })

  // Guard: onDone può scattare una sola volta per worker indipendentemente
  // da quanti eventi (done + error, store-disconnected + error, ecc.) arrivino.
  let _settled      = false
  let _lastProgress = null
  let _storeAc      = null
  function _settle(result, error) {
    if (_settled) return
    _settled = true
    onDone(result, error)
  }

  worker.on('message', (msg) => {
    const { type } = msg
    if (type === 'store-request') {
      const { id, hashVorn, bytes, filePath, sessionId, sessionName, relPath, compressionType, compTmpPath, compressedHash, strategy } = msg
      if (!ctx.activeStore) {
        worker.postMessage({ type: 'store-result', id, error: 'ERR_STORE_DISCONNECTED' })
        return
      }
      const ac = new AbortController()
      _storeAc = ac
      storeBlob({
        storeDir:       ctx.activeStore,
        hashVorn,
        bytes,
        sourcePath:     filePath,
        sessionId,
        sessionName,
        relPath,
        compressionType,
        compTmpPath,
        compressedHash,
        signal:         ac.signal,
        strategy,
      })
        .then(outcome => worker.postMessage({ type: 'store-result', id, outcome }))
        .catch(err    => worker.postMessage({ type: 'store-result', id, error: err.message, code: err.code }))
        .finally(() => { if (_storeAc === ac) _storeAc = null })
    } else if (type === 'db-request') {
      // Tutte le op DB transitano qui: una sola connessione better-sqlite3 viva,
      // serializzata sull'event-loop del main. Elimina il "known concern" su
      // workers che aprivano ciascuno la propria connessione (rischio SQLITE_BUSY
      // e upsert persi al force-terminate).
      const { id, op, args } = msg
      try {
        let result
        if      (op === 'get')          result = dbGetFile(args.path)
        else if (op === 'upsertMany')   result = (dbUpsertFileMany(args.records), null)
        else if (op === 'pruneOrphans') result = dbPruneOrphans()
        else                            throw new Error('ERR_UNKNOWN_DB_OP')
        worker.postMessage({ type: 'db-result', id, result })
      } catch (err) {
        worker.postMessage({ type: 'db-result', id, error: err.message, code: err.code })
      }
    } else if (type === 'progress') {
      _lastProgress = msg.progress
      updateTaskProgress(taskId, msg.progress)
      _send(mainWindow, 'vorn:task-progress', { taskId, ...msg.progress })
    } else if (type === 'done') {
      if (_cancelTimer) { clearTimeout(_cancelTimer); _cancelTimer = null }
      ctx.activeWorkers.delete(taskId)
      _settle(msg.result, null)
    } else if (type === 'error') {
      ctx.activeWorkers.delete(taskId)
      _settle(null, msg.error)
    } else if (type === 'log') {
      const level = msg.level === 'warn' ? 'warn' : msg.level === 'error' ? 'error' : 'info'
      logger[level](`[worker:${taskId}] ${msg.message}`)
    } else if (type === 'store-disconnected') {
      _settle(null, 'ERR_STORE_UNREACHABLE')
      triggerDisconnect(mainWindow)
    }
  })

  worker.on('error', (err) => {
    logger.error(`Worker [${taskId}] uncaught error: ${err.message}`)
    ctx.activeWorkers.delete(taskId)
    _settle(null, err.message)
  })

  // Se il worker esce senza aver mandato done/error (crash o exit inatteso),
  // risolve il task per non lasciarlo bloccato in stato running.
  // Nota: il force-terminate da cancel timer risolve già il task PRIMA di
  // chiamare terminate(), quindi qui _settled è tipicamente già true.
  let _cancelTimer = null
  worker.on('exit', (code) => {
    if (_cancelTimer) { clearTimeout(_cancelTimer); _cancelTimer = null }
    ctx.activeWorkers.delete(taskId)
    if (!_settled) {
      if (Atomics.load(cancelFlag, 0) !== 0) {
        _settle({
          status:      'cancelled',
          total:        _lastProgress?.total        ?? 0,
          ok:           _lastProgress?.ok           ?? 0,
          errors:       Array.isArray(_lastProgress?.errors) ? _lastProgress.errors : [],
          orphanCount:  _lastProgress?.orphanCount  ?? 0,
          deleted:      _lastProgress?.deleted      ?? 0,
          failed:       _lastProgress?.failed       ?? 0,
        }, null)
      } else {
        logger.warn(`Worker [${taskId}] exited unexpectedly (code ${code})`)
        _settle(null, 'ERR_WORKER_CRASHED')
      }
    }
  })

  setTaskCancelFn(taskId, () => {
    Atomics.store(cancelFlag, 0, 1)
    _storeAc?.abort()
    // Se il worker non risponde entro 8s dal cancel (es. I/O bloccata su USB/rete),
    // risolve subito il task come 'cancelled' per sbloccare la UI, poi tenta il
    // terminate. Su Windows il thread potrebbe restare in un kernel-wait finché
    // l'I/O non completa — l'exit handler non scatterebbe mai, lasciando la
    // modal bloccata in "Stopping…" indefinitamente.
    _cancelTimer = setTimeout(() => {
      const entry = ctx.activeWorkers.get(taskId)
      if (entry) {
        logger.warn(`Worker [${taskId}] force-terminated: non ha risposto al cancel entro 8s`)
        ctx.activeWorkers.delete(taskId)
        // Sblocca la UI immediatamente, indipendentemente dall'exit del worker.
        _settle({
          status:      'cancelled',
          total:        _lastProgress?.total        ?? 0,
          ok:           _lastProgress?.ok           ?? 0,
          errors:       Array.isArray(_lastProgress?.errors) ? _lastProgress.errors : [],
          orphanCount:  _lastProgress?.orphanCount  ?? 0,
          deleted:      _lastProgress?.deleted      ?? 0,
          failed:       _lastProgress?.failed       ?? 0,
        }, null)
        entry.worker.terminate().catch(() => { /* già morto */ })
      }
    }, 8000)
  })
}
