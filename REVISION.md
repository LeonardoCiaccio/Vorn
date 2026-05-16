# Code Review Prompt — Vorn App

## Overview

You are performing a **critical, adversarial code review** of **Vorn** (Vault Of Redundant Nodes), a content-addressable desktop backup system built with Electron, Vue 3, and Node.js.

**Your mandate:** be meticulous. Hunt for **security vulnerabilities, correctness bugs, race conditions, data-loss scenarios, and concrete improvement areas**. Do not stop at high-level architectural commentary — go into the code, follow data flows end-to-end, and challenge invariants. Assume an attacker controls file content, file names, and the contents of the user's home directory. Assume the store directory may live on a removable USB stick that can be unplugged at any moment.

**Scope:** only the `src/` directory. Ignore `proto/`, root config files, and build artifacts.

> ⚠️ **Prima di iniziare, leggi obbligatoriamente la sezione "Note di contesto per i prossimi revisori"** più sotto. Documenta decisioni architetturali consolidate, skip list, e aree fertili: 4 round di review sono già stati completati (30+ finding chiusi). Re-flaggare cose già discusse genera rumore.

---

## Technical Context

Read this section carefully before reviewing. It documents non-obvious invariants that are critical to correctness.

### Architecture

- **Main process** handles all file I/O, IPC handlers, SQLite access, and worker lifecycle.
- **Worker threads** (`backupWorker`, `restoreWorker`, `integrityWorker`, `pruneWorker`, etc.) perform heavy work. They communicate with the main process via `parentPort.postMessage`.
- **Store operations** (writing `.vorn` / `.vornc` files) are serialized through a request/response pattern: the worker sends a `store-request` message, the main process executes `storeBlob()`, and responds with `store-result`. This guarantees single-writer access to the store.
- **DB operations** (`dbGetFile`, `dbUpsertFile`, `dbPruneOrphans`) are routed from worker threads to the main process via a `db-request` / `db-result` IPC pair, mirroring the store-request pattern. Only the main process opens `better-sqlite3`. Worker threads never touch the DB directly.
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

The suffix is informational only. Always use `meta.compressedType` to determine actual compression. The hash portion is always `storeKey.split('_')[0]`. The regex is centralized as `STORE_KEY_RE` in `constants.js` and derived from `KNOWN_COMPRESSION_TYPES`.

### Cross-Strategy Deduplication

When a file's `hash_vorn` already exists in the store, `_findExistingVornKey()` returns the existing key **regardless of the current session's strategy or compression setting**. Consequences:

- A session configured for `chunks + gzip` will reuse an existing plain uncompressed `.vorn` if the hash matches.
- A session configured for plain uncompressed blob will reuse an existing chunked or compressed `.vorn` if the hash matches.
- This means **session settings are advisory for new content only**; existing intact content is never reprocessed. The UI exposes this via a "dedup note" in NewSessionModal/EditSessionModal.

The same cross-strategy dedup applies to `.vornc` chunks via `_findExistingVorncKey`. The priority order in `KNOWN_COMPRESSION_TYPES` is **API stabile**: append new types in tail, never in head.

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

Both are invalidated in every write path (`.vorn` creation, repair, dedup-record-upsert, deletion) and on `close-store`. **Stale `_metaCache` previously caused the UI to show wrong compression/strategy badges after manual file deletion + re-backup with different settings.** Verify every write path invalidates the right cache entries.

### Deduplication Cache (SQLite)

The SQLite database (`~/.vorn/vorn.db`, table `Files`) caches `path → { mtime, size, hash }`. On backup, if `mtime` and `size` match the DB record, the stored hash is reused without rehashing. The DB is a cache — losing it causes a full rehash on next backup but no data loss. `dbPruneOrphans` uses a sliding cursor (not random sampling) so the full table is scanned within `ceil(maxId/1000)` cycles.

### Atomic Write Pattern

