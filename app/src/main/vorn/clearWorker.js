import { workerData, parentPort } from 'worker_threads'
import { readdirSync, unlinkSync } from 'fs'
import { join } from 'path'

const { storeDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

const files = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
const total = files.length
let deleted = 0
let failed  = 0

const step = total > 200 ? 10 : 1

for (let i = 0; i < files.length; i++) {
  if (Atomics.load(cancelFlag, 0)) break

  try {
    unlinkSync(join(storeDir, files[i]))
    deleted++
  } catch {
    failed++
  }

  if (i % step === 0 || i === files.length - 1) {
    parentPort.postMessage({
      type: 'progress',
      progress: { current: i + 1, total, deleted, failed }
    })
  }
}

parentPort.postMessage({
  type: 'done',
  result: { total, deleted, failed }
})
