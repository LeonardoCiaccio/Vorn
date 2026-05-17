import { workerData, parentPort } from 'worker_threads'
import { join } from 'path'
import { safeReaddirSync, safeStatSync, safeUnlink } from './safeFs.js'
import { CLEAR_BATCH } from './constants.js'

const { storeDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

let files = []
try { files = safeReaddirSync(storeDir).filter(f => f.endsWith('.vorn') || f.endsWith('.vornc')) } catch { /* poller nel main process gestirà la disconnessione */ }
const total = files.length

async function run() {
  let idx          = 0
  let deleted      = 0
  let failed       = 0
  let disconnected = false
  let lastProgressTs = 0

  function reportProgress() {
    const now = Date.now()
    if (now - lastProgressTs >= 200 || idx >= total) {
      lastProgressTs = now
      parentPort.postMessage({ type: 'progress', progress: { current: Math.min(idx, total), total, deleted, failed } })
    }
  }

  async function worker() {
    while (true) {
      if (Atomics.load(cancelFlag, 0) !== 0 || disconnected) break
      const i = idx++
      if (i >= total) break

      try {
        await safeUnlink(join(storeDir, files[i]))
        deleted++
      } catch (e) {
        if (e.code === 'ENOENT') {
          deleted++
        } else {
          try { safeStatSync(storeDir) } catch {
            disconnected = true
            parentPort.postMessage({ type: 'store-disconnected' })
            break
          }
          failed++
        }
      }
      reportProgress()
    }
  }

  await Promise.all(Array.from({ length: CLEAR_BATCH }, worker))

  if (!disconnected) {
    parentPort.postMessage({ type: 'done', result: { total, deleted, failed } })
  }
}

run().catch(e => parentPort.postMessage({ type: 'error', error: e.message }))
