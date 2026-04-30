import { existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { readVornMeta, readVorn, writeVornFromSource, upsertPath, contentStream } from './format.js'

function vornPath(storeDir, hashVorn) {
  return join(storeDir, hashVorn + '.vorn')
}

export function ensureStore(storeDir) {
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })
}

export function hasEntry(storeDir, hashVorn) {
  return existsSync(vornPath(storeDir, hashVorn))
}

// ── Listing con cache in-memory ──────────────────────────────────────────────
// Il listing directory viene fatto una sola volta e cachato.
// offset=0 forza il rebuild (usato dal pulsante refresh).

let _listCache = null // { dir: string, files: string[] }

export function listStoreFiles(storeDir, offset = 0, limit = 20) {
  if (!existsSync(storeDir)) return { files: [], total: 0 }

  if (!_listCache || _listCache.dir !== storeDir || offset === 0) {
    const allFiles = readdirSync(storeDir)
      .filter(f => f.endsWith('.vorn'))
      .sort()
    _listCache = { dir: storeDir, files: allFiles }
  }

  const slice = _listCache.files.slice(offset, offset + limit)
  const files = slice.map(f => {
    const p = join(storeDir, f)
    const st = statSync(p)
    return {
      hash_vorn:  basename(f, '.vorn'),
      bytes_file: st.size,
      ctime:      st.birthtimeMs,
      mtime:      st.mtimeMs,
    }
  })

  return { files, total: _listCache.files.length }
}

// sourcePath: path of the original file — content is streamed, never fully buffered
export async function createEntry(storeDir, hashVorn, bytes, sourcePath, runTs, pathEntry, session, machine) {
  ensureStore(storeDir)
  const meta = {
    hash_vorn: hashVorn,
    bytes,
    records: [{ ts: runTs, session, machine, paths: [pathEntry] }],
  }
  await writeVornFromSource(vornPath(storeDir, hashVorn), meta, sourcePath)
}

export async function addPath(storeDir, hashVorn, runTs, pathEntry, session, machine) {
  await upsertPath(vornPath(storeDir, hashVorn), runTs, pathEntry, session, machine)
}

// Returns only metadata — safe even for huge .vorn files
export function getEntry(storeDir, hashVorn) {
  const p = vornPath(storeDir, hashVorn)
  if (!existsSync(p)) return null
  return readVornMeta(p).meta
}

// Returns a readable stream starting at the content section
export function extractContent(storeDir, hashVorn) {
  return contentStream(vornPath(storeDir, hashVorn))
}

// Full read (used only by inspect IPC where content is needed)
export function readEntry(storeDir, hashVorn) {
  return readVorn(vornPath(storeDir, hashVorn))
}
