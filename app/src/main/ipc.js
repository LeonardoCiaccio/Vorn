import { ipcMain, app } from 'electron'
import { join } from 'path'
import { Worker } from 'worker_threads'
import {
  listSessions, createSession, listRuns,
  loadRun, saveRun, getPausedRun, getSession, deleteRun, deleteSession,
  getLastUsedStore, fixOrphanedRuns
} from './vorn/manifest.js'
import { getEntry, listStoreFiles } from './vorn/store.js'
import { readVorn } from './vorn/format.js'
import { existsSync } from 'fs'
import { homedir } from 'os'
import {
  createTask, setTaskCancelFn, updateTaskProgress,
  finishTask, failTask, cancelTask, listTasks, hasRunningTask
} from './vorn/taskManager.js'

const dbPath = join(homedir(), '.vorn', 'vorn.db')

// taskId → { worker, cancelFlag } — per cleanup al quit
const _activeWorkers = new Map()

function _spawnWorker(workerFile, workerData, taskId, mainWindow, onDone) {
  const cancelBuffer = new SharedArrayBuffer(4)
  const cancelFlag   = new Int32Array(cancelBuffer)

  const worker = new Worker(join(__dirname, workerFile), {
    workerData: { ...workerData, cancelBuffer }
  })

  _activeWorkers.set(taskId, { worker, cancelFlag })

  worker.on('message', ({ type, progress, result, error }) => {
    if (type === 'progress') {
      updateTaskProgress(taskId, progress)
      mainWindow.webContents.send('vorn:task-progress', { taskId, ...progress })
    } else if (type === 'done') {
      _activeWorkers.delete(taskId)
      onDone(result, null)
    } else if (type === 'error') {
      _activeWorkers.delete(taskId)
      onDone(null, error)
    }
  })

  worker.on('error', (err) => {
    _activeWorkers.delete(taskId)
    onDone(null, err.message)
  })

  setTaskCancelFn(taskId, () => Atomics.store(cancelFlag, 0, 1))

  return cancelFlag
}

export function registerIpcHandlers(mainWindow) {

  // Ripristina run orfane lasciate 'running' da un eventuale crash precedente
  fixOrphanedRuns(dbPath)

  // Graceful shutdown: segnala a tutti i worker attivi di fermarsi, poi aspetta
  // (max 5s) prima di lasciare chiudere l'app
  app.once('before-quit', (e) => {
    if (_activeWorkers.size === 0) return
    e.preventDefault()
    const promises = []
    for (const { worker, cancelFlag } of _activeWorkers.values()) {
      Atomics.store(cancelFlag, 0, 1)
      promises.push(new Promise(resolve => {
        const timeout = setTimeout(() => { worker.terminate(); resolve() }, 5000)
        worker.once('exit', () => { clearTimeout(timeout); resolve() })
      }))
    }
    Promise.all(promises).then(() => app.quit())
  })

  // ── Sessions ──────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:list-sessions', () => listSessions(dbPath))

  ipcMain.handle('vorn:create-session', (_, { name, store, sources }) =>
    createSession(dbPath, name, store, sources)
  )

  ipcMain.handle('vorn:get-session', (_, name) => getSession(dbPath, name))

  // ── Runs ──────────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:list-runs', (_, sessionName) => listRuns(dbPath, sessionName))

  ipcMain.handle('vorn:load-run', (_, { sessionName, runTs }) =>
    loadRun(dbPath, sessionName, runTs)
  )

  ipcMain.handle('vorn:get-paused-run', (_, sessionName) => getPausedRun(dbPath, sessionName))

  ipcMain.handle('vorn:delete-run', (_, { sessionName, runTs }) =>
    deleteRun(dbPath, sessionName, runTs)
  )

  ipcMain.handle('vorn:delete-session', (_, name) => {
    if (hasRunningTask(name)) throw new Error(`Impossibile eliminare: backup o restore in corso per la sessione "${name}"`)
    deleteSession(dbPath, name)
  })

  // ── Tasks: Backup ─────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-backup', (_, { sessionName, resumeTs = null, excludes = [], maxBytes = 0 }) => {
    if (hasRunningTask(sessionName)) throw new Error(`Operazione già in corso per la sessione: ${sessionName}`)
    const task = createTask('backup', sessionName)

    // Aggiorna DB subito se resume: refreshSession nel renderer vedrà già 'running'
    if (resumeTs) {
      const run = loadRun(dbPath, sessionName, resumeTs)
      if (run) { run.status = 'running'; saveRun(dbPath, sessionName, resumeTs, run) }
    }

    _spawnWorker('backupWorker.js', { dbPath, sessionName, opts: { resumeTs, excludes, maxBytes } }, task.id, mainWindow,
      (result, error) => {
        if (error) {
          failTask(task.id, error)
          mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error })
        } else {
          finishTask(task.id, result)
          mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result })
        }
      }
    )

    return { taskId: task.id }
  })

  // ── Tasks: Restore ────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-restore', (_, { sessionName, runTs, destDir, selectedFiles = null }) => {
    if (hasRunningTask(sessionName)) throw new Error(`Operazione già in corso per la sessione: ${sessionName}`)
    const task = createTask('restore', sessionName)

    _spawnWorker('restoreWorker.js', { dbPath, sessionName, runTs, destDir, selectedFiles }, task.id, mainWindow,
      (result, error) => {
        if (error) {
          failTask(task.id, error)
          mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error })
        } else {
          finishTask(task.id, { ...result, status: 'done' })
          mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result })
        }
      }
    )

    return { taskId: task.id }
  })

  // ── Tasks: controllo ─────────────────────────────────────────────────────

  ipcMain.handle('vorn:task-cancel', (_, taskId) => cancelTask(taskId))
  ipcMain.handle('vorn:task-list',   ()           => listTasks())

  // ── Reconstruct ───────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-reconstruct', (_, { storeDir }) => {
    const anyRunning = listTasks().some(t => t.status === 'running')
    if (anyRunning) throw new Error('Impossibile ricostruire: operazioni in corso')
    const task = createTask('reconstruct', null)

    _spawnWorker('reconstructWorker.js', { dbPath, storeDir }, task.id, mainWindow,
      (result, error) => {
        if (error) {
          failTask(task.id, error)
          mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error })
        } else {
          finishTask(task.id, result)
          mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result })
        }
      }
    )

    return { taskId: task.id }
  })

  // ── Store ─────────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:inspect-hash', (_, { store, hashVorn }) => getEntry(store, hashVorn))

  ipcMain.handle('vorn:inspect-file', (_, filePath) => {
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
    const { meta } = readVorn(filePath)
    return meta
  })

  ipcMain.handle('vorn:list-store-files', (_, { storeDir, offset, limit }) =>
    listStoreFiles(storeDir, offset, limit)
  )

  // ── App info ──────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:resolve-store', (_, { defaultStore }) => {
    const last = getLastUsedStore(dbPath)
    if (last && existsSync(last)) return { store: last, source: 'last' }
    if (defaultStore && existsSync(defaultStore)) return { store: defaultStore, source: 'default' }
    return { store: null, source: 'none' }
  })

  ipcMain.handle('vorn:get-app-info', () => ({
    dbPath,
    version:  app.getVersion(),
    platform: process.platform,
  }))
}
