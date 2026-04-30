import { reactive } from 'vue'

export const state = reactive({
  currentView:      'sessions',
  selectedSession:  null,
  selectedRun:      null,
  selectedRunFull:  null,
  selectedStoreEntry: null,
  sessions:         [],
  storeEntries:     [],
  storeLoaded:      false,
  loading:          false,
  tasks:            {},   // taskId → task (shape pubblica dal backend)
  appInfo:          null,
})

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export async function init() {
  state.loading = true
  try {
    const [sessions, appInfo, tasks] = await Promise.all([
      window.vorn.listSessions(),
      window.vorn.getAppInfo(),
      window.vorn.listTasks(),
    ])
    state.sessions = sessions
    state.appInfo  = appInfo
    for (const t of tasks) state.tasks[t.id] = t
  } finally {
    state.loading = false
  }

  // Listeners globali: sopravvivono alla navigazione tra view
  window.vorn.onTaskProgress(({ taskId, ...progress }) => {
    if (state.tasks[taskId]) state.tasks[taskId].progress = progress
  })

  window.vorn.onTaskDone(async ({ taskId, result, error }) => {
    const t = state.tasks[taskId]
    if (!t) return
    t.status   = error ? 'error' : (result?.status ?? 'done')
    t.result   = result  ?? null
    t.error    = error   ?? null
    t.progress = null
    await refreshSession(t.sessionName)
  })
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function refreshSession(name) {
  const updated = await window.vorn.getSession(name)
  if (!updated) return
  const runs = await window.vorn.listRuns(name)
  const merged = { ...updated, runs }
  const idx = state.sessions.findIndex(s => s.name === name)
  if (idx >= 0) state.sessions[idx] = merged
  else state.sessions.unshift(merged)
  if (state.selectedSession?.name === name) state.selectedSession = merged
}

export function selectSession(session) {
  state.selectedSession  = session
  state.selectedRun      = session.runs[0] ?? null
  state.selectedRunFull  = null
  state.currentView      = 'detail'
  if (state.selectedRun) loadFullRun(session.name, state.selectedRun.ts)
}

export function goBack() {
  state.selectedSession  = null
  state.selectedRun      = null
  state.selectedRunFull  = null
  state.currentView      = 'sessions'
}

export function navigateTo(view) {
  state.currentView      = view
  state.selectedSession  = null
  state.selectedRun      = null
  state.selectedRunFull  = null
  state.selectedStoreEntry = null
}

export async function createSession(name, store, sources) {
  const session = await window.vorn.createSession(name, store, sources)
  state.sessions.unshift({ ...session, runs: [] })
  return session
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export async function deleteRun(sessionName, runTs) {
  await window.vorn.deleteRun(sessionName, runTs)
  await refreshSession(sessionName)
}

export function selectRun(run) {
  state.selectedRun     = run
  state.selectedRunFull = null
  loadFullRun(state.selectedSession.name, run.ts)
}

export async function loadFullRun(sessionName, runTs) {
  const full = await window.vorn.loadRun(sessionName, runTs)
  state.selectedRunFull = {
    ...full,
    filesArray: Object.entries(full.files ?? {}).map(([name, e]) => ({ name, ...e }))
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function startBackup(sessionName, opts = {}) {
  const paused = await window.vorn.getPausedRun(sessionName)
  const finalOpts = paused ? { ...opts, resumeTs: paused.ts } : opts
  const { taskId } = await window.vorn.startBackup(sessionName, finalOpts)
  state.tasks[taskId] = {
    id: taskId, type: 'backup', sessionName,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  // Aggiorna la lista run subito: openRun() è già stato chiamato nel main process
  // prima che il taskId arrivasse qui, quindi il file esiste già su disco.
  await refreshSession(sessionName)
  return taskId
}

export async function startRestore(sessionName, runTs, destDir) {
  const { taskId } = await window.vorn.startRestore(sessionName, runTs, destDir)
  state.tasks[taskId] = {
    id: taskId, type: 'restore', sessionName,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  return taskId
}

export function cancelTask(taskId) {
  window.vorn.cancelTask(taskId)
}

// Ritorna il task attivo (running) per una sessione, o null
export function getActiveTask(sessionName) {
  return Object.values(state.tasks).find(t => t.sessionName === sessionName && t.status === 'running') ?? null
}

// Ritorna l'ultimo task completato di un certo tipo per una sessione
export function getLastTask(sessionName, type) {
  return Object.values(state.tasks)
    .filter(t => t.sessionName === sessionName && t.type === type && t.status !== 'running')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

// ── Store ─────────────────────────────────────────────────────────────────────

export async function fetchStorePage(storeDir, offset = 0, limit = 20) {
  state.loading = true
  try {
    const result = await window.vorn.listStoreFiles(storeDir, offset, limit)
    if (offset === 0) state.storeEntries = result.files
    else state.storeEntries.push(...result.files)
    state.storeLoaded = true
    return result
  } finally {
    state.loading = false
  }
}

export async function handleSelectStoreEntry(storeDir, entry) {
  state.selectedStoreEntry = { ...entry, loading: true }
  try {
    const fullMeta = await window.vorn.inspectHash(storeDir, entry.hash_vorn)
    state.selectedStoreEntry = { ...entry, ...fullMeta, loading: false }
  } catch {
    state.selectedStoreEntry.loading = false
  }
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
