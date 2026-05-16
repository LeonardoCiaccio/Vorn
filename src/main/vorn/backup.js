import { join, basename } from 'path'
import { tmpdir } from 'os'
import { vornHash } from './hash.js'
import { storeBlob, toStoreKey, findExistingVornKey } from './store.js'
import { getSession, saveRun, loadRun } from './sessions.js'
import { walk, matchPattern } from './scanner.js'
import { dbGetFile, dbUpsertFileMany, dbPruneOrphans } from './db.js'
import { safeStatSync, safeExistsSync } from './safeFs.js'
import { SAVE_INTERVAL_FILES, SAVE_INTERVAL_MS, CHUNK_THRESHOLD_BYTES } from './constants.js'
import { compressToTemp, cleanupTemp } from './compress.js'

export async function backup(storeDir, sessionName, opts = {}) {
  const { onProgress, isCancelled, resumeTs, runTs, storeFn, dbGetFileFn, dbUpsertManyFn, dbPruneOrphansFn } = opts
  const _storeBlob        = storeFn          ?? storeBlob
  // Le funzioni DB possono essere iniettate dal worker (via IPC al main) o usate
  // direttamente come fallback in chiamate dirette dal main process. `await` su
  // valore sync è no-op, quindi entrambi gli stili convivono nello stesso loop.
  const _dbGetFile        = dbGetFileFn      ?? dbGetFile
  const _dbUpsertMany     = dbUpsertManyFn   ?? dbUpsertFileMany
  const _dbPruneOrphans   = dbPruneOrphansFn ?? dbPruneOrphans

  const session = getSession(storeDir, sessionName)
  if (!session) throw new Error('ERR_SESSION_NOT_FOUND')

  const compressionType = session.compressionType ?? null
  const strategy        = session.strategy        ?? null
  const sources  = session.sources ?? []
  const excPaths = session.excludes?.paths    ?? []
  const excPats  = session.excludes?.patterns ?? []

  const allFiles    = []
  const scanErrors  = []
  for (const src of sources) {
    try {
      const st = safeStatSync(src)
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
      if (run.compressionType !== undefined && run.compressionType !== compressionType) {
        throw new Error('ERR_COMPRESSION_TYPE_CHANGED')
      }
      alreadyDone = new Set(Object.keys(run.files ?? {}))
    } catch (e) {
      if (e.message === 'ERR_COMPRESSION_TYPE_CHANGED') throw e
      /* run non trovato: parte da zero */
    }
  }
  if (!run) {
    run = { ts: runTs ?? new Date().toISOString(), status: 'running', files: {}, compressionType: compressionType ?? null }
  } else {
    run.status = 'running'
  }
  saveRun(storeDir, sessionName, run)

  const prevDurationSec = run.duration_sec ?? 0

  let filesNew    = run.files_new    ?? 0
  let filesDedup  = run.files_dedup  ?? 0
  let bytesTotal  = run.bytes_total  ?? 0
  let bytesNew    = run.bytes_new    ?? 0
  let chunksNew   = run.chunks_new   ?? 0
  let chunksDedup = run.chunks_dedup ?? 0
  // Dedup degli scan-error sul resume: una sorgente unreadable produce lo stesso
  // errore a ogni tentativo. Senza dedup, run.errors cresce indefinitamente e
  // appesantisce sia il JSON che la UI. La chiave (path|error|phase) preserva
  // errori distinti per la stessa sorgente (es. EACCES vs ENOENT).
  const _errors = [...(run.errors ?? []), ...scanErrors]
  const _seenErr = new Set()
  const errors = []
  for (const e of _errors) {
    const key = `${e.path ?? ''}|${e.error ?? ''}|${e.phase ?? ''}`
    if (_seenErr.has(key)) continue
    _seenErr.add(key)
    errors.push(e)
  }
  let current    = alreadyDone.size

  let lastSaveCount  = current
  let lastSaveTime   = Date.now()
  let pendingUpserts = []
  let lastError      = null

  for (let i = 0; i < allFiles.length; i++) {
    if (isCancelled?.()) break

    const filePath = allFiles[i]
    const source = sources.find(s => filePath === s || filePath.startsWith(s + '\\') || filePath.startsWith(s + '/'))
    if (!source) { errors.push({ path: filePath, error: 'Sorgente non trovata per il file', phase: 'scan' }); continue }
    const relPath  = filePath.replace(/\\/g, '/')

    if (alreadyDone.has(relPath)) continue

    current++

    let stat
    try { stat = safeStatSync(filePath) }
    catch (e) { lastError = { path: filePath, error: e.code ?? e.message, phase: 'stat' }; errors.push(lastError); continue }

    const bytes = stat.size
    const mtime = stat.mtimeMs

    // Controllo DB: se mtime e size coincidono, conosciamo già l'hash
    let hashVorn
    const dbRecord = await _dbGetFile(filePath)
    if (dbRecord && dbRecord.mtime === mtime && dbRecord.size === bytes) {
      // Hash già noto: salta l'hashing del file.
      // Non fare continue anche se il .vorn esiste: storeBlob deve aggiornare i record
      // nel caso in cui relPath non sia ancora registrata (es. stesso contenuto in più sorgenti).
      hashVorn = dbRecord.hash
    }

    // Hash necessario: file nuovo, modificato, o .vorn mancante con hash sconosciuto
    if (!hashVorn) {
      try {
        hashVorn = vornHash(filePath, isCancelled, (bytesHashed) => {
          onProgress?.({ current, total, files_new: filesNew, files_dedup: filesDedup, errors: errors.length, last_error: lastError, file: filePath, bytes_total: bytesTotal, bytes_new: bytesNew, bytes_hashing: bytesHashed, bytes_hashing_total: bytes })
        })
      }
      catch (e) { lastError = { path: filePath, error: e.code ?? e.message, phase: 'hash' }; errors.push(lastError); continue }
      if (hashVorn === null) break // cancellato durante l'hashing
    }

    // Compressione nel worker (prima del store-request) per non bloccare il Main Process.
    // Per i chunked la compressione avviene per-chunk dentro storeChunked, MA solo se il file
    // supera la soglia. File piccoli con strategy='chunks' cadono nel path blob in _createNew:
    // comprimiamo in anticipo se compressionType è impostato E il file è sotto soglia.
    let compTmpPath    = null
    let compressedHash = null
    const willBeChunked = strategy === 'chunks' && bytes >= CHUNK_THRESHOLD_BYTES
    if (compressionType && !willBeChunked) {
      const storeKey   = toStoreKey(hashVorn, compressionType)
      // Salta la pre-compressione se esiste GIÀ un .vorn equivalente per questo
      // hashVorn sotto QUALSIASI compressionType conosciuto: storeBlob fa dedup
      // cross-strategy e riuserebbe il file esistente comunque. Senza questo
      // check, una sessione zstd su uno store già contenente hash_gzip.vorn
      // sprecherebbe CPU comprimendo per niente, solo per poi scartare il .ctmp.
      const vornExists = findExistingVornKey(storeDir, hashVorn, compressionType) !== null
      if (!vornExists) {
        compTmpPath = join(tmpdir(), 'vorn_' + storeKey + '.ctmp')
        try {
          onProgress?.({ current, total, files_new: filesNew, files_dedup: filesDedup, errors: errors.length, last_error: lastError, file: filePath, bytes_total: bytesTotal, bytes_new: bytesNew, compressing: true })
          const compressedSize = await compressToTemp(filePath, compTmpPath, compressionType, (bytesCompressed) => {
            onProgress?.({ current, total, files_new: filesNew, files_dedup: filesDedup, errors: errors.length, last_error: lastError, file: filePath, bytes_total: bytesTotal, bytes_new: bytesNew, bytes_compressing: bytesCompressed, bytes_compressing_total: bytes })
          }, isCancelled)
          if (compressedSize === null || isCancelled?.()) { cleanupTemp(compTmpPath); break }
          compressedHash = vornHash(compTmpPath, isCancelled, (bytesHashed) => {
            onProgress?.({ current, total, files_new: filesNew, files_dedup: filesDedup, errors: errors.length, last_error: lastError, file: filePath, bytes_total: bytesTotal, bytes_new: bytesNew, bytes_hashing: bytesHashed, bytes_hashing_total: compressedSize })
          })
          if (compressedHash === null) { cleanupTemp(compTmpPath); break }
        } catch (e) {
          cleanupTemp(compTmpPath); compTmpPath = null
          lastError = { path: filePath, error: e.code ?? e.message, phase: 'compress' }; errors.push(lastError); continue
        }
      }
    }

    onProgress?.({ current, total, files_new: filesNew, files_dedup: filesDedup, errors: errors.length, last_error: lastError, file: filePath, bytes_total: bytesTotal, bytes_new: bytesNew, storing: true })

    bytesTotal += bytes

    try {
      const { outcome, storeKey, chunks_new: cn, chunks_dedup: cd } = await _storeBlob({
        storeDir,
        hashVorn,
        bytes,
        sourcePath:    filePath,
        sessionId:     session.id,
        sessionName:   session.name,
        relPath,
        compressionType,
        compTmpPath,
        compressedHash,
        signal:        null,
        strategy,
      })
      run.files[relPath] = storeKey
      pendingUpserts.push({ path: filePath, mtime, size: bytes, hash: hashVorn })
      if (isCancelled?.()) { cleanupTemp(compTmpPath); break }
      if (outcome === 'new') { filesNew++; bytesNew += bytes } else { filesDedup++ }
      if (cn != null) { chunksNew += cn; chunksDedup += cd }
    } catch (e) {
      cleanupTemp(compTmpPath)
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
      lastError = { path: filePath, error: e.code ?? e.message, phase: 'store' }; errors.push(lastError)
    } finally {
      cleanupTemp(compTmpPath)
    }

    onProgress?.({
      current,
      total,
      files_new:    filesNew,
      files_dedup:  filesDedup,
      chunks_new:   chunksNew,
      chunks_dedup: chunksDedup,
      errors:       errors.length,
      last_error:   lastError,
      file:         filePath,
      bytes_total:  bytesTotal,
      bytes_new:    bytesNew,
    })

    // Salvataggio intermedio periodico
    if (current - lastSaveCount >= SAVE_INTERVAL_FILES || Date.now() - lastSaveTime >= SAVE_INTERVAL_MS) {
      await _dbUpsertMany(pendingUpserts)
      pendingUpserts = []
      run.files_new    = filesNew
      run.files_dedup  = filesDedup
      run.chunks_new   = chunksNew
      run.chunks_dedup = chunksDedup
      run.bytes_total  = bytesTotal
      run.bytes_new    = bytesNew
      run.errors       = errors
      saveRun(storeDir, sessionName, run)
      lastSaveCount = current
      lastSaveTime  = Date.now()
    }
  }

  await _dbUpsertMany(pendingUpserts)

  run.status       = isCancelled?.() ? 'paused' : 'done'
  run.duration_sec = prevDurationSec + Math.round((Date.now() - startTime) / 1000)
  run.files_total  = total
  run.files_new    = filesNew
  run.files_dedup  = filesDedup
  run.chunks_new   = chunksNew || undefined
  run.chunks_dedup = chunksDedup || undefined
  run.bytes_total  = bytesTotal
  run.bytes_new    = bytesNew
  run.errors       = errors
  saveRun(storeDir, sessionName, run)

  if (run.status === 'done') await _dbPruneOrphans()

  return { status: run.status, ts: run.ts, files_total: total, filesNew, filesDedup, errors }
}
