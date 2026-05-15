import { workerData, parentPort } from 'worker_threads'
import { readdirSync, openSync, closeSync, existsSync } from 'fs'
import { join } from 'path'
import { readVornMeta, contentStream } from './format.js'
import { hashFromFd, hashFromStream } from './hash.js'

const HEADER_SIZE = 12

const { storeDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

let files = [], vorn_total = 0, vornc_total = 0
try {
  const vorn  = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
  const vornc = readdirSync(storeDir).filter(f => f.endsWith('.vornc'))
  vorn_total  = vorn.length
  vornc_total = vornc.length
  files = [...vorn, ...vornc]
} catch { /* poller nel main process gestirà la disconnessione */ }

const total  = files.length
const errors = []
let ok = 0

;(async () => {
  for (let i = 0; i < files.length; i++) {
    if (Atomics.load(cancelFlag, 0)) break

    const filename     = files[i]
    const isChunk      = filename.endsWith('.vornc')
    const storeKey     = isChunk ? filename.slice(0, -6) : filename.slice(0, -5)
    const expectedHash = storeKey.split('_')[0]         // solo i 64 hex, ignora suffisso _gzip ecc.
    const filePath     = join(storeDir, filename)
    const issues       = []

    try {
      const { meta, contentLen } = readVornMeta(filePath)

      // Manifest .vorn: non ha contenuto, verifica solo che i chunk esistano.
      if (meta?.strategy === 'chunks') {
        for (const chunkKey of meta.chunks ?? []) {
          if (!existsSync(join(storeDir, chunkKey + '.vornc')))
            issues.push({ code: 'ERR_CHUNK_MISSING', params: { chunkKey } })
        }
        if (issues.length === 0) ok++
        else errors.push({ hashVorn: storeKey, issues })
        continue
      }

      const isCompressed = !!(meta?.compressedType)

      // Check dimensione: per i file non compressi confronta contentLen con meta.bytes.
      // Per i compressi usa meta.bytes_compressed se disponibile (scritto dopo l'introduzione del campo).
      if (!isCompressed) {
        const storedBytes = meta.bytes ?? meta.content_length
        if (storedBytes !== undefined && Number(contentLen) !== storedBytes) {
          issues.push({ code: 'ERR_SIZE_MISMATCH', params: { header: Number(contentLen), meta: storedBytes } })
        }
      } else if (meta?.bytes_compressed !== undefined) {
        if (Number(contentLen) !== meta.bytes_compressed) {
          issues.push({ code: 'ERR_COMPRESSED_SIZE_MISMATCH', params: { header: Number(contentLen), meta: meta.bytes_compressed } })
        }
      }

      // Check hash.
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
        issues.push({ code: 'ERR_HASH_CORRUPT', params: { expected: refHash.slice(0, 12), computed: computedHash.slice(0, 12) } })
      }

      if (issues.length === 0) ok++
      else errors.push({ hashVorn: storeKey, issues })

    } catch (err) {
      errors.push({ hashVorn: storeKey, issues: [{ code: err.message }] })
    }

    parentPort.postMessage({
      type: 'progress',
      progress: { current: i + 1, total, ok, errors: errors.length }
    })
  }

  parentPort.postMessage({ type: 'done', result: { total, vorn_total, vornc_total, ok, errors } })
})()
