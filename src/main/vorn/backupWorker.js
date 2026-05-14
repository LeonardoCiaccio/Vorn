import { workerData, parentPort } from 'worker_threads'
import { backup } from './backup.js'
import { STORE_REQUEST_TIMEOUT_MS } from './constants.js'

const { storeDir, sessionName, cancelBuffer, resumeTs, runTs } = workerData
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
      if (msg.error) p.reject(Object.assign(new Error(msg.error), { code: msg.code }))
      else           p.resolve(msg.outcome)
    }
  } else if (msg?.type === 'store-disconnected') {
    for (const p of _pending.values()) p.reject(new Error('ERR_STORE_UNREACHABLE'))
    _pending.clear()
  }
})

function storeFn(storeDir, hashVorn, bytes, filePath, sessionId, sessionName, relPath, compressionType, compTmpPath = null, compressedHash = null) {
  return new Promise((resolve, reject) => {
    const id    = ++_reqId
    const timer = setTimeout(() => {
      _pending.delete(id)
      reject(new Error('ERR_STORE_TIMEOUT'))
    }, STORE_REQUEST_TIMEOUT_MS)

    _pending.set(id, {
      resolve: (outcome) => { clearTimeout(timer); resolve(outcome) },
      reject:  (err)     => { clearTimeout(timer); reject(err) },
    })
    parentPort.postMessage({ type: 'store-request', id, hashVorn, bytes, filePath, sessionId, sessionName, relPath, compressionType, compTmpPath, compressedHash })
  })
}

let _lastProgressTs = 0
function _sendProgress(progress) {
  const now = Date.now()
  const isStateChange = progress.storing || progress.compressing
  if (isStateChange || now - _lastProgressTs >= 200 || progress.current === progress.total) {
    _lastProgressTs = now
    parentPort.postMessage({ type: 'progress', progress })
  }
}

backup(storeDir, sessionName, {
  isCancelled: () => Atomics.load(cancelFlag, 0) === 1,
  onProgress:  _sendProgress,
  resumeTs,
  runTs,
  storeFn,
})
  .then(result => parentPort.postMessage({ type: 'done', result }))
  .catch(err   => parentPort.postMessage({ type: 'error', error: err.message }))
