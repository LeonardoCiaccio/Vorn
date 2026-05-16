# Code Review Prompt — Vorn App

## Overview

You are performing a **critical, adversarial code review** of **Vorn** (Vault Of Redundant Nodes), a content-addressable desktop backup system built with Electron, Vue 3, and Node.js.

**Your mandate:** be meticulous. Hunt for **security vulnerabilities, correctness bugs, race conditions, data-loss scenarios, and concrete improvement areas**. Do not stop at high-level architectural commentary — go into the code, follow data flows end-to-end, and challenge invariants. Assume an attacker controls file content, file names, and the contents of the user's home directory. Assume the store directory may live on a removable USB stick that can be unplugged at any moment.

**Scope:** only the `src/` directory. Ignore `proto/`, root config files, and build artifacts.

---

## Technical Context

Read this section carefully before reviewing. It documents non-obvious invariants that are critical to correctness.

### Architecture

- **Main process** handles all file I/O, IPC handlers, SQLite access, and worker lifecycle.
- **Worker threads** (`backupWorker`, `restoreWorker`, `integrityWorker`, `pruneWorker`, etc.) perform heavy work. They communicate with the main process via `parentPort.postMessage`.
- **Store operations** (writing `.vorn` / `.vornc` files) are serialized through a request/response pattern: the worker sends a `store-request` message, the main process executes `storeBlob()`, and responds with `store-result`. This guarantees single-writer access to the store.
- **DB operations** (`dbGetFile`, `dbUpsertFile`) are currently called directly inside worker threads from `backup.js`. This is a known architectural concern — `better-sqlite3` is not thread-safe, and the current safety relies solely on task serialization.
- **Renderer** uses a Vue `reactive` store (not Pinia). It communicates with the main process exclusively through `window.vorn.*` (exposed via `contextBridge`). The renderer runs with `contextIsolation: true` and `sandbox: true`.

### `.vorn` File Format

Each `.vorn` file has the following binary layout:

```
MAGIC (4 bytes) | contentLen (8 bytes, BigInt BE) | content | SEPARATOR (4 bytes) | JSON metadata
```

- `content` is either raw bytes or gzip-compressed bytes, depending on `meta.compressedType`.
- `meta.hash_vorn`: BLAKE3 hash of the **original** (uncompressed) content — the deduplication key.
- `meta.compressed_hash`: BLAKE3 hash of the **compressed** bytes — used as a fast integrity check path. Present only on files written after compression was introduced.
- `meta.compressedType`: authoritative source for compression type (`undefined`/`null` = none, `'gzip'` = gzip).

### Two `.vorn` Variants: Plain Blob vs Chunked Manifest

A `.vorn` file can be either:

1. **Plain blob** — `meta.strategy` is `undefined` or `null`. `content` holds the full file bytes (optionally compressed).
2. **Chunked manifest** — `meta.strategy === 'chunks'`. `content` is **empty**; `meta.chunks` is an ordered array of chunk storeKeys (filenames without extension) pointing to sibling `.vornc` files in the same store directory.

Chunking is activated only when both:
- The session's `strategy === 'chunks'`, AND
- The source file is `>= CHUNK_THRESHOLD_BYTES` (currently 10 MB).

Chunk size is `CHUNK_SIZE_BYTES` (currently 4 MB, fixed-size — NOT content-defined). Chunks are written to temporary files in `os.tmpdir()` first, hashed, then moved into the store. The temp directory is on the host computer regardless of where the store lives.

### `.vornc` Chunk Files

Same binary layout as `.vorn`. Differences:
- Filename extension is `.vornc`.
- `meta.references`: array of parent manifest hashes. A chunk may be referenced by multiple chunked manifests (cross-file chunk dedup).
- A `.vornc` is considered orphan if **no** entry in `references` points to a `.vorn` that still has `strategy === 'chunks'` AND whose `meta.chunks` array still includes this chunk's storeKey. Existence of the parent file alone is **not** sufficient — the parent may have been rewritten as a plain blob.

