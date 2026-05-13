import { workerData, parentPort } from 'worker_threads'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { unlink, stat } from 'fs/promises'
import { join } from 'path'
import { PRUNE_BATCH } from './constants.js'

const { storeDir, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

async function run() {
  parentPort.postMessage({ type: 'progress', progress: { phase: 'scanning', scanned: 0, totalSessions: 0 } })

  // Phase 1: scan tutti i run per raccogliere gli hash referenziati
  let orphans = null
  {
    const sessionsRoot = join(storeDir, 'vorn', 'sessions')
    const sessionDirs  = existsSync(sessionsRoot)
      ? readdirSync(sessionsRoot, { withFileTypes: true }).filter(e => e.isDirectory())
      : []

    const totalSessions = sessionDirs.length
    const referenced    = new Set()

    for (let si = 0; si < sessionDirs.length; si++) {
      if (Atomics.load(cancelFlag, 0) !== 0) {
        parentPort.postMessage({ type: 'done', result: { status: 'cancelled', deleted: 0, failed: 0, orphanCount: 0 } })
        return
      }

      parentPort.postMessage({ type: 'progress', progress: { phase: 'scanning', scanned: si + 1, totalSessions } })

      const runsPath = join(sessionsRoot, sessionDirs[si].name, 'runs')
      if (!existsSync(runsPath)) continue

      for (const runFile of readdirSync(runsPath)) {
        if (!runFile.endsWith('.json')) continue
        if (Atomics.load(cancelFlag, 0) !== 0) {
          parentPort.postMessage({ type: 'done', result: { status: 'cancelled', deleted: 0, failed: 0, orphanCount: 0 } })
          return
        }
        try {
          const run = JSON.parse(readFileSync(join(runsPath, runFile), 'utf8'))
          for (const fileInfo of Object.values(run.files ?? {})) {
            if (typeof fileInfo === 'string') referenced.add(fileInfo)
            else if (fileInfo?.hash_vorn) referenced.add(fileInfo.hash_vorn)
          }
        } catch { /* run corrotto, ignorato */ }
      }
    }

    if (Atomics.load(cancelFlag, 0) !== 0) {
      parentPort.postMessage({ type: 'done', result: { status: 'cancelled', deleted: 0, failed: 0, orphanCount: 0 } })
      return
    }

    parentPort.postMessage({ type: 'progress', progress: { phase: 'computing', scanned: totalSessions, totalSessions } })

    const allStoreFiles = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
    orphans = allStoreFiles.map(f => f.slice(0, -5)).filter(h => !referenced.has(h))
  }

  const orphanCount = orphans.length

  if (orphanCount === 0) {
    parentPort.postMessage({ type: 'done', result: { status: 'done', orphanCount: 0, deleted: 0, failed: 0 } })
    return
  }

  // Phase 2: delete orphans con worker pool
  const toDelete = orphans
  let localIdx       = 0
  let deleted        = 0
  let failed         = 0
  let disconnected   = false
  let lastProgressTs = 0

  function reportDeleteProgress() {
    const now = Date.now()
    if (now - lastProgressTs >= 200 || localIdx >= toDelete.length) {
      lastProgressTs = now
      parentPort.postMessage({
        type: 'progress',
        progress: { phase: 'deleting', orphanCount, current: Math.min(localIdx, toDelete.length), total: orphanCount, deleted, failed },
      })
    }
  }

  async function deleteWorker() {
    while (true) {
      if (Atomics.load(cancelFlag, 0) !== 0 || disconnected) break
      const i = localIdx++
      if (i >= toDelete.length) break

      try {
        await unlink(join(storeDir, toDelete[i] + '.vorn'))
        deleted++
      } catch (e) {
        if (e.code === 'ENOENT') {
          deleted++
        } else {
          try { await stat(storeDir) } catch {
            disconnected = true; break
          }
          failed++
        }
      }
      reportDeleteProgress()
    }
  }

  await Promise.all(Array.from({ length: PRUNE_BATCH }, deleteWorker))

  if (disconnected) {
    parentPort.postMessage({ type: 'store-disconnected' })
    return
  }

  if (Atomics.load(cancelFlag, 0) !== 0) {
    parentPort.postMessage({ type: 'done', result: { status: 'cancelled', orphanCount, deleted, failed } })
    return
  }

  parentPort.postMessage({ type: 'done', result: { status: 'done', orphanCount, deleted, failed } })
}

run().catch(e => parentPort.postMessage({ type: 'error', error: e.message }))
