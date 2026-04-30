import { ipcMain, app } from 'electron'
import { join } from 'path'
import { backup, restore } from './vorn/engine.js'
import {
  listSessions, createSession, listRuns,
  loadRun, getPausedRun, getSession
} from './vorn/manifest.js'
import { getEntry, listStoreFiles } from './vorn/store.js'
import { readVorn } from './vorn/format.js'
import { existsSync } from 'fs'

import { homedir } from 'os'

// Default manifests directory: aligned with the Python prototype
const manifestsDir = join(homedir(), '.vorn', 'sessions')

// Active backup handles keyed by sessionName (for cancellation)
const activeBackups = {}

export function registerIpcHandlers(mainWindow) {

  // ── Sessions ──────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:list-sessions', () => {
    return listSessions(manifestsDir)
  })

  ipcMain.handle('vorn:create-session', (_, { name, store, sources }) => {
    return createSession(manifestsDir, name, store, sources)
  })

  ipcMain.handle('vorn:get-session', (_, name) => {
    return getSession(manifestsDir, name)
  })

  // ── Runs ──────────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:list-runs', (_, sessionName) => {
    return listRuns(manifestsDir, sessionName)
  })

  ipcMain.handle('vorn:load-run', (_, { sessionName, runTs }) => {
    return loadRun(manifestsDir, sessionName, runTs)
  })

  ipcMain.handle('vorn:get-paused-run', (_, sessionName) => {
    return getPausedRun(manifestsDir, sessionName)
  })

  // ── Backup ────────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:backup', async (_, { sessionName, resumeTs = null, excludes = [], maxBytes = 0 }) => {
    if (activeBackups[sessionName]) throw new Error(`Backup already running for ${sessionName}`)

    // Prepariamo l'oggetto per gestire la cancellazione
    const opts = {
      resumeTs,
      excludes,
      maxBytes,
      onProgress: (progress) => {
        mainWindow.webContents.send('vorn:backup-progress', { sessionName, ...progress })
      }
    }

    // Avviamo il backup (restituisce una promise)
    const backupPromise = backup(manifestsDir, sessionName, opts)
    
    // Recuperiamo l'handle di cancellazione (che viene iniettato sincronicamente da backup() all'avvio)
    activeBackups[sessionName] = opts._handle

    try {
      const result = await backupPromise
      delete activeBackups[sessionName]
      mainWindow.webContents.send('vorn:backup-done', { sessionName, ...result })
      return result
    } catch (error) {
      delete activeBackups[sessionName]
      throw error
    }
  })

  ipcMain.handle('vorn:backup-cancel', (_, sessionName) => {
    if (activeBackups[sessionName]) {
      activeBackups[sessionName]._cancel?.()
    }
  })

  // ── Restore ───────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:restore', async (_, { sessionName, runTs, destDir }) => {
    return await restore(manifestsDir, sessionName, runTs, destDir, {
      onProgress: (progress) => {
        mainWindow.webContents.send('vorn:restore-progress', { sessionName, ...progress })
      }
    })
  })

  // ── Store ─────────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:inspect-hash', (_, { store, hashVorn }) => {
    return getEntry(store, hashVorn)
  })

  ipcMain.handle('vorn:inspect-file', (_, filePath) => {
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
    const { meta } = readVorn(filePath)
    return meta
  })

  ipcMain.handle('vorn:list-store-files', (_, { storeDir, offset, limit }) => {
    return listStoreFiles(storeDir, offset, limit)
  })

  // ── App info ──────────────────────────────────────────────────────────────

  ipcMain.handle('vorn:get-app-info', () => ({
    manifestsDir,
    version: app.getVersion(),
    platform: process.platform,
  }))
}
