import { ipcMain }                                    from 'electron'
import { existsSync }                                 from 'fs'
import { checkLock, acquireLock, releaseLock }        from '../vorn/lockFile.js'
import { loadSettings, saveSettings, addRecentStore } from '../vorn/settings.js'
import { ctx, startStoreWatch, stopStoreWatch }       from '../workerManager.js'

export function registerStoreHandlers(mainWindow) {
  ipcMain.handle('vorn:open-store', async (_, { storeDir }) => {
    if (!existsSync(storeDir)) throw new Error('Cartella non trovata')
    const lockErr = checkLock(storeDir)
    if (lockErr) throw new Error(lockErr)
    if (ctx.activeStore && ctx.activeStore !== storeDir) releaseLock(ctx.activeStore)
    acquireLock(storeDir)
    ctx.activeStore = storeDir
    addRecentStore(storeDir)
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
