import { ipcMain }                                                from 'electron'
import { createTask, cancelTask, listTasks, finishTask, failTask } from '../vorn/taskManager.js'
import { extractByHash }                                           from '../vorn/restore.js'
import { ctx, spawnWorker }                                        from '../workerManager.js'
import { loadRun, saveRun }                                        from '../vorn/sessions.js'

function _onDone(task, mainWindow) {
  return (result, error) => {
    if (error) { failTask(task.id, error);   mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error }) }
    else        { finishTask(task.id, result); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result }) }
  }
}

export function registerTaskHandlers(mainWindow) {
  ipcMain.handle('vorn:task-cancel', (_, taskId) => cancelTask(taskId))
  ipcMain.handle('vorn:task-list',   ()           => listTasks())

  ipcMain.handle('vorn:start-backup', (_, { sessionName, resumeTs = null }) => {
    if (listTasks().some(t => t.sessionName === sessionName && t.status === 'running'))
      throw new Error(`Operazione già in corso: ${sessionName}`)
    // Aggiorna subito il run su disco a 'running' così refreshSession legge lo stato corretto
    if (resumeTs) {
      try {
        const run = loadRun(ctx.activeStore, sessionName, resumeTs)
        run.status = 'running'
        saveRun(ctx.activeStore, sessionName, run)
      } catch { /* run non trovato: il worker lo creerà */ }
    }
    const task = createTask('backup', sessionName)
    spawnWorker('backupWorker.js', { storeDir: ctx.activeStore, sessionName, resumeTs }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-restore', (_, { sessionName, runTs, destDir, selectedFiles = null }) => {
    if (listTasks().some(t => t.sessionName === sessionName && t.status === 'running'))
      throw new Error(`Operazione già in corso: ${sessionName}`)
    const task = createTask('restore', sessionName)
    spawnWorker('restoreWorker.js', { storeDir: ctx.activeStore, sessionName, runTs, destDir, selectedFiles }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error);   mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error }) }
        else        { finishTask(task.id, { ...result, status: 'done' }); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result }) }
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

  ipcMain.handle('vorn:extract-hash', async (_, { hashVorn, destDir, filename }) =>
    extractByHash(ctx.activeStore, hashVorn, destDir, filename)
  )
}
