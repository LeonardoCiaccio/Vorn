import { contextBridge, ipcRenderer } from 'electron'

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
  onTaskProgress: (cb)  => ipcRenderer.on('vorn:task-progress', (_, data) => cb(data)),
  offTaskProgress: ()   => ipcRenderer.removeAllListeners('vorn:task-progress'),
  onTaskDone:     (cb)  => ipcRenderer.on('vorn:task-done',     (_, data) => cb(data)),
  offTaskDone:    ()    => ipcRenderer.removeAllListeners('vorn:task-done'),

  // Store / Inspect
  inspectHash:    (store, hashVorn)         => ipcRenderer.invoke('vorn:inspect-hash', { store, hashVorn }),
  inspectFile:    (filePath)                => ipcRenderer.invoke('vorn:inspect-file', filePath),
  listStoreFiles: (storeDir, offset, limit) => ipcRenderer.invoke('vorn:list-store-files', { storeDir, offset, limit }),

  // App info
  getAppInfo:     ()                        => ipcRenderer.invoke('vorn:get-app-info'),

  platform: process.platform,
})
