import { STORE_KEY_RE } from '../vorn/constants.js'

export const HASH_RE = STORE_KEY_RE

export function assertHash(h) {
  if (!h || !STORE_KEY_RE.test(h)) throw new Error('ERR_INVALID_HASH')
}
