import { workerData, parentPort } from 'worker_threads'
import { backup } from './backup.js'
import { STORE_REQUEST_TIMEOUT_MS } from './constants.js'

const { storeDir, sessionName, cancelBuffer, resumeTs, runTs } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

// Tutte le store-write passano per il main process (single-threaded),
// così fileLock.js funziona correttamente anche con più sessioni in parallelo.
let _reqId = 0
const _pending = new Map()

// Poll del cancel-flag mentre ci sono request in volo verso il main process.
// Senza questo, un cancel utente durante un _dbRequest/storeFn bloccato dovrebbe
// attendere il timeout di 10 min. Singolo interval globale (non per request)
// per minimizzare overhead e mantenere lo stesso pattern di store-disconnected.
const _CANCEL_POLL_MS = 500
let _cancelPoll = null
function _ensureCancelPoll() {
  if (_cancelPoll) return
  _cancelPoll = setInterval(() => {
    if (_pending.size === 0) { clearInterval(_cancelPoll); _cancelPoll = null; return }
    if (Atomics.load(cancelFlag, 0) === 1) {
      for (const p of _pending.values()) p.reject(new Error('ERR_CANCELLED'))
      _pending.clear()
      clearInterval(_cancelPoll); _cancelPoll = null
    }
  }, _CANCEL_POLL_MS)
}

parentPort.on('message', (msg) => {
  if (msg?.type === 'store-result' || msg?.type === 'db-result') {
    const p = _pending.get(msg.id)
    if (p) {
      _pending.delete(msg.id)
      if (msg.error) p.reject(Object.assign(new Error(msg.error), { code: msg.code }))
      else           p.resolve(msg.type === 'db-result' ? msg.result : msg.outcome)
    }
  } else if (msg?.type === 'store-disconnected') {
    for (const p of _pending.values()) p.reject(new Error('ERR_STORE_UNREACHABLE'))
    _pending.clear()
  }
})

// Accetta opts (stessa shape di storeBlob): la traduzione a campo `filePath`
// nel messaggio IPC è interna e nasconde la legacy naming dei caller.
function storeFn(opts) {
  const { hashVorn, bytes, sourcePath, sessionId, sessionName, relPath,
          compressionType = null, compTmpPath = null, compressedHash = null, strategy = null } = opts
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
    _ensureCancelPoll()
    parentPort.postMessage({ type: 'store-request', id, hashVorn, bytes, filePath: sourcePath, sessionId, sessionName, relPath, compressionType, compTmpPath, compressedHash, strategy })
  })
}

// Tutte le query DB passano per il main. Single-writer su better-sqlite3,
// closeDb() del main copre la connessione unica, niente accumulo di N connessioni
// né rischio SQLITE_BUSY tra worker concorrenti.
function _dbRequest(op, args) {
  return new Promise((resolve, reject) => {
    const id    = ++_reqId
    const timer = setTimeout(() => {
      _pending.delete(id)
      reject(new Error('ERR_DB_TIMEOUT'))
    }, STORE_REQUEST_TIMEOUT_MS)
    _pending.set(id, {
      resolve: (r) => { clearTimeout(timer); resolve(r) },
      reject:  (e) => { clearTimeout(timer); reject(e) },
    })
    _ensureCancelPoll()
    parentPort.postMessage({ type: 'db-request', id, op, args })
  })
}
const dbGetFileFn      = (path)    => _dbRequest('get',          { path })
const dbUpsertManyFn   = (records) => _dbRequest('upsertMany',   { records })
const dbPruneOrphansFn = ()        => _dbRequest('pruneOrphans', {})

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
  dbGetFileFn,
  dbUpsertManyFn,
  dbPruneOrphansFn,
})
  .then(result => parentPort.postMessage({ type: 'done', result }))
  .catch(err   => parentPort.postMessage({ type: 'error', error: err.message }))
