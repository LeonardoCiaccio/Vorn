import { statSync, existsSync } from 'fs'
import { basename, relative, join } from 'path'
import { vornHash } from './hash.js'
import { storeBlob, toStoreKey } from './store.js'
import { getSession, saveRun, loadRun } from './sessions.js'
import { walk, matchPattern } from './scanner.js'
import { dbGetFile, dbUpsertFile, dbPruneOrphans } from './db.js'
import { SAVE_INTERVAL_FILES, SAVE_INTERVAL_MS } from './constants.js'

export async function backup(storeDir, sessionName, opts = {}) {
  const { onProgress, isCancelled, resumeTs, runTs, storeFn } = opts
  const _storeBlob = storeFn ?? storeBlob

  const session = getSession(storeDir, sessionName)
  if (!session) throw new Error(`Sessione non trovata: ${sessionName}`)

  const compressionType = session.compressionType ?? null
  const sources  = session.sources ?? []
  const excPaths = session.excludes?.paths    ?? []
  const excPats  = session.excludes?.patterns ?? []

  const allFiles    = []
  const scanErrors  = []
  for (const src of sources) {
    try {
      const st = statSync(src)
      if (st.isFile()) {
        if (!excPaths.some(p => src === p) && !excPats.some(pat => matchPattern(basename(src), pat)))
          allFiles.push(src)
      } else {
        walk(src, excPaths, excPats, allFiles)
      }
    } catch (e) { scanErrors.push({ path: src, error: e.code ?? e.message, phase: 'scan' }) }
  }

  const total     = allFiles.length
  const startTime = Date.now()

  let run
  let alreadyDone = new Set()
  if (resumeTs) {
    try {
      run = loadRun(storeDir, sessionName, resumeTs)
      alreadyDone = new Set(Object.keys(run.files ?? {}))
    } catch { /* run non trovato: parte da zero */ }
  }
  if (!run) {
    run = { ts: runTs ?? new Date().toISOString(), status: 'running', files: {} }
  } else {
    run.status = 'running'
  }
  saveRun(storeDir, sessionName, run)

  const prevDurationSec = run.duration_sec ?? 0

  let filesNew   = run.files_new   ?? 0
  let filesDedup = run.files_dedup ?? 0
  let bytesTotal = run.bytes_total ?? 0
  let bytesNew   = run.bytes_new   ?? 0
  const errors   = [...(run.errors ?? []), ...scanErrors]
  let current    = alreadyDone.size

  let lastSaveCount = current
  let lastSaveTime  = Date.now()

  for (let i = 0; i < allFiles.length; i++) {
    if (isCancelled?.()) break

    const filePath = allFiles[i]
    const source = sources.find(s => filePath === s || filePath.startsWith(s + '\\') || filePath.startsWith(s + '/'))
    if (!source) { errors.push({ path: filePath, error: 'Sorgente non trovata per il file', phase: 'scan' }); continue }
    const relPath  = filePath === source ? basename(filePath) : relative(source, filePath).replace(/\\/g, '/')

    if (alreadyDone.has(relPath)) continue

    current++

    let stat
    try { stat = statSync(filePath) }
    catch (e) { errors.push({ path: filePath, error: e.code ?? e.message, phase: 'stat' }); continue }

    const bytes = stat.size
    const mtime = stat.mtimeMs

    // Controllo DB: se mtime e size coincidono, conosciamo già l'hash
    let hashVorn
    const dbRecord = dbGetFile(filePath)
    if (dbRecord && dbRecord.mtime === mtime && dbRecord.size === bytes) {
      // File invariato — verifica che il .vorn esista ancora nello store.
      // Controlla prima la chiave compressa della sessione corrente, poi quella non compressa.
      const storeKey   = toStoreKey(dbRecord.hash, compressionType)
      const vornExists = existsSync(join(storeDir, storeKey + '.vorn'))
      if (vornExists) {
        // Dedup completo: nessun hashing, nessuna lettura del file
        filesDedup++
        bytesTotal += bytes
        run.files[relPath] = storeKey
        onProgress?.({ current, total, files_new: filesNew, files_dedup: filesDedup, errors: errors.length, file: filePath, bytes_total: bytesTotal, bytes_new: bytesNew })
        if (current - lastSaveCount >= SAVE_INTERVAL_FILES || Date.now() - lastSaveTime >= SAVE_INTERVAL_MS) {
          run.files_new = filesNew; run.files_dedup = filesDedup; run.bytes_total = bytesTotal; run.bytes_new = bytesNew; run.errors = errors
          saveRun(storeDir, sessionName, run)
          lastSaveCount = current; lastSaveTime = Date.now()
        }
        continue
      }
      // .vorn mancante: usiamo l'hash già noto, saltiamo solo l'hashing
      hashVorn = dbRecord.hash
    }

    // Hash necessario: file nuovo, modificato, o .vorn mancante con hash sconosciuto
    if (!hashVorn) {
      try { hashVorn = vornHash(filePath) }
      catch (e) { errors.push({ path: filePath, error: e.code ?? e.message, phase: 'hash' }); continue }
    }

    bytesTotal += bytes

    try {
      const { outcome, storeKey } = await _storeBlob(storeDir, hashVorn, bytes, filePath, session.id, session.name, relPath, compressionType)
      if (outcome === 'new') { filesNew++; bytesNew += bytes }
      else                   { filesDedup++ }
      run.files[relPath] = storeKey
      dbUpsertFile(filePath, mtime, bytes, hashVorn)
    } catch (e) {
      if (e.code === 'ENOSPC') {
        run.status      = 'error'
        run.files_new   = filesNew
        run.files_dedup = filesDedup
        run.bytes_total = bytesTotal
        run.bytes_new   = bytesNew
        run.errors      = [...errors, { path: filePath, error: e.code, phase: 'store' }]
        saveRun(storeDir, sessionName, run)
        throw e
      }
      errors.push({ path: filePath, error: e.code ?? e.message, phase: 'store' })
    }

    onProgress?.({
      current,
      total,
      files_new:   filesNew,
      files_dedup: filesDedup,
      errors:      errors.length,
      file:        filePath,
      bytes_total: bytesTotal,
      bytes_new:   bytesNew,
    })

    // Salvataggio intermedio periodico
    if (current - lastSaveCount >= SAVE_INTERVAL_FILES || Date.now() - lastSaveTime >= SAVE_INTERVAL_MS) {
      run.files_new    = filesNew
      run.files_dedup  = filesDedup
      run.bytes_total  = bytesTotal
      run.bytes_new    = bytesNew
      run.errors       = errors
      saveRun(storeDir, sessionName, run)
      lastSaveCount = current
      lastSaveTime  = Date.now()
    }
  }

  run.status       = isCancelled?.() ? 'paused' : 'done'
  run.duration_sec = prevDurationSec + Math.round((Date.now() - startTime) / 1000)
  run.files_total  = total
  run.files_new    = filesNew
  run.files_dedup  = filesDedup
  run.bytes_total  = bytesTotal
  run.bytes_new    = bytesNew
  run.errors       = errors
  saveRun(storeDir, sessionName, run)

  if (run.status === 'done') dbPruneOrphans()

  return { status: run.status, ts: run.ts, files_total: total, filesNew, filesDedup, errors }
}
