import { hostname } from 'os'
import { openDb } from './db.js'

// ── Sessions ──────────────────────────────────────────────────────────────────

export function createSession(dbPath, name, store, sources) {
  const db = openDb(dbPath)
  const ts = new Date().toISOString()
  db.prepare(`
    INSERT INTO sessions (name, store, sources, ts) VALUES (?, ?, ?, ?)
  `).run(name, store, JSON.stringify(sources), ts)
  return { name, store, sources, ts }
}

export function getSession(dbPath, name) {
  const db = openDb(dbPath)
  const row = db.prepare('SELECT * FROM sessions WHERE name = ?').get(name)
  if (!row) return null
  return { ...row, sources: JSON.parse(row.sources) }
}

export function listSessions(dbPath) {
  const db = openDb(dbPath)
  const sessions = db.prepare('SELECT * FROM sessions').all()
  return sessions.map(s => ({
    ...s,
    sources: JSON.parse(s.sources),
    runs: listRuns(dbPath, s.name)
  }))
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export function openRun(dbPath, name) {
  const db = openDb(dbPath)
  const session = db.prepare('SELECT * FROM sessions WHERE name = ?').get(name)
  if (!session) throw new Error(`Session not found: ${name}`)

  const ts      = new Date().toISOString()
  const machine = hostname()

  db.prepare(`
    INSERT INTO runs (ts, session_name, machine, status)
    VALUES (?, ?, ?, 'running')
  `).run(ts, name, machine)

  return {
    ts, name,
    store:       session.store,
    sources:     JSON.parse(session.sources),
    machine,
    status:      'running',
    duration_sec: 0,
    bytes_total: 0, bytes_new:   0,
    files_total: 0, files_new:   0, files_dedup: 0,
    files_errors: [],
    files: {}
  }
}

export function saveRun(dbPath, name, runTs, runObj) {
  const db = openDb(dbPath)

  db.prepare(`
    UPDATE runs SET
      status = ?, duration_sec = ?,
      bytes_total = ?, bytes_new = ?,
      files_total = ?, files_new = ?, files_dedup = ?,
      files_errors = ?
    WHERE session_name = ? AND ts = ?
  `).run(
    runObj.status,
    runObj.duration_sec  ?? 0,
    runObj.bytes_total   ?? 0,
    runObj.bytes_new     ?? 0,
    runObj.files_total   ?? 0,
    runObj.files_new     ?? 0,
    runObj.files_dedup   ?? 0,
    JSON.stringify(runObj.files_errors ?? []),
    name, runTs
  )

  const entries = Object.entries(runObj.files ?? {})
  if (entries.length === 0) return

  const insert = db.prepare(`
    INSERT OR IGNORE INTO run_files
      (session_name, run_ts, rel_path, hash_vorn, source, bytes, mtime, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    for (const [relPath, f] of entries)
      insert.run(name, runTs, relPath, f.hash_vorn, f.source, f.bytes, f.mtime, f.permissions)
  })()
}

export function loadRun(dbPath, name, runTs) {
  const db = openDb(dbPath)

  const run = db.prepare(`
    SELECT r.*, s.store, s.sources
    FROM runs r JOIN sessions s ON r.session_name = s.name
    WHERE r.session_name = ? AND r.ts = ?
  `).get(name, runTs)
  if (!run) throw new Error(`Run not found: ${name} @ ${runTs}`)

  const rows = db.prepare(`
    SELECT rel_path, hash_vorn, source, bytes, mtime, permissions
    FROM run_files WHERE session_name = ? AND run_ts = ?
  `).all(name, runTs)

  const files = {}
  for (const r of rows) files[r.rel_path] = { hash_vorn: r.hash_vorn, source: r.source, bytes: r.bytes, mtime: r.mtime, permissions: r.permissions }

  return {
    ts:          run.ts,
    name:        run.session_name,
    store:       run.store,
    sources:     JSON.parse(run.sources),
    machine:     run.machine,
    status:      run.status,
    duration_sec: run.duration_sec,
    bytes_total: run.bytes_total,
    bytes_new:   run.bytes_new,
    files_total: run.files_total,
    files_new:   run.files_new,
    files_dedup: run.files_dedup,
    files_errors: JSON.parse(run.files_errors ?? '[]'),
    files
  }
}

export function listRuns(dbPath, name) {
  const db = openDb(dbPath)
  return db.prepare(`
    SELECT ts, session_name AS name, machine, status, duration_sec,
           bytes_total, bytes_new, files_total, files_new, files_dedup, files_errors
    FROM runs WHERE session_name = ? ORDER BY ts DESC
  `).all(name).map(r => ({
    ...r,
    files_errors: JSON.parse(r.files_errors ?? '[]'),
    files_count:  r.files_total
  }))
}

export function getPausedRun(dbPath, name) {
  const db = openDb(dbPath)
  const row = db.prepare(`
    SELECT ts FROM runs WHERE session_name = ? AND status = 'paused' ORDER BY ts DESC LIMIT 1
  `).get(name)
  return row ?? null
}

export function deleteRun(dbPath, name, runTs) {
  const db = openDb(dbPath)
  const result = db.prepare('DELETE FROM runs WHERE session_name = ? AND ts = ?').run(name, runTs)
  if (result.changes === 0) throw new Error(`Run not found: ${name} @ ${runTs}`)
}

export function setRunStatus(dbPath, name, runTs, status, stats = {}) {
  const db = openDb(dbPath)
  const sets = ['status = ?']
  const vals = [status]
  for (const [k, v] of Object.entries(stats)) { sets.push(`${k} = ?`); vals.push(v) }
  vals.push(name, runTs)
  db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE session_name = ? AND ts = ?`).run(...vals)
}

export function recoverSession(dbPath, name) {
  const db = openDb(dbPath)
  const session = db.prepare('SELECT * FROM sessions WHERE name = ?').get(name)
  if (!session) throw new Error(`Session not found: ${name}`)
  return { ...session, sources: JSON.parse(session.sources) }
}

// Chiamata all'avvio: run rimaste 'running' per un crash precedente vengono
// messe in 'paused' così possono essere riprese normalmente.
export function getLastUsedStore(dbPath) {
  const db = openDb(dbPath)
  const row = db.prepare(`
    SELECT s.store FROM runs r
    JOIN sessions s ON r.session_name = s.name
    ORDER BY r.ts DESC LIMIT 1
  `).get()
  return row?.store ?? null
}

export function deleteSession(dbPath, name) {
  const db = openDb(dbPath)
  const result = db.prepare('DELETE FROM sessions WHERE name = ?').run(name)
  if (result.changes === 0) throw new Error(`Session not found: ${name}`)
}

export function fixOrphanedRuns(dbPath) {
  const db = openDb(dbPath)
  db.prepare(`UPDATE runs SET status = 'paused' WHERE status = 'running'`).run()
}
