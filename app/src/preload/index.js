import { contextBridge, ipcRenderer } from 'electron'

// Riferimenti espliciti ai listener attivi — evita removeAllListeners (troppo aggressivo)
let _onProgress = null
let _onDone     = null

contextBridge.exposeInMainWorld('vorn', {
  // Sessions
  listSessions:   ()                        => ipcRenderer.invoke('vorn:list-sessions'),
  createSession:  (name, store, sources)    => ipcRenderer.invoke('vorn:create-session', { name, store, sources }),
  getSession:     (name)                    => ipcRenderer.invoke('vorn:get-session', name),

  // Runs
  listRuns:       (sessionName)             => ipcRenderer.invoke('vorn:list-runs', sessionName),
  loadRun:        (sessionName, runTs)      => ipcRenderer.invoke('vorn:load-run', { sessionName, runTs }),
  getPausedRun:   (sessionName)             => ipcRenderer.invoke('vorn:get-paused-run', sessionName),
  deleteRun:      (sessionName, runTs)      => ipcRenderer.invoke('vorn:delete-run', { sessionName, runTs }),

  // Tasks
  startBackup:    (sessionName, opts = {})          => ipcRenderer.invoke('vorn:start-backup', { sessionName, ...opts }),
  startRestore:   (sessionName, runTs, destDir)     => ipcRenderer.invoke('vorn:start-restore', { sessionName, runTs, destDir }),
  cancelTask:     (taskId)                          => ipcRenderer.invoke('vorn:task-cancel', taskId),
  listTasks:      ()                                => ipcRenderer.invoke('vorn:task-list'),

  onTaskProgress: (cb) => {
    if (_onProgress) ipcRenderer.off('vorn:task-progress', _onProgress)
    _onProgress = (_, data) => cb(data)
    ipcRenderer.on('vorn:task-progress', _onProgress)
  },
  offTaskProgress: () => {
    if (_onProgress) { ipcRenderer.off('vorn:task-progress', _onProgress); _onProgress = null }
  },
  onTaskDone: (cb) => {
    if (_onDone) ipcRenderer.off('vorn:task-done', _onDone)
    _onDone = (_, data) => cb(data)
    ipcRenderer.on('vorn:task-done', _onDone)
  },
  offTaskDone: () => {
    if (_onDone) { ipcRenderer.off('vorn:task-done', _onDone); _onDone = null }
  },

  // Store / Inspect
  inspectHash:    (store, hashVorn)         => ipcRenderer.invoke('vorn:inspect-hash', { store, hashVorn }),
  inspectFile:    (filePath)                => ipcRenderer.invoke('vorn:inspect-file', filePath),
  listStoreFiles: (storeDir, offset, limit) => ipcRenderer.invoke('vorn:list-store-files', { storeDir, offset, limit }),

  // App info
  getAppInfo:     ()                        => ipcRenderer.invoke('vorn:get-app-info'),

  platform: process.platform,
})