All persistent state uses **write-to-tmp + fsync + rename**:
- `.vorn` blob creation → `<dest>.tmp` then renamed (with fsync before rename).
- `.vorn` chunked manifest → `<dest>.tmp` (same pattern).
- `.vorn` meta update → `.mtmp` WAL with `contentLen` fingerprint + checksum; the meta tail is then truncated+appended on the original file.
- `.vorn` meta recovery → `.repair.<pid>.<timestamp>` tmp + atomic rename (R3-1).
- Run JSON manifests, settings → write-to-tmp + rename.

The `.mtmp` WAL of `_updateMeta` is the **only** source of truth for metadata updates interrupted by crash/USB-unplug. It MUST NOT be wiped before `readVornMeta` has a chance to apply it (see R4-1 in consolidated decisions).

---

## Review Areas

### 1. Store, Compression & Chunking Pipeline
- Is the `store-request` / `store-result` handshake implemented correctly in all worker types that write to the store?
- Are compressed files always written with `meta.compressed_hash`? Are old files without it handled gracefully in the integrity worker?
- Is `meta.compressedType` always checked before attempting decompression? Are there paths that assume no compression?
- Is the storeKey regex (`STORE_KEY_RE`) applied consistently across all handlers that accept a hash?
- Could a corrupt or malformed `.vorn`/`.vornc` file (truncated, wrong MAGIC, malformed JSON metadata, missing separator, header claiming a content length larger than the file) cause unhandled exceptions or be exploited?
- **Chunking-specific:**
  - Is the parent–chunk relationship updated atomically? What happens if a chunk is written but the parent manifest fails to write?
  - When a chunked manifest is replaced by a plain blob (or vice versa), are the previously referenced `.vornc` chunks properly orphaned and detectable?
  - Does `_storeVornc` handle a race where two concurrent backups create the same chunk simultaneously? Are duplicate `references` entries possible?
  - Can `meta.chunks` contain duplicates if the same content appears twice in a file (e.g., two identical 4 MB regions)? Is that handled correctly during restore?
  - Are temp chunk files in `os.tmpdir()` cleaned up on every error path, including cancellation, OOM, and `ENOSPC`?
- **Cache invalidation:** Does every code path that mutates a `.vorn` invalidate both `_listCache` AND `_metaCache`?

### 2. Concurrency & Worker Lifecycle
- Are all worker threads terminated correctly on task cancel, store disconnect, and app quit?
- Is the `cancelBuffer` (SharedArrayBuffer + Atomics) checked at appropriate granularity in long-running workers?
- Is there any state shared between workers beyond the cancel flag?
- What happens if a `store-request` or `db-request` is in flight when the store disconnects (e.g., USB unplug)?
- Are worker errors propagated back to the renderer in all cases, including uncaught exceptions and worker-thread crashes (`exit` event with non-zero code)?

### 3. IPC & Renderer Security
- Are all IPC handler inputs validated (type, range, path safety) before use?
- Does `vorn:list-dir` allow traversal to sensitive paths?
- Does `vorn:open-external` enforce the URL allowlist in all cases? Could a `javascript:` or `file:` URL slip through?
- Are there any IPC handlers that perform privileged operations without checking `ctx.activeStore`?
- Can a malicious manifest in the store cause the renderer to execute or render attacker-controlled data unsafely (XSS via path names, locale strings, etc.)?
- Are file paths from `.vorn` metadata sanitized before being used in restore destinations (path traversal via `../`, absolute paths in record `paths`, Win32 namespace prefixes)?

### 4. Data Integrity & Error Handling
- Are atomic write patterns (write to `.tmp`, then rename, with fsync) used consistently for all persistent state?
- What happens if a backup worker crashes mid-run? Are crashed runs correctly marked and cleaned up on next store open? Are orphaned `.vornc` chunks left behind?
- Are file descriptor leaks possible in error paths of format/read operations?
- What happens if the disk fills up (`ENOSPC`) during a chunk write? Is the partial `.vornc` cleaned up? Is the parent manifest left in a consistent state?
- What happens if a `.vorn` file is truncated externally between writing and reading? Does `readVornMeta` recover via `.mtmp` correctly in all cases?

