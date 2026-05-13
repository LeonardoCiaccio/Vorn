import { ipcMain, Notification, app }                                      from 'electron'
import { logger }                                                          from '../vorn/logger.js'
import { isAbsolute, resolve }                                              from 'path'
import { accessSync, constants }                                           from 'fs'
import { createTask, cancelTask, listTasks, finishTask, failTask }         from '../vorn/taskManager.js'
import { extractByHash }                                                   from '../vorn/restore.js'
import { invalidateListCache }                                             from '../vorn/store.js'
import { ctx, spawnWorker }                                                from '../workerManager.js'
import { loadRun, saveRun, validateSessionName, validateRunTs }            from '../vorn/sessions.js'
import { loadSettings }                                                    from '../vorn/settings.js'
import { assertHash }                                                      from './_validation.js'
import { getAppIcon }                                                      from '../vorn/icon.js'

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
  const notif = new Notification({ title: `Backup completato — ${task.sessionName}`, body, icon: getAppIcon() })
  notif.on('click', () => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    app.focus({ steal: true })
  })
  notif.show()
}

function _logTaskErrors(task, result) {
  if (!Array.isArray(result?.errors) || result.errors.length === 0) return
  const prefix = `Task ${task.type} [${task.id}]${task.sessionName ? ` session="${task.sessionName}"` : ''}`
  logger.warn(`${prefix} completed with ${result.errors.length} file error(s)`)
  for (const e of result.errors) {
    if (Array.isArray(e.issues)) {
      logger.warn(`  [integrity] ${e.hashVorn}: ${e.issues.join(' | ')}`)
    } else {
      const where = e.path ?? e.hash ?? '?'
      const phase = e.phase ? ` [${e.phase}]` : ''
      logger.warn(`  ${phase} ${where}: ${e.error ?? e.message ?? 'unknown error'}`)
    }
  }
}

function _onDone(task, mainWindow) {
  return (result, error) => {
    if (error) {
      logger.error(`Task ${task.type} [${task.id}]${task.sessionName ? ` session="${task.sessionName}"` : ''} failed: ${error}`)
      failTask(task.id, error)
      _send(mainWindow, { taskId: task.id, error })
    } else {
      const errCount = result?.errors?.length ?? 0
      if (errCount > 0) {
        logger.warn(`Task ${task.type} [${task.id}]${task.sessionName ? ` session="${task.sessionName}"` : ''} completed with ${errCount} error(s)`)
      } else {
        logger.info(`Task ${task.type} [${task.id}]${task.sessionName ? ` session="${task.sessionName}"` : ''} completed`)
      }
      _logTaskErrors(task, result)
      finishTask(task.id, result)
      _notifyRunDone(task, result, mainWindow)
      _send(mainWindow, { taskId: task.id, result })
    }
  }
}

export function registerTaskHandlers(mainWindow) {
  ipcMain.handle('vorn:task-cancel', (_, taskId) => cancelTask(taskId))
  ipcMain.handle('vorn:task-list',   ()           => listTasks())

  ipcMain.handle('vorn:start-backup', (_, { sessionName, resumeTs = null }) => {
    if (!ctx.activeStore) throw new Error('Nessuno store aperto')
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
    logger.info(`Task backup started [${task.id}] session="${sessionName}"${resumeTs ? ` resume=${resumeTs}` : ''}`)
    spawnWorker('backupWorker.js', { storeDir: ctx.activeStore, sessionName, resumeTs, runTs }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-restore', (_, { sessionName, runTs, destDir, selectedFiles = null }) => {
    if (!ctx.activeStore) throw new Error('Nessuno store aperto')
    validateSessionName(sessionName)
    validateRunTs(runTs)
    if (!destDir || typeof destDir !== 'string') throw new Error('destDir non valido')
    const resolvedDest = resolve(destDir)
    if (!isAbsolute(resolvedDest)) throw new Error('destDir deve essere un percorso assoluto')
    try { accessSync(resolvedDest, constants.W_OK) }
    catch { throw new Error(`destDir non scrivibile: ${destDir}`) }
    if (listTasks().some(t => t.sessionName === sessionName && t.status === 'running'))
      throw new Error(`Operazione già in corso: ${sessionName}`)
    const task = createTask('restore', sessionName)
    logger.info(`Task restore started [${task.id}] session="${sessionName}" runTs=${runTs} dest="${resolvedDest}"`)
    spawnWorker('restoreWorker.js', { storeDir: ctx.activeStore, sessionName, runTs, destDir: resolvedDest, selectedFiles }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error);   _send(mainWindow, { taskId: task.id, error }) }
        else        { finishTask(task.id, { ...result, status: 'done' }); _send(mainWindow, { taskId: task.id, result }) }
      }
    )
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-integrity', () => {
    if (!ctx.activeStore) throw new Error('Nessuno store aperto')
    if (listTasks().some(t => t.type === 'integrity' && t.status === 'running'))
      throw new Error('Verifica integrità già in corso')
    const task = createTask('integrity', null)
    logger.info(`Task integrity started [${task.id}]`)
    spawnWorker('integrityWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-clear-store', () => {
    if (!ctx.activeStore) throw new Error('Nessuno store aperto')
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile svuotare: operazioni in corso')
    const task = createTask('clear', null)
    logger.info(`Task clear-store started [${task.id}]`)
    spawnWorker('clearWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, (result, error) => {
      if (!error) invalidateListCache()
      _onDone(task, mainWindow)(result, error)
    })
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-extract-store', (_, { destDir, sessionFilter = null }) => {
    if (!ctx.activeStore) throw new Error('Nessuno store aperto')
    if (!destDir || typeof destDir !== 'string') throw new Error('destDir non valido')
    const resolvedDest = resolve(destDir)
    if (!isAbsolute(resolvedDest)) throw new Error('destDir deve essere un percorso assoluto')
    try { accessSync(resolvedDest, constants.W_OK) }
    catch { throw new Error(`destDir non scrivibile: ${destDir}`) }
    if (sessionFilter !== null && typeof sessionFilter !== 'string') throw new Error('sessionFilter non valido')
    if (listTasks().some(t => t.type === 'extract-store' && t.status === 'running'))
      throw new Error('Estrazione store già in corso')
    const task = createTask('extract-store', null)
    logger.info(`Task extract-store started [${task.id}] dest="${resolvedDest}"`)
    spawnWorker('extractStoreWorker.js', { storeDir: ctx.activeStore, destDir: resolvedDest, sessionFilter }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-prune', () => {
    if (!ctx.activeStore) throw new Error('Nessuno store aperto')
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile pulire: operazioni in corso')
    const task = createTask('prune', null)
    logger.info(`Task prune started [${task.id}]`)
    spawnWorker('pruneWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:extract-hash', async (_, { hashVorn, destDir, filename }) => {
    if (!ctx.activeStore) throw new Error('Nessuno store aperto')
    assertHash(hashVorn)
    if (!destDir || typeof destDir !== 'string') throw new Error('destDir non valido')
    const resolvedDest = resolve(destDir)
    if (!isAbsolute(resolvedDest)) throw new Error('destDir deve essere un percorso assoluto')
    return extractByHash(ctx.activeStore, hashVorn, resolvedDest, filename)
  })
}
