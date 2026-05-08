# Code Review Prompt — Vorn App

## Overview

You are performing a critical code review of **Vorn** (Vault Of Redundant Nodes), a content-addressable desktop backup system built with Electron, Vue 3, and Node.js.

**Scope:** only the `src/` directory. Ignore `proto/`, root config files, and build artifacts.

---

## Technical Context

Read this section carefully before reviewing. It documents non-obvious invariants that are critical to correctness.

### Architecture

- **Main process** handles all file I/O, IPC handlers, SQLite access, and worker lifecycle.
- **Worker threads** (`backupWorker`, `restoreWorker`, `integrityWorker`, `pruneWorker`, etc.) perform heavy work. They communicate with the main process via `parentPort.postMessage`.
- **Store operations** (writing `.vorn` files) are serialized through a request/response pattern: the worker sends a `store-request` message, the main process executes `storeBlob()`, and responds with `store-result`. This guarantees single-writer access to the store.
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
- `meta.compressedType`: authoritative source for compression type (`undefined` = none, `'gzip'` = gzip).

### storeKey Convention

The filename of a `.vorn` file (without extension) is the **storeKey**:
- Uncompressed: `<blake3-hex>` (64 hex chars)
- Compressed: `<blake3-hex>_gzip` (or `_<type>` for future formats)

The suffix is informational only. Always use `meta.compressedType` to determine actual compression. The hash portion is always `storeKey.split('_')[0]`.

### Integrity Check Logic

1. If `meta.compressed_hash` is present → hash the raw bytes of the file and compare to `meta.compressed_hash` (fast path, no decompression).
2. Otherwise → decompress via `contentStream()` and hash the output, compare to `meta.hash_vorn`.
3. Skip the size check (`contentLen` vs `meta.bytes`) for compressed files — sizes differ by design.

### Deduplication

The SQLite database (`~/.vorn/vorn.db`, table `Files`) caches `path → { mtime, size, hash }`. On backup, if `mtime` and `size` match the DB record, the stored hash is reused without rehashing. The DB is a cache — losing it causes a full rehash on next backup but no data loss.

---

## Review Areas

### 1. Store & Compression Pipeline
- Is the `store-request` / `store-result` handshake implemented correctly in all worker types that write to the store?
- Are compressed files always written with `meta.compressed_hash`? Are old files without it handled gracefully in the integrity worker?
- Is `meta.compressedType` always checked before attempting decompression? Are there paths that assume no compression?
- Is the storeKey regex (`/^[0-9a-f]{64}(_[a-z0-9]+)?$/`) applied consistently across all handlers that accept a hash?
- Could a corrupt or malformed `.vorn` file (truncated, wrong MAGIC, malformed JSON metadata) cause unhandled exceptions?

### 2. Concurrency & Worker Lifecycle
- Are all worker threads terminated correctly on task cancel, store disconnect, and app quit?
- Is the `cancelBuffer` (SharedArrayBuffer + Atomics) checked at appropriate granularity in long-running workers?
- Is there any state shared between workers beyond the cancel flag?
- What happens if a `store-request` is in flight when the store disconnects?
- Are worker errors propagated back to the renderer in all cases, including uncaught exceptions?

### 3. IPC Security
- Are all IPC handler inputs validated (type, range, path safety) before use?
- Does `vorn:list-dir` allow traversal to sensitive paths? Is the current `normalize + resolve` sufficient given the renderer's sandbox?
- Does `vorn:open-external` enforce the URL allowlist in all cases?
- Are there any IPC handlers that perform privileged operations without checking `ctx.activeStore`?

### 4. Data Integrity & Error Handling
- Are atomic write patterns (write to `.tmp`, then rename) used consistently for all persistent state (run manifests, settings)?
- What happens if a backup worker crashes mid-run? Are crashed runs correctly marked and cleaned up on next store open?
- Are file descriptor leaks possible in error paths of format/read operations?
- Is `busy_timeout` in SQLite sufficient to avoid `SQLITE_BUSY` under the current task serialization model?

### 5. Resource Management
- Are all `setInterval` / `setTimeout` handles cleared on store close and app quit?
- Are IPC listeners registered in `preload/index.js` replaced (not duplicated) on re-registration?
- Are temporary files (`.tmp`, `.ctmp`) cleaned up in all error paths?

### 6. Renderer State Consistency
- Is `state` (Vue `reactive`) updated correctly after every IPC call that mutates server-side state?
- Are there cases where the renderer can display stale data after a task completes?
- Are loading/error states reset properly when operations fail partway through?

### 7. Code Quality
- Functions with more than one responsibility or more than ~60 lines
- Logic duplicated across modules (e.g., hash extraction, path normalization)
- Exported functions with inconsistent or fragile call signatures
- Missing error handling on `async` functions that are not `await`-ed

---

## Output Format

Provide a prioritized list of findings, from most to least critical:

---

### [SEVERITY: HIGH / MEDIUM / LOW] — Short title

**File:** `path/to/file.js`
**Problem:** Clear description of the issue.
**Impact:** What can go wrong (crash, data loss, security issue, technical debt).
**Suggested fix:** Recommended approach.

---

Group findings by severity (HIGH first). Within each group, order by practical impact. End with a **general assessment** paragraph (3–5 lines).
