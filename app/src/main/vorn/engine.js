import { statSync, readdirSync, mkdirSync, createWriteStream } from 'fs'
import { join, relative, basename } from 'path'
import { vornHash } from './hash.js'
import { createOrAddPath, extractContent } from './store.js'
import { openRun, addFile, setRunStatus, loadRun } from './manifest.js'

// ── Walk ──────────────────────────────────────────────────────────────────────

function walk(dir, excludes = []) {
  const results = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (excludes.some(p => entry.name === p || full.includes(p))) continue
      if (entry.isDirectory()) {
        results.push(...walk(full, excludes))
      } else if (entry.isFile()) {
        results.push(full)
      }
    }
  } catch (_) { /* skip unreadable dirs */ }
  return results
}

// ── Backup ────────────────────────────────────────────────────────────────────

export async function backup(manifestsDir, sessionName, opts = {}) {
  const { onProgress, excludes = [], resumeTs = null, maxBytes = 0 } = opts

  const run = resumeTs
    ? loadRun(manifestsDir, sessionName, resumeTs)
    : openRun(manifestsDir, sessionName)

  if (run.status === 'done') throw new Error('Run already completed')

  if (resumeTs) setRunStatus(manifestsDir, sessionName, run.ts, 'running')

  const { ts: runTs, store, sources, machine } = run
  const startTime   = Date.now()
  const alreadyDone = new Set(Object.keys(run.files))

  // Collect all files upfront (needed for accurate total count)
  const allFiles = []
  for (const src of sources) allFiles.push(...walk(src, excludes))
  const total = allFiles.length

  let filesNew   = run.files_new   ?? 0
  let filesDedup = run.files_dedup ?? 0
  let bytesTotal = run.bytes_total ?? 0
  let bytesNew   = run.bytes_new   ?? 0
  const errors   = [...(run.files_errors ?? [])]
  let cancelled  = false

  // Cancellation handle returned to caller
  opts._handle = { _cancel: () => { cancelled = true } }

  for (let i = 0; i < allFiles.length; i++) {
    if (cancelled) break

    const filePath = allFiles[i]
    const source   = sources.find(s => filePath.startsWith(s)) ?? sources[0]
    
    // Calcoliamo il percorso relativo rispetto alla sorgente
    const relPath = relative(source, filePath)

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
      if (outcome === 'new') {
        filesNew++
        bytesNew += bytes
      } else {
        filesDedup++
      }

      // IMPORTANTE: La chiave nel manifesto deve essere il PERCORSO, non l'hash
      addFile(manifestsDir, sessionName, runTs, relPath, {
        hash_vorn:   hashVorn,
        source,
        bytes,
        mtime:       stat.mtimeMs,
        permissions: pathEntry.permissions
      })

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

    // Yield to event loop every 50 files so IPC remains responsive
    if (i % 50 === 0) await sleep(0)
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000)
  const status = cancelled ? 'paused' : 'done'

  setRunStatus(manifestsDir, sessionName, runTs, status, {
    duration_sec: durationSec,
    bytes_total:  bytesTotal,
    bytes_new:    bytesNew,
    files_total:  total,
    files_new:    filesNew,
    files_dedup:  filesDedup,
    files_errors: errors,
  })

  return { status, runTs, files_total: total, filesNew, filesDedup, durationSec, errors }
}

// ── Restore ───────────────────────────────────────────────────────────────────

export async function restore(manifestsDir, sessionName, runTs, destDir, opts = {}) {
  const { onProgress } = opts
  const run = loadRun(manifestsDir, sessionName, runTs)
  const storePath = run.store
  const errors = []
  let restored = 0

  const fileEntries = Object.entries(run.files)
  const total = fileEntries.length

  for (let i = 0; i < fileEntries.length; i++) {
    const [relPath, info] = fileEntries[i]
    try {
      const hashVorn = info.hash_vorn
      const rs = extractContent(storePath, hashVorn)
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

    if (i % 50 === 0) await sleep(0)
  }

  return { restored, total, errors }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