### 5. Resource Management
- Are all `setInterval` / `setTimeout` handles cleared on store close and app quit?
- Are IPC listeners registered in `preload/index.js` replaced (not duplicated) on re-registration?
- Are temporary files (`.tmp`, `.ctmp`, `.mtmp`, `.repair.*`, chunk temps) cleaned up in all error paths?
- Are streams properly destroyed on error? Look for `pipeline` calls without proper cleanup of the source stream when the destination errors.

### 6. Renderer State Consistency
- Is `state` (Vue `reactive`) updated correctly after every IPC call that mutates server-side state?
- Are there cases where the renderer can display stale data after a task completes? (See the historical `_metaCache` bug — same class of issue.)
- Are loading/error states reset properly when operations fail partway through?
- After editing a session (changing strategy/compression), does the renderer correctly reflect the new settings without needing a restart?

### 7. Code Quality
- Functions with more than one responsibility or more than ~60 lines
- Logic duplicated across modules (e.g., hash extraction, path normalization, compression-type checks)
- Exported functions with inconsistent or fragile call signatures
- Missing error handling on `async` functions that are not `await`-ed
- Silent `catch {}` blocks that swallow errors that should be surfaced

---

## Output Format

Provide a prioritized list of findings, from most to least critical. **Be specific** — cite file paths, function names, and line numbers wherever possible. Speculative findings are welcome but must be marked as such.

```
### [SEVERITY: HIGH / MEDIUM / LOW] — Short title

**File:** `path/to/file.js[:line]`
**Problem:** Clear description of the issue, with code references.
**Impact:** What can go wrong (crash, data loss, store corruption, security issue, technical debt). Be concrete: "an attacker can…", "after N runs the store will…", "if the USB is unplugged during X, then Y".
**Suggested fix:** Recommended approach, with code snippet if useful.
```

Group findings by severity (HIGH first). Within each group, order by practical impact.

End with a **general assessment** paragraph (3–5 lines) covering:
1. The two or three most dangerous patterns you found.
2. Areas where the architecture is solid and should be preserved.
3. The single highest-leverage improvement you would prioritize next.

---

# ⚠️ Note di contesto per i prossimi revisori — MUST READ

Lette PRIMA di flaggare nuovi finding. Aree già discusse, decisioni architetturali consolidate, voci esplicitamente skippate, aree fertili non ancora investigate. Re-flaggare voci coperte qui genera rumore: sono decisioni esplicite con razionale documentato attraverso 4 round di review.

## Decisioni architetturali consolidate

Non riproporre i seguenti pattern come "bug" — sono il design corrente, con razionale documentato.

### Concorrenza e accesso single-writer

- **DB single-writer nel main process via IPC** (commit `7c0b27a`): `dbGetFile` / `dbUpsertFileMany` / `dbPruneOrphans` invocate dai worker tramite `db-request` / `db-result` (pattern speculare a `store-request`). Una sola connessione `better-sqlite3` viva, serializzata sull'event loop del main. Non flaggare "worker DB connections multiple" né "SQLITE_BUSY risk under concurrent workers".
- **Store writes single-writer** (commit `7c0b27a`): tutte le scritture `.vorn` / `.vornc` passano per `storeBlob` nel main via `store-request`. I worker non aprono mai il file di store direttamente per write. Non flaggare "concurrent writers on `.vorn`".
- **`withFileLock` per-path** (R1, R2-1, R2-5): usato in `storeBlob`, `storeChunked`, `_storeVornc`, `_writeNewVornc`. La chiave è normalizzata via `resolve()` + `toLowerCase()` su Win32. Lock per-path, niente deadlock possibile. Non flaggare "race su scrittura `.vorn`/`.vornc`" né "lock key non normalizzata".
- **Task mutex centralizzato** (R2-1, R3-4): `_assertNoMutatingTask()` in `taskHandlers.js` gate-keepa `backup` / `restore` / `clear` / `extract-store` / `prune` / `extract-hash`. Non flaggare race tra questi task — è gestita.

