import { reactive } from 'vue'
import { syncThemeFromSettings } from './settings.js'
import { setLocale } from './i18n.js'
import { refreshSession } from './sessions.js'

export const state = reactive({
  // Store
  phase:           'select',   // 'select' | 'ready' | 'disconnected'
  activeStore:     null,
  recentStores:    [],

  // App
  appInfo:         null,
  updateInfo:      null,

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
  tasks: {},
})

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export async function boot() {
  const [appInfo, settings, tasks, updateInfo] = await Promise.all([
    window.vorn.getAppInfo(),
    window.vorn.getSettings(),
    window.vorn.listTasks(),
    window.vorn.checkUpdate(),
  ])
  state.appInfo      = appInfo
  state.updateInfo   = updateInfo
  state.recentStores = settings.recentStores ?? []
  syncThemeFromSettings(settings.theme)
  setLocale(settings.language)
  for (const t of tasks) state.tasks[t.id] = t

  window.vorn.onTaskProgress(({ taskId, ...progress }) => {
    if (state.tasks[taskId]) state.tasks[taskId].progress = progress
  })

  window.vorn.onTaskDone(async ({ taskId, result, error }) => {
    const t = state.tasks[taskId]
    if (!t) return
    t.status   = error ? 'error' : (result?.status ?? 'done')
    t.result   = result ?? null
    t.error    = error  ?? null
    t.progress = null
    if (t.type !== 'integrity' && t.type !== 'clear' && t.type !== 'extract-store' && t.type !== 'prune') {
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
  state.phase           = 'select'
  state.activeStore     = null
  state.sessions        = []
  state.currentView     = 'sessions'
  state.selectedSession = null
  state.selectedRun     = null
  state.storeEntries    = []
  state.storeLoaded     = false
}

// ── Navigazione ───────────────────────────────────────────────────────────────

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

// ── Re-export dai sub-store (le view non cambiano i loro import) ──────────────

export { formatTs, formatBytes, shortHash }        from './format.js'
export {
  refreshSession, selectSession, createSession, updateSession, deleteSession,
  deleteRun, selectRun, loadFullRun,
}                                                  from './sessions.js'
export {
  integrityState, clearState, extractState, pruneState,
  startBackup, startRestore, startIntegrity, startClearStore, startExtractStore,
  startPrune, resumePrune, pausePrune,
  cancelTask, getActiveTask, getLastTask,
}                                                  from './tasks.js'
