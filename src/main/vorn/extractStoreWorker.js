import { workerData, parentPort } from 'worker_threads'
import { extractFromStore } from './restore.js'

const { storeDir, destDir, sessionFilter, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

extractFromStore(storeDir, destDir, sessionFilter || null, {
  onProgress: (p) => parentPort.postMessage({ type: 'progress', progress: p }),
  isCancelled: () => Atomics.load(cancelFlag, 0) === 1,
})
  .then(result => parentPort.postMessage({ type: 'done', result }))
  .catch(e    => parentPort.postMessage({ type: 'error', error: e.message }))
