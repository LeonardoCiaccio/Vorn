const _queue = new Map() // filePath → { tail: Promise, count: number }

export async function withFileLock(filePath, fn) {
  if (!_queue.has(filePath)) _queue.set(filePath, { tail: Promise.resolve(), count: 0 })
  const q = _queue.get(filePath)
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
    if (q.count === 0) _queue.delete(filePath)
  }
}
