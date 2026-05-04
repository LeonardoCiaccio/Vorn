import { Worker } from 'worker_threads'
import { join }   from 'path'
import { statSync } from 'fs'
import { storeBlob }                                         from './vorn/store.js'
import { releaseLock }                                       from './vorn/lockFile.js'
import { setTaskCancelFn, updateTaskProgress }               from './vorn/taskManager.js'

export const ctx = {
  activeWorkers: new Map(), // taskId → { worker, cancelFlag }
  activeStore:   null,
  storeWatcher:  null,
}

function _send(mainWindow, channel, payload) {
  if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

// ── Store health poller ───────────────────────────────────────────────────────

export function startStoreWatch(mainWindow) {
  stopStoreWatch()
  ctx.storeWatcher = setInterval(() => {
    if (!ctx.activeStore) return stopStoreWatch()
    try { statSync(ctx.activeStore) }
    catch { triggerDisconnect(mainWindow) }
  }, 2000)
}

export function stopStoreWatch() {
  if (ctx.storeWatcher) { clearInterval(ctx.storeWatcher); ctx.storeWatcher = null }
}

export function triggerDisconnect(mainWindow) {
  if (!ctx.activeStore) return
  stopStoreWatch()
  for (const { worker, cancelFlag } of ctx.activeWorkers.values()) {
    Atomics.store(cancelFlag, 0, 1)
    setTimeout(() => worker.terminate(), 5000) // terminate forzata se non risponde al cancel
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
  let _settled = false
  function _settle(result, error) {
    if (_settled) return
    _settled = true
    onDone(result, error)
  }

  worker.on('message', (msg) => {
    const { type } = msg
    if (type === 'store-request') {
      const { id, hashVorn, bytes, filePath, sessionId, sessionName, relPath } = msg
      storeBlob(ctx.activeStore, hashVorn, bytes, filePath, sessionId, sessionName, relPath)
        .then(outcome => worker.postMessage({ type: 'store-result', id, outcome }))
        .catch(err    => worker.postMessage({ type: 'store-result', id, error: err.message }))
    } else if (type === 'progress') {
      updateTaskProgress(taskId, msg.progress)
      _send(mainWindow, 'vorn:task-progress', { taskId, ...msg.progress })
    } else if (type === 'done') {
      ctx.activeWorkers.delete(taskId)
      _settle(msg.result, null)
    } else if (type === 'error') {
      ctx.activeWorkers.delete(taskId)
      _settle(null, msg.error)
    } else if (type === 'store-disconnected') {
      _settle(null, 'Store non raggiungibile')
      triggerDisconnect(mainWindow)
    }
  })

  worker.on('error', (err) => {
    ctx.activeWorkers.delete(taskId)
    _settle(null, err.message)
  })

  setTaskCancelFn(taskId, () => Atomics.store(cancelFlag, 0, 1))
}
