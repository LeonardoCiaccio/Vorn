import { statSync } from 'fs'
import { basename, relative } from 'path'
import { vornHash } from './hash.js'
import { storeBlob } from './store.js'
import { getSession, saveRun, loadRun } from './sessions.js'
import { walk, matchPattern } from './scanner.js'

export async function backup(storeDir, sessionName, opts = {}) {
  const { onProgress, isCancelled, resumeTs, storeFn } = opts
  const _storeBlob = storeFn ?? storeBlob

  const session = getSession(storeDir, sessionName)
  if (!session) throw new Error(`Sessione non trovata: ${sessionName}`)

  const sources  = session.sources ?? []
  const excPaths = session.excludes?.paths    ?? []
  const excPats  = session.excludes?.patterns ?? []

  const allFiles = []
  for (const src of sources) {
    try {
      const st = statSync(src)
      if (st.isFile()) {
        if (!excPaths.some(p => src === p) && !excPats.some(pat => matchPattern(basename(src), pat)))
          allFiles.push(src)
      } else {
        walk(src, excPaths, excPats, allFiles)
      }
    } catch (e) { /* sorgente non accessibile */ }
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
    run = { ts: new Date().toISOString(), status: 'running', files: {} }
  } else {
    run.status = 'running'
  }
  saveRun(storeDir, sessionName, run)

  const prevDurationSec = run.duration_sec ?? 0

  let filesNew   = run.files_new   ?? 0
  let filesDedup = run.files_dedup ?? 0
  let bytesTotal = run.bytes_total ?? 0
  let bytesNew   = run.bytes_new   ?? 0
  const errors   = [...(run.errors ?? [])]
  let current    = alreadyDone.size

  let lastSaveCount = current
  let lastSaveTime  = Date.now()
  const SAVE_INTERVAL_FILES = 500
  const SAVE_INTERVAL_MS    = 60_000

  for (let i = 0; i < allFiles.length; i++) {
    if (isCancelled?.()) break

    const filePath = allFiles[i]
    const source   = sources.find(s => filePath === s || filePath.startsWith(s + '\\') || filePath.startsWith(s + '/')) ?? sources[0]
    const relPath  = filePath === source ? basename(filePath) : relative(source, filePath).replace(/\\/g, '/')

    if (alreadyDone.has(relPath)) continue

    current++

    let stat
    try { stat = statSync(filePath) }
    catch (e) { errors.push({ path: filePath, error: e.code ?? e.message }); continue }

    let hashVorn
    try { hashVorn = vornHash(filePath) }
    catch (e) { errors.push({ path: filePath, error: e.code ?? e.message }); continue }

    const bytes = stat.size
    bytesTotal += bytes

    try {
      const outcome = await _storeBlob(storeDir, hashVorn, bytes, filePath, session.id, session.name, relPath)
      if (outcome === 'new') { filesNew++; bytesNew += bytes }
      else                   { filesDedup++ }
      run.files[relPath] = hashVorn
    } catch (e) {
      errors.push({ path: filePath, error: e.code ?? e.message })
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

  return { status: run.status, ts: run.ts, files_total: total, filesNew, filesDedup, errors }
}
