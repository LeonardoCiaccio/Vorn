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

## Round 2 — Follow-up findings (post-fixes)

Issue emerse dopo la prima tornata di fix (commits `f657793`, `7c0b27a`). Tutte reali e citano codice esistente. Chiuse.

- [x] **R2-1** [HIGH] — Race prune↔backup: `_assertNoMutatingTask()` centralizzato in `taskHandlers.js`, applicato a backup / restore / clear / extract-store / prune
- [x] **R2-2** [HIGH] — `_metaCache` stale dopo `_upsertRecord` nel dedup path di `storeBlob`: invalidazione esplicita aggiunta (stessa classe del bug `_metaCache` storico)
- [x] **R2-3** [MED] — Pre-compressione ridondante in `backup.js`: esportata `findExistingVornKey` da `store.js`, usata per dedup-check cross-strategy PRIMA di comprimere
- [x] **R2-4** [MED] — Cleanup orfani `vorn_c_*.tmp` (chunk temps in `%TEMP%`): estesa la regex in `_cleanupVornTemps` (`ipc.js`)
- [x] **R2-5** [MED] — `readSync` parziale nel check separatore: aggiunto `if (sepN < SEPARATOR.length) throw ERR_FILE_TRUNCATED` (distinto da `ERR_SEPARATOR_NOT_FOUND`)
- [x] **R2-6** [LOW] — Lock detection su NAS/SMB: `checkLock` rifiuta se `lock.machine !== hostname()`, previene il furto di lock cross-machine → store corruption

---

## Round 3 — Follow-up findings (post Round 2)

Quattro fix applicati. Restano due item marcati come **non-bug** e **non-applicabile-in-pratica**: vedere le note nel prossimo capitolo per evitare di re-flaggarli a futuri review.

- [x] **R3-1** [HIGH] — Race in `readVornMeta` recovery: la recovery in-place (`truncateSync` + `openSync 'a'` + `writeSync`) è stata sostituita da una recovery ATOMICA con tmp+rename. Ogni invocazione costruisce un `<filePath>.repair.<pid>.<timestamp>` univoco, fa fsync, poi `renameSync` atomico. Due recovery concorrenti producono file tmp distinti, l'ultimo rename vince ma il contenuto è identico → idempotente. Niente più interleaved writes su Linux/macOS né EBUSY su Win.
- [x] **R3-2** [HIGH] — Missing `fsync` in `writeVornFromSource`: aggiunto `openSync(tmpPath, 'r+')` + `fsyncSync(fd)` PRIMA del `renameSync`. Allineato al pattern già usato da `writeVornManifest`. Senza fsync, power failure / USB unplug post-rename poteva lasciare file zero-byte "pubblicato" come backup completato.
- [x] **R3-3** [MED] — Duplicate error accumulation su resume: dedup degli errori `[...run.errors, ...scanErrors]` con chiave `path|error|phase` prima del save. Errori distinti per la stessa sorgente (es. EACCES vs ENOENT) restano separati.
- [x] **R3-4** [MED] — `vorn:extract-hash` senza mutex: aggiunto `_assertNoMutatingTask()` come per gli altri task. Race con prune/clear (file cancellato mid-read) ora bloccata a monte.
- [x] **R3-6** [LOW] — Cache invalidation per `.vornc` (defense-in-depth): aggiunte `_metaCache.entries.delete(key + '.vornc')` in `_writeNewVornc` e `_storeVornc`. Attualmente moot perché `listStoreFiles` filtra `.vornc`, ma chiude il rischio in caso di future UI changes.

---

## ⚠️ Note di contesto per i prossimi revisori

Lette PRIMA di flaggare nuovi finding. Aree già discusse o intenzionalmente non protette. Evitare di sollevarle di nuovo come "bug": sono decisioni esplicite con razionale documentato.

### Decisioni architetturali consolidate

