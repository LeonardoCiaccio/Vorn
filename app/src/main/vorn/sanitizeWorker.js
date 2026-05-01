import { workerData, parentPort } from 'worker_threads'
import { readdirSync, openSync, writeSync, closeSync, ftruncateSync } from 'fs'
import { join } from 'path'
import { readVornMeta } from './format.js'
import { openDb } from './db.js'

const SEPARATOR   = Buffer.from([0xFF, 0x00, 0xFF, 0x00])
const HEADER_SIZE = 12

function rewriteMeta(filePath, newMeta, contentLen) {
  const metaOffset = BigInt(HEADER_SIZE) + contentLen
  const newMetaBuf = Buffer.from(JSON.stringify(newMeta), 'utf8')
  const fd = openSync(filePath, 'r+')
  try {
    ftruncateSync(fd, Number(metaOffset))
    writeSync(fd, SEPARATOR,   0, SEPARATOR.length,   Number(metaOffset))
    writeSync(fd, newMetaBuf, 0, newMetaBuf.length,  Number(metaOffset) + SEPARATOR.length)
  } finally {
    closeSync(fd)
  }
}

const { storeDir, dbPath, cutoffTs, cancelBuffer } = workerData
const cancelFlag = new Int32Array(cancelBuffer)

let vornRecordsRemoved = 0
let vornFilesModified  = 0
let runsDeleted        = 0

// ── Fase 1: sanitize .vorn ────────────────────────────────────────────────────

const files = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
const totalVorn = files.length

for (let i = 0; i < files.length; i++) {
  if (Atomics.load(cancelFlag, 0)) break

  const filePath = join(storeDir, files[i])
  try {
    const { meta, contentLen } = readVornMeta(filePath)
    const before = meta.records.length
    meta.records = meta.records.filter(r => r.ts >= cutoffTs)
    const removed = before - meta.records.length
    if (removed > 0) {
      rewriteMeta(filePath, meta, contentLen)
      vornRecordsRemoved += removed
      vornFilesModified++
    }
  } catch { /* file corrotto — lo saltiamo */ }

  if (i % 20 === 0 || i === files.length - 1) {
    parentPort.postMessage({
      type: 'progress',
      progress: {
        phase: 'vorn', current: i + 1, total: totalVorn,
        vornFilesModified, vornRecordsRemoved, runsDeleted
      }
    })
  }
}

// ── Fase 2: elimina run dal DB ────────────────────────────────────────────────

const db       = openDb(dbPath)
const sessions = db.prepare('SELECT name FROM sessions').all()

for (const { name } of sessions) {
  const oldRuns = db.prepare(
    "SELECT ts FROM runs WHERE session_name = ? AND ts < ? AND status != 'running'"
  ).all(name, cutoffTs)

  for (const { ts } of oldRuns) {
    db.prepare('DELETE FROM runs WHERE session_name = ? AND ts = ?').run(name, ts)
    runsDeleted++
  }
}

parentPort.postMessage({
  type: 'done',
  result: { vornFilesModified, vornRecordsRemoved, runsDeleted }
})
