import { workerData, parentPort } from 'worker_threads'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'

const { storeDir, cancelBuffer, orphanList = null, startIndex = 0 } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

const BATCH = 32

async function run() {
  // Segnale immediato che il worker è partito
  parentPort.postMessage({ type: 'progress', progress: { phase: 'scanning', scanned: 0, totalSessions: 0 } })

  let orphans = orphanList

  if (!orphans) {
    // Phase 1: scan tutti i run per raccogliere gli hash referenziati
    const sessionsRoot = join(storeDir, 'vorn', 'sessions')
    const sessionDirs  = existsSync(sessionsRoot)
      ? readdirSync(sessionsRoot, { withFileTypes: true }).filter(e => e.isDirectory())
      : []

    const totalSessions = sessionDirs.length
    const referenced    = new Set()

    for (let si = 0; si < sessionDirs.length; si++) {
      if (Atomics.load(cancelFlag, 0) === 1) {
        parentPort.postMessage({ type: 'done', result: { status: 'cancelled', deleted: 0, failed: 0, orphanCount: 0 } })
        return
      }

      parentPort.postMessage({ type: 'progress', progress: { phase: 'scanning', scanned: si + 1, totalSessions } })

      const runsPath = join(sessionsRoot, sessionDirs[si].name, 'runs')
      if (!existsSync(runsPath)) continue

      for (const runFile of readdirSync(runsPath)) {
        if (!runFile.endsWith('.json')) continue
        try {
          const run = JSON.parse(readFileSync(join(runsPath, runFile), 'utf8'))
          for (const fileInfo of Object.values(run.files ?? {})) {
            if (typeof fileInfo === 'string') referenced.add(fileInfo)
            else if (fileInfo?.hash_vorn) referenced.add(fileInfo.hash_vorn)
          }
        } catch { /* run corrotto, ignorato */ }
      }
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

  const toDelete = startIndex > 0 ? orphans.slice(startIndex) : orphans
  let deleted = 0
  let failed  = 0

  for (let i = 0; i < toDelete.length; i += BATCH) {
    const flag = Atomics.load(cancelFlag, 0)
    if (flag === 1) {
      parentPort.postMessage({ type: 'done', result: { status: 'cancelled', orphanCount, deleted, failed } })
      return
    }
    if (flag === 2) {
      const nextIndex = startIndex + i
      parentPort.postMessage({ type: 'done', result: { status: 'paused', orphanCount, deleted, failed, orphanList: orphans, nextIndex } })
      return
    }

    const batch   = toDelete.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(hash => unlink(join(storeDir, hash + '.vorn'))))

    for (const r of results) {
      if (r.status === 'fulfilled' || r.reason?.code === 'ENOENT') {
        deleted++
      } else {
        try { statSync(storeDir) } catch {
          parentPort.postMessage({ type: 'store-disconnected' })
          return
        }
        failed++
      }
    }

    parentPort.postMessage({
      type: 'progress',
      progress: { phase: 'deleting', orphanCount, current: startIndex + i + batch.length, total: orphanCount, deleted, failed },
    })
  }

  parentPort.postMessage({ type: 'done', result: { status: 'done', orphanCount, deleted, failed } })
}

run().catch(e => parentPort.postMessage({ type: 'error', error: e.message }))
