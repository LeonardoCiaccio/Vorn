import { ipcMain }                                                          from 'electron'
import { listSessions, getSession, createSession, updateSession, deleteSession,
         listRuns, loadRun, deleteRun, validateSessionName, validateRunTs } from '../vorn/sessions.js'
import { hasRunningTask }                                                   from '../vorn/taskManager.js'
import { ctx }                                                              from '../workerManager.js'
import { isAbsolute }                                                       from 'path'

const _validateName = validateSessionName

// Helper centralizzati: stessi vincoli applicati da create-session e update-session.
// Importante che siano IDENTICI per evitare drift (es. aggiungere zstd in un solo
// posto lascerebbe l'altro a rifiutare il nuovo tipo).
function _validateCompression(v) {
  if (v != null && v !== 'gzip') throw new Error('ERR_INVALID_COMPRESSION_TYPE')
}
function _validateStrategy(v) {
  if (v != null && v !== 'chunks' && v !== 'bytes') throw new Error('ERR_INVALID_STRATEGY')
}
function _validateExcludes(ex) {
  if (typeof ex !== 'object' || ex === null) throw new Error('ERR_INVALID_EXCLUDES')
  if (ex.paths != null) {
    if (!Array.isArray(ex.paths)) throw new Error('ERR_EXCLUDES_PATHS_NOT_ARRAY')
    if (ex.paths.length > 200) throw new Error('ERR_TOO_MANY_EXCLUDE_PATHS')
  }
  if (ex.patterns != null) {
    if (!Array.isArray(ex.patterns)) throw new Error('ERR_EXCLUDES_PATTERNS_NOT_ARRAY')
    if (ex.patterns.length > 200) throw new Error('ERR_TOO_MANY_EXCLUDE_PATTERNS')
  }
}

function _validateSession(session) {
  if (!session || typeof session !== 'object') throw new Error('ERR_INVALID_SESSION')
  if (!Array.isArray(session.sources)) throw new Error('ERR_SOURCES_NOT_ARRAY')
  if (session.sources.length > 50) throw new Error('ERR_TOO_MANY_SOURCES')
  for (const src of session.sources) {
    if (typeof src !== 'string' || src.length > 4096) throw new Error('ERR_INVALID_SOURCE')
    if (!isAbsolute(src)) throw new Error('ERR_SOURCE_NOT_ABSOLUTE')
  }
  if (session.excludes != null) _validateExcludes(session.excludes)
  _validateCompression(session.compressionType)
  _validateStrategy(session.strategy)
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

// Invalidazione mirata: chiamata dal taskHandler quando un backup termina, dal
// delete-run, dalla chiusura dello store. Senza argomenti pulisce tutto.
export function invalidateRunCache(sessionName, runTs) {
  if (!_runCache) return
  if (sessionName === undefined) { _runCache = null; return }
  if (_runCache.sessionName !== sessionName) return
  if (runTs !== undefined && _runCache.runTs !== runTs) return
  _runCache = null
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
      _validateCompression(patch.compressionType)
      allowed.compressionType = patch.compressionType
    }
    if (patch.strategy !== undefined) {
      _validateStrategy(patch.strategy)
      allowed.strategy = patch.strategy
    }
    if (patch.excludes !== undefined) {
      _validateExcludes(patch.excludes)
      const ex = {}
      if (patch.excludes.paths !== undefined)    ex.paths    = patch.excludes.paths
      if (patch.excludes.patterns !== undefined) ex.patterns = patch.excludes.patterns
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

  ipcMain.handle('vorn:delete-run', (_, { sessionName, runTs }) => {
    _validateName(sessionName); validateRunTs(runTs)
    invalidateRunCache(sessionName, runTs)
    return deleteRun(ctx.activeStore, sessionName, runTs)
  })
}
