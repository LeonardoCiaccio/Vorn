import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, rmSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ── Paths ─────────────────────────────────────────────────────────────────────

export function sessionsDir(storeDir)                    { return join(storeDir, 'vorn', 'sessions') }
export function sessionDir(storeDir, name)               { return join(sessionsDir(storeDir), name) }
export function sessionManifestPath(storeDir, name)      { return join(sessionDir(storeDir, name), 'manifest.json') }
export function runsDir(storeDir, name)                  { return join(sessionDir(storeDir, name), 'runs') }
export function tsToFilename(ts)                         { return ts.replace(/:/g, '-').replace(/\./g, '-') + '.json' }
export function runPath(storeDir, name, ts)              { return join(runsDir(storeDir, name), tsToFilename(ts)) }

// ── Sessions ──────────────────────────────────────────────────────────────────

export function listSessions(storeDir) {
  const dir = sessionsDir(storeDir)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const s = getSession(storeDir, e.name)
      if (!s) return null
      return { ...s, runs: listRuns(storeDir, e.name) }
    })
    .filter(Boolean)
}

export function getSession(storeDir, name) {
  const mp = sessionManifestPath(storeDir, name)
  if (!existsSync(mp)) return null
  try { return JSON.parse(readFileSync(mp, 'utf8')) } catch { return null }
}

export function saveSession(storeDir, session) {
  const dest = sessionManifestPath(storeDir, session.name)
  const tmp  = dest + '.tmp'
  writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf8')
  renameSync(tmp, dest)
}

export function createSession(storeDir, session) {
  const withId = { id: randomUUID(), ...session, runs_meta: [] }
  const dir = sessionDir(storeDir, withId.name)
  mkdirSync(join(dir, 'runs'), { recursive: true })
  saveSession(storeDir, withId)
  return withId
}

export function deleteSession(storeDir, name) {
  const dir = sessionDir(storeDir, name)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export function listRuns(storeDir, sessionName) {
  const session = getSession(storeDir, sessionName)
  if (!session) return []

  // Se abbiamo il cache dei metadati nel manifest, lo usiamo (veloce)
  if (session.runs_meta?.length) return session.runs_meta

  // Altrimenti ricostruiamo la cache dai file (compatibilità o cache mancante)
  const dir = runsDir(storeDir, sessionName)
  if (!existsSync(dir)) return []
  const runs = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort().reverse()
    .map(f => {
      try {
        const run = JSON.parse(readFileSync(join(dir, f), 'utf8'))
        return _summarizeRun(run)
      } catch { return null }
    })
    .filter(Boolean)

  if (runs.length > 0) {
    session.runs_meta = runs.slice(0, 500)
    saveSession(storeDir, session)
  }
  return runs
}

function _summarizeRun(run) {
  return {
    ts:          run.ts,
    status:      run.status ?? 'done',
    files_total: run.files_total ?? Object.keys(run.files ?? {}).length,
    files_new:   run.files_new   ?? null,
    files_dedup: run.files_dedup ?? null,
    bytes_total: run.bytes_total ?? null,
    bytes_new:   run.bytes_new   ?? null,
    duration_sec: run.duration_sec ?? null,
    errors_count: run.errors?.length ?? null,
  }
}

export function loadRun(storeDir, sessionName, ts) {
  const p = runPath(storeDir, sessionName, ts)
  if (!existsSync(p)) throw new Error(`Run non trovato: ${ts}`)
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function saveRun(storeDir, sessionName, run) {
  const dir  = runsDir(storeDir, sessionName)
  mkdirSync(dir, { recursive: true })
  
  // Scrittura atomica del file run (che può essere enorme)
  const dest = runPath(storeDir, sessionName, run.ts)
  const tmp  = dest + '.tmp'
  writeFileSync(tmp, JSON.stringify(run, null, 2), 'utf8')
  renameSync(tmp, dest)

  // Aggiornamento cache metadati nel manifest della sessione (veloce)
  const session = getSession(storeDir, sessionName)
  if (session) {
    if (!session.runs_meta) session.runs_meta = []
    const summary = _summarizeRun(run)
    const idx = session.runs_meta.findIndex(r => r.ts === run.ts)
    if (idx >= 0) session.runs_meta[idx] = summary
    else          session.runs_meta.unshift(summary)
    session.runs_meta.sort((a, b) => b.ts.localeCompare(a.ts))
    if (session.runs_meta.length > 500) session.runs_meta = session.runs_meta.slice(0, 500)
    saveSession(storeDir, session)
  }
}

export function deleteRun(storeDir, sessionName, ts) {
  const p = runPath(storeDir, sessionName, ts)
  if (existsSync(p)) unlinkSync(p)

  const session = getSession(storeDir, sessionName)
  if (session?.runs_meta) {
    session.runs_meta = session.runs_meta.filter(r => r.ts !== ts)
    saveSession(storeDir, session)
  }
}

