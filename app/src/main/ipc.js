import { ipcMain, app, dialog } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync } from 'fs'
import { hostname } from 'os'
import { Worker } from 'worker_threads'
import { listSessions, getSession, createSession, deleteSession, listRuns, loadRun, deleteRun } from './vorn/sessions.js'
import { storeBlob, getEntry, listStoreFiles, countStoreFiles, deleteStoreEntry } from './vorn/store.js'
import { extractByHash } from './vorn/engine.js'
import { loadSettings, saveSettings, addRecentStore } from './vorn/settings.js'
import {
  createTask, setTaskCancelFn, updateTaskProgress,
  finishTask, failTask, cancelTask, listTasks, hasRunningTask
} from './vorn/taskManager.js'

const _activeWorkers = new Map()
let _activeStore     = null
let _storeWatcher    = null

// ── Store health poller ───────────────────────────────────────────────────────

function _startStoreWatch(mainWindow) {
  _stopStoreWatch()
  _storeWatcher = setInterval(() => {
    if (!_activeStore) return _stopStoreWatch()
    try { statSync(_activeStore) }
    catch { _triggerDisconnect(mainWindow) }
  }, 2000)
}

function _stopStoreWatch() {
  if (_storeWatcher) { clearInterval(_storeWatcher); _storeWatcher = null }
}

function _triggerDisconnect(mainWindow) {
  if (!_activeStore) return
  _stopStoreWatch()
  for (const { cancelFlag: cf } of _activeWorkers.values()) Atomics.store(cf, 0, 1)
  _activeWorkers.clear()
  _releaseLock(_activeStore)
  _activeStore = null
  mainWindow.webContents.send('vorn:store-disconnected')
}

// ── Worker spawn ──────────────────────────────────────────────────────────────