### storeKey Convention

The filename of a `.vorn`/`.vornc` file (without extension) is the **storeKey**:
- Uncompressed: `<blake3-hex>` (64 hex chars)
- Compressed: `<blake3-hex>_gzip` (or `_<type>` for future formats)

The suffix is informational only. Always use `meta.compressedType` to determine actual compression. The hash portion is always `storeKey.split('_')[0]`.

### Cross-Strategy Deduplication

When a file's `hash_vorn` already exists in the store, `_findExistingVornKey()` returns the existing key **regardless of the current session's strategy or compression setting**. Consequences:

- A session configured for `chunks + gzip` will reuse an existing plain uncompressed `.vorn` if the hash matches.
- A session configured for plain uncompressed blob will reuse an existing chunked or compressed `.vorn` if the hash matches.
- This means **session settings are advisory for new content only**; existing intact content is never reprocessed. The UI exposes this via a "dedup note" in NewSessionModal/EditSessionModal.

### Integrity Check Logic

For plain `.vorn`:
1. If `meta.compressed_hash` is present → hash the raw bytes of the file and compare to `meta.compressed_hash` (fast path, no decompression).
2. Otherwise → decompress via `contentStream()` and hash the output, compare to `meta.hash_vorn`.
3. Skip the size check (`contentLen` vs `meta.bytes`) for compressed files — sizes differ by design.

For chunked `.vorn` manifest:
1. No content to hash; verify every chunk listed in `meta.chunks` exists as a `.vornc` file.

For `.vornc`:
1. Hash own content as above.
2. Verify at least one entry in `meta.references` points to a `.vorn` that still exists, has `strategy === 'chunks'`, and still includes this chunk's storeKey in its `meta.chunks` array. Otherwise emit `ERR_CHUNK_ORPHAN`.

### In-Memory Caches in `store.js`

Two module-level caches:
- `_listCache`: list of `.vorn` filenames in the store.
- `_metaCache`: per-filename parsed metadata.

Both must be invalidated whenever a `.vorn` is created, repaired, or deleted. **Stale `_metaCache` previously caused the UI to show wrong compression/strategy badges after manual file deletion + re-backup with different settings.** Verify every write path invalidates the right cache entries.

### Deduplication Cache

The SQLite database (`~/.vorn/vorn.db`, table `Files`) caches `path → { mtime, size, hash }`. On backup, if `mtime` and `size` match the DB record, the stored hash is reused without rehashing. The DB is a cache — losing it causes a full rehash on next backup but no data loss.

---

## Review Areas

### 1. Store, Compression & Chunking Pipeline
- Is the `store-request` / `store-result` handshake implemented correctly in all worker types that write to the store?
- Are compressed files always written with `meta.compressed_hash`? Are old files without it handled gracefully in the integrity worker?
- Is `meta.compressedType` always checked before attempting decompression? Are there paths that assume no compression?
- Is the storeKey regex (`/^[0-9a-f]{64}(_[a-z0-9]+)?$/`) applied consistently across all handlers that accept a hash?
- Could a corrupt or malformed `.vorn`/`.vornc` file (truncated, wrong MAGIC, malformed JSON metadata, missing separator, header claiming a content length larger than the file) cause unhandled exceptions or be exploited?
- **Chunking-specific:**
  - Is the parent–chunk relationship updated atomically? What happens if a chunk is written but the parent manifest fails to write?
  - When a chunked manifest is replaced by a plain blob (or vice versa), are the previously referenced `.vornc` chunks properly orphaned and detectable?
  - Does `_storeVornc` handle a race where two concurrent backups create the same chunk simultaneously? Are duplicate `references` entries possible?
  - Can `meta.chunks` contain duplicates if the same content appears twice in a file (e.g., two identical 4 MB regions)? Is that handled correctly during restore?
  - Are temp chunk files in `os.tmpdir()` cleaned up on every error path, including cancellation, OOM, and `ENOSPC`?
  - Is `CHUNK_THRESHOLD_BYTES` checked correctly? Can a tiny file accidentally trigger chunking?
