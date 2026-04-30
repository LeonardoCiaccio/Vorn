import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('vorn', {
  // Sessions
  listSessions:   ()                          => ipcRenderer.invoke('vorn:list-sessions'),
  createSession:  (name, store, sources)      => ipcRenderer.invoke('vorn:create-session', { name, store, sources }),
  getSession:     (name)                      => ipcRenderer.invoke('vorn:get-session', name),

  // Runs
  listRuns:       (sessionName)               => ipcRenderer.invoke('vorn:list-runs', sessionName),
  loadRun:        (sessionName, runTs)        => ipcRenderer.invoke('vorn:load-run', { sessionName, runTs }),
  getPausedRun:   (sessionName)               => ipcRenderer.invoke('vorn:get-paused-run', sessionName),

  // Backup
  backup:         (sessionName, opts = {})    => ipcRenderer.invoke('vorn:backup', { sessionName, ...opts }),
  backupCancel:   (sessionName)               => ipcRenderer.invoke('vorn:backup-cancel', sessionName),
  onBackupProgress: (cb)                      => ipcRenderer.on('vorn:backup-progress', (_, data) => cb(data)),
  onBackupDone:     (cb)                      => ipcRenderer.on('vorn:backup-done',     (_, data) => cb(data)),
  offBackupProgress: ()                       => ipcRenderer.removeAllListeners('vorn:backup-progress'),
  offBackupDone:     ()                       => ipcRenderer.removeAllListeners('vorn:backup-done'),

  // Restore
  restore:           (sessionName, runTs, destDir) => ipcRenderer.invoke('vorn:restore', { sessionName, runTs, destDir }),
  onRestoreProgress: (cb) => ipcRenderer.on('vorn:restore-progress', (_, data) => cb(data)),
  offRestoreProgress: ()  => ipcRenderer.removeAllListeners('vorn:restore-progress'),

  // Store / Inspect
  inspectHash:    (store, hashVorn)           => ipcRenderer.invoke('vorn:inspect-hash', { store, hashVorn }),
  inspectFile:    (filePath)                  => ipcRenderer.invoke('vorn:inspect-file', filePath),
  listStoreFiles: (storeDir, offset, limit)   => ipcRenderer.invoke('vorn:list-store-files', { storeDir, offset, limit }),

  // App info
  getAppInfo:     ()                          => ipcRenderer.invoke('vorn:get-app-info'),

  platform: process.platform,
})
