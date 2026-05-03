import { ipcMain, app, dialog } from 'electron'
import { join, normalize, resolve } from 'path'
import { readdirSync }              from 'fs'
import { getEntry, listStoreFiles, countStoreFiles, deleteStoreEntry, getCachedFileList } from '../vorn/store.js'
import { listTasks }                from '../vorn/taskManager.js'
import { ctx }                      from '../workerManager.js'

function _hashSetForQuery(storeDir, query) {
  const q = query.toLowerCase()
  const source = getCachedFileList(storeDir) ?? readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
  return new Set(
    source
      .filter(f => f.toLowerCase().includes(q))
      .map(f => f.slice(0, -5))
  )
}

export function registerSystemHandlers(mainWindow) {
  ipcMain.handle('vorn:get-app-info', () => ({
    version:  app.getVersion(),
    platform: process.platform,
    store:    ctx.activeStore,
    homedir:  require('os').homedir(),
  }))

  ipcMain.handle('vorn:pick-folder', async (_, { defaultPath } = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      ...(defaultPath ? { defaultPath } : {}),
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('vorn:list-dir', (_, { dirPath }) => {
    if (!dirPath || typeof dirPath !== 'string') return []
    const safePath = normalize(resolve(dirPath))
    try {
      return readdirSync(safePath, { withFileTypes: true })
        .filter(e => { try { return e.isDirectory() || e.isFile() } catch { return false } })
        .map(e => ({ name: e.name, path: join(safePath, e.name), type: e.isDirectory() ? 'dir' : 'file' }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        })
    } catch { return [] }
  })

  ipcMain.handle('vorn:inspect-hash',       (_, { hashVorn })           => getEntry(ctx.activeStore, hashVorn))
  ipcMain.handle('vorn:count-store-files',  ()                          => countStoreFiles(ctx.activeStore))
  ipcMain.handle('vorn:list-store-files',   (_, { offset, limit, query }) =>
    listStoreFiles(ctx.activeStore, offset, limit, query?.trim() ? _hashSetForQuery(ctx.activeStore, query.trim()) : null)
  )
  ipcMain.handle('vorn:delete-store-entry', (_, { hashVorn }) => {
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile eliminare: operazioni in corso')
    deleteStoreEntry(ctx.activeStore, hashVorn)
  })
}
