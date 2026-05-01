import { workerData, parentPort } from 'worker_threads'
import { reconstructFromStore } from './reconstruct.js'

const { dbPath, storeDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

try {
  const result = reconstructFromStore(dbPath, storeDir, {
    isCancelled: () => Atomics.load(cancelFlag, 0) === 1,
    onProgress:  (progress) => parentPort.postMessage({ type: 'progress', progress }),
  })
  parentPort.postMessage({ type: 'done', result })
} catch (err) {
  parentPort.postMessage({ type: 'error', error: err.message })
}
