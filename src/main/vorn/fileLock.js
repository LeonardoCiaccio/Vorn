import { resolve } from 'path'

const _queue = new Map() // normalizedPath → { tail: Promise, count: number }

// Normalizza la chiave: due forme diverse dello stesso path (slash/backslash,
// casing su FS case-insensitive, segmenti relativi) DEVONO mappare alla stessa
// coda, altrimenti due caller potrebbero scrivere lo stesso file in parallelo.
function _key(filePath) {
  const r = resolve(filePath)
  return process.platform === 'win32' ? r.toLowerCase() : r
}

export async function withFileLock(filePath, fn) {
  const key = _key(filePath)
  if (!_queue.has(key)) _queue.set(key, { tail: Promise.resolve(), count: 0 })
  const q = _queue.get(key)
  q.count++

  const prev = q.tail
  let release
  q.tail = new Promise(r => (release = r))

  try {
    await prev
    return await fn()
  } finally {
    release()
    q.count--
    if (q.count === 0) _queue.delete(key)
  }
}
