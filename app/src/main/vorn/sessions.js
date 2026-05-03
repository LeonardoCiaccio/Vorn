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
      const mp = sessionManifestPath(storeDir, e.name)
      if (!existsSync(mp)) return null
      try {
        const s = JSON.parse(readFileSync(mp, 'utf8'))
        return { ...s, runs: listRuns(storeDir, e.name) }
      } catch { return null }
    })
    .filter(Boolean)
}

export function getSession(storeDir, name) {
  const mp = sessionManifestPath(storeDir, name)
  if (!existsSync(mp)) return null
  return JSON.parse(readFileSync(mp, 'utf8'))
}

export function createSession(storeDir, session) {
  const withId = { id: randomUUID(), ...session }
  const dir = sessionDir(storeDir, withId.name)
  mkdirSync(join(dir, 'runs'), { recursive: true })
  const dest = sessionManifestPath(storeDir, withId.name)
  const tmp  = dest + '.tmp'
  writeFileSync(tmp, JSON.stringify(withId, null, 2), 'utf8')
  renameSync(tmp, dest)
  return withId
}

export function deleteSession(storeDir, name) {
  const dir = sessionDir(storeDir, name)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export function listRuns(storeDir, sessionName) {
  const dir = runsDir(storeDir, sessionName)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .map(f => {
      try {
        const run = JSON.parse(readFileSync(join(dir, f), 'utf8'))
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
      } catch { return null }
    })
    .filter(Boolean)
}

export function loadRun(storeDir, sessionName, ts) {
  const p = runPath(storeDir, sessionName, ts)
  if (!existsSync(p)) throw new Error(`Run non trovato: ${ts}`)
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function saveRun(storeDir, sessionName, run) {
  const dir  = runsDir(storeDir, sessionName)
  mkdirSync(dir, { recursive: true })
  const dest = runPath(storeDir, sessionName, run.ts)
  const tmp  = dest + '.tmp'
  writeFileSync(tmp, JSON.stringify(run, null, 2), 'utf8')
  renameSync(tmp, dest)
}

export function deleteRun(storeDir, sessionName, ts) {
  const p = runPath(storeDir, sessionName, ts)
  if (existsSync(p)) unlinkSync(p)
}
