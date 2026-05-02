import { reactive, watch } from 'vue'
import { settings } from './settings.js'

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
  activeStore:      null, // percorso store attivo (ultimo usato → default → null)
  integrity:        { running: false, progress: null, report: null },
  sanitize:         { running: false, progress: null, report: null },
  clear:            { running: false, progress: null, report: null },
  statsCache:       null,  // { data: {...}, calculatedAt: ISO string }
})

// ── Bootstrap ─────────────────────────────────────────────────────────────────

let _initDone = false

export async function init() {
  if (_initDone) return
  _initDone = true
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

  await _resolveStore()
  watch(() => settings.defaultStore, _resolveStore)

  window.vorn.onTaskProgress(({ taskId, ...progress }) => {
    if (state.tasks[taskId]) state.tasks[taskId].progress = progress
    if (state.integrity.running && state.tasks[taskId]?.type === 'integrity') {
      state.integrity.progress = progress
    }
    if (state.sanitize.running && state.tasks[taskId]?.type === 'sanitize') {
      state.sanitize.progress = progress
    }
    if (state.clear.running && state.tasks[taskId]?.type === 'clear') {
      state.clear.progress = progress
    }
  })

  window.vorn.onTaskDone(async ({ taskId, result, error }) => {
    const t = state.tasks[taskId]
    if (!t) return
    t.status   = error ? 'error' : (result?.status ?? 'done')
    t.result   = result  ?? null
    t.error    = error   ?? null
    t.progress = null
    if (t.type === 'integrity') {
      state.integrity.running  = false
      state.integrity.progress = null
      state.integrity.report   = error ? { total: 0, ok: 0, errors: [], fatalError: error } : result
    } else if (t.type === 'sanitize') {
      state.sanitize.running  = false
      state.sanitize.progress = null
      state.sanitize.report   = error ? { fatalError: error } : result
      await refreshAllSessions()
    } else if (t.type === 'clear') {
      state.clear.running  = false
      state.clear.progress = null
      state.clear.report   = error ? { fatalError: error } : result
    } else if (t.type === 'reconstruct') {
      await refreshAllSessions()
    } else {
      await refreshSession(t.sessionName)
    }
  })
}

async function _resolveStore() {
  const { store } = await window.vorn.resolveStore(settings.defaultStore)
  state.activeStore = store
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function refreshAllSessions() {
  const sessions = await window.vorn.listSessions()
  state.sessions = sessions
  await _resolveStore()
}

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
  state.selectedRun      = null
  state.selectedRunFull  = null
  state.currentView      = 'detail'
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

export async function updateSession(sessionName, store, sources) {
  await window.vorn.updateSession(sessionName, store, sources)
  await refreshSession(sessionName)
}

export async function deleteSession(sessionName) {
  await window.vorn.deleteSession(sessionName)
  const idx = state.sessions.findIndex(s => s.name === sessionName)
  if (idx >= 0) state.sessions.splice(idx, 1)
  if (state.selectedSession?.name === sessionName) goBack()
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

export async function startSanitize(storeDir, cutoffTs) {
  state.sanitize = { running: true, progress: null, report: null }
  const { taskId } = await window.vorn.startSanitize(storeDir, cutoffTs)
  state.tasks[taskId] = {
    id: taskId, type: 'sanitize', sessionName: null,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  return taskId
}

export async function startIntegrity(storeDir) {
  state.integrity = { running: true, progress: { current: 0, total: 0 }, report: null }
  const { taskId } = await window.vorn.startIntegrity(storeDir)
  state.tasks[taskId] = {
    id: taskId, type: 'integrity', sessionName: null,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  return taskId
}

export async function startClearStore(storeDir) {
  state.clear = { running: true, progress: { current: 0, total: 0, deleted: 0, failed: 0 }, report: null }
  const { taskId } = await window.vorn.startClearStore(storeDir)
  state.tasks[taskId] = {
    id: taskId, type: 'clear', sessionName: null,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  return taskId
}

export async function startReconstruct(storeDir) {
  const { taskId } = await window.vorn.startReconstruct(storeDir)
  state.tasks[taskId] = {
    id: taskId, type: 'reconstruct', sessionName: null,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
  return taskId
}

export function cancelTask(taskId) {
  window.vorn.cancelTask(taskId)
}

export function getActiveTask(sessionName) {
  return Object.values(state.tasks).find(t => t.sessionName === sessionName && t.status === 'running') ?? null
}

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
