import { readdirSync } from 'fs'
import { join } from 'path'
import { hostname } from 'os'
import { readVornMeta } from './format.js'
import { openDb } from './db.js'

export function reconstructFromStore(dbPath, storeDir, { onProgress, isCancelled } = {}) {
  // ── Fase 1: scansione metadati (interrompibile) ───────────────────────────

  const files = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
  const total = files.length

  // sessions → Map<sessionName, Map<runTs, { machine, files: Map<relPath, fileEntry> }>>
  const sessions = new Map()

  for (let i = 0; i < files.length; i++) {
    if (isCancelled?.()) return { cancelled: true }

    try {
      const { meta } = readVornMeta(join(storeDir, files[i]))
      for (const record of (meta.records ?? [])) {
        if (!sessions.has(record.session)) sessions.set(record.session, new Map())
        const runs = sessions.get(record.session)
        if (!runs.has(record.ts)) runs.set(record.ts, { machine: record.machine, files: new Map() })
        const run = runs.get(record.ts)
        for (const p of (record.paths ?? [])) {
          if (!p.name) continue
          run.files.set(p.name, {
            hash_vorn:   meta.hash_vorn,
            bytes:       meta.bytes ?? 0,
            mtime:       p.mtime ?? 0,
            permissions: p.permissions ?? '0644',
            source:      _inferSource(p),
          })
        }
      }
    } catch (_) { /* .vorn corrotto o non leggibile — salta */ }

    onProgress?.({ current: i + 1, total, file: files[i] })
  }

  // ── Fase 2: scrittura DB in unica transazione ─────────────────────────────

  const db = openDb(dbPath)
  let sessionsCreated = 0
  let sessionsUpdated = 0
  let runsCreated     = 0

  db.transaction(() => {
    const checkSession = db.prepare('SELECT 1 FROM sessions WHERE name = ?')
    const upsertSession = db.prepare(`
      INSERT INTO sessions (name, store, sources, ts) VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET store = excluded.store, sources = excluded.sources
    `)
    const insertRun = db.prepare(`
      INSERT INTO runs (ts, session_name, machine, status, files_total, bytes_total, files_new, files_dedup)
      VALUES (?, ?, ?, 'done', ?, ?, ?, ?)
      ON CONFLICT(ts, session_name) DO NOTHING
    `)
    const insertFile = db.prepare(`
      INSERT OR IGNORE INTO run_files (session_name, run_ts, rel_path, hash_vorn, source, bytes, mtime, permissions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const [sessionName, runs] of sessions) {
      const sources   = _inferSources(runs)
      const sessionTs = [...runs.keys()].sort()[0] ?? new Date().toISOString()

      const existed = !!checkSession.get(sessionName)
      upsertSession.run(sessionName, storeDir, JSON.stringify([...sources]), sessionTs)
      if (existed) sessionsUpdated++
      else         sessionsCreated++

      // Ordina i run per ts per calcolare files_new/dedup
      const orderedRuns = [...runs.entries()].sort(([a], [b]) => a.localeCompare(b))
      const seenHashes  = new Set()

      for (const [runTs, runData] of orderedRuns) {
        let filesNew = 0, filesDedup = 0, bytesTotal = 0

        for (const f of runData.files.values()) {
          bytesTotal += f.bytes
          if (seenHashes.has(f.hash_vorn)) filesDedup++
          else                             { filesNew++; seenHashes.add(f.hash_vorn) }
        }

        insertRun.run(runTs, sessionName, runData.machine ?? hostname(),
          runData.files.size, bytesTotal, filesNew, filesDedup)
        runsCreated++

        for (const [relPath, f] of runData.files) {
          insertFile.run(sessionName, runTs, relPath, f.hash_vorn,
            f.source ?? storeDir, f.bytes, f.mtime, f.permissions)
        }
      }
    }
  })()

  return { sessionsCreated, sessionsUpdated, runsCreated, filesScanned: total }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _inferSource(pathEntry) {
  if (!pathEntry.path || !pathEntry.name) return null
  // source = fullPath - separator - relativePath
  const sep = pathEntry.path.includes('\\') ? '\\' : '/'
  const rel = pathEntry.name.replace(/\//g, sep)
  if (!pathEntry.path.endsWith(sep + rel)) return null
  return pathEntry.path.slice(0, pathEntry.path.length - rel.length - 1)
}

function _inferSources(runs) {
  const sources = new Set()
  for (const run of runs.values())
    for (const f of run.files.values())
      if (f.source) sources.add(f.source)
  return sources.size > 0 ? sources : new Set()
}
