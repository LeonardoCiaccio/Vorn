import { ipcMain, Notification, app }                                      from 'electron'
import { logger }                                                          from '../vorn/logger.js'
import { isAbsolute, resolve, dirname }                                     from 'path'
import { accessSync, mkdirSync, statSync, constants }                      from 'fs'
import { createTask, cancelTask, listTasks, finishTask, failTask }         from '../vorn/taskManager.js'
import { extractByHash }                                                   from '../vorn/restore.js'
import { invalidateListCache }                                             from '../vorn/store.js'
import { ctx, spawnWorker }                                                from '../workerManager.js'
import { loadRun, saveRun, validateSessionName, validateRunTs }            from '../vorn/sessions.js'
import { invalidateRunCache }                                              from './sessionHandlers.js'
import { loadSettings }                                                    from '../vorn/settings.js'
import { getMainT }                                                        from '../vorn/mainI18n.js'
import { assertHash }                                                      from './_validation.js'
import { getAppIcon }                                                      from '../vorn/icon.js'

function _send(mainWindow, payload) {
  if (!mainWindow.isDestroyed()) mainWindow.webContents.send('vorn:task-done', payload)
}

// Sanitize chirurgico per il title delle notifiche OS. validateSessionName blocca
// già path separators / null / .. ma NON control chars o markup. Su Linux DE il
// notification daemon può interpretare markup Pango (<a href>, <b>, <i>): un nome
// tipo `<a href="...">click</a>` apparirebbe come link cliccabile. Sanitizziamo
// solo all'output, senza modificare validateSessionName (romperebbe sessioni esistenti).
function _sanitizeForNotification(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/[\x00-\x1f\x7f<>&]/g, '_').slice(0, 80)
}

function _notifyRunDone(task, result, mainWindow) {
  if (!loadSettings().notifications) return
  if (!Notification.isSupported()) return
  if (task.type !== 'backup' || result?.status !== 'done') return
  const errors = result.errors?.length ?? 0
  const t      = getMainT()
  const body   = t.backupDoneBody(result.files_total, errors)
  const notif  = new Notification({ title: t.backupDoneTitle(_sanitizeForNotification(task.sessionName)), body, icon: getAppIcon() })
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
      logger.warn(`  [integrity] ${e.hashVorn}: ${e.issues.map(i => i.code).join(' | ')}`)
    } else {
      const where = e.path ?? e.hash ?? '?'
      const phase = e.phase ? ` [${e.phase}]` : ''
      logger.warn(`  ${phase} ${where}: ${e.error ?? e.message ?? 'unknown error'}`)
    }
  }
}

