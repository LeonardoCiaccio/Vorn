import { mkdirSync, createWriteStream, existsSync, readdirSync } from 'fs'
import { join, basename, dirname } from 'path'
import { pipeline } from 'stream/promises'
import { extractContent } from './store.js'
import { readVornMeta } from './format.js'
import { loadRun } from './sessions.js'

const EXTRACT_MAX_BYTES = 500 * 1024 * 1024 // 500 MB

export async function restore(storeDir, sessionName, runTs, destDir, opts = {}) {
  const { onProgress, isCancelled, selectedFiles } = opts
  const run = loadRun(storeDir, sessionName, runTs)
  const errors = []
  let restored = 0

  const fileEntries = selectedFiles?.length
    ? Object.entries(run.files).filter(([k]) => selectedFiles.includes(k))
    : Object.entries(run.files)
  const total = fileEntries.length

  for (let i = 0; i < fileEntries.length; i++) {
    if (isCancelled?.()) break

    const [relPath, hashVorn] = fileEntries[i]
    try {
      if (!existsSync(join(storeDir, hashVorn + '.vorn'))) {
        errors.push({ path: relPath, hash: hashVorn, error: 'not_found' })
        onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
        continue
      }
      const outPath = join(destDir, relPath)
      mkdirSync(join(outPath, '..'), { recursive: true })
      await pipeline(extractContent(storeDir, hashVorn), createWriteStream(outPath))
      restored++
    } catch (e) {
      errors.push({ path: relPath, hash: hashVorn, error: e.code ?? e.message })
    }

    onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
  }

  return { restored, total, errors }
}

export async function extractFromStore(storeDir, destDir, sessionFilter, { onProgress, isCancelled } = {}) {
  const allFiles = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
  const total      = allFiles.length
  const sessionNames = new Set()
  const noRecords  = []
  const errors     = []
  let extracted    = 0

  for (let i = 0; i < allFiles.length; i++) {
    if (isCancelled?.()) break

    const hashVorn  = basename(allFiles[i], '.vorn')
    const vornPath  = join(storeDir, allFiles[i])

    let meta
    try { meta = readVornMeta(vornPath).meta }
    catch (e) { errors.push({ hash: hashVorn, error: e.message }); onProgress?.({ current: i + 1, total, extracted, errors: errors.length }); continue }

    if (!meta.records?.length) {
      noRecords.push(hashVorn)
      onProgress?.({ current: i + 1, total, extracted, errors: errors.length })
      continue
    }

    for (const rec of meta.records) sessionNames.add(rec.session)

    const recsToExtract = sessionFilter
      ? meta.records.filter(r => r.session === sessionFilter)
      : meta.records

    for (const rec of recsToExtract) {
      for (const relPath of rec.paths) {
        try {
          const folderName = `${rec.session}-${rec.id}`
          const outPath = join(destDir, folderName, relPath)
          mkdirSync(dirname(outPath), { recursive: true })
          await pipeline(extractContent(storeDir, hashVorn), createWriteStream(outPath))
          extracted++
        } catch (e) {
          errors.push({ hash: hashVorn, session: rec.session, path: relPath, error: e.message })
        }
      }
    }

    onProgress?.({ current: i + 1, total, extracted, errors: errors.length })
  }

  return { extracted, total, errors, sessions: [...sessionNames], noRecords }
}

export async function extractByHash(storeDir, hashVorn, destDir, filename) {
  const vornFilePath = join(storeDir, hashVorn + '.vorn')
  const { contentLen } = readVornMeta(vornFilePath)
  if (Number(contentLen) > EXTRACT_MAX_BYTES) {
    const mb = Math.round(Number(contentLen) / 1024 / 1024)
    throw new Error(`File troppo grande per l'estrazione diretta (${mb} MB). Limite: 500 MB.`)
  }
  const outPath = join(destDir, basename(filename || hashVorn))
  mkdirSync(destDir, { recursive: true })
  await pipeline(extractContent(storeDir, hashVorn), createWriteStream(outPath))
  return { path: outPath }
}