function _spawnWorker(workerFile, workerData, taskId, mainWindow, onDone) {
  const cancelBuffer = new SharedArrayBuffer(4)
  const cancelFlag   = new Int32Array(cancelBuffer)

  const worker = new Worker(join(__dirname, workerFile), {
    workerData: { ...workerData, cancelBuffer }
  })

  _activeWorkers.set(taskId, { worker, cancelFlag })

  worker.on('message', (msg) => {
    const { type } = msg
    if (type === 'store-request') {
      const { id, hashVorn, bytes, filePath, sessionId, sessionName, relPath } = msg
      storeBlob(_activeStore, hashVorn, bytes, filePath, sessionId, sessionName, relPath)
        .then(outcome => worker.postMessage({ type: 'store-result', id, outcome }))
        .catch(err    => worker.postMessage({ type: 'store-result', id, error: err.message }))
    } else if (type === 'progress') {
      updateTaskProgress(taskId, msg.progress)
      mainWindow.webContents.send('vorn:task-progress', { taskId, ...msg.progress })
    } else if (type === 'done') {
      _activeWorkers.delete(taskId)
      onDone(msg.result, null)
    } else if (type === 'error') {
      _activeWorkers.delete(taskId)
      onDone(null, msg.error)
    } else if (type === 'store-disconnected') {
      onDone(null, 'Store non raggiungibile')
      _triggerDisconnect(mainWindow)
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

  app.once('before-quit', (e) => {
    _stopStoreWatch()
    if (_activeStore) _releaseLock(_activeStore)
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

  // ── Store ─────────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:open-store', async (_, { storeDir }) => {
    if (!existsSync(storeDir)) throw new Error('Cartella non trovata')

    const lockErr = _checkLock(storeDir)
    if (lockErr) throw new Error(lockErr)

    if (_activeStore && _activeStore !== storeDir) {
      _releaseLock(_activeStore)
    }

    _acquireLock(storeDir)
    _activeStore = storeDir
    addRecentStore(storeDir)
    _startStoreWatch(mainWindow)

    return { ok: true }
  })

  ipcMain.handle('vorn:close-store', () => {
    _stopStoreWatch()
    if (_activeStore) { _releaseLock(_activeStore); _activeStore = null }
  })

  ipcMain.handle('vorn:get-settings',  ()        => loadSettings())
  ipcMain.handle('vorn:save-settings', (_, patch) => saveSettings(patch))

  // ── Sessions ──────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:list-sessions',  ()           => listSessions(_activeStore))
  ipcMain.handle('vorn:get-session',    (_, name)    => getSession(_activeStore, name))
  ipcMain.handle('vorn:create-session', (_, session) => createSession(_activeStore, session))
  ipcMain.handle('vorn:delete-session', (_, name) => {
    if (hasRunningTask(name)) throw new Error(`Operazione in corso per "${name}"`)
    deleteSession(_activeStore, name)
  })

  // ── Runs ──────────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:list-runs',  (_, sessionName)            => listRuns(_activeStore, sessionName))
  ipcMain.handle('vorn:load-run',   (_, { sessionName, runTs }) => loadRun(_activeStore, sessionName, runTs))
  ipcMain.handle('vorn:delete-run', (_, { sessionName, runTs }) => deleteRun(_activeStore, sessionName, runTs))

  // ── Backup ────────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-backup', (_, { sessionName, resumeTs = null }) => {
    if (hasRunningTask(sessionName)) throw new Error(`Operazione già in corso: ${sessionName}`)
    const task = createTask('backup', sessionName)
    _spawnWorker('backupWorker.js', { storeDir: _activeStore, sessionName, resumeTs }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error }) }
        else        { finishTask(task.id, result); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result }) }
      }
    )
    return { taskId: task.id }
  })

  // ── Restore ───────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-restore', (_, { sessionName, runTs, destDir, selectedFiles = null }) => {
    if (hasRunningTask(sessionName)) throw new Error(`Operazione già in corso: ${sessionName}`)
    const task = createTask('restore', sessionName)
    _spawnWorker('restoreWorker.js', { storeDir: _activeStore, sessionName, runTs, destDir, selectedFiles }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error }) }
        else        { finishTask(task.id, { ...result, status: 'done' }); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result }) }
      }
    )
    return { taskId: task.id }
  })

  // ── Task controls ─────────────────────────────────────────────────────────

  ipcMain.handle('vorn:task-cancel', (_, taskId) => cancelTask(taskId))
  ipcMain.handle('vorn:task-list',   ()           => listTasks())

  // ── Integrity ─────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-integrity', () => {
    const task = createTask('integrity', null)
    _spawnWorker('integrityWorker.js', { storeDir: _activeStore }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error }) }
        else        { finishTask(task.id, result); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result }) }
      }
    )
    return { taskId: task.id }
  })

  // ── Clear store ───────────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-clear-store', () => {
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile svuotare: operazioni in corso')
    const task = createTask('clear', null)
    _spawnWorker('clearWorker.js', { storeDir: _activeStore }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error }) }
        else        { finishTask(task.id, result); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result }) }
      }
    )
    return { taskId: task.id }
  })

  // ── Extract from store ────────────────────────────────────────────────────

  ipcMain.handle('vorn:start-extract-store', (_, { destDir, sessionFilter = null }) => {
    const task = createTask('extract-store', null)
    _spawnWorker('extractStoreWorker.js', { storeDir: _activeStore, destDir, sessionFilter }, task.id, mainWindow,
      (result, error) => {
        if (error) { failTask(task.id, error); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, error }) }
        else        { finishTask(task.id, result); mainWindow.webContents.send('vorn:task-done', { taskId: task.id, result }) }
      }
    )
    return { taskId: task.id }
  })

  // ── Store browser ─────────────────────────────────────────────────────────

  ipcMain.handle('vorn:inspect-hash',       (_, { hashVorn })                    => getEntry(_activeStore, hashVorn))
  ipcMain.handle('vorn:extract-hash',       async (_, { hashVorn, destDir, filename }) => extractByHash(_activeStore, hashVorn, destDir, filename))
  ipcMain.handle('vorn:delete-store-entry', (_, { hashVorn }) => {
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile eliminare: operazioni in corso')
    deleteStoreEntry(_activeStore, hashVorn)
  })
  ipcMain.handle('vorn:list-store-files',  (_, { offset, limit, query }) =>
    listStoreFiles(_activeStore, offset, limit, query?.trim() ? _hashSetForQuery(_activeStore, query.trim()) : null)
  )
  ipcMain.handle('vorn:count-store-files', () => countStoreFiles(_activeStore))

  // ── Folder picker ─────────────────────────────────────────────────────────

  ipcMain.handle('vorn:pick-folder', async (_, { defaultPath } = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      ...(defaultPath ? { defaultPath } : {}),
    })
    return canceled ? null : filePaths[0]
  })

  // ── App info ──────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:get-app-info', () => ({
    version:  app.getVersion(),
    platform: process.platform,
    store:    _activeStore,
    homedir:  require('os').homedir(),
  }))

  ipcMain.handle('vorn:list-dir', (_, { dirPath }) => {
    try {
      return readdirSync(dirPath, { withFileTypes: true })
        .filter(e => { try { return e.isDirectory() || e.isFile() } catch { return false } })
        .map(e => ({ name: e.name, path: join(dirPath, e.name), type: e.isDirectory() ? 'dir' : 'file' }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        })
    } catch { return [] }
  })

  ipcMain.handle('vorn:get-recent-stores', () => loadSettings().recentStores)
}

// ── Lock file ─────────────────────────────────────────────────────────────────

function _lockPath(storeDir) { return join(storeDir, 'vorn', 'lock') }

function _checkLock(storeDir) {
  const lp = _lockPath(storeDir)
  if (!existsSync(lp)) return null
  try {
    const lock = JSON.parse(readFileSync(lp, 'utf8'))
    try { process.kill(lock.pid, 0); return `Store in uso (PID ${lock.pid}) su ${lock.machine}` }
    catch { return null }
  } catch { return null }
}

function _acquireLock(storeDir) {
  mkdirSync(join(storeDir, 'vorn'), { recursive: true })
  writeFileSync(_lockPath(storeDir), JSON.stringify({
    pid:      process.pid,
    machine:  hostname(),
    openedAt: new Date().toISOString(),
  }), 'utf8')
}

function _releaseLock(storeDir) {
  try { unlinkSync(_lockPath(storeDir)) } catch (_) {}
}

// ── Hash search (senza DB: filtra per prefisso) ────────────────────────────────

function _hashSetForQuery(storeDir, query) {
  const q = query.toLowerCase()
  return new Set(
    readdirSync(storeDir)
      .filter(f => f.endsWith('.vorn') && f.toLowerCase().includes(q))
      .map(f => f.slice(0, -5))
  )
}
