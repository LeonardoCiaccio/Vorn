import { app }              from 'electron'
import { readdirSync, unlinkSync } from 'fs'
import { tmpdir }           from 'os'
import { join }             from 'path'
import { ctx, stopStoreWatch, triggerDisconnect } from './workerManager.js'
import { releaseLock }      from './vorn/lockFile.js'
import { closeDb }          from './vorn/db.js'
import { registerStoreHandlers }   from './handlers/storeHandlers.js'
import { registerSessionHandlers } from './handlers/sessionHandlers.js'
import { registerTaskHandlers }    from './handlers/taskHandlers.js'
import { registerSystemHandlers }  from './handlers/systemHandlers.js'
import { logger }                  from './vorn/logger.js'

// Pulisce in `%TEMP%` i residui di precedenti sessioni Vorn:
// - `vorn_<key>.ctmp`     → file precompressi (writeVornFromSource)
// - `vorn_c_<hash>_*.tmp` → chunk pre-staged (storeChunked / _repairMissingChunk)
// Il match è ancorato a `vorn_` per non toccare temp di altre app.
function _cleanupVornTemps() {
  try {
    const tmp = tmpdir()
    for (const f of readdirSync(tmp)) {
      if (!f.startsWith('vorn_')) continue
      if (f.endsWith('.ctmp') || (f.startsWith('vorn_c_') && f.endsWith('.tmp'))) {
        try { unlinkSync(join(tmp, f)) } catch { }
      }
    }
  } catch { }
}

export function registerIpcHandlers(mainWindow) {
  _cleanupVornTemps()

  app.once('before-quit', (e) => {
    ctx.appClosing = true
    stopStoreWatch()
    if (ctx.activeStore) releaseLock(ctx.activeStore)
    if (ctx.activeWorkers.size === 0) {
      logger.info('Application shutdown')
      closeDb()
      return
    }
    e.preventDefault()
    logger.info(`Application shutdown — waiting for ${ctx.activeWorkers.size} active worker(s)`)
    const promises = []
    for (const { worker, cancelFlag } of ctx.activeWorkers.values()) {
      Atomics.store(cancelFlag, 0, 1)
      promises.push(new Promise(resolve => {
        const timeout = setTimeout(() => { worker.terminate().catch(() => {}); resolve() }, 5000)
        worker.once('exit', () => { clearTimeout(timeout); resolve() })
      }))
    }
    Promise.all(promises).then(() => { closeDb(); app.quit() })
  })

  registerStoreHandlers(mainWindow)
  registerSessionHandlers()
  registerTaskHandlers(mainWindow)
  registerSystemHandlers(mainWindow)
}
