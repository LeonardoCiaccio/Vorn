import { contextBridge, ipcRenderer, webUtils } from 'electron'

let _onProgress = null
let _onDone     = null
let _onDisconn  = null

contextBridge.exposeInMainWorld('vorn', {

  // Store
  openStore:        (storeDir)    => ipcRenderer.invoke('vorn:open-store', { storeDir }),
  closeStore:       ()            => ipcRenderer.invoke('vorn:close-store'),
  getRecentStores:    ()          => ipcRenderer.invoke('vorn:get-recent-stores'),
  removeRecentStore:  (path)      => ipcRenderer.invoke('vorn:remove-recent-store', { path }),

  // Sessions
  listSessions:   ()              => ipcRenderer.invoke('vorn:list-sessions'),
  getSession:     (name)          => ipcRenderer.invoke('vorn:get-session', name),
  createSession:  (session)       => ipcRenderer.invoke('vorn:create-session', session),
  updateSession:  (name, patch)   => ipcRenderer.invoke('vorn:update-session', { name, patch }),
  deleteSession:  (name)          => ipcRenderer.invoke('vorn:delete-session', name),

  // Runs
  listRuns:     (sessionName)                                    => ipcRenderer.invoke('vorn:list-runs', sessionName),
  loadRun:      (sessionName, runTs)                             => ipcRenderer.invoke('vorn:load-run', { sessionName, runTs }),
  listRunFiles: (sessionName, runTs, offset, limit, search)      => ipcRenderer.invoke('vorn:list-run-files', { sessionName, runTs, offset, limit, search }),
  deleteRun:    (sessionName, runTs)                             => ipcRenderer.invoke('vorn:delete-run', { sessionName, runTs }),

  // Tasks
  startBackup:        (sessionName, resumeTs = null)                      => ipcRenderer.invoke('vorn:start-backup', { sessionName, resumeTs }),
  startExtractStore:  (destDir, sessionFilter = null)                     => ipcRenderer.invoke('vorn:start-extract-store', { destDir, sessionFilter }),
  startRestore: (sessionName, runTs, destDir, selectedFiles = null) => ipcRenderer.invoke('vorn:start-restore', { sessionName, runTs, destDir, selectedFiles }),
  cancelTask:   (taskId)                                            => ipcRenderer.invoke('vorn:task-cancel', taskId),
  listTasks:    ()                                                  => ipcRenderer.invoke('vorn:task-list'),

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

  // Store disconnect
  onStoreDisconnected: (cb) => {
    if (_onDisconn) ipcRenderer.off('vorn:store-disconnected', _onDisconn)
    _onDisconn = () => cb()
    ipcRenderer.on('vorn:store-disconnected', _onDisconn)
  },
  offStoreDisconnected: () => {
    if (_onDisconn) { ipcRenderer.off('vorn:store-disconnected', _onDisconn); _onDisconn = null }
  },

  // Integrity
  startIntegrity: () => ipcRenderer.invoke('vorn:start-integrity'),

  // Store browser
  inspectHash:      (hashVorn)                        => ipcRenderer.invoke('vorn:inspect-hash', { hashVorn }),
  extractHash:      (hashVorn, destDir, filename)     => ipcRenderer.invoke('vorn:extract-hash', { hashVorn, destDir, filename }),
  deleteStoreEntry: (hashVorn)                        => ipcRenderer.invoke('vorn:delete-store-entry', { hashVorn }),
  listStoreFiles:   (offset, limit, query)            => ipcRenderer.invoke('vorn:list-store-files', { offset, limit, query }),
  countStoreFiles:  ()                                => ipcRenderer.invoke('vorn:count-store-files'),
  startClearStore:  ()                                => ipcRenderer.invoke('vorn:start-clear-store'),
  startPrune:       ()                                => ipcRenderer.invoke('vorn:start-prune'),
  resumePrune:      (data)                            => ipcRenderer.invoke('vorn:resume-prune', data),
  pausePrune:       (taskId)                          => ipcRenderer.invoke('vorn:pause-prune', taskId),

  // Settings
  getSettings:  ()        => ipcRenderer.invoke('vorn:get-settings'),
  saveSettings: (patch)   => ipcRenderer.invoke('vorn:save-settings', patch),
  openExternal: (url)     => ipcRenderer.invoke('vorn:open-external', { url }),
  openLog:      ()        => ipcRenderer.invoke('vorn:open-log'),

  // Utils
  pickFolder:      (defaultPath) => ipcRenderer.invoke('vorn:pick-folder', { defaultPath }),
  getPathForFile:  (file)        => webUtils.getPathForFile(file),
  getAppInfo:   () => ipcRenderer.invoke('vorn:get-app-info'),
  checkUpdate:  () => ipcRenderer.invoke('vorn:check-update'),
  listDir:     (dirPath) => ipcRenderer.invoke('vorn:list-dir', { dirPath }),

  platform: process.platform,
})
