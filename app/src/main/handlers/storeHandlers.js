import { ipcMain }                                    from 'electron'
import { existsSync }                                 from 'fs'
import { checkLock, acquireLock, releaseLock }        from '../vorn/lockFile.js'
import { loadSettings, saveSettings, addRecentStore } from '../vorn/settings.js'
import { ctx, startStoreWatch, stopStoreWatch }       from '../workerManager.js'
import { listSessions, listRuns, loadRun, saveRun }   from '../vorn/sessions.js'

function _cleanCrashedRuns(storeDir) {
  for (const session of listSessions(storeDir)) {
    for (const run of listRuns(storeDir, session.name)) {
      if (run.status !== 'running') continue
      try {
        const full = loadRun(storeDir, session.name, run.ts)
        full.status = 'crashed'
        saveRun(storeDir, session.name, full)
      } catch { /* run corrotto, ignorato */ }
    }
  }
}

export function registerStoreHandlers(mainWindow) {
  ipcMain.handle('vorn:open-store', async (_, { storeDir }) => {
    if (!existsSync(storeDir)) throw new Error('Cartella non trovata')
    const lockErr = checkLock(storeDir)
    if (lockErr) throw new Error(lockErr)
    if (ctx.activeStore && ctx.activeStore !== storeDir) releaseLock(ctx.activeStore)
    acquireLock(storeDir)
    ctx.activeStore = storeDir
    addRecentStore(storeDir)
    _cleanCrashedRuns(storeDir)
    startStoreWatch(mainWindow)
    return { ok: true }
  })

  ipcMain.handle('vorn:close-store', () => {
    stopStoreWatch()
    if (ctx.activeStore) { releaseLock(ctx.activeStore); ctx.activeStore = null }
  })

  ipcMain.handle('vorn:get-settings',      ()         => loadSettings())
  ipcMain.handle('vorn:save-settings',     (_, patch) => saveSettings(patch))
  ipcMain.handle('vorn:get-recent-stores', ()         => loadSettings().recentStores)
}
