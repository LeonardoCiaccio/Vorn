export const HASH_CHUNK_BYTES         = 4 * 1024 * 1024   // 4 MB — buffer di lettura per l'hashing
export const CHUNK_THRESHOLD_BYTES    = 10 * 1024 * 1024  // 10 MB — soglia minima per attivare il chunking
export const CHUNK_SIZE_BYTES         =  4 * 1024 * 1024  //  4 MB — dimensione di ogni .vornc
export const SAVE_INTERVAL_FILES      = 500                // salvataggio intermedio ogni N file
export const SAVE_INTERVAL_MS         = 60_000             // salvataggio intermedio ogni N ms
export const EXTRACT_MAX_BYTES        = 500 * 1024 * 1024  // 500 MB — limite estrazione diretta
export const CLEAR_BATCH              = 64                 // unlink in parallelo per clearWorker
export const PRUNE_BATCH              = 32                 // unlink in parallelo per pruneWorker
export const STORE_REQUEST_TIMEOUT_MS = 600_000            // timeout IPC store-request → main (AV scan su file grandi può richiedere minuti)
export const KNOWN_COMPRESSION_TYPES  = ['gzip']           // tipi di compressione supportati — usato per la ricerca cross-strategy

// storeKey valido: 64 hex (BLAKE3) opzionalmente seguito da `_<tipo-compressione>`.
// Derivata da KNOWN_COMPRESSION_TYPES per scalare quando si aggiungono nuovi tipi (es. zstd).
export const STORE_KEY_RE = new RegExp(`^[0-9a-f]{64}(?:_(?:${KNOWN_COMPRESSION_TYPES.join('|')}))?$`)
