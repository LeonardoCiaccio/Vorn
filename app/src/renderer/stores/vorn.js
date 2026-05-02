import { reactive } from 'vue'
import { syncThemeFromSettings } from './settings.js'

export const state = reactive({
  // Store
  phase:           'select',   // 'select' | 'ready' | 'disconnected'
  activeStore:     null,
  recentStores:    [],

  // App
  appInfo:         null,

  // Sessioni e navigazione
  currentView:     'sessions',
  sessions:        [],
  selectedSession: null,
  selectedRun:     null,
  selectedRunFull: null,
  loading:         false,

  // Store browser
  storeEntries: [],
  storeLoaded:  false,

  // Tasks
  tasks:    {},
  integrity: { running: false, progress: null, report: null },
  clear:     { running: false, progress: null, report: null },
})

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export async function boot() {
  const [appInfo, settings, tasks] = await Promise.all([
    window.vorn.getAppInfo(),
    window.vorn.getSettings(),
    window.vorn.listTasks(),
  ])
  state.appInfo      = appInfo
  state.recentStores = settings.recentStores ?? []
  syncThemeFromSettings(settings.theme)
  for (const t of tasks) state.tasks[t.id] = t

  window.vorn.onTaskProgress(({ taskId, ...progress }) => {
    if (state.tasks[taskId]) state.tasks[taskId].progress = progress
    if (state.integrity.running && state.tasks[taskId]?.type === 'integrity')
      state.integrity.progress = progress
    if (state.clear.running && state.tasks[taskId]?.type === 'clear')
      state.clear.progress = progress
  })

  window.vorn.onTaskDone(async ({ taskId, result, error }) => {
    const t = state.tasks[taskId]
    if (!t) return
    t.status   = error ? 'error' : (result?.status ?? 'done')
    t.result   = result ?? null
    t.error    = error  ?? null
    t.progress = null
    if (t.type === 'integrity') {
      state.integrity.running  = false
      state.integrity.progress = null
      state.integrity.report   = error ? { total: 0, ok: 0, errors: [], fatalError: error } : result
    } else if (t.type === 'clear') {
      state.clear.running  = false
      state.clear.progress = null
      state.clear.report   = error ? { fatalError: error } : result
    } else {
      await refreshSession(t.sessionName)
    }
  })

  window.vorn.onStoreDisconnected(() => {
    state.phase       = 'disconnected'
    state.activeStore = null
    state.sessions    = []
  })
}

// ── Store selection ───────────────────────────────────────────────────────────

export async function openStore(storeDir) {
  await window.vorn.openStore(storeDir)
  state.activeStore  = storeDir
  state.phase        = 'ready'
  const [sessions, settings] = await Promise.all([
    window.vorn.listSessions(),
    window.vorn.getSettings(),
  ])
  state.sessions     = sessions
  state.recentStores = settings.recentStores ?? []
}

export function closeStore() {
  window.vorn.closeStore()
  state.phase          = 'select'
  state.activeStore    = null
  state.sessions       = []
  state.currentView    = 'sessions'
  state.selectedSession = null
  state.selectedRun    = null
  state.storeEntries   = []
  state.storeLoaded    = false
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function refreshSession(name) {
  if (!name) return
  const updated = await window.vorn.getSession(name)
  if (!updated) return
  const runs   = await window.vorn.listRuns(name)
  const merged = { ...updated, runs }
  const idx    = state.sessions.findIndex(s => s.name === name)
  if (idx >= 0) state.sessions[idx] = merged
  else          state.sessions.unshift(merged)
  if (state.selectedSession?.name === name) state.selectedSession = merged
}

export function selectSession(session) {
  state.selectedSession = session
  state.selectedRun     = null
  state.selectedRunFull = null
  state.currentView     = 'detail'
}

export function goBack() {
  state.selectedSession = null
  state.selectedRun     = null
  state.selectedRunFull = null
  state.currentView     = 'sessions'
}

export function navigateTo(view) {
  state.currentView        = view
  state.selectedSession    = null
  state.selectedRun        = null
  state.selectedRunFull    = null
  state.selectedStoreEntry = null
}

export async function createSession(session) {
  const created = await window.vorn.createSession(session)
  state.sessions.unshift({ ...created, runs: [] })
  return created
}

export async function deleteSession(name) {
  await window.vorn.deleteSession(name)
  const idx = state.sessions.findIndex(s => s.name === name)
  if (idx >= 0) state.sessions.splice(idx, 1)
  if (state.selectedSession?.name === name) goBack()
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
    filesArray: Object.entries(full.files ?? {}).map(([name, hash_vorn]) => ({ name, hash_vorn }))
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function startBackup(sessionName, resumeTs = null) {
  const { taskId } = await window.vorn.startBackup(sessionName, resumeTs)
  state.tasks[taskId] = {
    id: taskId, type: 'backup', sessionName,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  await refreshSession(sessionName)
  return taskId
}

export async function startRestore(sessionName, runTs, destDir, selectedFiles = null) {
  const { taskId } = await window.vorn.startRestore(sessionName, runTs, destDir, selectedFiles)
  state.tasks[taskId] = {
    id: taskId, type: 'restore', sessionName,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  return taskId
}

export async function startIntegrity() {
  state.integrity = { running: true, progress: { current: 0, total: 0 }, report: null }
  const { taskId } = await window.vorn.startIntegrity()
  state.tasks[taskId] = {
    id: taskId, type: 'integrity', sessionName: null,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  return taskId
}

export async function startClearStore() {
  state.clear = { running: true, progress: { current: 0, total: 0, deleted: 0, failed: 0 }, report: null }
  const { taskId } = await window.vorn.startClearStore()
  state.tasks[taskId] = {
    id: taskId, type: 'clear', sessionName: null,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  return taskId
}

export function cancelTask(taskId) { window.vorn.cancelTask(taskId) }

export function getActiveTask(sessionName) {
  return Object.values(state.tasks).find(t => t.sessionName === sessionName && t.status === 'running') ?? null
}

export function getLastTask(sessionName, type) {
  return Object.values(state.tasks)
    .filter(t => t.sessionName === sessionName && t.type === type && t.status !== 'running')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

// ── Store browser ─────────────────────────────────────────────────────────────

export async function fetchStorePage(offset = 0, limit = 20, query = '') {
  state.loading = true
  try {
    const result = await window.vorn.listStoreFiles(offset, limit, query)
    if (offset === 0) state.storeEntries = result.files
    else              state.storeEntries.push(...result.files)
    state.storeLoaded = true
    return result
  } finally {
    state.loading = false
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
