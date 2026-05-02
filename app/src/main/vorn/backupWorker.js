import { workerData, parentPort } from 'worker_threads'
import { backup } from './engine.js'

const { storeDir, sessionName, cancelBuffer, resumeTs } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

backup(storeDir, sessionName, {
  isCancelled: () => Atomics.load(cancelFlag, 0) === 1,
  onProgress:  (progress) => parentPort.postMessage({ type: 'progress', progress }),
  resumeTs,
})
  .then(result => parentPort.postMessage({ type: 'done', result }))
  .catch(err   => parentPort.postMessage({ type: 'error', error: err.message }))
