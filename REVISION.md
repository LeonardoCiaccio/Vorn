# Code Review Prompt — Vorn App

## Overview

You are performing a **critical, adversarial code review** of **Vorn** (Vault Of Redundant Nodes), a content-addressable desktop backup system built with Electron, Vue 3, and Node.js.

**Your mandate:** be meticulous. Hunt for **security vulnerabilities, correctness bugs, race conditions, data-loss scenarios, and concrete improvement areas**. Do not stop at high-level architectural commentary — go into the code, follow data flows end-to-end, and challenge invariants. Assume an attacker controls file content, file names, and the contents of the user's home directory. Assume the store directory may live on a removable USB stick that can be unplugged at any moment.

**Scope:** only the `src/` directory. Ignore `proto/`, root config files, and build artifacts.

> 📝 **Mandatory output: write the review in `RESPONSE.md`** (overwrite any existing content). Use the format described in the "Output Format" section. Every finding MUST include a **code snippet suggestion** — plain prose is not enough. The snippet must be copy-pastable or near-pastable: name the function/file, include enough context to apply the fix without ambiguity.

> ⚠️ **Before starting, you MUST read the "Notes for the next reviewer" section** below. It documents consolidated architectural decisions, the skip list, review anti-patterns to avoid, and fertile areas still open: 5 review rounds have already been completed (35+ findings closed). Re-flagging closed items or falling into known anti-patterns generates noise — or worse, fixes that break the code.

> 🚫 **Review-quality bar**: Round 5 produced inflated severities (HIGH used for UX-lag), a "race condition" that did not exist (JS single-thread), and a suggested fix that would have caused massive data loss if applied literally. The "Review anti-patterns" section is mandatory reading to avoid repeating these mistakes. Findings without a concrete vector, inflated severity, or fixes not verified against callers will be rejected.

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

The same cross-strategy dedup applies to `.vornc` chunks via `_findExistingVorncKey`. The priority order in `KNOWN_COMPRESSION_TYPES` is **stable API**: append new types at the tail, never at the head.

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

Both are invalidated in every write path (`.vorn` creation, repair, dedup-record-upsert, deletion) and on `close-store`. **A stale `_metaCache` previously caused the UI to show wrong compression/strategy badges after manual file deletion + re-backup with different settings.** Verify every write path invalidates the right cache entries.

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

**Destination**: write the review into `RESPONSE.md` (overwrite any existing content). Do NOT respond inline — the user will read the file.

**Mandatory code snippets**: every finding must include a copy-pastable (or near-pastable) snippet in the `Suggested fix` field. Prose-only suggestions are not acceptable. The snippet must be self-sufficient: function name, file path, and any relevant imports / call-site context.

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

# ⚠️ Notes for the next reviewer — MUST READ

Read BEFORE flagging new findings. Areas already discussed, consolidated architectural decisions, explicitly skipped items, fertile areas not yet investigated. Re-flagging items covered here generates noise: these are deliberate decisions with documented rationale across 5 review rounds.

## Consolidated architectural decisions

Do not propose any of the following patterns as "bugs" — they are the current design, with documented rationale.

### Concurrency and single-writer access

- **DB single-writer in main process via IPC** (commit `7c0b27a`): `dbGetFile` / `dbUpsertFileMany` / `dbPruneOrphans` are invoked from workers through `db-request` / `db-result` (specular pattern to `store-request`). A single `better-sqlite3` connection alive, serialized on the main event loop. Do NOT flag "worker DB connections multiple" or "SQLITE_BUSY risk under concurrent workers".
- **Store writes single-writer** (commit `7c0b27a`): all `.vorn` / `.vornc` writes go through `storeBlob` in the main via `store-request`. Workers never open store files directly for write. Do NOT flag "concurrent writers on `.vorn`".
- **`withFileLock` per-path** (R1, R2-1, R2-5): used in `storeBlob`, `storeChunked`, `_storeVornc`, `_writeNewVornc`. The key is normalized via `resolve()` + `toLowerCase()` on Win32. Per-path lock, no deadlock possible. Do NOT flag "race on `.vorn`/`.vornc` writes" or "lock key not normalized".
- **Centralized task mutex** (R2-1, R3-4): `_assertNoMutatingTask()` in `taskHandlers.js` gate-keeps `backup` / `restore` / `clear` / `extract-store` / `prune` / `extract-hash`. Do NOT flag races between these tasks — it is handled.