function _backupOnDone(task, storeDir, runTs, mainWindow) {
  return (result, error) => {
    if (!error) {
      try {
        const run = loadRun(storeDir, task.sessionName, runTs)
        if (run.status === 'running') {
          run.status = 'paused'
          saveRun(storeDir, task.sessionName, run)
        }
      } catch { /* run non trovato o store non raggiungibile */ }
    }
    // Il backup ha aggiornato il run su disco (status, files, errors): qualunque
    // cache mirata su (sessionName, runTs) è stale → invalidare.
    invalidateRunCache(task.sessionName, runTs)
    _onDone(task, mainWindow)(result, error)
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

// Task che mutano lo store: solo uno alla volta (e nessuno altro che muti contemporaneamente).
// Senza questo gate, un backup partito durante un prune può vedersi cancellati i suoi nuovi
// .vorn dal prune che ha già fatto lo scan delle reference → data loss reale.
const _MUTATING_TASK_TYPES = new Set(['backup', 'prune', 'clear', 'extract-store', 'restore'])
// Exported per session-level guards (delete-session, ecc.) che devono bloccare
// qualunque operazione di store-mutation in corso, non solo backup della stessa sessione.
export function assertNoMutatingTask() {
  if (listTasks().some(t => t.status === 'running' && _MUTATING_TASK_TYPES.has(t.type)))
    throw new Error('ERR_OPERATION_IN_PROGRESS')
}
const _assertNoMutatingTask = assertNoMutatingTask

export function registerTaskHandlers(mainWindow) {
  ipcMain.handle('vorn:task-cancel', (_, taskId) => cancelTask(taskId))
  ipcMain.handle('vorn:task-list',   ()           => listTasks())

  ipcMain.handle('vorn:start-backup', (_, { sessionName, resumeTs = null }) => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    validateSessionName(sessionName)
    _assertNoMutatingTask()
    // Scrivi il run su disco prima di avviare il worker — il watcher potrebbe
    // fare refreshSession prima che il worker abbia avuto tempo di crearlo.
    let runTs
    if (resumeTs) {
      validateRunTs(resumeTs)
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
    const storeDir = ctx.activeStore
    spawnWorker('backupWorker.js', { storeDir, sessionName, resumeTs, runTs }, task.id, mainWindow, _backupOnDone(task, storeDir, runTs, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-restore', (_, { sessionName, runTs, destDir, selectedFiles = null }) => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    validateSessionName(sessionName)
    validateRunTs(runTs)
    // destDir = null → ripristino originale (path assolute dai run.files)
    let resolvedDest = null
    if (destDir !== null && destDir !== undefined) {
      if (typeof destDir !== 'string') throw new Error('ERR_INVALID_DEST_DIR')
      resolvedDest = resolve(destDir)
      if (!isAbsolute(resolvedDest)) throw new Error('ERR_DEST_NOT_ABSOLUTE')
      try { mkdirSync(resolvedDest, { recursive: true }) } catch (e) {
        if (e.code === 'EEXIST') {
          try { if (!statSync(resolvedDest).isDirectory()) resolvedDest = dirname(resolvedDest) } catch { /* ignore */ }
        }
      }
      try { accessSync(resolvedDest, constants.W_OK) }
      catch { throw new Error('ERR_DEST_NOT_WRITABLE') }
    }
    if (selectedFiles !== null) {
      if (!Array.isArray(selectedFiles) || selectedFiles.length > 100_000) throw new Error('ERR_INVALID_SELECTED_FILES')
      for (const f of selectedFiles)
        if (typeof f !== 'string' || f.length === 0 || f.length > 4096 || f.includes('\x00')) throw new Error('ERR_INVALID_SELECTED_FILES')
    }
    _assertNoMutatingTask()
    const task = createTask('restore', sessionName)
    logger.info(`Task restore started [${task.id}] session="${sessionName}" runTs=${runTs} dest="${resolvedDest ?? 'original'}"`)
    spawnWorker('restoreWorker.js', { storeDir: ctx.activeStore, sessionName, runTs, destDir: resolvedDest, selectedFiles }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error);   _send(mainWindow, { taskId: task.id, error }) }
        else        { finishTask(task.id, { ...result, status: 'done' }); _send(mainWindow, { taskId: task.id, result }) }
      }
    )
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-integrity', () => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    if (listTasks().some(t => t.type === 'integrity' && t.status === 'running'))
      throw new Error('ERR_INTEGRITY_RUNNING')
    const task = createTask('integrity', null)
    logger.info(`Task integrity started [${task.id}]`)
    spawnWorker('integrityWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-clear-store', () => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    _assertNoMutatingTask()
    const task = createTask('clear', null)
    logger.info(`Task clear-store started [${task.id}]`)
    spawnWorker('clearWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, (result, error) => {
      if (!error) invalidateListCache()
      _onDone(task, mainWindow)(result, error)
    })
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-extract-store', (_, { destDir, sessionFilter = null }) => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    if (!destDir || typeof destDir !== 'string') throw new Error('ERR_INVALID_DEST_DIR')
    let resolvedDest = resolve(destDir)
    if (!isAbsolute(resolvedDest)) throw new Error('ERR_DEST_NOT_ABSOLUTE')
    try { mkdirSync(resolvedDest, { recursive: true }) } catch (e) {
      if (e.code === 'EEXIST') {
        try { if (!statSync(resolvedDest).isDirectory()) resolvedDest = dirname(resolvedDest) } catch { /* ignore */ }
      }
    }
    try { accessSync(resolvedDest, constants.W_OK) }
    catch { throw new Error('ERR_DEST_NOT_WRITABLE') }
    if (sessionFilter !== null && typeof sessionFilter !== 'string') throw new Error('ERR_INVALID_SESSION_FILTER')
    _assertNoMutatingTask()
    const task = createTask('extract-store', null)
    logger.info(`Task extract-store started [${task.id}] dest="${resolvedDest}"`)
    spawnWorker('extractStoreWorker.js', { storeDir: ctx.activeStore, destDir: resolvedDest, sessionFilter }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:start-prune', () => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    _assertNoMutatingTask()
    const task = createTask('prune', null)
    logger.info(`Task prune started [${task.id}]`)
    spawnWorker('pruneWorker.js', { storeDir: ctx.activeStore }, task.id, mainWindow, _onDone(task, mainWindow))
    return { taskId: task.id }
  })

  ipcMain.handle('vorn:extract-hash', async (_, { hashVorn, destDir, filename }) => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    assertHash(hashVorn)
    if (!destDir || typeof destDir !== 'string') throw new Error('ERR_INVALID_DEST_DIR')
    const resolvedDest = resolve(destDir)
    if (!isAbsolute(resolvedDest)) throw new Error('ERR_DEST_NOT_ABSOLUTE')
    if (filename !== undefined && filename !== null) {
      if (typeof filename !== 'string' || filename.length === 0 || filename.length > 255 || filename.includes('\x00'))
        throw new Error('ERR_INVALID_FILENAME')
    }
    // Stesso gate degli altri task mutanti: prune/clear in corso possono
    // cancellare il file (come orfano) mentre extractByHash lo sta leggendo.
    _assertNoMutatingTask()
    return extractByHash(ctx.activeStore, hashVorn, resolvedDest, filename)
  })
}
