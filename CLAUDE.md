# Vorn — AI Agent Briefing

## Cos'è

Vorn è un sistema di backup **content-addressable** per desktop (Windows, macOS, Linux).
Ogni file sorgente viene identificato dal suo hash e archiviato una sola volta nello store, indipendentemente da quante sessioni o macchine lo referenzino. La deduplicazione è automatica e cross-sessione.

Il progetto ha due parti:
- `proto/` — POC funzionante in Python (CLI, riferimento di verità)
- `app/` — applicazione Electron + Vue 3 che reimplementa il core in JavaScript

---

## Il formato `.vorn`

Ogni file nello store è un file binario con questa struttura:

```
[ MAGIC 4B ][ CONTENT-LENGTH 8B big-endian uint64 ]
[ ...content bytes... ]
[ SEPARATOR 4B: FF 00 FF 00 ]
[ metadata JSON ]
```

- **MAGIC**: stringa ASCII `VORN`
- **CONTENT-LENGTH**: dimensione esatta del contenuto originale (0 per file vuoti)
- **SEPARATOR**: marcatore fisso che separa contenuto da metadati
- **Metadata JSON**: hash, bytes, lista `records` (ogni record = sessione + macchina + percorsi)

Il metadata può essere aggiornato **chirurgicamente** (upsert): si tronca il file al separatore e si riscrivono solo i metadati, senza toccare il contenuto. Questo è il meccanismo centrale per registrare nuovi percorsi sullo stesso file senza ricopiare i dati.

---

## Hashing

Due strategie in base alla dimensione del file (`vorn_hash.py` / `hash.js`):

- File **≤ 104 byte**: SHA256 del contenuto completo
- File **> 104 byte**: campiona 13 punti equidistanti (8 byte ciascuno), costruisce un fingerprint di 104 byte e ne fa il SHA256

Questo permette di rilevare modifiche in file grandi senza leggerli interamente. L'hash risultante è chiamato `hash_vorn`.

---

## Struttura dello store

```
<store-dir>/
  <hash_vorn>.vorn   ← un file per hash unico
  <hash_vorn>.vorn
  ...
```

Se due file sorgente hanno lo stesso `hash_vorn`, esistono in un solo `.vorn`. I metadati interni tengono traccia di tutte le sessioni e percorsi che lo referenziano.

---

## Manifest

```
~/.vorn/sessions/
  <session-name>/
    <session-name>.json                      ← config sessione (store, sorgenti)
    <session-name>-<timestamp>.json          ← run file
```

**Session file**: `{ name, store, sources[], ts }`

**Run file**:
```json
{
  "ts": "2024-01-15T10:00:00.000Z",
  "name": "mysession",
  "store": "/path/to/store",
  "status": "running | done | paused",
  "files_total": 1234, "files_new": 56, "files_dedup": 1178,
  "bytes_total": 9999, "bytes_new": 1234, "duration_sec": 42,
  "files": {
    "subdir/file.txt": {
      "hash_vorn": "abc123...",
      "source": "/path/to/source",
      "bytes": 4096,
      "permissions": "0644"
    }
  }
}
```

La chiave in `files` è il **path relativo** rispetto alla sorgente, non l'hash.

---

## Architettura app (Electron)

```
main process                preload (bridge)          renderer (Vue 3)
─────────────────────────   ──────────────────────    ──────────────────────────
ipc.js                      index.js                  stores/vorn.js  (state)
vorn/engine.js              contextBridge → window.vorn  views/*.vue
vorn/manifest.js                                      components/*.vue
vorn/store.js
vorn/format.js
vorn/hash.js
vorn/taskManager.js
vorn/fileLock.js
```

**Flusso IPC**: il renderer chiama `window.vorn.*` → preload fa `ipcRenderer.invoke` → main process esegue e risponde. Gli eventi asincroni (progress) viaggiano in direzione opposta via `ipcRenderer.on`.

---

## Task system

Backup e restore sono **fire-and-forget** nel main process. Il renderer non blocca mai in attesa del completamento.

- `taskManager.js` mantiene un registry `Map<taskId, task>` in memoria
- Ogni task ha: `{ id, type, sessionName, status, progress, result, error }`
- Il renderer si aggancia agli eventi `vorn:task-progress` e `vorn:task-done` registrati una sola volta in `init()` — sopravvivono alla navigazione tra view
- Il frontend può navigare liberamente: i task continuano nel main process

---

## File locking

`fileLock.js` implementa un mutex asincrono per path file. Ogni `.vorn` ha la propria coda: se N operazioni arrivano sullo stesso file, si serializzano in ordine FIFO.

Il check `existsSync` + write è atomico dentro il lock (`createOrAddPath` in `store.js`): impossibile che due sessioni creino lo stesso `.vorn` in parallelo.

---

## Regole di sviluppo

- Il formato `.vorn` deve rimanere compatibile col POC Python — stesso layout binario, stessa struttura manifest JSON, stesso algoritmo di hash
- La chiave in `run.files` è sempre il **path relativo**, mai l'hash
- I dati in Store View e Stats vengono solo da `statSync` (filesystem) o dal manifest — mai da letture del contenuto `.vorn` durante il listing
- La concorrenza tra sessioni sullo stesso store è gestita da `fileLock.js`, non da lock a livello di sessione
