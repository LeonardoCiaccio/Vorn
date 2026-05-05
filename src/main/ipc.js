import { app }              from 'electron'
import { ctx, stopStoreWatch, triggerDisconnect } from './workerManager.js'
import { releaseLock }      from './vorn/lockFile.js'
import { closeDb }          from './vorn/db.js'
import { registerStoreHandlers }   from './handlers/storeHandlers.js'
import { registerSessionHandlers } from './handlers/sessionHandlers.js'
import { registerTaskHandlers }    from './handlers/taskHandlers.js'
import { registerSystemHandlers }  from './handlers/systemHandlers.js'

export function registerIpcHandlers(mainWindow) {

  app.once('before-quit', (e) => {
    stopStoreWatch()
    if (ctx.activeStore) releaseLock(ctx.activeStore)
    if (ctx.activeWorkers.size === 0) { closeDb(); return }
    e.preventDefault()
    const promises = []
    for (const { worker, cancelFlag } of ctx.activeWorkers.values()) {
      Atomics.store(cancelFlag, 0, 1)
      promises.push(new Promise(resolve => {
        const timeout = setTimeout(() => { worker.terminate(); resolve() }, 5000)
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
