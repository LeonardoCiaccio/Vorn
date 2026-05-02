import { statSync, readdirSync, mkdirSync, createWriteStream } from 'fs'
import { join, relative, basename } from 'path'
import { vornHash } from './hash.js'
import { storeBlob, extractContent } from './store.js'
import { getSession, saveRun, loadRun } from './sessions.js'

// ── Walk ──────────────────────────────────────────────────────────────────────

function walk(dir, excludePaths = [], excludePatterns = [], _results = []) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (excludePaths.some(p => full === p || full.startsWith(p + '\\') || full.startsWith(p + '/'))) continue
      if (excludePatterns.some(pat => _matchPattern(entry.name, pat))) continue
      if (entry.isDirectory()) walk(full, excludePaths, excludePatterns, _results)
      else if (entry.isFile()) _results.push(full)
    }
  } catch (_) { /* skip unreadable dirs */ }
  return _results
}

function _matchPattern(name, pattern) {
  const pat = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern
  const re = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i')
  return re.test(name)
}

// ── Backup ────────────────────────────────────────────────────────────────────

export async function backup(storeDir, sessionName, opts = {}) {
  const { onProgress, isCancelled, resumeTs } = opts

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
        if (!excPaths.some(p => src === p) && !excPats.some(pat => _matchPattern(basename(src), pat)))
          allFiles.push(src)
      } else {
        walk(src, excPaths, excPats, allFiles)
      }
    } catch (e) { /* sorgente non accessibile */ }
  }
  const total     = allFiles.length
  const startTime = Date.now()

  // Carica run in pausa oppure crea nuovo
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

  // Contatori: ripartono dai valori salvati nel run in pausa
  let filesNew   = run.files_new   ?? 0
  let filesDedup = run.files_dedup ?? 0
  let bytesTotal = run.bytes_total ?? 0
  let bytesNew   = run.bytes_new   ?? 0
  const errors   = [...(run.errors ?? [])]
  let current    = alreadyDone.size

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
      const outcome = await storeBlob(storeDir, hashVorn, bytes, filePath)
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
  }

  run.status       = isCancelled?.() ? 'paused' : 'done'
  run.duration_sec = Math.round((Date.now() - startTime) / 1000)
  run.files_total  = total
  run.files_new    = filesNew
  run.files_dedup  = filesDedup
  run.bytes_total  = bytesTotal
  run.bytes_new    = bytesNew
  run.errors       = errors
  saveRun(storeDir, sessionName, run)

  return { status: run.status, ts: run.ts, files_total: total, filesNew, filesDedup, errors }
}

// ── Restore ───────────────────────────────────────────────────────────────────

export async function restore(storeDir, sessionName, runTs, destDir, opts = {}) {
  const { onProgress, isCancelled, selectedFiles } = opts
  const run = loadRun(storeDir, sessionName, runTs) // imported below
  const errors = []
  let restored = 0

  const fileEntries = selectedFiles?.length
    ? Object.entries(run.files).filter(([k]) => selectedFiles.includes(k))
    : Object.entries(run.files)
  const total = fileEntries.length

  for (let i = 0; i < fileEntries.length; i++) {
    if (isCancelled?.()) break

    const [relPath, hashVorn] = fileEntries[i]
    try {
      const rs      = extractContent(storeDir, hashVorn)
      const outPath = join(destDir, relPath)
      mkdirSync(join(outPath, '..'), { recursive: true })
      const ws = createWriteStream(outPath)
      await new Promise((resolve, reject) => {
        rs.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        rs.on('error', reject)
      })
      restored++
    } catch (e) {
      errors.push({ path: relPath, hash: hashVorn, error: e.code ?? e.message })
    }

    onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
  }

  return { restored, total, errors }
}

// ── Extract by hash ───────────────────────────────────────────────────────────

export async function extractByHash(storeDir, hashVorn, destDir, filename) {
  const outPath = join(destDir, basename(filename || hashVorn))
  mkdirSync(destDir, { recursive: true })
  const rs = extractContent(storeDir, hashVorn)
  const ws = createWriteStream(outPath)
  await new Promise((resolve, reject) => {
    rs.pipe(ws)
    ws.on('finish', resolve)
    ws.on('error', reject)
    rs.on('error', reject)
  })
  return { path: outPath }
}