- **Cache invalidation:** Does every code path that mutates a `.vorn` invalidate both `_listCache` AND `_metaCache`? Specifically: blob creation, chunked manifest creation, blob repair, manifest repair, chunk creation, chunk reference updates, deletion.

### 2. Concurrency & Worker Lifecycle
- Are all worker threads terminated correctly on task cancel, store disconnect, and app quit?
- Is the `cancelBuffer` (SharedArrayBuffer + Atomics) checked at appropriate granularity in long-running workers? Specifically, is it checked between chunk writes during a chunked backup of a large file?
- Is there any state shared between workers beyond the cancel flag?
- What happens if a `store-request` is in flight when the store disconnects (e.g., USB unplug)?
- Are worker errors propagated back to the renderer in all cases, including uncaught exceptions and worker-thread crashes (`exit` event with non-zero code)?
- Can two concurrent operations (e.g., backup + integrity check) both touch the same `.vornc` and corrupt the `references` array?

### 3. IPC & Renderer Security
- Are all IPC handler inputs validated (type, range, path safety) before use?
- Does `vorn:list-dir` allow traversal to sensitive paths? Is the current `normalize + resolve` sufficient given the renderer's sandbox?
- Does `vorn:open-external` enforce the URL allowlist in all cases? Could a `javascript:` or `file:` URL slip through?
- Are there any IPC handlers that perform privileged operations without checking `ctx.activeStore`?
- Can a malicious manifest in the store cause the renderer to execute or render attacker-controlled data unsafely (XSS via path names, locale strings, etc.)?
- Are file paths from `.vorn` metadata sanitized before being shown in the UI or used in restore destinations (path traversal via `../`, absolute paths in record `paths`)?

### 4. Data Integrity & Error Handling
- Are atomic write patterns (write to `.tmp`, then rename) used consistently for all persistent state (run manifests, settings, `.vorn` files, `.vornc` files)?
- What happens if a backup worker crashes mid-run? Are crashed runs correctly marked and cleaned up on next store open? Are orphaned `.vornc` chunks left behind?
- Are file descriptor leaks possible in error paths of format/read operations (especially in `format.js` and `compress.js`)?
- Is `busy_timeout` in SQLite sufficient to avoid `SQLITE_BUSY` under the current task serialization model?
- What happens if the disk fills up (`ENOSPC`) during a chunk write? Is the partial `.vornc` cleaned up? Is the parent manifest left in a consistent state?
- What happens if a `.vorn` file is truncated externally between writing and reading? Does `readVornMeta` recover via `.mtmp` correctly in all cases?
- Race condition: can `withFileLock` be bypassed if two different `storeKey` variants map to the same content (e.g., `hash` vs `hash_gzip` for the same source)?

### 5. Resource Management
- Are all `setInterval` / `setTimeout` handles cleared on store close and app quit?
- Are IPC listeners registered in `preload/index.js` replaced (not duplicated) on re-registration?
- Are temporary files (`.tmp`, `.ctmp`, `.mtmp`, chunk temps) cleaned up in all error paths, including cancellation, throw, and worker termination?
- Are streams properly destroyed on error? Look for `pipeline` calls without proper cleanup of the source stream when the destination errors.

### 6. Renderer State Consistency
- Is `state` (Vue `reactive`) updated correctly after every IPC call that mutates server-side state?
- Are there cases where the renderer can display stale data after a task completes? (See the historical `_metaCache` bug — same class of issue.)
- Are loading/error states reset properly when operations fail partway through?
- After editing a session (changing strategy/compression), does the renderer correctly reflect the new settings without needing a restart?

