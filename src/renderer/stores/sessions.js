import { state } from './vorn.js'

const RUN_FILES_PAGE = 1000

// ── Sessioni ──────────────────────────────────────────────────────────────────

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

export async function createSession(session) {
  const created = await window.vorn.createSession(session)
  state.sessions.unshift({ ...created, runs: [] })
  return created
}

export async function deleteSession(name) {
  await window.vorn.deleteSession(name)
  const idx = state.sessions.findIndex(s => s.name === name)
  if (idx >= 0) state.sessions.splice(idx, 1)
  if (state.selectedSession?.name === name) {
    state.selectedSession = null
    state.selectedRun     = null
    state.selectedRunFull = null
    state.currentView     = 'sessions'
  }
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
  // Carica solo i metadati — nessun payload IPC massiccio
  const meta = await window.vorn.loadRun(sessionName, runTs)
  state.selectedRunFull = {
    ...meta,
    files:         null,      // null = spinner in FileTree
    _filesLoaded:  0,
    _filesTotal:   meta.files_count ?? 0,
    _filesLoading: true,
  }
  // Carica i file in chunks in background
  _loadFilesChunk(sessionName, runTs, 0)
}

async function _loadFilesChunk(sessionName, runTs, offset) {
  const { files, total } = await window.vorn.listRunFiles(sessionName, runTs, offset, RUN_FILES_PAGE, '')

  // L'utente potrebbe aver cambiato run nel frattempo
  if (!state.selectedRunFull || state.selectedRunFull.ts !== runTs) return

  if (offset === 0) {
    state.selectedRunFull.files = files
  } else {
    Object.assign(state.selectedRunFull.files, files)
  }

  const loaded = offset + Object.keys(files).length
  state.selectedRunFull._filesLoaded = loaded
  state.selectedRunFull._filesTotal  = total

  if (loaded < total) {
    _loadFilesChunk(sessionName, runTs, loaded)
  } else {
    state.selectedRunFull._filesLoading = false
  }
}
