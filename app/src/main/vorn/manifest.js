import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { hostname } from 'os'

function sessionDir(manifestsDir, name)  { return join(manifestsDir, name) }
function sessionFile(manifestsDir, name) { return join(manifestsDir, name, `${name}.json`) }

function runFile(manifestsDir, name, ts) {
  return join(manifestsDir, name, `${name}-${ts.replace(/:/g, '-')}.json`)
}

function load(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function save(path, data) { writeFileSync(path, JSON.stringify(data, null, 2), 'utf8') }

export function createSession(manifestsDir, name, store, sources) {
  const dir = sessionDir(manifestsDir, name)
  mkdirSync(dir, { recursive: true })
  const session = { ts: new Date().toISOString(), name, store, sources }
  save(sessionFile(manifestsDir, name), session)
  return session
}

export function getSession(manifestsDir, name) {
  const p = sessionFile(manifestsDir, name)
  if (!existsSync(p)) return null
  return load(p)
}

export function listSessions(manifestsDir) {
  if (!existsSync(manifestsDir)) return []
  return readdirSync(manifestsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const p = sessionFile(manifestsDir, e.name)
      if (!existsSync(p)) return null
      const session = load(p)
      const runs = listRuns(manifestsDir, e.name)
      return { ...session, runs }
    })
    .filter(Boolean)
}

export function openRun(manifestsDir, name) {
  const session = getSession(manifestsDir, name)
  if (!session) throw new Error(`Session not found: ${name}`)
  const ts = new Date().toISOString()
  const run = {
    ts,
    name,
    store:       session.store,
    sources:     session.sources,
    machine:     hostname(),
    status:      'running',
    duration_sec:  0,
    bytes_total:   0,
    bytes_new:     0,
    files_total:   0,
    files_new:     0,
    files_dedup:   0,
    files_errors:  [],
    files:         {}
  }
  save(runFile(manifestsDir, name, ts), run)
  return run
}

export function addFile(manifestsDir, name, runTs, hashVorn, fileEntry) {
  const p = runFile(manifestsDir, name, runTs)
  const run = load(p)
  run.files[hashVorn] = fileEntry
  save(p, run)
}

export function setRunStatus(manifestsDir, name, runTs, status, stats = {}) {
  const p = runFile(manifestsDir, name, runTs)
  const run = load(p)
  run.status = status
  Object.assign(run, stats)
  save(p, run)
}

export function loadRun(manifestsDir, name, runTs) {
  const p = runFile(manifestsDir, name, runTs)
  if (!existsSync(p)) throw new Error(`Run not found: ${name} @ ${runTs}`)
  return load(p)
}

export function listRuns(manifestsDir, name) {
  const dir = sessionDir(manifestsDir, name)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f !== `${name}.json` && f.endsWith('.json'))
    .map(f => {
      const run = load(join(dir, f))
      // Return summary without the full files map (can be large)
      const { files, ...summary } = run
      summary.files_count = Object.keys(files).length
      return summary
    })
    .sort((a, b) => b.ts.localeCompare(a.ts))
}

export function getPausedRun(manifestsDir, name) {
  return listRuns(manifestsDir, name).find(r => r.status === 'paused') ?? null
}

export function recoverSession(manifestsDir, name) {
  const dir = sessionDir(manifestsDir, name)
  const runFiles = readdirSync(dir)
    .filter(f => f !== `${name}.json` && f.endsWith('.json'))
    .sort()
  if (!runFiles.length) throw new Error(`No run files found for session: ${name}`)
  const latest = load(join(dir, runFiles.at(-1)))
  const session = {
    ts:      latest.ts,
    name:    latest.name,
    store:   latest.store,
    sources: latest.sources
  }
  save(sessionFile(manifestsDir, name), session)
  return session
}
