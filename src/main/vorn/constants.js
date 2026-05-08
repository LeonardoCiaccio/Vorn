export const HASH_CHUNK_BYTES         = 4 * 1024 * 1024   // 4 MB — buffer di lettura per l'hashing
export const SAVE_INTERVAL_FILES      = 500                // salvataggio intermedio ogni N file
export const SAVE_INTERVAL_MS         = 60_000             // salvataggio intermedio ogni N ms
export const EXTRACT_MAX_BYTES        = 500 * 1024 * 1024  // 500 MB — limite estrazione diretta
export const CLEAR_BATCH              = 64                 // unlink in parallelo per clearWorker
export const PRUNE_BATCH              = 32                 // unlink in parallelo per pruneWorker
export const STORE_REQUEST_TIMEOUT_MS = 120_000            // timeout IPC store-request → main (AV scan su exe può richiedere > 30s)
