import { reactive } from 'vue'

export const state = reactive({
  currentView: 'sessions',
  selectedSession: null,
  selectedRun: null,
  selectedRunFull: null,   // full run data with files map
  selectedStoreEntry: null,
  sessions: [],
  storeEntries: [],
  storeLoaded: false,
  loading: false,
  runningBackup: null,     // { sessionName, progress }
  appInfo: null,           // { version, platform, manifestsDir }
})

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export async function init() {
  state.loading = true
  try {
    const [sessions, appInfo] = await Promise.all([
      window.vorn.listSessions(),
      window.vorn.getAppInfo(),
    ])
    state.sessions = sessions
    state.appInfo  = appInfo
  } finally {
    state.loading = false
  }
}

export async function refreshSession(name) {
  const updated = await window.vorn.getSession(name)
  if (!updated) return
  const runs = await window.vorn.listRuns(name)
  const idx = state.sessions.findIndex(s => s.name === name)
  const merged = { ...updated, runs }
  if (idx >= 0) state.sessions[idx] = merged
  else state.sessions.unshift(merged)
  if (state.selectedSession?.name === name) {
    state.selectedSession = merged
  }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export function selectSession(session) {
  state.selectedSession = session
  state.selectedRun = session.runs[0] ?? null
  state.selectedRunFull = null
  state.currentView = 'detail'
  if (state.selectedRun) loadFullRun(session.name, state.selectedRun.ts)
}

export function goBack() {
  state.selectedSession = null
  state.selectedRun = null
  state.selectedRunFull = null
  state.currentView = 'sessions'
}

export function navigateTo(view) {
  state.currentView = view
  state.selectedSession = null
  state.selectedRun = null
  state.selectedRunFull = null
  state.selectedStoreEntry = null
}

export async function createSession(name, store, sources) {
  const session = await window.vorn.createSession(name, store, sources)
  state.sessions.unshift({ ...session, runs: [] })
  return session
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export function selectRun(run) {
  state.selectedRun = run
  state.selectedRunFull = null
  loadFullRun(state.selectedSession.name, run.ts)
}

export async function loadFullRun(sessionName, runTs) {
  const full = await window.vorn.loadRun(sessionName, runTs)
  state.selectedRunFull = {
    ...full,
    filesArray: Object.entries(full.files ?? {}).map(([hash_vorn, e]) => ({ hash_vorn, ...e }))
  }
}

// ── Backup ────────────────────────────────────────────────────────────────────

export async function startBackup(sessionName, opts = {}) {
  if (state.runningBackup) return

  // Check for paused run to resume
  const paused = await window.vorn.getPausedRun(sessionName)
  const finalOpts = paused ? { ...opts, resumeTs: paused.ts } : opts

  state.runningBackup = { sessionName, progress: null }

  window.vorn.onBackupProgress((data) => {
    if (data.sessionName === sessionName) {
      state.runningBackup = { sessionName, progress: data }
    }
  })

  try {
    const result = await window.vorn.backup(sessionName, finalOpts)
    await refreshSession(sessionName)
    return result
  } finally {
    window.vorn.offBackupProgress()
    window.vorn.offBackupDone()
    state.runningBackup = null
  }
}

export function cancelBackup(sessionName) {
  window.vorn.backupCancel(sessionName)
}

// ── Store ─────────────────────────────────────────────────────────────────────

export async function loadStoreEntries() {
  if (state.storeLoaded) return
  const map = new Map()

  for (const session of state.sessions) {
    for (const runSummary of session.runs) {
      let run
      try { run = await window.vorn.loadRun(session.name, runSummary.ts) }
      catch { continue }

      for (const [hashVorn, fileEntry] of Object.entries(run.files ?? {})) {
        if (!map.has(hashVorn)) {
          map.set(hashVorn, { hash_vorn: hashVorn, bytes: fileEntry.bytes, records: [] })
        }
        const entry = map.get(hashVorn)
        let rec = entry.records.find(r => r.ts === run.ts && r.session === session.name)
        if (!rec) {
          rec = { ts: run.ts, session: session.name, machine: run.machine, paths: [] }
          entry.records.push(rec)
        }
        rec.paths.push({ name: fileEntry.name, path: fileEntry.path })
      }
    }
  }

  state.storeEntries = [...map.values()]
  state.storeLoaded = true
}

export function selectStoreEntry(entry) {
  state.selectedStoreEntry = entry
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatTs(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function shortHash(hash) {
  if (!hash) return '—'
  return hash.slice(0, 8) + '…' + hash.slice(-8)
}
