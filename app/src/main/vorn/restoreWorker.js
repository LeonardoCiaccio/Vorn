import { workerData, parentPort } from 'worker_threads'
import { restore } from './engine.js'

const { dbPath, sessionName, runTs, destDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

restore(dbPath, sessionName, runTs, destDir, {
  isCancelled: () => Atomics.load(cancelFlag, 0) === 1,
  onProgress:  (progress) => parentPort.postMessage({ type: 'progress', progress }),
})
  .then(result => parentPort.postMessage({ type: 'done', result }))
  .catch(err   => parentPort.postMessage({ type: 'error', error: err.message }))
