export const HASH_RE = /^[0-9a-f]{64}(?:_[a-z0-9]+)?$/

export function assertHash(h) {
  if (!h || !HASH_RE.test(h)) throw new Error('Hash non valido')
}
