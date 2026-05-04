import { ipcMain }                                                          from 'electron'
import { listSessions, getSession, createSession, deleteSession,
         listRuns, loadRun, deleteRun }                                     from '../vorn/sessions.js'
import { hasRunningTask }                                                   from '../vorn/taskManager.js'
import { ctx }                                                              from '../workerManager.js'

function _validateName(name) {
  if (!name || typeof name !== 'string') throw new Error('Nome sessione non valido')
  if (/[/\\]/.test(name) || name.includes('..')) throw new Error(`Nome sessione non sicuro: "${name}"`)
}

// Cache in-memory dell'ultima run letta — evita di rileggere il JSON per ogni chunk di file
let _runCache = null

function _getCachedRun(storeDir, sessionName, runTs) {
  if (_runCache?.storeDir === storeDir && _runCache.sessionName === sessionName && _runCache.runTs === runTs) {
    return _runCache.data
  }
  const data = loadRun(storeDir, sessionName, runTs)
  _runCache = { storeDir, sessionName, runTs, data }
  return data
}

export function registerSessionHandlers() {
  ipcMain.handle('vorn:list-sessions',  ()           => listSessions(ctx.activeStore))
  ipcMain.handle('vorn:get-session',    (_, name)    => { _validateName(name); return getSession(ctx.activeStore, name) })
  ipcMain.handle('vorn:create-session', (_, session) => {
    _validateName(session.name)
    return createSession(ctx.activeStore, session)
  })
  ipcMain.handle('vorn:delete-session', (_, name) => {
    _validateName(name)
    if (hasRunningTask(name)) throw new Error(`Operazione in corso per "${name}"`)
    deleteSession(ctx.activeStore, name)
  })

  ipcMain.handle('vorn:list-runs',  (_, sessionName) => { _validateName(sessionName); return listRuns(ctx.activeStore, sessionName) })

  // Carica solo i metadati della run (senza files) — payload IPC minimale
  ipcMain.handle('vorn:load-run', (_, { sessionName, runTs }) => {
    _validateName(sessionName)
    const run = _getCachedRun(ctx.activeStore, sessionName, runTs)
    const { files, ...meta } = run
    return { ...meta, files_count: Object.keys(files ?? {}).length }
  })

  // Carica i file di una run in pagine — evita payload IPC massicci
  ipcMain.handle('vorn:list-run-files', (_, { sessionName, runTs, offset = 0, limit = 1000, search = '' }) => {
    _validateName(sessionName)
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

  ipcMain.handle('vorn:delete-run', (_, { sessionName, runTs }) => { _validateName(sessionName); return deleteRun(ctx.activeStore, sessionName, runTs) })
}