### Atomic write and WAL

- **`writeVornFromSource` with fsync before rename** (R3-2): aligned with `writeVornManifest`. Without fsync, power failure / USB unplug post-rename could leave a zero-byte file "published" as a completed backup. Do NOT re-propose "missing fsync before rename".
- **TOCTOU mitigation for plain blob** (R1 #4): `writeVornFromSource` limits the read-stream to exactly `contentLen` bytes + verifies `bytesRead === contentLen`. "Live" files (logs, DBs) that grow or are truncated during the pipeline no longer corrupt the header. Do NOT re-propose "TOCTOU between statSync and pipeline".
- **`_updateMeta` WAL with `contentLen` fingerprint** (R1 #6): the `.mtmp` ties its applicability to the current `contentLen` of the `.vorn`. Recovery rejects an orphan WAL if the fingerprint mismatches. Do NOT re-propose "WAL may resurrect uncommitted records".
- **ATOMIC `readVornMeta` recovery via tmp+rename** (R3-1): the old in-place `truncateSync` + `openSync 'a'` is gone. Each recovery builds a unique `<filePath>.repair.<pid>.<timestamp>`, fsyncs, and atomically renames. Idempotent under race. Do NOT flag "race in metadata recovery".
- **`.mtmp` cleanup is exclusive to `readVornMeta`** (R4-1, commit `b929885`): open-store MUST NEVER delete them — they are the WAL of `_updateMeta`. Only `readVornMeta` on a readable meta tail can declare a WAL "provably orphan" and delete it. `_cleanupResidualTemps` removes ONLY `.tmp` / `.ctmp` / `.repair.<pid>.<ts>`. Do NOT re-propose "cleanup all WAL on store open".

### Dedup and cache

- **Cross-strategy dedup** for `.vorn` (`_findExistingVornKey`) AND for `.vornc` (`_findExistingVorncKey`) (R1, R2-3): the priority order in `KNOWN_COMPRESSION_TYPES` is **stable API** (commented in `store.js`). To add a new type (zstd) **append at the tail**, not at the head. Do NOT flag "fragile order".
- **Cache invalidation `_listCache` / `_metaCache`** (R1, R2-2, R3-6): invalidated in EVERY `.vorn` write path (blob creation, manifest, repair, dedup-record-upsert, delete) and on `close-store`. Same pattern extended defense-in-depth to `.vornc`. Do NOT re-propose "stale cache after X".

### Restore security

- **Original-restore blocks all Win32 namespace prefixes** (R4-2): `\\?\`, `\\.\`, `\??\` rejected before `resolve()`. Combined with `_SYSTEM_PREFIXES_LC` (system dirs blocklist) and `_isUNCPath` (network shares). Do NOT re-propose "system path bypass via namespace prefix" or "UNC original-restore".
- **`extractFromStore` sanitizes folder-segment from hostile store** (R4-3): `rec.session` / `rec.id` pass through `_sanitizeFolderSegment` (rejects `..`, separators, drive letters, control chars; cap 100) + defense-in-depth check `resolvedBase ∈ destDir`. Do NOT re-propose "path traversal via meta.records".
- **`extractByHash` size cap also valid on chunked** (R4-4): uses `meta.bytes` (effective size) for chunked manifests, `contentLen` (on-disk) for plain blobs. Do NOT re-propose "EXTRACT_MAX_BYTES bypassed".
- **`vorn:list-dir`**: null-byte injection blocked. Full root whitelist NOT applied because it would break legitimate use (backup source selection anywhere on the FS). The real vector requires another vuln first (XSS in renderer). Do NOT re-propose "list-dir allows filesystem enumeration" without a concrete attack chain.
- **`vorn:open-external`**: strict URL parsing (`host === 'github.com'` + `pathname === '/LeonardoCiaccio/Vorn'` or `startsWith('/LeonardoCiaccio/Vorn/')`). `Vorn-evil` rejected. Do NOT re-propose "prefix match weakness".

### I/O robustness

- **`vornHash` detects mid-hash truncate** (R4-5): `n === 0` → `ERR_SOURCE_TRUNCATED_DURING_HASH`. The caller `backup.js` handles it as a per-file error (`continue`), distinct from `null` (cancel, `break`). Do NOT re-propose "infinite loop on live file".
- **`readVornMeta` distinguishes truncation from bad separator** (R2-5): partial `readSync` → `ERR_FILE_TRUNCATED`; full read but bytes ≠ SEPARATOR → `ERR_SEPARATOR_NOT_FOUND`. Do NOT re-propose "fragile separator check".
- **`safeFs.toLongPath` normalizes forward-slash + handles UNC** (R1 #12): drive-letter, UNC, mixed slash → correct `\\?\` prefix. Do NOT re-propose "long path failure on Windows".
- **Scanner blocks junction before isDirectory** (R1 #20): NTFS junction on `AppData/Local/Application Data` no longer causes recursive loops.
- **Lock detection on NAS/SMB** (R2-6): `checkLock` rejects if `lock.machine !== hostname()`. PID check is only valid intra-machine. Do NOT re-propose "stale lock theft on network share".

### Cosmetic / UX

- **Case-insensitive post-scan dedup** (R4-7): `backup.js` dedups `allFiles` with case-folding on Win32. Sources duplicated by case no longer produce double-hash. Do NOT re-propose "duplicate scan on NTFS".
- **Cancellable pipelines in restore** (R5-1): `restore()` and `extractFromStore()` use a `_cancellable(isCancelled)` transform stream that throws `ERR_ABORTED` on every chunk if cancel is active. The caller catches `ERR_ABORTED` and `break`s. Do NOT re-propose "pipeline does not pass AbortSignal".
- **Task guard on delete-session and delete-run** (R5-2 defensive, R5-3): `delete-session` calls `assertNoMutatingTask()` (any global mutating task), `delete-run` calls `hasRunningTask(sessionName)` (task on the same session). Without `delete-run` guard a mid-resume backup would have recreated the deleted run with partial data. Do NOT re-propose "delete-X race".
- **`pruneWorker` single schema** (R5-4): `run.files` is a `relPath → storeKey` (string) map. The legacy `fileInfo?.hash_vorn` branch has been removed. `referenced` contains full storeKeys (with suffix like `_gzip`) and the match against store filenames is direct — do NOT split by hash, or all compressed `.vorn` files become false orphans.
- **Surgical notification sanitize** (R4-6): `_sanitizeForNotification` in `taskHandlers.js` strips control chars + `<>&` only at the notification layer. `validateSessionName` stays as-is for backward compatibility with existing sessions. Do NOT re-propose "Pango markup injection".
- **`_runCache` invalidated on backup-done / delete-run / close-store** (R2-2): do NOT re-propose "stale run data".
- **Error dedup on resume** (R3-3): `path|error|phase` key prevents unbounded accumulation. Do NOT re-propose "errors[] grows on every resume".

## Deliberately skipped — do not re-flag

The following items are **explicit decisions not to fix**. Re-proposing them as findings requires a NEW justification (concrete vector, real use case) — repeating the same concern is not enough.

- **BigInt → Number on offsets > 2^53 (~9 PB)** (Round 3 #5): `Number(contentLen)` loses precision only for single files over 9 petabytes. **WONTFIX**. Unrealistic for desktop backup. Re-proposing requires a concrete use case.
- **TOCTOU in `_findExistingVorncKey`** (Round 3 #7): the only caller (`_storeVornc`) re-checks under `withFileLock`. The race does not produce corruption, only a fallthrough to creation. **NOT-A-BUG**, defensive-programming note.
- **UI confirmation flow for original-restore on system paths**: the path is already blocked at the worker layer (`_SYSTEM_PREFIXES_LC` + UNC reject + Win32 namespace reject). The confirmation modal in the renderer is **deferred UX**, not a security gap. Re-proposing it as "missing user prompt" is valid only as a feature request, not as HIGH.
- **Full root whitelist for `vorn:list-dir`**: see above ("Restore security"). Practical defense-in-depth already applied (null-byte block).
- **CQ2 — precompression duplicates `writeVornFromSource`**: **WONTFIX**. This is an intentional split: the worker pre-compresses to compute the compressed hash BEFORE querying the dedup-check. Centralizing would mean moving the dedup-check inside `writeVornFromSource` (worse architecture).
- **CQ5 — silent catch `{ /* non-critical */ }`**: **DEFERRED**. Converting them all to `logger.debug` requires importing logger in 6+ modules, marginal value. Most are temp cleanups and don't deserve logs.
- **CQ6 — heterogeneous workerManager progress shape**: **DEFERRED**. The shape is different by design across backup / integrity / prune / restore. Normalizing requires redesigning the workers, low value.
- **R4-8 — version byte in `.vorn` header**: **DEFERRED to next major**. Current header `MAGIC(4) + contentLen(8)` has no version field. Proposed solution: byte after MAGIC that is `0x00` for v0 (compat with existing files) and `0x01+` for future versions. Not urgent, re-propose only when a real binary-incompatible change is needed.
- **R5-1 propagation in `_writeChunkTemp` / `extractByHash`**: pipeline AbortSignal NOT propagated in `store.js _writeChunkTemp` (4 MB chunks, negligible cancel-lag) nor in `extractByHash` (called from main process IPC, not from a worker, no isCancelled available). Do NOT re-propose as a coverage gap.
- **R5-5 — `safeFs.toLongPath` on relative paths**: **WONTFIX**. `resolve()` on a relative path changes semantics (CWD-dependent). Callers always pass absolute paths (validated upstream by `_validateSession`, `assertHash`, etc.). Do NOT re-propose without a concrete caller passing relative paths.
- **R5-6 — Atomics consistency**: **NOT-A-BUG**. All workers already use `Atomics.load(cancelFlag, 0)` (verified in `pruneWorker`, `integrityWorker`, `backupWorker`, `restoreWorker`). The reviewer themselves admitted "current code is mostly okay". Do NOT re-propose without a specific point with non-atomic access.
- **R5-2 race between `_assertNoMutatingTask` and `createTask`**: **NOT-A-RACE**. JS main-process is a single-threaded event-loop, the `start-backup` handler executes both sync calls in the same tick → atomic by construction. The defensive fix was applied anyway, but it is NOT closing a real race condition. Do NOT re-propose as HIGH.
- **`_logWin executeJavaScript` with log content** (Round 4 by-design): content passed via `JSON.stringify`, DOM insertion via `.textContent`. No XSS. `</script>` sequences are harmless (executeJavaScript does not go through the HTML parser).
- **`v-html` only on bundled `$t(...)`** (Round 4 by-design): the locale JSON files are in `src/renderer/locales/*.json`, bundled at build time, not user-controlled. No XSS.

## Review anti-patterns — what NOT to do

Patterns observed in previous rounds that generated noise or, worse, suggested fixes that would have broken the code. Avoid rigorously.

### 1. Do not inflate severity
**HIGH** is reserved for: demonstrable data loss, privilege escalation, store corruption, security vulnerabilities with a concrete vector. The following are NOT HIGH:
- Broken UX or lag (it's MED).
- "It could in theory…" without a concrete case (it's LOW or WONTFIX).
- Hypothetical races between sync IPC handlers in the same main-process (NOT a race — see point 3).
- Code smell, dead-code branches, naming inconsistency (it's LOW cleanup).

If you can't demonstrate the vector in 2 concrete sentences ("if the attacker does X, then Y happens, and the user loses Z"), it's not HIGH.

### 2. Verify callers BEFORE proposing a fix
Negative example (Round 5 #4): the reviewer proposed `referenced.add(storeKey.split('_')[0])` in `pruneWorker.js`. But the `referenced` set is then matched against the store FILENAMES (`<hash>_<type>.vorn`), NOT against bare hashes. Applying the fix would have flagged every compressed `.vorn` as an orphan → massive data loss on the first prune.

Before proposing a snippet that changes a data structure, trace ALL its callers. If you don't have time, mark it as "speculative — verify callers before applying".

### 3. Distinguish main-process single-thread from worker threads
JavaScript in the main-process is a **single-threaded event-loop**. Two sync IPC handlers CANNOT interleave. Sequences like:
```js
ipcMain.handle('x', () => {
  checkA()    // sync
  doB()       // sync
  doC()       // sync
})
```
are **atomic** from the event-loop's point of view. There is no race between `checkA` and `doC`.

**Real** race conditions live between:
- Worker thread ↔ main-process (on shared resources: store files, DB).
- Worker thread ↔ worker thread (same).
- Async IPC handler (with internal `await`) ↔ another handler that breaches during that `await`.

Before flagging a race, explicitly identify WHO are the two threads/contexts competing and WHERE the `await` or yield-point is.

### 4. Speculative findings: mark them as such
"This COULD be a problem IF in the future someone does X" is not a bug, it's a note. If you want to raise it as a finding:
- Demonstrate a real caller that triggers the vector, OR
- Mark explicitly as `[SPECULATIVE]` and accept a likely WONTFIX.

Don't inflate LOW to MED to give weight to the report.

### 5. Read the consolidated decisions BEFORE flagging
The "Consolidated architectural decisions" and "Deliberately skipped" sections above contain every pattern already fixed or explicitly non-fixable, with rationale. Re-flagging one of these requires a NEW concrete vector, not the same concern rephrased. Examples of unacceptable re-flags:
- "DB workers race" → closed, `db-request` IPC in `7c0b27a`.
- "TOCTOU on `_findExistingVorncKey`" → caller already protected under lock.
- "EXTRACT_MAX_BYTES bypass" → closed in R4-4 with `meta.bytes`.

### 6. Do not state falsehoods about the codebase
Verify BEFORE writing. Examples of false statements seen in Round 5:
- "Workers don't use `Atomics.load`" → false, all 4 workers use it (`grep Atomics.load src/main/vorn/*Worker.js`).
- "`pipeline` never receives `signal`" → true only in `restore.js`; `compressToTemp` already has the AbortController inline-attached.

If you have not opened the file in the last 30 seconds, do not write "the file does X". Open it, verify, cite the line.

### 7. Code-pastable snippets, always
Every finding must include a copy-pastable snippet. Pseudocode "// idea: do this" is insufficient. The snippet must:
- Cite the exact file and function.
- Include enough context (imports, signature, callers if relevant).
- Be applicable without further investigation.

If you can't write it concretely, the finding is probably not mature enough to be flagged.

### 8. Dead-code removal ≠ MED
Removing an `else if` branch that is never reached is cosmetic, not functional. It is always LOW (or "code quality"). Don't inflate it to make the report look more substantial.

### 9. Distinguish "fix written" from "fix tested"
The reviewer does not test the code (cannot). So every "Suggested fix" is a **hypothesis**. Mark the most invasive fixes (refactors of public signatures, shape changes on shared data structures) with: "requires regression tests on callers X, Y, Z". The user applying the fix takes this as a pre-flight checklist, not as a blocker.

---

## Areas worth investigating (Round 6+)

The next reviewer can invest effort productively in these areas NOT yet touched (items closed in R5-1/3/4 have been removed):

1. **`safeFs.js` deep dive**: handles paths from user / store, broad attack surface. `toLongPath`, `safeReadSync`, edge cases on multiple symlinks/junctions / indirect loops.
2. **Notification icon path**: does `getAppIcon()` have a cache? Is it called on every notification?
3. **Cancel atomicity of `storeChunked`**: cancel mid-flight → manifest not written BUT some `.vornc` files with `references` pointing to a hashVorn that doesn't exist as `.vorn`. Are they correctly collected by the prune as orphans?
4. **Permission edge cases**: run file made read-only mid-backup → does `saveRun` throw? Is it caught? Is the run state lost?
5. **Renderer XSS via metadata**: `meta.records[].paths` and `meta.records[].session` end up in the UI. Only `v-text` or are there `v-html`? Specific audit of every template rendering data from `.vorn`.
6. **Selective worker error recovery**: if `_storeBlob` rejects inside `storeBlob`, the worker continues with the next file. On certain errors (ENOSPC on the destination `.vorn`, not only on the `.vornc`) would we want to abort the whole run instead?
7. **Format upgrade path**: today there is no version byte (R4-8 deferred). When added, how will legacy `.vorn` files be propagated? Automatic migration on store open, or read-old-write-new on-touch?
8. **Memory pressure on `readVorn`**: the cap `READ_VORN_MAX_BYTES = 128MB` is hardcoded. On low-RAM workstations it may still saturate if concurrent. Is an `os.freemem` check worthwhile?
9. **`KNOWN_COMPRESSION_TYPES` extension**: today only `['gzip']`. When zstd is added, full audit of points that assume `'gzip'` as the only value — are they all caught by the derived `STORE_KEY_RE` or are there hardcoded checks?
10. **Pipeline AbortSignal extension**: today `_cancellable(isCancelled)` lives only in `restore.js`. The same logic may be needed in other long pipelines (e.g., `extractStoreWorker` if it exists). Audit residual pipelines.

---

# Closed-rounds history

Chronological reference of completed reviews. Every `[x]` item is a fix applied on `feature/vornc-chunking`. Every `[ ]` item is deferred / wontfix with rationale in the "Deliberately skipped" section.

## Round 1 — Initial adversarial review (Opus, 24 findings + 6 CQ)

Commits: `f657793` (phases 1-9 + 11), `7c0b27a` (phase 10 + CQ1).

**Severity HIGH (7/7 closed):**
- [x] **R1-1** "Original" restore without validation: system dirs blocklist + UNC + Win32 namespace
- [x] **R1-2** `vorn:list-dir` null-byte input guard
- [x] **R1-3** `_runCache` invalidated on backup-done / delete-run / close-store
- [x] **R1-4** TOCTOU plain blob: read-stream limited to `contentLen` + bytesRead verification
- [x] **R1-5** `_storeVornc` wrapped in `withFileLock` (race on `references`)
- [x] **R1-6** WAL `contentLen` fingerprint in `.mtmp` + orphan cleanup on successful read
- [x] **R1-7** DB single-writer via main-process IPC

**Severity MEDIUM (8/8 closed):**
- [x] **R1-8** `HASH_RE` → `STORE_KEY_RE` derived from `KNOWN_COMPRESSION_TYPES`
- [x] **R1-9** Cross-strategy chunk dedup via `_findExistingVorncKey`
- [x] **R1-10** `_repairMissingChunk` verifies `vornHash(chunkTmp) === expected`
- [x] **R1-11** `dbPruneOrphans` sliding cursor (not random sampling)
- [x] **R1-12** `safeFs.toLongPath` normalizes forward-slash + handles UNC
- [x] **R1-13** `format.js` WAL recovery preserves original cause
- [x] **R1-14** `fileLock` key normalized via `resolve()` + lowercase on Win32
- [x] **R1-15** Documented `KNOWN_COMPRESSION_TYPES` fallback order as stable API

**Severity LOW (9/9 closed):**
- [x] **R1-16** `vorn:open-external` strict URL parsing
- [x] **R1-17** UNC paths rejected in original-restore (folded into R1-1)
- [x] **R1-18** Integrity error log: `.map(i => i.code).join(' | ')`
- [x] **R1-19** `pruneWorker`: single `readdirSync` for `.vorn` + `.vornc`
- [x] **R1-20** Scanner: check `isSymbolicLink` BEFORE `isDirectory` (NTFS junction)
- [x] **R1-21** `compressToTemp`: removed `setInterval`, inline check on every chunk
- [x] **R1-22** `cleanCrashedRuns` yields event-loop between every run
- [x] **R1-23** `closeDb` repositioned before `dbPruneOrphans`
- [x] **R1-24** `store.js` `getEntry`/`extractContent`/`readEntry` assert `storeKey`

**Code Quality (3/6 closed, 3 deferred):**
- [x] **CQ1** `storeBlob` → object args (ex 12 positional parameters)
- [x] **CQ3** Extracted `_validateCompression` / `_validateStrategy` / `_validateExcludes`
- [x] **CQ4** Legacy WAL marked DEPRECATED
- [ ] **CQ2** Precompression duplicates `writeVornFromSource` — **WONTFIX** (intentional split)
- [ ] **CQ5** Silent catch → `logger.debug` — **DEFERRED**
- [ ] **CQ6** workerManager progress shape — **DEFERRED**

## Round 2 — Follow-up review (post Round 1, 6 findings)

Commit: `733da69`.

- [x] **R2-1** [HIGH] Race prune↔backup: `_assertNoMutatingTask()` centralized in `taskHandlers.js`
- [x] **R2-2** [HIGH] Stale `_metaCache` after `_upsertRecord` in `storeBlob` dedup path
- [x] **R2-3** [MED] Redundant pre-compression: exported `findExistingVornKey` from `store.js`
- [x] **R2-4** [MED] Orphan `vorn_c_*.tmp` cleanup (chunk temps in `%TEMP%`)
- [x] **R2-5** [MED] Partial `readSync` separator check: `ERR_FILE_TRUNCATED` distinguished
- [x] **R2-6** [LOW] Lock detection on NAS/SMB: `lock.machine !== hostname()` reject

## Round 3 — Follow-up review (post Round 2, 7 findings of which 2 declined)

Commit: `ee5ce03`.

- [x] **R3-1** [HIGH] Race in `readVornMeta` recovery → atomic via tmp+rename
- [x] **R3-2** [HIGH] Missing `fsync` in `writeVornFromSource` before rename
- [x] **R3-3** [MED] Dedup duplicate errors on resume (`path|error|phase` key)
- [x] **R3-4** [MED] `vorn:extract-hash` calls `_assertNoMutatingTask`
- [ ] **R3-5** [MED] BigInt → Number on offsets > 2^53 — **WONTFIX** (see skip list)
- [x] **R3-6** [LOW] Cache invalidation for `.vornc` (defense-in-depth)
- [ ] **R3-7** [LOW] TOCTOU in `_findExistingVorncKey` — **NOT-A-BUG** (caller protected)

## Round 4 — Follow-up review (post Round 3, 8 findings of which 1 deferred)

Commits: `303effd` (R4-4..R4-7), `a788f15` (R4-2, R4-3), `b929885` (R4-1), `c3c4b48` (docs).

- [x] **R4-1** [HIGH] `_cleanupResidualTemps` no longer touches `.mtmp`; orphan `.repair.*` cleanup added
- [x] **R4-2** [HIGH] Bypass of `_isSystemPath` via Win32 namespace prefix → `_isWin32NamespacePath`
- [x] **R4-3** [HIGH] Path traversal in `extractFromStore` via hostile `rec.session` → `_sanitizeFolderSegment` + `resolvedBase` check
- [x] **R4-4** [MED] `extractByHash` size cap on chunked → uses `meta.bytes`
- [x] **R4-5** [MED] `vornHash` truncate mid-hash → `ERR_SOURCE_TRUNCATED_DURING_HASH`
- [x] **R4-6** [MED] `_notifyRunDone` sanitizes sessionName for Pango markup
- [x] **R4-7** [LOW] Case-insensitive walker: post-scan dedup in `backup.js`
- [ ] **R4-8** [LOW] Version byte in header — **DEFERRED to next major**

## Round 5 — Follow-up review (post Round 4, 6 findings of which 3 declined)

Less meticulous review than previous rounds: surfaced 3 real problems across the 12 declared fertile areas, one of which had a wrong suggested fix (would have introduced massive data loss if applied literally). The review was accepted selectively.

- [x] **R5-1** [MED, was HIGH] Pipeline without AbortSignal in `restore()` / `extractFromStore` → `_cancellable(isCancelled)` helper as inline transform stream. `_writeChunkTemp` (4 MB) and `extractByHash` (no isCancelled) **skipped** with rationale.
- [x] **R5-2** [LOW defensive, was HIGH] `delete-session` now calls `assertNoMutatingTask()`. The "race" flagged as HIGH **did not exist** (JS single-threaded); the fix was applied as defense-in-depth (delete-session mid-prune/clear of other sessions).
- [x] **R5-3** [MED] `delete-run` now checks `hasRunningTask(sessionName)`. Real bug: mid-resume backup would have recreated the deleted run with partial data.
- [x] **R5-4** [LOW cleanup] Removed dead-code branch `fileInfo?.hash_vorn` in `pruneWorker`. ⚠️ **The originally proposed fix was WRONG**: it would have done `referenced.add(storeKey.split('_')[0])`, but `referenced` is matched against filenames WITH suffix → all compressed `.vorn` files become false orphans → massive data loss on prune. Only the dead-code removal was applied, not the rewrite.
- [ ] **R5-5** [LOW] `safeFs.toLongPath` on relative paths — **WONTFIX** (CWD-dependent semantics, callers always pass absolute).
- [ ] **R5-6** [LOW] Atomics consistency — **NOT-A-BUG** (all workers already use `Atomics.load`, the reviewer themselves admitted "mostly okay").

---

## Operational notes for the Round 6 reviewer

- **Current branch**: `feature/vornc-chunking`. Master is the state before the chunking refactor.
- **Threat model**: hostile store (someone else's USB, manipulated `.vorn`), USB removable at runtime, attacker controls file content / file names / `meta.records`. Same baseline as previous rounds.
- **Finding style**: cite exact files and lines. Clearly distinguish "speculative" from "concrete vector". Suggest fixes with snippets.
- **Severity calibration**: HIGH = demonstrable data loss / privilege escalation / corruption. MED = functional bug, broken UX, resource leak. LOW = code quality, unlikely edge case, recommendation.
- **Avoid duplicates**: every item marked `[x]` in this file HAS BEEN FIXED. Every item in the "Deliberately skipped" section was DELIBERATELY not fixed. Re-proposing one of these requires a new concrete vector.