### 7. Code Quality
- Functions with more than one responsibility or more than ~60 lines
- Logic duplicated across modules (e.g., hash extraction, path normalization, compression-type checks)
- Exported functions with inconsistent or fragile call signatures (especially the long parameter list in `storeBlob` / `_createNew`)
- Missing error handling on `async` functions that are not `await`-ed
- Silent `catch {}` blocks that swallow errors that should be surfaced

---

## Output Format

Provide a prioritized list of findings, from most to least critical. **Be specific** — cite file paths, function names, and line numbers wherever possible. Speculative findings are welcome but must be marked as such.

---

### [SEVERITY: HIGH / MEDIUM / LOW] — Short title

**File:** `path/to/file.js[:line]`
**Problem:** Clear description of the issue, with code references.
**Impact:** What can go wrong (crash, data loss, store corruption, security issue, technical debt). Be concrete: "an attacker can…", "after N runs the store will…", "if the USB is unplugged during X, then Y".
**Suggested fix:** Recommended approach, with code snippet if useful.

---

Group findings by severity (HIGH first). Within each group, order by practical impact.

End with a **general assessment** paragraph (3–5 lines) covering:
1. The two or three most dangerous patterns you found.
2. Areas where the architecture is solid and should be preserved.
3. The single highest-leverage improvement you would prioritize next.

---

## Action Plan — Fix Checklist

Fix raggruppati in fasi ordinate per **complessità crescente** e **affinità di file/area**, così tocchiamo ogni file una volta sola dove possibile. Ogni fase è un commit unico (o pochi commit logici). Depennare man mano.

### Fase 1 — Micro-fix banali (1 riga, no logica) · _stima: 15 min_
File toccati: `format.js`, `taskHandlers.js`, `pruneWorker.js`, `storeHandlers.js`, `db.js`
- [x] **#13** — `format.js:79`: ternario morto in WAL recovery → `throw new Error('ERR_WAL_INVALID', { cause: e })`
- [x] **#18** — `taskHandlers.js:42`: `e.issues.map(i => i.code).join(' | ')` invece di `[object Object]`
- [x] **#19** — `pruneWorker.js:70-71`: estrarre `const all = readdirSync(storeDir)` una volta sola
- [x] **#22** — `storeHandlers.js:40-53`: `await new Promise(r => setImmediate(r))` anche tra runs
- [x] **#23** — `db.js:67-72`: riposizionare `closeDb` fuori dal blocco di `dbPruneOrphans`

### Fase 2 — Defence-in-depth security (banali) · _stima: 15 min_
File toccati: `systemHandlers.js`, `store.js`
- [x] **#16** — `systemHandlers.js:151`: `open-external` con URL parsing (`pathname.startsWith('/LeonardoCiaccio/Vorn/')`)
- [x] **#24** — `store.js:366-381`: `assertHash` interno in `getEntry`/`extractContent`/`readEntry`

### Fase 3 — Estensibilità compression types · _stima: 20 min_
File toccati: `_validation.js`, `store.js`, `constants.js`
- [x] **#8** — `_validation.js:1`: `HASH_RE` derivata da `KNOWN_COMPRESSION_TYPES` (spostata in `constants.js` come `STORE_KEY_RE`)
- [x] **#15** — `store.js:229-244`: documentare ordine fallback come API stabile (commento)

### Fase 4 — Cache invalidation (stessa classe del bug `_metaCache` storico) · _stima: 20 min_
File toccati: `sessionHandlers.js`, `taskHandlers.js`
- [x] **#3** [HIGH] — Invalidare `_runCache` in `_backupOnDone`, `delete-run`, `close-store`

### Fase 5 — Concorrenza su lock · _stima: 30 min_
File toccati: `store.js`, `fileLock.js`
- [x] **#5** [HIGH] — `_storeVornc`: avvolgere read/append/`_updateMeta` in `withFileLock`
- [x] **#14** — `fileLock.js:1-20`: normalizzare key con `resolve()` + `toLowerCase()` su Win