### Atomic write e WAL

- **`writeVornFromSource` con fsync prima del rename** (R3-2): allineato a `writeVornManifest`. Senza fsync, power failure / USB unplug post-rename poteva lasciare file zero-byte "pubblicato" come backup completato. Non riproporre "missing fsync before rename".
- **TOCTOU mitigation sul blob plain** (R1 #4): `writeVornFromSource` limita il read-stream a `contentLen` esatti + verifica `bytesRead === contentLen`. File "vivi" (log, DB) che crescono o si troncano durante la pipeline non corrompono più l'header. Non riproporre "TOCTOU between statSync and pipeline".
- **WAL `_updateMeta` con fingerprint `contentLen`** (R1 #6): il `.mtmp` lega la sua applicabilità al contentLen corrente del `.vorn`. Recovery rifiuta un WAL orfano se il fingerprint non corrisponde. Non riproporre "WAL può resuscitare records non committati".
- **Recovery di `readVornMeta` ATOMICA via tmp+rename** (R3-1): la vecchia in-place `truncateSync` + `openSync 'a'` non c'è più. Ogni recovery costruisce un `<filePath>.repair.<pid>.<timestamp>` univoco, fsync, rename atomico. Idempotente sotto race. Non flaggare "race in metadata recovery".
- **`.mtmp` cleanup è esclusiva di `readVornMeta`** (R4-1, commit `b929885`): l'open-store NON deve mai eliminarli, sono il WAL di `_updateMeta`. Solo `readVornMeta` su una meta tail leggibile può dichiarare un WAL "provatamente orfano" e cancellarlo. `_cleanupResidualTemps` cleanup-a SOLO `.tmp` / `.ctmp` / `.repair.<pid>.<ts>`. Non riproporre "cleanup all WAL on store open".

### Dedup e cache

- **Cross-strategy dedup** per `.vorn` (`_findExistingVornKey`) E per `.vornc` (`_findExistingVorncKey`) (R1, R2-3): l'ordine di priorità in `KNOWN_COMPRESSION_TYPES` è **API stabile** (commentato in `store.js`). Per aggiungere un tipo (zstd) **appenderlo in fondo**, non in testa. Non flaggare "ordine fragile".
- **Cache invalidation `_listCache` / `_metaCache`** (R1, R2-2, R3-6): invalidate in TUTTI i write path di `.vorn` (creazione blob, manifest, repair, dedup-record-upsert, delete) e in `close-store`. Stesso pattern esteso defense-in-depth a `.vornc`. Non riproporre "stale cache after X".

### Sicurezza restore

- **Restore-originale blocca tutti i namespace prefix Win32** (R4-2): `\\?\`, `\\.\`, `\??\` rifiutati prima di `resolve()`. Combinato con `_SYSTEM_PREFIXES_LC` (blocklist system dirs) e `_isUNCPath` (network shares). Non riproporre "bypass system path via namespace prefix" né "UNC restore originale".
- **`extractFromStore` sanitizza folder-segment da store ostile** (R4-3): `rec.session` / `rec.id` passano da `_sanitizeFolderSegment` (rifiuta `..`, separators, drive letters, control chars; cap 100) + defense-in-depth check `resolvedBase ∈ destDir`. Non riproporre "path traversal via meta.records".
- **`extractByHash` size cap valido anche su chunked** (R4-4): usa `meta.bytes` (effective size) per i manifest chunked, `contentLen` (on-disk) per i blob plain. Non riproporre "EXTRACT_MAX_BYTES bypassed".
- **`vorn:list-dir`**: null-byte injection bloccato. Whitelist completa di root NON applicata perché romperebbe l'uso legittimo (selezione sorgenti backup ovunque sul FS). Vettore reale richiede prima un'altra vuln (XSS in renderer). Non riproporre "list-dir allows filesystem enumeration" senza un attack chain concreto.
- **`vorn:open-external`**: URL parsing strict (`host === 'github.com'` + `pathname === '/LeonardoCiaccio/Vorn'` o `startsWith('/LeonardoCiaccio/Vorn/')`). `Vorn-evil` rifiutato. Non riproporre "prefix match weakness".

### Robustezza I/O

- **`vornHash` rileva truncate mid-hash** (R4-5): `n === 0` → `ERR_SOURCE_TRUNCATED_DURING_HASH`. Il caller `backup.js` lo gestisce come errore per-file (`continue`), distinto da `null` (cancel, `break`). Non riproporre "infinite loop on live file".
- **`readVornMeta` distingue truncation da bad separator** (R2-5): `readSync` parziale → `ERR_FILE_TRUNCATED`; full read ma bytes ≠ SEPARATOR → `ERR_SEPARATOR_NOT_FOUND`. Non riproporre "fragile separator check".
- **`safeFs.toLongPath` normalizza forward-slash + gestisce UNC** (R1 #12): drive-letter, UNC, mixed slash → prefisso `\\?\` corretto. Non riproporre "long path failure on Windows".
- **Scanner blocca junction prima di isDirectory** (R1 #20): NTFS junction su `AppData/Local/Application Data` non causa più loop ricorsivi.
- **Lock detection su NAS/SMB** (R2-6): `checkLock` rifiuta se `lock.machine !== hostname()`. PID check è valido solo entro-macchina. Non riproporre "stale lock theft on network share".

### Cosmetica / UX

- **Dedup post-scan case-insensitive** (R4-7): `backup.js` dedup `allFiles` con case-folding su Win32. Sources doppi per case non producono più double-hash. Non riproporre "duplicate scan on NTFS".
- **Notification sanitize chirurgico** (R4-6): `_sanitizeForNotification` in `taskHandlers.js` strippa control chars + `<>&` solo nel layer notifica. `validateSessionName` resta invariata per retrocompatibilità con sessioni esistenti. Non riproporre "Pango markup injection".
- **`_runCache` invalidata su backup-done / delete-run / close-store** (R2-2): non riproporre "stale run data".
- **Dedup errori su resume** (R3-3): chiave `path|error|phase` evita accumulo unbounded. Non riproporre "errors[] grows on every resume".

## Skippato volutamente — non re-flaggare

Le seguenti voci sono **decisioni esplicite di non fare**. Riproporle come finding richiede una giustificazione NUOVA (vettore concreto, caso d'uso reale) — non basta riproporre la stessa preoccupazione.

- **BigInt → Number su offset > 2^53 (~9 PB)** (Round 3 #5): `Number(contentLen)` perde precisione solo per file singoli oltre 9 petabyte. **WONTFIX**. Scenario non realistico per backup desktop. Riproporlo richiede un caso d'uso concreto.
- **TOCTOU in `_findExistingVorncKey`** (Round 3 #7): l'unico caller (`_storeVornc`) re-checka sotto `withFileLock`. Race non produce corruzione, solo un fallthrough alla creazione. **NOT-A-BUG**, defensive-programming-note.
- **Confirmation flow UI per restore-originale su path di sistema**: il path è già bloccato a livello worker (`_SYSTEM_PREFIXES_LC` + UNC reject + Win32 namespace reject). La modal di conferma in renderer è **deferred UX**, non security gap. Riproporla come "missing user prompt" è valida solo come feature request, non come HIGH.
- **`vorn:list-dir` whitelist completa di root**: vedi sopra ("Sicurezza restore"). Defense-in-depth pratica già applicata (null-byte block).
- **CQ2 — precompressione duplica `writeVornFromSource`**: **WONTFIX**. È uno split intenzionale: il worker pre-comprime per calcolare l'hash compresso PRIMA di interrogare la dedup-check. Centralizzare significherebbe spostare la dedup-check dentro `writeVornFromSource` (peggior architettura).
- **CQ5 — silent catch `{ /* non-critico */ }`**: **DEFERRED**. Convertirli tutti a `logger.debug` richiede importare logger in 6+ moduli, valore marginale. La maggior parte sono cleanup di temp e non meritano log.
- **CQ6 — workerManager progress shape eterogenea**: **DEFERRED**. La shape è diversa per design tra backup / integrity / prune / restore. Normalizzare richiede ridisegno dei worker, basso valore.
- **R4-8 — version byte nell'header `.vorn`**: **DEFERRED a prossima major**. Header attuale `MAGIC(4) + contentLen(8)` non ha campo version. Soluzione proposta: byte dopo MAGIC che vale `0x00` per v0 (compat con file esistenti) e `0x01+` per future versioni. Non urgente, riproporlo solo quando serve un cambio binary-incompatibile reale.
- **`_logWin executeJavaScript` con content del log** (Round 4 by-design): content passato via `JSON.stringify`, inserzione nel DOM via `.textContent`. No XSS. Sequenze `</script>` innocue (executeJavaScript non passa per parser HTML).
- **`v-html` solo su `$t(...)` bundled** (Round 4 by-design): i locale JSON sono in `src/renderer/locales/*.json`, bundled at build time, non user-controlled. No XSS.

## Aree dove sì cercare (Round 5+)

Il prossimo revisore può investire energie utili su queste aree NON toccate finora:

1. **Pipeline + AbortSignal in `restore.js` / `extractFromStore`**: i `pipeline()` non ricevono signal, quindi un cancel mid-extract attende il flush del chunk corrente. Edge case di responsiveness.
2. **`pruneWorker` schema misto su `run.files`**: legge `Object.values(...)` accettando sia stringhe che `{hash_vorn}`. Verificare se il fallback `fileInfo?.hash_vorn` è morto o storico — è schema-drift?
3. **`safeFs.js` deep dive**: gestisce path da user / store, è una superficie ampia. `toLongPath`, `safeReadSync`, edge case su symlink/junction multipli/loop indiretti.
4. **Notification icon path**: `getAppIcon()` ha cache? Chiamato a ogni notifica?
5. **Cancel atomicity di `storeChunked`**: cancel a metà → manifest non scritto MA alcuni `.vornc` con `references` puntante a un hashVorn che non esiste come `.vorn`. Sono raccolti dal prune come orfani correttamente?
6. **Permission edge cases**: file di run reso read-only mid-backup → `saveRun` lancia? Catturato? Lo stato del run viene perso?
7. **Renderer XSS via metadata**: `meta.records[].paths` e `meta.records[].session` finiscono nella UI. Solo `v-text` o ci sono `v-html`? Audit specifico di ogni template che renderizza dati da `.vorn`.
8. **Race start-backup ↔ delete-session**: `_assertNoMutatingTask` copre i task mutanti, ma `delete-session` (handler IPC sync) può essere chiamato mentre un backup è running? `hasRunningTask` lo blocca ma è before-task-creation — c'è una finestra?
9. **Worker error recovery selettiva**: se `_storeBlob` rejecta dentro `storeBlob`, il worker continua col file successivo. Su certi errori (ENOSPC sul `.vorn` di destinazione, non solo sul `.vornc`) vorremmo abortire l'intera run invece?
10. **Format upgrade path**: oggi non c'è version byte (R4-8 deferred). Quando si aggiungerà, come si propagheranno i `.vorn` legacy? Migrazione automatica all'apertura store, o leggi-vecchio-scrivi-nuovo on-touch?
11. **Memory pressure su `readVorn`**: il cap `READ_VORN_MAX_BYTES = 128MB` è hardcoded. Su workstation con poca RAM può comunque saturare se concorrenti. Vale un check di `os.freemem`?
12. **`KNOWN_COMPRESSION_TYPES` estensione**: oggi solo `['gzip']`. Quando si aggiungerà zstd, audit completo dei punti che assumono `'gzip'` come unico valore — sono tutti catturati dalla derived `STORE_KEY_RE` o ci sono check hardcoded?

---

# Storico Round chiusi

Riferimento cronologico delle review già completate. Tutte le voci `[x]` sono fix applicati su `feature/vornc-chunking`. Le voci `[ ]` sono deferred / wontfix con razionale nella sezione "Skippato volutamente".

## Round 1 — Adversarial review iniziale (Opus, 24 finding + 6 CQ)

Commit: `f657793` (fasi 1-9 + 11), `7c0b27a` (fase 10 + CQ1).

**Severity HIGH (7/7 chiusi):**
- [x] **R1-1** Restore "originale" senza validazione: blocklist system dirs + UNC + Win32 namespace
- [x] **R1-2** `vorn:list-dir` null-byte input guard
- [x] **R1-3** `_runCache` invalidata su backup-done / delete-run / close-store
- [x] **R1-4** TOCTOU blob plain: read-stream limitato a `contentLen` + verifica bytesRead
- [x] **R1-5** `_storeVornc` wrappata in `withFileLock` (race su `references`)
- [x] **R1-6** WAL `contentLen` fingerprint nel `.mtmp` + cleanup orfani su read OK
- [x] **R1-7** DB single-writer via IPC main process

**Severity MEDIUM (8/8 chiusi):**
- [x] **R1-8** `HASH_RE` → `STORE_KEY_RE` derivata da `KNOWN_COMPRESSION_TYPES`
- [x] **R1-9** Cross-strategy chunk dedup via `_findExistingVorncKey`
- [x] **R1-10** `_repairMissingChunk` verifica `vornHash(chunkTmp) === expected`
- [x] **R1-11** `dbPruneOrphans` cursore sliding (non random sampling)
- [x] **R1-12** `safeFs.toLongPath` normalizza forward-slash + gestisce UNC
- [x] **R1-13** `format.js` WAL recovery preserva la cause originale
- [x] **R1-14** `fileLock` key normalizzata via `resolve()` + lowercase su Win32
- [x] **R1-15** Documentato ordine fallback `KNOWN_COMPRESSION_TYPES` come API stabile

**Severity LOW (9/9 chiusi):**
- [x] **R1-16** `vorn:open-external` URL parsing strict
- [x] **R1-17** UNC paths rifiutati nel restore originale (incorporato in R1-1)
- [x] **R1-18** Integrity error log: `.map(i => i.code).join(' | ')`
- [x] **R1-19** `pruneWorker`: singolo `readdirSync` per `.vorn` + `.vornc`
- [x] **R1-20** Scanner: check `isSymbolicLink` PRIMA di `isDirectory` (NTFS junction)
- [x] **R1-21** `compressToTemp`: rimosso `setInterval`, check inline su ogni chunk
- [x] **R1-22** `cleanCrashedRuns` cede event-loop tra ogni run
- [x] **R1-23** `closeDb` riposizionato prima di `dbPruneOrphans`
- [x] **R1-24** `store.js` `getEntry`/`extractContent`/`readEntry` asserzione `storeKey`

**Code Quality (3/6 chiusi, 3 deferred):**
- [x] **CQ1** `storeBlob` → object args (ex 12 parametri posizionali)
- [x] **CQ3** Estratti `_validateCompression` / `_validateStrategy` / `_validateExcludes`
- [x] **CQ4** WAL legacy marcato DEPRECATED
- [ ] **CQ2** Precompressione duplica `writeVornFromSource` — **WONTFIX** (split intenzionale)
- [ ] **CQ5** Silent catch → `logger.debug` — **DEFERRED**
- [ ] **CQ6** workerManager progress shape — **DEFERRED**

## Round 2 — Follow-up review (post Round 1, 6 finding)

Commit: `733da69`.

- [x] **R2-1** [HIGH] Race prune↔backup: `_assertNoMutatingTask()` centralizzato in `taskHandlers.js`
- [x] **R2-2** [HIGH] `_metaCache` stale dopo `_upsertRecord` nel dedup path di `storeBlob`
- [x] **R2-3** [MED] Pre-compressione ridondante: esportata `findExistingVornKey` da `store.js`
- [x] **R2-4** [MED] Cleanup orfani `vorn_c_*.tmp` (chunk temps in `%TEMP%`)
- [x] **R2-5** [MED] `readSync` parziale check separatore: `ERR_FILE_TRUNCATED` distinto
- [x] **R2-6** [LOW] Lock detection su NAS/SMB: `lock.machine !== hostname()` reject

## Round 3 — Follow-up review (post Round 2, 7 finding di cui 2 declinati)

Commit: `ee5ce03`.

- [x] **R3-1** [HIGH] Race in `readVornMeta` recovery → atomica via tmp+rename
- [x] **R3-2** [HIGH] Missing `fsync` in `writeVornFromSource` prima del rename
- [x] **R3-3** [MED] Dedup duplicate errors su resume (`path|error|phase` key)
- [x] **R3-4** [MED] `vorn:extract-hash` chiama `_assertNoMutatingTask`
- [ ] **R3-5** [MED] BigInt → Number su offset > 2^53 — **WONTFIX** (vedi skip list)
- [x] **R3-6** [LOW] Cache invalidation per `.vornc` (defense-in-depth)
- [ ] **R3-7** [LOW] TOCTOU in `_findExistingVorncKey` — **NOT-A-BUG** (caller protetto)

## Round 4 — Follow-up review (post Round 3, 8 finding di cui 1 deferred)

Commit: `303effd` (R4-4..R4-7), `a788f15` (R4-2, R4-3), `b929885` (R4-1), `c3c4b48` (docs).

- [x] **R4-1** [HIGH] `_cleanupResidualTemps` NON tocca più `.mtmp`; cleanup `.repair.*` orfani aggiunto
- [x] **R4-2** [HIGH] Bypass `_isSystemPath` via Win32 namespace prefix → `_isWin32NamespacePath`
- [x] **R4-3** [HIGH] Path traversal in `extractFromStore` via `rec.session` ostile → `_sanitizeFolderSegment` + check `resolvedBase`
- [x] **R4-4** [MED] `extractByHash` size cap su chunked → usa `meta.bytes`
- [x] **R4-5** [MED] `vornHash` truncate mid-hash → `ERR_SOURCE_TRUNCATED_DURING_HASH`
- [x] **R4-6** [MED] `_notifyRunDone` sanitize sessionName per Pango markup
- [x] **R4-7** [LOW] Walker case-insensitive: dedup post-scan in `backup.js`
- [ ] **R4-8** [LOW] Version byte nell'header — **DEFERRED a prossima major**

---

## Note operative per il revisore Round 5

- **Branch corrente**: `feature/vornc-chunking`. Master è lo stato prima del refactor chunking.
- **Threat model**: store ostile (USB altrui, `.vorn` manipolato), USB rimovibile a runtime, attaccante controlla file content / file names / `meta.records`. Stessa baseline dei round precedenti.
- **Stile dei finding**: cita file e righe esatti. Distingui chiaramente "speculative" da "concrete vector". Suggerisci fix con snippet.
- **Severity calibration**: HIGH = data loss / privilege escalation / corruption reale e dimostrabile. MED = bug funzionale, UX rotta, leak di risorse. LOW = code quality, edge case improbabile, raccomandazione.
- **Avoid duplicates**: ogni cosa marcata `[x]` in questo file È STATA FIXATA. Ogni cosa nella sezione "Skippato volutamente" è stata DELIBERATAMENTE non fixata. Riproporre una di queste richiede un nuovo vettore concreto.
