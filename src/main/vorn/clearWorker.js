import { workerData, parentPort } from 'worker_threads'
import { readdirSync } from 'fs'
import { unlink, stat } from 'fs/promises'
import { join } from 'path'
import { CLEAR_BATCH } from './constants.js'

const { storeDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

const files = readdirSync(storeDir).filter(f => f.endsWith('.vorn') || f.endsWith('.vornc'))
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
        await unlink(join(storeDir, files[i]))
        deleted++
      } catch (e) {
        if (e.code === 'ENOENT') {
          deleted++
        } else {
          try { await stat(storeDir) } catch {
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
