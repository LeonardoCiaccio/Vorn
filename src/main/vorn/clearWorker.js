import { workerData, parentPort } from 'worker_threads'
import { readdirSync, statSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'

const { storeDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

const files = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
const total   = files.length
const BATCH   = 64

let deleted = 0
let failed  = 0

async function run() {
  for (let i = 0; i < files.length; i += BATCH) {
    if (Atomics.load(cancelFlag, 0)) break

    const batch   = files.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(f => unlink(join(storeDir, f))))
    for (const r of results) {
      if (r.status === 'fulfilled') deleted++
      else {
        try { statSync(storeDir) } catch {
          parentPort.postMessage({ type: 'store-disconnected' }); return
        }
        failed++
      }
    }

    parentPort.postMessage({ type: 'progress', progress: { current: i + BATCH, total, deleted, failed } })
  }

  parentPort.postMessage({ type: 'done', result: { total, deleted, failed } })
}

run().catch(e => parentPort.postMessage({ type: 'error', error: e.message }))
