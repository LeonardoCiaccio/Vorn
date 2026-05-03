import { workerData, parentPort } from 'worker_threads'
import { backup } from './engine.js'

const { storeDir, sessionName, cancelBuffer, resumeTs } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

// Tutte le store-write passano per il main process (single-threaded),
// così fileLock.js funziona correttamente anche con più sessioni in parallelo.
let _reqId = 0
const _pending = new Map()

parentPort.on('message', (msg) => {
  if (msg?.type === 'store-result') {
    const p = _pending.get(msg.id)
    if (p) {
      _pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error))
      else           p.resolve(msg.outcome)
    }
  }
})

function storeFn(storeDir, hashVorn, bytes, filePath, sessionId, sessionName, relPath) {
  return new Promise((resolve, reject) => {
    const id = ++_reqId
    _pending.set(id, { resolve, reject })
    parentPort.postMessage({ type: 'store-request', id, hashVorn, bytes, filePath, sessionId, sessionName, relPath })
  })
}

backup(storeDir, sessionName, {
  isCancelled: () => Atomics.load(cancelFlag, 0) === 1,
  onProgress:  (progress) => parentPort.postMessage({ type: 'progress', progress }),
  resumeTs,
  storeFn,
})
  .then(result => parentPort.postMessage({ type: 'done', result }))
  .catch(err   => parentPort.postMessage({ type: 'error', error: err.message }))
