import { ipcMain }                                    from 'electron'
import { safeExistsSync, safeReaddirSync, safeUnlinkSync } from '../vorn/safeFs.js'
import { parse, join }                                from 'path'
import { execFileSync }                               from 'child_process'
import { platform }                                   from 'os'
import { checkLock, acquireLock, releaseLock }        from '../vorn/lockFile.js'
import { loadSettings, saveSettings, addRecentStore, removeRecentStore } from '../vorn/settings.js'
import { ctx, startStoreWatch, stopStoreWatch }       from '../workerManager.js'
import { listSessions, listRuns, loadRun, saveRun }   from '../vorn/sessions.js'
import { invalidateListCache }                        from '../vorn/store.js'
import { invalidateRunCache }                         from './sessionHandlers.js'
import { logger }                                     from '../vorn/logger.js'

const FAT32_FS_NAMES = new Set(['fat32', 'vfat', 'msdos'])

function _getFilesystem(dirPath) {
  try {
    const os = platform()
    const { root } = parse(dirPath)

    if (os === 'win32') {
      if (root.startsWith('\\\\')) return 'network'
      const letter = root[0].toUpperCase()
      if (!/^[A-Z]$/.test(letter) || root[1] !== ':') return null
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
      if (run.status === 'running' || run.status === 'paused') {
        const newStatus = run.status === 'running' ? 'crashed' : 'aborted'
        try {
          const full = loadRun(storeDir, session.name, run.ts)
          full.status = newStatus
          saveRun(storeDir, session.name, full)
        } catch (e) { logger.warn(`Run corrotto ignorato [${session.name}/${run.ts}]: ${e.message}`) }
      }
      await new Promise(r => setImmediate(r)) // cede il controllo tra ogni run per non bloccare il main process
    }
  }
}

function _cleanupResidualTemps(storeDir) {
  try {
    for (const f of safeReaddirSync(storeDir)) {
      // ⚠️ NB: `.mtmp` NON va toccato qui. È il WAL di `_updateMeta` e serve a
      // `readVornMeta` per recuperare i records DOPO un crash mid-update. Il
      // cleanup degli orfani avviene già dentro `readVornMeta` quando la meta
      // tail del .vorn è leggibile (= WAL provatamente orfano). Eliminarli
      // qui, prima della prima readVornMeta, = data loss permanente per ogni
      // _upsertRecord interrotto da un crash/USB-unplug.
      //
      // Cleanup eseguito qui solo per:
      //   <storeKey>.vorn.tmp / <storeKey>.vornc.tmp  → temp di writeVornFromSource
      //   <vornFile>.repair.<pid>.<ts>                → recovery atomica readVornMeta
      //
      // PATTERN STRETTO: la versione precedente usava `f.endsWith('.tmp')` raw,
      // che cancellava QUALUNQUE *.tmp nello storeDir (es. `~$doc.tmp` di Office,
      // `download.tmp` di Firefox/Chrome interrotti, file utente di terze parti).
      // Lo store può vivere in cartelle condivise con altri file — silent data
      // loss su file non-Vorn era un bug. `.ctmp` rimosso dal match: writeVornFromSource
      // crea i .ctmp in os.tmpdir(), MAI in storeDir → match era cosmetico.
      const isVornWriteTmp = /\.vornc?\.tmp$/.test(f)
      const isRepairTmp    = /\.repair\.\d+\.\d+$/.test(f)
      if (isVornWriteTmp || isRepairTmp) {
        try { safeUnlinkSync(join(storeDir, f)) } catch { /* non-critico */ }
      }
    }
  } catch { /* dir scomparsa */ }
}

export function registerStoreHandlers(mainWindow) {
  ipcMain.handle('vorn:open-store', async (_, { storeDir }) => {
    if (!safeExistsSync(storeDir)) throw new Error('ERR_FOLDER_NOT_FOUND')
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
    // Pulizia di tutte le cache in-memory: store list/meta + run cache.
    // Senza questo, riaprendo un diverso store si vedrebbero dati del precedente.
    invalidateListCache()
    invalidateRunCache()
  })

  ipcMain.handle('vorn:get-settings',         ()              => loadSettings())
  ipcMain.handle('vorn:save-settings',        (_, patch)      => saveSettings(patch))
  ipcMain.handle('vorn:get-recent-stores',    ()              => loadSettings().recentStores)
  ipcMain.handle('vorn:remove-recent-store',  (_, { path })   => removeRecentStore(path))
}
