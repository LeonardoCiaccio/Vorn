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
  updateSession:  (name, store, sources)    => ipcRenderer.invoke('vorn:update-session', { name, store, sources }),
  deleteSession:  (name)                    => ipcRenderer.invoke('vorn:delete-session', name),

  // Tasks
  startBackup:    (sessionName, opts = {})          => ipcRenderer.invoke('vorn:start-backup', { sessionName, ...opts }),
  startRestore:   (sessionName, runTs, destDir, selectedFiles = null) => ipcRenderer.invoke('vorn:start-restore', { sessionName, runTs, destDir, selectedFiles }),
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

  // Reconstruct
  startReconstruct: (storeDir) => ipcRenderer.invoke('vorn:start-reconstruct', { storeDir }),

  // Integrity check
  startIntegrity: (storeDir) => ipcRenderer.invoke('vorn:start-integrity', { storeDir }),

  // Sanitize
  startSanitize: (storeDir, cutoffTs) => ipcRenderer.invoke('vorn:start-sanitize', { storeDir, cutoffTs }),

  // Store / Inspect
  inspectHash:    (store, hashVorn)         => ipcRenderer.invoke('vorn:inspect-hash', { store, hashVorn }),
  inspectFile:    (filePath)                => ipcRenderer.invoke('vorn:inspect-file', filePath),
  extractHash:     (storeDir, hashVorn, destDir, filename) => ipcRenderer.invoke('vorn:extract-hash', { storeDir, hashVorn, destDir, filename }),
  listStoreFiles:  (storeDir, offset, limit, query) => ipcRenderer.invoke('vorn:list-store-files', { storeDir, offset, limit, query }),
  countStoreFiles: (storeDir)               => ipcRenderer.invoke('vorn:count-store-files', { storeDir }),
  deleteStoreEntry: (storeDir, hashVorn)     => ipcRenderer.invoke('vorn:delete-store-entry', { storeDir, hashVorn }),
  startClearStore: (storeDir)               => ipcRenderer.invoke('vorn:start-clear-store', { storeDir }),

  pickFolder:     ()                         => ipcRenderer.invoke('vorn:pick-folder'),
  resolveStore:   (defaultStore)            => ipcRenderer.invoke('vorn:resolve-store', { defaultStore }),
  getSessionStats: ()                       => ipcRenderer.invoke('vorn:get-session-stats'),

  // App info
  getAppInfo:     ()                        => ipcRenderer.invoke('vorn:get-app-info'),

  platform: process.platform,
})
