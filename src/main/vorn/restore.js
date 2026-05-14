import { mkdirSync, existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { join, basename, dirname, resolve, sep } from 'path'
import { pipeline } from 'stream/promises'
import { extractContent } from './store.js'
import { readVornMeta } from './format.js'
import { loadRun } from './sessions.js'
import { EXTRACT_MAX_BYTES } from './constants.js'
import { safeCreateWriteStream } from './safeFs.js'

// Restituisce il path assoluto solo se è contenuto dentro baseDir, altrimenti null
function _safeJoin(baseDir, relPath) {
  const out = resolve(join(baseDir, relPath))
  if (out !== baseDir && !out.startsWith(baseDir + sep)) return null
  return out
}

export async function restore(storeDir, sessionName, runTs, destDir, opts = {}) {
  destDir = resolve(destDir)
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

    const [relPath, storeKey] = fileEntries[i]
    try {
      if (!existsSync(join(storeDir, storeKey + '.vorn'))) {
        errors.push({ path: relPath, storeKey, error: 'not_found' })
        onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
        continue
      }
      const outPath = _safeJoin(destDir, relPath)
      if (!outPath) {
        errors.push({ path: relPath, storeKey, error: 'path_traversal' })
        onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
        continue
      }
      mkdirSync(join(outPath, '..'), { recursive: true })
      await pipeline(extractContent(storeDir, storeKey), safeCreateWriteStream(outPath))
      restored++
    } catch (e) {
      errors.push({ path: relPath, storeKey, error: e.code ?? e.message })
    }

    onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
  }

  return { restored, total, errors }
}

export async function extractFromStore(storeDir, destDir, sessionFilter, { onProgress, isCancelled } = {}) {
  destDir = resolve(destDir)
  const allFiles = (await readdir(storeDir)).filter(f => f.endsWith('.vorn'))
  const total      = allFiles.length
  const sessionNames = new Set()
  const noRecords  = []
  const errors     = []
  let extracted    = 0

  for (let i = 0; i < allFiles.length; i++) {
    if (isCancelled?.()) break

    const storeKey  = basename(allFiles[i], '.vorn')
    const hashOnly  = storeKey.split('_')[0]
    const vornPath  = join(storeDir, allFiles[i])

    let meta
    try { meta = readVornMeta(vornPath).meta }
    catch (e) { errors.push({ hash: hashOnly, error: e.message }); onProgress?.({ current: i + 1, total, extracted, errors: errors.length }); continue }

    if (!meta.records?.length) {
      noRecords.push(hashOnly)
      onProgress?.({ current: i + 1, total, extracted, errors: errors.length })
      continue
    }

    for (const rec of meta.records) sessionNames.add(rec.session)

    const recsToExtract = sessionFilter
      ? meta.records.filter(r => r.session === sessionFilter)
      : meta.records

    for (const rec of recsToExtract) {
      for (const relPath of rec.paths) {
        if (isCancelled?.()) break
        try {
          const folderName = `${rec.session}-${rec.id}`
          const outPath    = _safeJoin(join(destDir, folderName), relPath)
          if (!outPath) { errors.push({ hash: hashOnly, session: rec.session, path: relPath, error: 'path_traversal' }); continue }
          mkdirSync(dirname(outPath), { recursive: true })
          await pipeline(extractContent(storeDir, storeKey), safeCreateWriteStream(outPath))
          extracted++
        } catch (e) {
          errors.push({ hash: hashOnly, session: rec.session, path: relPath, error: e.message })
        }
      }
    }

    onProgress?.({ current: i + 1, total, extracted, errors: errors.length })
  }

  return { extracted, total, errors, sessions: [...sessionNames], noRecords }
}

export async function extractByHash(storeDir, storeKey, destDir, filename) {
  destDir = resolve(destDir)
  const vornFilePath = join(storeDir, storeKey + '.vorn')
  const { contentLen } = readVornMeta(vornFilePath)
  if (Number(contentLen) > EXTRACT_MAX_BYTES) {
    throw new Error('ERR_FILE_TOO_LARGE_EXTRACT')
  }
  const outPath = join(destDir, basename(filename || storeKey))
  mkdirSync(destDir, { recursive: true })
  await pipeline(extractContent(storeDir, storeKey), safeCreateWriteStream(outPath))
  return { path: outPath }
}
