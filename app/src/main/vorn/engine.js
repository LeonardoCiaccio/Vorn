import { statSync, readdirSync, mkdirSync, createWriteStream } from 'fs'
import { join, relative } from 'path'
import { vornHash } from './hash.js'
import { createOrAddPath, extractContent } from './store.js'
import { openRun, saveRun, loadRun } from './manifest.js'

// ── Walk ──────────────────────────────────────────────────────────────────────

function walk(dir, excludes = [], _results = []) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (excludes.some(p => entry.name === p || full.includes(p))) continue
      if (entry.isDirectory()) walk(full, excludes, _results)
      else if (entry.isFile()) _results.push(full)
    }
  } catch (_) { /* skip unreadable dirs */ }
  return _results
}

// ── Backup ────────────────────────────────────────────────────────────────────

export async function backup(dbPath, sessionName, opts = {}) {
  const { onProgress, excludes = [], resumeTs = null, maxBytes = 0, isCancelled } = opts

  const run = resumeTs
    ? loadRun(dbPath, sessionName, resumeTs)
    : openRun(dbPath, sessionName)

  if (run.status === 'done') throw new Error('Run already completed')

  if (resumeTs) run.status = 'running'

  const { ts: runTs, store, sources, machine } = run
  const startTime   = Date.now()
  const alreadyDone = new Set(Object.keys(run.files))

  const allFiles = []
  for (const src of sources) walk(src, excludes, allFiles)
  const total = allFiles.length

  let filesNew   = run.files_new   ?? 0
  let filesDedup = run.files_dedup ?? 0
  let bytesTotal = run.bytes_total ?? 0
  let bytesNew   = run.bytes_new   ?? 0
  const errors   = [...(run.files_errors ?? [])]

  for (let i = 0; i < allFiles.length; i++) {
    if (isCancelled?.()) break

    const filePath = allFiles[i]
    const source   = sources.find(s => filePath.startsWith(s)) ?? sources[0]
    const relPath  = relative(source, filePath)

    if (alreadyDone.has(relPath)) continue

    let stat
    try { stat = statSync(filePath) }
    catch (e) { errors.push({ path: filePath, error: e.code ?? e.message }); continue }

    const bytes = stat.size
    if (maxBytes > 0 && bytes > maxBytes) continue

    let hashVorn
    try { hashVorn = vornHash(filePath) }
    catch (e) { errors.push({ path: filePath, error: e.code ?? e.message }); continue }

    bytesTotal += bytes

    const pathEntry = {
      name:        relPath,
      path:        filePath,
      mtime:       stat.mtimeMs,
      permissions: (stat.mode & 0o777).toString(8).padStart(4, '0')
    }

    try {
      const outcome = await createOrAddPath(store, hashVorn, bytes, filePath, runTs, pathEntry, sessionName, machine)
      if (outcome === 'new') { filesNew++; bytesNew += bytes }
      else                   { filesDedup++ }

      run.files[relPath] = { hash_vorn: hashVorn, source, bytes, mtime: stat.mtimeMs, permissions: pathEntry.permissions }
      alreadyDone.add(relPath)
    } catch (e) {
      errors.push({ path: filePath, error: e.code ?? e.message })
    }

    onProgress?.({
      current:     i + 1,
      total,
      files_new:   filesNew,
      files_dedup: filesDedup,
      errors:      errors.length,
      file:        filePath,
      bytes_total: bytesTotal,
      bytes_new:   bytesNew,
    })
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000)
  run.status       = isCancelled?.() ? 'paused' : 'done'
  run.duration_sec = durationSec
  run.bytes_total  = bytesTotal
  run.bytes_new    = bytesNew
  run.files_total  = total
  run.files_new    = filesNew
  run.files_dedup  = filesDedup
  run.files_errors = errors
  saveRun(dbPath, sessionName, runTs, run)

  return { status: run.status, runTs, files_total: total, filesNew, filesDedup, durationSec, errors }
}

// ── Restore ───────────────────────────────────────────────────────────────────

export async function restore(dbPath, sessionName, runTs, destDir, opts = {}) {
  const { onProgress, isCancelled } = opts
  const run = loadRun(dbPath, sessionName, runTs)
  const storePath = run.store
  const errors = []
  let restored = 0

  const fileEntries = Object.entries(run.files)
  const total = fileEntries.length

  for (let i = 0; i < fileEntries.length; i++) {
    if (isCancelled?.()) break

    const [relPath, info] = fileEntries[i]
    try {
      const rs = extractContent(storePath, info.hash_vorn)
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
      errors.push({ path: relPath, hash: info.hash_vorn, error: e.code ?? e.message })
    }

    onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
  }

  return { restored, total, errors }
}
