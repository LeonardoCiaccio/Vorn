import { statSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join, relative, basename } from 'path'
import { vornHash } from './hash.js'
import { hasEntry, createEntry, addPath, extractContent } from './store.js'
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
  run._cancel = () => { cancelled = true }

  for (let i = 0; i < allFiles.length; i++) {
    if (cancelled) break

    const filePath = allFiles[i]
    const source   = sources.find(s => filePath.startsWith(s)) ?? sources[0]

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
      name:        basename(filePath),
      path:        filePath,
      mtime:       stat.mtimeMs,
      permissions: (stat.mode & 0o777).toString(8).padStart(4, '0')
    }

    if (!alreadyDone.has(hashVorn)) {
      try {
        if (!hasEntry(store, hashVorn)) {
          createEntry(store, hashVorn, bytes, readFileSync(filePath), runTs, pathEntry, sessionName, machine)
          filesNew++
          bytesNew += bytes
        } else {
          addPath(store, hashVorn, runTs, pathEntry, sessionName, machine)
          filesDedup++
        }

        addFile(manifestsDir, sessionName, runTs, hashVorn, {
          name:        pathEntry.name,
          path:        filePath,
          source,
          bytes,
          mtime:       stat.mtimeMs,
          permissions: pathEntry.permissions
        })

        alreadyDone.add(hashVorn)
      } catch (e) {
        errors.push({ path: filePath, error: e.code ?? e.message })
      }
    } else {
      filesDedup++
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

export function restore(manifestsDir, sessionName, runTs, destDir) {
  const run    = loadRun(manifestsDir, sessionName, runTs)
  const errors = []
  let restored = 0

  for (const [hashVorn, entry] of Object.entries(run.files)) {
    try {
      const content = extractContent(run.store, hashVorn)
      const relPath = relative(run.sources[0], entry.path)
      const outPath = join(destDir, relPath)
      mkdirSync(join(outPath, '..'), { recursive: true })
      writeFileSync(outPath, content)
      restored++
    } catch (e) {
      errors.push({ path: entry.path, error: e.code ?? e.message })
    }
  }

  return { restored, errors }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
