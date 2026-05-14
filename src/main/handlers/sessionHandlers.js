import { ipcMain }                                                          from 'electron'
import { listSessions, getSession, createSession, updateSession, deleteSession,
         listRuns, loadRun, deleteRun, validateSessionName, validateRunTs } from '../vorn/sessions.js'
import { hasRunningTask }                                                   from '../vorn/taskManager.js'
import { ctx }                                                              from '../workerManager.js'
import { isAbsolute }                                                       from 'path'

const _validateName = validateSessionName

function _validateSession(session) {
  if (!session || typeof session !== 'object') throw new Error('ERR_INVALID_SESSION')
  if (!Array.isArray(session.sources)) throw new Error('ERR_SOURCES_NOT_ARRAY')
  if (session.sources.length > 50) throw new Error('ERR_TOO_MANY_SOURCES')
  for (const src of session.sources) {
    if (typeof src !== 'string' || src.length > 4096) throw new Error('ERR_INVALID_SOURCE')
    if (!isAbsolute(src)) throw new Error('ERR_SOURCE_NOT_ABSOLUTE')
  }
  if (session.excludes != null) {
    if (typeof session.excludes !== 'object') throw new Error('ERR_INVALID_EXCLUDES')
    if (session.excludes.paths != null) {
      if (!Array.isArray(session.excludes.paths)) throw new Error('ERR_EXCLUDES_PATHS_NOT_ARRAY')
      if (session.excludes.paths.length > 200) throw new Error('ERR_TOO_MANY_EXCLUDE_PATHS')
    }
    if (session.excludes.patterns != null) {
      if (!Array.isArray(session.excludes.patterns)) throw new Error('ERR_EXCLUDES_PATTERNS_NOT_ARRAY')
      if (session.excludes.patterns.length > 200) throw new Error('ERR_TOO_MANY_EXCLUDE_PATTERNS')
    }
  }
  if (session.compressionType != null) {
    if (session.compressionType !== 'gzip')
      throw new Error('ERR_INVALID_COMPRESSION_TYPE')
  }
}

// Cache in-memory dell'ultima run letta — evita di rileggere il JSON per ogni chunk di file
let _runCache = null

function _getCachedRun(storeDir, sessionName, runTs) {
  if (_runCache?.storeDir === storeDir && _runCache.sessionName === sessionName && _runCache.runTs === runTs) {
    return _runCache.data
  }
  const data = loadRun(storeDir, sessionName, runTs)
  if (data.status !== 'running') _runCache = { storeDir, sessionName, runTs, data }
  return data
}

export function registerSessionHandlers() {
  ipcMain.handle('vorn:list-sessions',  ()           => listSessions(ctx.activeStore))
  ipcMain.handle('vorn:get-session',    (_, name)    => { _validateName(name); return getSession(ctx.activeStore, name) })
  ipcMain.handle('vorn:create-session', (_, session) => {
    _validateName(session.name)
    _validateSession(session)
    return createSession(ctx.activeStore, session)
  })
  ipcMain.handle('vorn:update-session', (_, { name, patch }) => {
    _validateName(name)
    if (hasRunningTask(name)) throw new Error('ERR_OPERATION_IN_PROGRESS')
    const allowed = {}
    if (patch.sources         !== undefined) {
      if (!Array.isArray(patch.sources)) throw new Error('ERR_SOURCES_NOT_ARRAY')
      allowed.sources = patch.sources
    }
    if (patch.compressionType !== undefined) {
      if (patch.compressionType != null && patch.compressionType !== 'gzip')
        throw new Error('ERR_INVALID_COMPRESSION_TYPE')
      allowed.compressionType = patch.compressionType
    }
    if (patch.excludes !== undefined) {
      if (typeof patch.excludes !== 'object' || patch.excludes === null)
        throw new Error('ERR_INVALID_EXCLUDES')
      const ex = {}
      if (patch.excludes.paths !== undefined) {
        if (!Array.isArray(patch.excludes.paths)) throw new Error('ERR_EXCLUDES_PATHS_NOT_ARRAY')
        if (patch.excludes.paths.length > 200) throw new Error('ERR_TOO_MANY_EXCLUDE_PATHS')
        ex.paths = patch.excludes.paths
      }
      if (patch.excludes.patterns !== undefined) {
        if (!Array.isArray(patch.excludes.patterns)) throw new Error('ERR_EXCLUDES_PATTERNS_NOT_ARRAY')
        if (patch.excludes.patterns.length > 200) throw new Error('ERR_TOO_MANY_EXCLUDE_PATTERNS')
        ex.patterns = patch.excludes.patterns
      }
      allowed.excludes = ex
    }
    updateSession(ctx.activeStore, name, allowed)
  })

  ipcMain.handle('vorn:delete-session', (_, name) => {
    _validateName(name)
    if (hasRunningTask(name)) throw new Error('ERR_OPERATION_IN_PROGRESS')
    deleteSession(ctx.activeStore, name)
  })

  ipcMain.handle('vorn:list-runs',  (_, sessionName) => { _validateName(sessionName); return listRuns(ctx.activeStore, sessionName) })

  // Carica solo i metadati della run (senza files) — payload IPC minimale
  ipcMain.handle('vorn:load-run', (_, { sessionName, runTs }) => {
    _validateName(sessionName)
    validateRunTs(runTs)
    const run = _getCachedRun(ctx.activeStore, sessionName, runTs)
    const { files, ...meta } = run
    return { ...meta, files_count: Object.keys(files ?? {}).length }
  })

  // Carica i file di una run in pagine — evita payload IPC massicci
  ipcMain.handle('vorn:list-run-files', (_, { sessionName, runTs, offset = 0, limit = 1000, search = '' }) => {
    _validateName(sessionName)
    validateRunTs(runTs)
    const run = _getCachedRun(ctx.activeStore, sessionName, runTs)
    let entries = Object.entries(run.files ?? {})
    if (search) {
      const q = search.toLowerCase()
      entries = entries.filter(([k]) => k.toLowerCase().includes(q))
    }
    const total = entries.length
    const slice = entries.slice(offset, offset + limit)
    return { files: Object.fromEntries(slice), total }
  })

  ipcMain.handle('vorn:delete-run', (_, { sessionName, runTs }) => { _validateName(sessionName); validateRunTs(runTs); return deleteRun(ctx.activeStore, sessionName, runTs) })
}
