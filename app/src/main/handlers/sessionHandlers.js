import { ipcMain }                                                          from 'electron'
import { listSessions, getSession, createSession, deleteSession,
         listRuns, loadRun, deleteRun }                                     from '../vorn/sessions.js'
import { hasRunningTask }                                                   from '../vorn/taskManager.js'
import { ctx }                                                              from '../workerManager.js'

function _validateName(name) {
  if (!name || typeof name !== 'string') throw new Error('Nome sessione non valido')
  if (/[/\\]/.test(name) || name.includes('..')) throw new Error(`Nome sessione non sicuro: "${name}"`)
}

export function registerSessionHandlers() {
  ipcMain.handle('vorn:list-sessions',  ()           => listSessions(ctx.activeStore))
  ipcMain.handle('vorn:get-session',    (_, name)    => { _validateName(name); return getSession(ctx.activeStore, name) })
  ipcMain.handle('vorn:create-session', (_, session) => createSession(ctx.activeStore, session))
  ipcMain.handle('vorn:delete-session', (_, name) => {
    _validateName(name)
    if (hasRunningTask(name)) throw new Error(`Operazione in corso per "${name}"`)
    deleteSession(ctx.activeStore, name)
  })

  ipcMain.handle('vorn:list-runs',  (_, sessionName)            => { _validateName(sessionName); return listRuns(ctx.activeStore, sessionName) })
  ipcMain.handle('vorn:load-run',   (_, { sessionName, runTs }) => { _validateName(sessionName); return loadRun(ctx.activeStore, sessionName, runTs) })
  ipcMain.handle('vorn:delete-run', (_, { sessionName, runTs }) => { _validateName(sessionName); return deleteRun(ctx.activeStore, sessionName, runTs) })
}
