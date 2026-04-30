// Mutex per path file — serializza operazioni sullo stesso .vorn
// JS è single-threaded: l'assegnazione a _locks è atomica rispetto agli await.

const _locks = new Map() // filePath → Promise (resolved quando il lock è libero)

export async function withFileLock(filePath, fn) {
  const prev = _locks.get(filePath) ?? Promise.resolve()

  let release
  _locks.set(filePath, new Promise(r => (release = r)))

  try {
    await prev
    return await fn()
  } finally {
    release()
  }
}