### Fase 6 — Chunk integrity & dedup · _stima: 40 min_
File toccati: solo `store.js` (entrambi su `_storeVornc` e `storeChunked`)
- [x] **#10** — Verifica `vornHash(chunkTmp) === chunkKey.split('_')[0]` dopo repair (helper `_repairMissingChunk`)
- [x] **#9** — Cross-strategy dedup per chunk: helper `_findExistingVorncKey` + scelta `_storeVornc` vs `_writeNewVornc`

### Fase 7 — Robustezza path Windows / UNC / junction · _stima: 45 min_
File toccati: `safeFs.js`, `scanner.js`, `restore.js`
- [x] **#12** — `safeFs.js:14-19`: normalizzare a backslash + gestire UNC
- [x] **#20** — `scanner.js:15-22`: symlink-check prima di isDirectory per catturare junction Win
- [x] **#17** — `restore.js`: rifiutato UNC nel restore originale (incorporato in #1)

### Fase 8 — Sicurezza HIGH (richiede UX) · _stima: 60 min_
File toccati: `restore.js`, `systemHandlers.js`, renderer (modal conferma)
- [x] **#1** [HIGH] — Validazione path restore "originale": blocklist dir di sistema + UNC (worker-side hard block; conferma UI separata)
- [x] **#2** [HIGH] — `vorn:list-dir`: null-byte guard input (whitelist root completa rimandata, vettore principale chiuso)

### Fase 9 — Data loss strutturale (refactor `format.js`) · _stima: 90 min_
File toccati: `format.js`, eventualmente `store.js`
- [x] **#4** [HIGH] — TOCTOU blob plain: read-stream limitato a `contentLen` + verifica bytesRead == contentLen
- [x] **#6** [HIGH] — WAL `contentLen` fingerprint nel `.mtmp` + cleanup orfani su read OK

### Fase 10 — Architettura DB (grosso refactor) · _stima: 3-4 ore_
File toccati: `db.js`, `backup.js`, `ipc.js`, nuovo handler IPC
- [ ] **#7** [HIGH] — Spostare accessi DB nel main via IPC (analogo `store-request`)
- [ ] **#11** — `dbPruneOrphans`: cursor persistito o "Full DB prune" su comando

### Fase 11 — Perf (nice-to-have) · _stima: 30 min_
File toccati: `compress.js`
- [x] **#21** — `cancelPoll`: rimosso `setInterval`, check inline su ogni chunk con `ac.abort()`

### Fase 12 — Code quality (parallelo, da fare quando si tocca il file) · _stima: variabile_
- [ ] **CQ1** — `storeBlob:263`: trasformare 12 parametri posizionali in object args _(fare durante Fase 6)_
- [ ] **CQ2** — `backup.js:108-148`: centralizzare precompression in `writeVornFromSource` _(fare durante Fase 9)_
- [x] **CQ3** — `sessionHandlers.js`: estratti `_validateCompression`/`_validateStrategy`/`_validateExcludes` riusati da create + update
- [x] **CQ4** — `format.js:69-89`: marcare WAL legacy come deprecated (commento DEPRECATED nel ramo `else`)
- [ ] **CQ5** — Silent catch ricorrenti: passare a `logger.debug`
- [ ] **CQ6** — `workerManager.js:69-73`: tipizzare/normalizzare shape progress

---

**Strategia anti-duplicazione**:
1. Fasi 5+6 toccano entrambe `store.js` → fare in sequenza, commit unico se piccoli
2. Fase 7 + Fase 8 entrambe toccano `restore.js` → #17 va incorporato in #1 se possibile
3. Fasi 9 + CQ2 + CQ4 → tutto su `format.js`, refactor unico
4. Fase 4 + Fase 3 → entrambe leggere, ottimo primo blocco "in voga" dopo Fase 1-2
