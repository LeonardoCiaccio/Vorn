import { ipcMain, Notification, nativeImage, app }                  from 'electron'
import { join }                                                    from 'path'
import { createTask, cancelTask, listTasks, finishTask, failTask } from '../vorn/taskManager.js'
import { extractByHash }                                           from '../vorn/restore.js'
import { ctx, spawnWorker }                                        from '../workerManager.js'
import { loadRun, saveRun, validateSessionName }                   from '../vorn/sessions.js'
import { loadSettings }                                            from '../vorn/settings.js'

let _icon = null
function _getIcon() {
  if (!_icon) _icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
  return _icon
}

function _send(mainWindow, payload) {
  if (!mainWindow.isDestroyed()) mainWindow.webContents.send('vorn:task-done', payload)
}

function _notifyRunDone(task, result, mainWindow) {
  if (!loadSettings().notifications) return
  if (!Notification.isSupported()) return
  if (task.type !== 'backup' || result?.status !== 'done') return
  const errors = result.errors?.length ?? 0
  const body = errors > 0
    ? `${result.files_total} file — ${errors} errori`
    : `${result.files_total} file completati`
  const notif = new Notification({ title: `Backup completato — ${task.sessionName}`, body, icon: _getIcon() })
  notif.on('click', () => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    app.focus({ steal: true })
  })
  notif.show()
}

function _onDone(task, mainWindow) {
  return (result, error) => {
    if (error) { failTask(task.id, error);   _send(mainWindow, { taskId: task.id, error }) }
    else        { finishTask(task.id, result); _notifyRunDone(task, result, mainWindow); _send(mainWindow, { taskId: task.id, result }) }
  }
}

export function registerTaskHandlers(mainWindow) {
  ipcMain.handle('vorn:task-cancel', (_, taskId) => cancelTask(taskId))
  ipcMain.handle('vorn:task-list',   ()           => listTasks())

  ipcMain.handle('vorn:start-backup', (_, { sessionName, resumeTs = null }) => {
    validateSessionName(sessionName)
    if (listTasks().some(t => t.sessionName === sessionName && t.status === 'running'))
      throw new Error(`Operazione già in corso: ${sessionName}`)
    // Scrivi il run su disco prima di avviare il worker — il watcher potrebbe
    // fare refreshSession prima che il worker abbia avuto tempo di crearlo.
    let runTs
    if (resumeTs) {
      runTs = resumeTs
      try {
        const run = loadRun(ctx.activeStore, sessionName, resumeTs)
        run.status = 'running'
        saveRun(ctx.activeStore, sessionName, run)
      } catch { /* run non trovato: il worker lo creerà */ }
    } else {
      runTs = new Date().toISOString()
      saveRun(ctx.activeStore, sessionName, { ts: runTs, status: 'running', files: {} })
    }
    const task = createTask('backup', sessionName)
    spawnWorker('backupWorker.js', { storeDir: ctx.activeStore, sessionName, resumeTs, runTs }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-restore', (_, { sessionName, runTs, destDir, selectedFiles = null }) => {
    validateSessionName(sessionName)
    if (listTasks().some(t => t.sessionName === sessionName && t.status === 'running'))
      throw new Error(`Operazione già in corso: ${sessionName}`)
    const task = createTask('restore', sessionName)
    spawnWorker('restoreWorker.js', { storeDir: ctx.activeStore, sessionName, runTs, destDir, selectedFiles }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error);   _send(mainWindow, { taskId: task.id, error }) }
        else        { finishTask(task.id, { ...result, status: 'done' }); _send(mainWindow, { taskId: task.id, result }) }
      }
    )
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-integrity', () => {
    const task = createTask('integrity', null)
    spawnWorker('integrityWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-clear-store', () => {
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile svuotare: operazioni in corso')
    const task = createTask('clear', null)
    spawnWorker('clearWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-extract-store', (_, { destDir, sessionFilter = null }) => {
    const task = createTask('extract-store', null)
    spawnWorker('extractStoreWorker.js', { storeDir: ctx.activeStore, destDir, sessionFilter }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-prune', () => {
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile pulire: operazioni in corso')
    const task = createTask('prune', null)
    spawnWorker('pruneWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:resume-prune', (_, { orphanList, nextIndex }) => {
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile riprendere: operazioni in corso')
    const task = createTask('prune', null)
    spawnWorker('pruneWorker.js', { storeDir: ctx.activeStore, orphanList, startIndex: nextIndex }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:pause-prune', (_, taskId) => {
    const entry = ctx.activeWorkers.get(taskId)
    if (entry) Atomics.store(entry.cancelFlag, 0, 2)
    return true
  })

  ipcMain.handle('vorn:extract-hash', async (_, { hashVorn, destDir, filename }) =>
    extractByHash(ctx.activeStore, hashVorn, destDir, filename)
  )
}
