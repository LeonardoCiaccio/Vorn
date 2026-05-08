import { workerData, parentPort } from 'worker_threads'
import { readdirSync, openSync, closeSync } from 'fs'
import { join } from 'path'
import { readVornMeta, contentStream } from './format.js'
import { hashFromFd, hashFromStream } from './hash.js'

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

;(async () => {
  for (let i = 0; i < files.length; i++) {
    if (Atomics.load(cancelFlag, 0)) break

    const filename     = files[i]
    const storeKey     = filename.slice(0, -5)          // rimuove .vorn
    const expectedHash = storeKey.split('_')[0]         // solo i 64 hex, ignora suffisso _gzip ecc.
    const filePath     = join(storeDir, filename)
    const issues       = []

    try {
      const { meta, contentLen } = readVornMeta(filePath)
      const isCompressed = !!(meta?.compressedType)

      // Check dimensione: per i file compressi contentLen è la dimensione compressa,
      // non la dimensione originale in meta.bytes — il check va saltato.
      if (!isCompressed) {
        const storedBytes = meta.bytes ?? meta.content_length
        if (storedBytes !== undefined && Number(contentLen) !== storedBytes) {
          issues.push(`Dimensione non corrispondente: header=${Number(contentLen)} B, metadati=${storedBytes} B`)
        }
      }

      // Check hash.
      // Fast path: se meta.compressed_hash è disponibile, hash i byte compressi direttamente
      // (nessuna decompressione). Disponibile per file scritti dopo l'introduzione del campo.
      // Fallback: decomprime e hasha il contenuto originale (file scritti in precedenza).
      let computedHash, refHash
      if (isCompressed && meta?.compressed_hash) {
        const fd = openSync(filePath, 'r')
        try {
          computedHash = hashFromFd(fd, HEADER_SIZE, contentLen)
        } finally {
          closeSync(fd)
        }
        refHash = meta.compressed_hash
      } else if (isCompressed) {
        computedHash = await hashFromStream(contentStream(filePath))
        refHash = meta?.hash_vorn ?? expectedHash
      } else {
        const fd = openSync(filePath, 'r')
        try {
          computedHash = hashFromFd(fd, HEADER_SIZE, contentLen)
        } finally {
          closeSync(fd)
        }
        refHash = meta?.hash_vorn ?? expectedHash
      }

      if (computedHash !== refHash) {
        issues.push(`Hash corrotto: atteso ${refHash.slice(0, 12)}…, calcolato ${computedHash.slice(0, 12)}…`)
      }

      if (issues.length === 0) ok++
      else errors.push({ hashVorn: storeKey, issues })

    } catch (err) {
      errors.push({ hashVorn: storeKey, issues: [`Errore lettura: ${err.message}`] })
    }

    parentPort.postMessage({
      type: 'progress',
      progress: { current: i + 1, total, ok, errors: errors.length }
    })
  }

  parentPort.postMessage({ type: 'done', result: { total, ok, errors } })
})()
