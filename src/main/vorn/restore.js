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

// Rileva se relPath è una path assoluta (nuovo formato)
function _isAbsPath(relPath) {
  return /^[A-Za-z]:\//.test(relPath) || relPath.startsWith('/')
}

// UNC path (Windows network share): \\server\share\... oppure //server/share/...
// Bloccato nel restore "originale": uno store ostile potrebbe puntare a una
// share controllata dall'attaccante per esfiltrare contenuti.
function _isUNCPath(p) {
  return /^\\\\[^\\?]/.test(p) || /^\/\/[^/]/.test(p)
}

// Directory di sistema il cui contenuto NON deve essere sovrascritto da un restore.
// Threat model: uno store ostile (USB altrui, .vorn manipolato) può iniettare
// path come `C:/Windows/System32/...` o `/etc/...` nei run JSON. Senza questa
// blocklist, restore "originale" piazza payload arbitrari in posizioni di esecuzione.
const _SYSTEM_PREFIXES_LC = [
  'c:/windows', 'c:/program files', 'c:/program files (x86)', 'c:/programdata',
  '/etc',       '/usr',             '/bin',                    '/sbin',
  '/proc',      '/sys',             '/boot',
  '/system',    '/library/system',
]
function _isSystemPath(absPath) {
  if (!absPath) return false
  const norm = absPath.replace(/\\/g, '/').toLowerCase()
  return _SYSTEM_PREFIXES_LC.some(s => norm === s || norm.startsWith(s + '/'))
}

export async function restore(storeDir, sessionName, runTs, destDir, opts = {}) {
  if (destDir !== null && destDir !== undefined) destDir = resolve(destDir)
  else destDir = null
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

      let outPath
      if (_isAbsPath(relPath)) {
        if (destDir === null) {
          // Ripristino originale: blocca UNC e directory di sistema PRIMA di
          // toccare il filesystem. Vedi commento su _SYSTEM_PREFIXES_LC.
          if (_isUNCPath(relPath)) {
            errors.push({ path: relPath, storeKey, error: 'unc_path_blocked' })
            onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
            continue
          }
          outPath = resolve(relPath.replace(/\//g, sep))
          if (_isSystemPath(outPath)) {
            errors.push({ path: relPath, storeKey, error: 'system_path_blocked' })
            onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
            continue
          }
        } else {
          // Ripristino personalizzato: rimuovi drive root e join a destDir
          const stripped = relPath.replace(/^[A-Za-z]:\//, '').replace(/^\//, '')
          outPath = _safeJoin(destDir, stripped)
          if (!outPath) {
            errors.push({ path: relPath, storeKey, error: 'path_traversal' })
            onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
            continue
          }
        }
      } else {
        // Vecchio formato relativo
        if (destDir === null) {
          errors.push({ path: relPath, storeKey, error: 'no_dest_for_relative_path' })
          onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
          continue
        }
        outPath = _safeJoin(destDir, relPath)
        if (!outPath) {
          errors.push({ path: relPath, storeKey, error: 'path_traversal' })
          onProgress?.({ current: i + 1, total, restored, errors: errors.length, file: relPath })
          continue
        }
      }

      mkdirSync(dirname(outPath), { recursive: true })
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
          const base       = join(destDir, folderName)
          // Path assolute: rimuovi drive root prima di join a destDir/folderName
          const stripped   = _isAbsPath(relPath)
            ? relPath.replace(/^[A-Za-z]:\//, '').replace(/^\//, '')
            : relPath
          const outPath    = _safeJoin(base, stripped)
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
