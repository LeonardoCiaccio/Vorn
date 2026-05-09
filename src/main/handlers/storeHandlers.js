import { ipcMain }                                    from 'electron'
import { existsSync, readdirSync, unlinkSync }        from 'fs'
import { parse, join }                                from 'path'
import { execFileSync }                               from 'child_process'
import { platform }                                   from 'os'
import { checkLock, acquireLock, releaseLock }        from '../vorn/lockFile.js'
import { loadSettings, saveSettings, addRecentStore, removeRecentStore } from '../vorn/settings.js'
import { ctx, startStoreWatch, stopStoreWatch }       from '../workerManager.js'
import { listSessions, listRuns, loadRun, saveRun }   from '../vorn/sessions.js'
import { logger }                                     from '../vorn/logger.js'

const FAT32_FS_NAMES = new Set(['fat32', 'vfat', 'msdos'])

function _getFilesystem(dirPath) {
  try {
    const os = platform()
    const { root } = parse(dirPath)

    if (os === 'win32') {
      if (root.startsWith('\\\\')) return 'network'
      const letter = root[0].toUpperCase()
      if (!letter || root[1] !== ':') return null
      const out = execFileSync(
        'powershell', ['-NoProfile', '-NonInteractive', '-Command',
          `(Get-Volume -DriveLetter '${letter}' -ErrorAction SilentlyContinue).FileSystem`],
        { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
      )
      return out.trim() || null
    }
    if (os === 'linux') {
      return execFileSync('findmnt', ['-n', '-o', 'FSTYPE', '--target', dirPath], { encoding: 'utf8', timeout: 3000 }).trim()
    }
    if (os === 'darwin') {
      return execFileSync('stat', ['-f', '%T', dirPath], { encoding: 'utf8', timeout: 3000 }).trim()
    }
  } catch (e) { logger.warn(`_getFilesystem failed for "${dirPath}": ${e.message}`) }
  return null
}

async function _cleanCrashedRuns(storeDir) {
  for (const session of listSessions(storeDir)) {
    for (const run of listRuns(storeDir, session.name)) {
      if (run.status !== 'running' && run.status !== 'paused') continue
      const newStatus = run.status === 'running' ? 'crashed' : 'aborted'
      try {
        const full = loadRun(storeDir, session.name, run.ts)
        full.status = newStatus
        saveRun(storeDir, session.name, full)
      } catch (e) { logger.warn(`Run corrotto ignorato [${session.name}/${run.ts}]: ${e.message}`) }
      await new Promise(r => setImmediate(r)) // cede il controllo tra sessioni per non bloccare il main process
    }
  }
}

function _cleanupResidualTemps(storeDir) {
  try {
    for (const f of readdirSync(storeDir)) {
      if (f.endsWith('.ctmp') || f.endsWith('.tmp') || f.endsWith('.mtmp')) {
        try { unlinkSync(join(storeDir, f)) } catch { }
      }
    }
  } catch { }
}

export function registerStoreHandlers(mainWindow) {
  ipcMain.handle('vorn:open-store', async (_, { storeDir }) => {
    if (!existsSync(storeDir)) throw new Error('Cartella non trovata')
    const fs = _getFilesystem(storeDir)
    if (fs && FAT32_FS_NAMES.has(fs.toLowerCase())) throw new Error('ERR_FILESYSTEM_FAT32')
    const lockErr = checkLock(storeDir)
    if (lockErr) throw new Error(lockErr)
    if (ctx.activeStore && ctx.activeStore !== storeDir) releaseLock(ctx.activeStore)
    acquireLock(storeDir)
    ctx.activeStore = storeDir
    addRecentStore(storeDir)
    logger.info(`Store opened: ${storeDir}`)
    _cleanupResidualTemps(storeDir)
    await _cleanCrashedRuns(storeDir).catch(err => logger.error(`[storeHandlers] cleanCrashedRuns: ${err.message}`))
    startStoreWatch(mainWindow)
    return { ok: true }
  })

  ipcMain.handle('vorn:close-store', () => {
    stopStoreWatch()
    if (ctx.activeStore) {
      logger.info(`Store closed: ${ctx.activeStore}`)
      releaseLock(ctx.activeStore)
      ctx.activeStore = null
    }
  })

  ipcMain.handle('vorn:get-settings',         ()              => loadSettings())
  ipcMain.handle('vorn:save-settings',        (_, patch)      => saveSettings(patch))
  ipcMain.handle('vorn:get-recent-stores',    ()              => loadSettings().recentStores)
  ipcMain.handle('vorn:remove-recent-store',  (_, { path })   => removeRecentStore(path))
}
