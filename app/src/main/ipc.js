import { ipcMain, app } from 'electron'
import { join } from 'path'
import { backup, restore } from './vorn/engine.js'
import {
  listSessions, createSession, listRuns,
  loadRun, getPausedRun, getSession, deleteRun
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

export function registerIpcHandlers(mainWindow) {

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

  // ── Tasks: Backup ─────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-backup', (_, { sessionName, resumeTs = null, excludes = [], maxBytes = 0 }) => {
    if (hasRunningTask(sessionName)) throw new Error(`Operazione già in corso per la sessione: ${sessionName}`)
    const task = createTask('backup', sessionName)
    const opts = {
      resumeTs, excludes, maxBytes,
      onProgress: (progress) => updateTaskProgress(task.id, progress),
    }

    backup(dbPath, sessionName, opts)
      .then(result => {
        finishTask(task.id, result)
        mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result })
      })
      .catch(err => {
        failTask(task.id, err.message)
        mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error: err.message })
      })

    setTaskCancelFn(task.id, () => opts._handle?._cancel())

    return { taskId: task.id }
  })

  // ── Tasks: Restore ────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-restore', (_, { sessionName, runTs, destDir }) => {
    if (hasRunningTask(sessionName)) throw new Error(`Operazione già in corso per la sessione: ${sessionName}`)
    const task = createTask('restore', sessionName)
    const opts = {
      onProgress: (progress) => updateTaskProgress(task.id, progress),
    }

    restore(dbPath, sessionName, runTs, destDir, opts)
      .then(result => {
        finishTask(task.id, { ...result, status: 'done' })
        mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result })
      })
      .catch(err => {
        failTask(task.id, err.message)
        mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error: err.message })
      })

    return { taskId: task.id }
  })

  // ── Tasks: controllo ─────────────────────────────────────────────────────

  ipcMain.handle('vorn:task-cancel',   (_, taskId) => cancelTask(taskId))
  ipcMain.handle('vorn:task-list',     ()           => listTasks())
  ipcMain.handle('vorn:task-snapshot', ()           => listTasks())

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

  ipcMain.handle('vorn:get-app-info', () => ({
    dbPath,
    version:  app.getVersion(),
    platform: process.platform,
  }))
}