- **DB single-writer nel main process via IPC**: `dbGetFile` / `dbUpsertFileMany` / `dbPruneOrphans` sono invocate dai worker tramite `db-request` / `db-result` (pattern speculare a `store-request`). Una sola connessione `better-sqlite3` viva, serializzata sull'event loop del main. Non flaggare "worker DB connections multiple" — è stato chiuso in `7c0b27a`.
- **Store writes single-writer**: tutte le scritture `.vorn` / `.vornc` passano per `storeBlob` nel main via `store-request`. I worker non aprono mai il file di store direttamente per write. Non flaggare "concurrent writers on `.vorn`" — il pattern lo previene by design.
- **`withFileLock` per-path**: usato in `storeBlob`, `storeChunked`, `_storeVornc`, `_writeNewVornc`. La chiave è normalizzata via `resolve()` + `toLowerCase()` su Win32. Lock per-path, niente deadlock possibile.
- **WAL `_updateMeta` con fingerprint `contentLen`**: il `.mtmp` lega la sua applicabilità al contentLen corrente del `.vorn`. Recovery rifiuta un WAL orfano se il fingerprint non corrisponde. Cleanup degli orfani all'avvio store e ogni volta che `readVornMeta` riesce. Non riproporre "WAL può resuscitare records non committati" — è coperto.
- **Recovery di `readVornMeta` ATOMICA via tmp+rename** (R3-1): la vecchia in-place `truncate`+`append` non c'è più. Non flaggare "race in recovery".
- **Cross-strategy dedup** per `.vorn` (`_findExistingVornKey`) E per `.vornc` (`_findExistingVorncKey`): l'ordine di priorità in `KNOWN_COMPRESSION_TYPES` è **API stabile** (commentato in `store.js`). Per aggiungere un tipo (zstd) **appenderlo in fondo**, non in testa. Non flaggare "ordine fragile".
- **Task mutex centralizzato**: `_assertNoMutatingTask()` in `taskHandlers.js` gate-keepa `backup` / `restore` / `clear` / `extract-store` / `prune` / `extract-hash`. Non flaggare race tra questi task — è gestita.
- **Cache invalidation `_listCache` / `_metaCache`**: invalidate in TUTTI i write path di `.vorn` (creazione blob, manifest, repair, dedup-record-upsert, delete) e in `close-store`. Stesso pattern esteso defense-in-depth a `.vornc` (R3-6). Non riproporre "stale cache after X".
- **`.mtmp` cleanup è esclusiva di `readVornMeta`** (R4-1): l'open-store NON deve mai eliminarli, sono il WAL di `_updateMeta`. Solo `readVornMeta` su una meta tail leggibile può dichiarare un WAL "provatamente orfano" e cancellarlo. Non riproporre "cleanup all WAL on store open".
- **Restore-originale blocca tutti i namespace prefix Win32** (R4-2): `\\?\`, `\\.\`, `\??\` rifiutati prima di `resolve()`. Combinato con `_SYSTEM_PREFIXES_LC` e `_isUNCPath`. Non riproporre "bypass system path via prefix".
- **`extractFromStore` sanitizza folder-segment da store ostile** (R4-3): `rec.session` / `rec.id` passano da `_sanitizeFolderSegment` (rifiuta `..`, separators, drive letters, control chars; cap 100) + check `resolvedBase ∈ destDir`. Non riproporre "path traversal via meta.records".
- **`extractByHash` size cap valido anche su chunked** (R4-4): usa `meta.bytes` (effective size) per i manifest chunked, `contentLen` (on-disk) per i blob plain. Non riproporre "EXTRACT_MAX_BYTES bypassed".
- **`vornHash` rileva truncate mid-hash** (R4-5): `n === 0` → `ERR_SOURCE_TRUNCATED_DURING_HASH`. Il caller `backup.js` lo gestisce come errore per-file (`continue`), distinto da `null` (cancel, `break`). Non riproporre "infinite loop on live file".
- **Notification sanitize chirurgico** (R4-6): `_sanitizeForNotification` in `taskHandlers.js` strippa control chars + `<>&` solo nel layer notifica. `validateSessionName` resta invariata per retrocompatibilità con sessioni esistenti. Non riproporre "Pango markup injection".
- **Dedup post-scan case-insensitive** (R4-7): `backup.js` dedup `allFiles` con case-folding su Win32. Sources doppi per case non producono più double-hash. Non riproporre "duplicate scan on NTFS".

### Skippato volutamente — non re-flaggare

- **BigInt → Number su offset > 2^53 (~9 PB)** (Round 3 #5): la conversione `Number(contentLen)` perde precisione solo per file singoli oltre 9 petabyte. Scenario non realistico per backup desktop. **WONTFIX**. Riproporlo richiede un caso d'uso concreto in cui un singolo `.vorn` superi quel limite.
- **TOCTOU in `_findExistingVorncKey`** (Round 3 #7): l'unico caller (`_storeVornc`) re-checka sotto `withFileLock`. L'eventuale race non produce corruzione, solo un fallthrough alla creazione. **NOT-A-BUG**, è defensive-programming-note. Non riproporlo come finding.
- **Confirmation flow UI per restore-originale su path di sistema**: lato worker il path è già bloccato (blocklist `_SYSTEM_PREFIXES_LC` + UNC reject in `restore.js`). La modal di conferma in renderer è **deferred UX**, non security gap. Riproporla come "missing user prompt" è valido solo come feature request, non come HIGH.
- **`vorn:list-dir` whitelist completa di root**: input null-byte è bloccato; restringere alla home dell'utente romperebbe l'uso legittimo (selezione sorgenti backup ovunque sul FS). Il vettore reale (XSS in renderer + abuso di list-dir) richiede prima un'altra vuln. Marcato **defense-in-depth done a livello pratico**.
- **CQ2 — precompressione duplica `writeVornFromSource`**: **WONTFIX**. È uno split intenzionale: il worker pre-comprime per calcolare l'hash compresso PRIMA di interrogare la dedup-check. Centralizzare significherebbe spostare la dedup-check dentro `writeVornFromSource` (peggior architettura).
- **CQ5 — silent catch `{ /* non-critico */ }`**: **DEFERRED**. Convertirli tutti a `logger.debug` richiede importare logger in 6+ moduli, valore marginale. La maggior parte sono cleanup di temp e non meritano log.
- **CQ6 — workerManager progress shape eterogenea**: **DEFERRED**. La shape è diversa per design tra backup / integrity / prune / restore. Normalizzare richiede ridisegno dei worker, basso valore.
- **R4-8 — version byte nell'header `.vorn`**: **DEFERRED a prossima major**. Header attuale `MAGIC(4) + contentLen(8)` non ha campo version. Soluzione proposta: byte dopo MAGIC che vale `0x00` per v0 (compat con file esistenti) e `0x01+` per future versioni — distinguibile perché in v0 quel byte è l'high-byte di un `BigUInt64BE < 72 PB` (sempre `0x00`). Non urgente, riproporlo solo quando serve un cambio binary-incompatibile reale.

### Aree dove sì cercare (Round 5 →)

Il prossimo revisore può investire energie utili su queste aree NON toccate finora:

1. **Pipeline + AbortSignal in `restore.js` / `extractFromStore`**: i `pipeline()` non ricevono signal, quindi un cancel mid-extract attende il flush del chunk corrente. Edge case di responsiveness.
2. **`pruneWorker` schema misto su `run.files`**: legge `Object.values(...)` accettando sia stringhe che `{hash_vorn}`. Verificare se il fallback `fileInfo?.hash_vorn` è morto o storico.
3. **`safeFs.js` deep dive**: gestisce path da user / store, è una superficie ampia. `toLongPath`, `safeReadSync`, edge case su symlink/junction.
4. **Notification icon path**: `getAppIcon()` ha cache? Chiamato a ogni notifica?
5. **Cancel atomicity di `storeChunked`**: cancel a metà → manifest non scritto MA alcuni `.vornc` sì. Sono raccolti dal prune come orfani?
6. **Permission edge cases**: file di run reso read-only mid-backup → `saveRun` lancia? Catturato?
7. **Renderer XSS via metadata**: `meta.records[].paths` e `meta.records[].session` finiscono nella UI. Solo `v-text` o ci sono `v-html`?
8. **Race start-backup ↔ delete-session**: `_assertNoMutatingTask` copre i task mutanti, ma `delete-session` (handler IPC sync) può essere chiamato mentre un backup è running? `hasRunningTask` lo blocca ma è before-task-creation.
9. **Worker error recovery**: se `_storeBlob` rejecta dentro storeBlob, il worker continua con il file successivo. È giusto o vorremmo abortire l'intera run su certi errori (es. ENOSPC sul `.vorn` di destinazione, non solo sul `.vornc`)?

---

## Round 4 — Follow-up findings (post Round 3)

Adversarial pass concentrato sulle aree dichiarate aperte nel capitolo "Note di contesto". Sette finding nuovi, tutti reali, tutti citano codice esistente. Severità motivata dal threat model dichiarato (store ostile, USB rimovibile, attaccante controlla nomi/file).

- [x] **R4-1** [HIGH] — `_cleanupResidualTemps` distruggeva i `.mtmp` all'open-store, eliminando il WAL prima che `readVornMeta` potesse usarlo per la recovery. Data loss permanente per ogni `_upsertRecord` interrotto da crash. Fix: rimossi `.mtmp` dal cleanup; aggiunto pattern `\.repair\.\d+\.\d+$` per gli orfani della recovery atomica (R3-1).
- [x] **R4-2** [HIGH] — Bypass `_isSystemPath` via namespace prefix Win32 (`\\?\`, `\\.\`, `\??\`). Privilege escalation reale su Windows: store ostile con `\\?\C:\Windows\System32\evil.exe` scriveva in System32 al restore-originale. Fix: `_isWin32NamespacePath` con check PRIMA di `resolve()`; regex `_isUNCPath` aggiornata per chiarezza; codice errore unificato in `unsafe_path_blocked`.
- [x] **R4-3** [HIGH] — Path traversal in `extractFromStore` via `rec.session` / `rec.id` ostili: `folderName = '../../evil'` fa fuoriuscire `base` da `destDir` PRIMA che `_safeJoin` validi lo `stripped`. Fix: `_sanitizeFolderSegment` (rifiuta separators / `..` / drive letters / control chars; cap a 100) + defense-in-depth check `resolvedBase ∈ destDir`.
- [x] **R4-4** [MED] — `extractByHash` bypassava `EXTRACT_MAX_BYTES` sui chunked manifest (`contentLen=0n`). Fix: usa `meta.bytes` come `effectiveSize` per i chunked.
- [x] **R4-5** [MED] — `vornHash` loop infinito se `safeReadSync` torna `0` (file truncated mid-hash). Fix: throw `ERR_SOURCE_TRUNCATED_DURING_HASH`; il caller in `backup.js` già gestisce errori per-file via try/catch.
- [x] **R4-6** [MED] — `_notifyRunDone` non sanitizza `task.sessionName`: su Linux DE il notification daemon può interpretare markup Pango. Fix: `_sanitizeForNotification` chirurgico nel layer notifica (no modifica a `validateSessionName` per non rompere sessioni esistenti).
- [x] **R4-7** [LOW] — Walker case-insensitive: due sources che differiscono solo per case su NTFS producevano double-scan, double-hash e silent merge su restore. Fix: dedup post-scan in `backup.js` con case-folding solo su Win32.
- [ ] **R4-8** [LOW] — Manca version byte nell'header `.vorn`: **DEFERRED a prossima major**. È una raccomandazione di housekeeping, non un bug. Costo zero ORA, crescente in futuro.

---


## Note ai prossimi revisori (round 4 → round 5)

Aree ancora aperte non investigate in questo round:
1. **Pipeline error propagation in restore.js / extractFromStore con AbortSignal**: i `pipeline` non passano un signal, quindi un cancel mid-extract attende il flush del chunk corrente. Edge case di responsiveness.
2. **`pruneWorker` legge `run.files` come `Object.values(...)` accettando sia stringhe che `{hash_vorn}`**: c'è uno schema misto storico? Verificare se il fallback `fileInfo?.hash_vorn` è morto o serve davvero.
3. **`safeFs.js`**: non letto in questo round, è una superficie di attacco se gestisce path da utente / store.
4. **Notification icon path**: `getAppIcon()` viene chiamato senza cache? Va profilato se è chiamato a ogni notifica.

### Finding di Round 4 marcati come "by design, non flaggare di nuovo"
- **`_logWin executeJavaScript` con content del log**: il content è passato via `JSON.stringify`, l'inserzione nel DOM è via `.textContent`. No XSS. Anche un log con sequenze `</script>` resta innocuo (executeJavaScript non passa per parser HTML).
- **`vorn:open-external` allowlist GitHub**: `parsed.pathname === '/LeonardoCiaccio/Vorn'` o `startsWith('/LeonardoCiaccio/Vorn/')`. `/LeonardoCiaccio/Vorn-evil` viene rifiutato (no trailing slash). OK.
- **`v-html` solo su `$t(...)` bundled**: i locale JSON sono in `src/renderer/locales/*.json`, bundled at build time, non user-controlled. No XSS.
