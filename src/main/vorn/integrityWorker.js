import { workerData, parentPort } from 'worker_threads'
import { readdirSync, openSync, closeSync } from 'fs'
import { join } from 'path'
import { readVornMeta } from './format.js'
import { hashFromFd } from './hash.js'

const HEADER_SIZE = 12

const { storeDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

let files = []
try {
  files = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
} catch { /* poller nel main process gestirà la disconnessione */ }

const total  = files.length
const errors = []
let ok = 0

for (let i = 0; i < files.length; i++) {
  if (Atomics.load(cancelFlag, 0)) break

  const filename     = files[i]
  const expectedHash = filename.slice(0, -5)
  const filePath     = join(storeDir, filename)
  const issues       = []

  try {
    const { meta, contentLen } = readVornMeta(filePath)

    const storedBytes = meta.bytes ?? meta.content_length
    if (storedBytes !== undefined && Number(contentLen) !== storedBytes) {
      issues.push(`Dimensione non corrispondente: header=${Number(contentLen)} B, metadati=${storedBytes} B`)
    }

    const fd = openSync(filePath, 'r')
    try {
      const computedHash = hashFromFd(fd, HEADER_SIZE, contentLen)
      if (computedHash !== expectedHash) {
        issues.push(`Hash corrotto: atteso ${expectedHash.slice(0, 12)}…, calcolato ${computedHash.slice(0, 12)}…`)
      }
    } finally {
      closeSync(fd)
    }

    if (issues.length === 0) ok++
    else errors.push({ hashVorn: expectedHash, issues })

  } catch (err) {
    errors.push({ hashVorn: expectedHash, issues: [`Errore lettura: ${err.message}`] })
  }

  if (i % 20 === 0 || i === files.length - 1) {
    parentPort.postMessage({
      type: 'progress',
      progress: { current: i + 1, total, ok, errors: errors.length }
    })
  }
}

parentPort.postMessage({ type: 'done', result: { total, ok, errors } })
