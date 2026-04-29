# Contesto progetto — Vorn

Stiamo costruendo **Vorn**, un protocollo di backup content-addressable inventato da zero.

## Cos'è Vorn

Un sistema di backup dove ogni file è identificato dall'hash SHA-256 del suo contenuto. Lo store è una cartella piatta di file `.vorn` — nessun database esterno, nessun indice separato. Ogni `.vorn` è autosufficiente: header JSON con metadati + contenuto binario originale.

Formato binario del file `.vorn`:
```
[header JSON UTF-8] [SEPARATORE 8 byte: 56 4F 52 4E FF 00 FF 00] [contenuto originale in byte]
```
Il separatore è `VORN` in ASCII + `FF 00 FF 00` — impossibile in JSON UTF-8 valido.
L'header contiene `hash_vorn`, `bytes`, e un array `records` con tutta la storia del file.
Ogni record ha: `name`, `ts`, `session`, `machine`, `path`.

**`hash_vorn`** è il nostro identificatore privato: SHA-256 applicato al contenuto del file, usato per normalizzare il nostro fingerprint in una stringa 64-char hex filesystem-safe. Prodotto da `vorn_hash()` in `vorn_hash.py` — il modulo del nostro algoritmo privato.

## Decisioni architetturali già prese

- **Nessun index separato** — i metadati vivono dentro ogni `.vorn`, lo store è l'unica fonte di verità
- **Nome file = hash SHA-256** — garantisce deduplicazione automatica e verifica integrità
- **Cartella sorgente intoccabile** — Vorn non scrive mai nulla nella cartella che sta backuppando
- **Cross-platform** — path sempre relativi con `/`, encoding UTF-8, no normalizzazione line endings
- **Hash calcolato solo sul contenuto puro** — mai su header o metadati

## File del progetto

| File | Ruolo |
|---|---|
| `vorn.py` | CLI entry point (session create/add/list/info/run/restore) |
| `vorn_engine.py` | Logica backup e restore |
| `vorn_manifest.py` | Gestione sessioni JSON (sources, runs, file→hash_vorn) |
| `vorn_store.py` | CRUD dei file `.vorn` nello store |
| `vorn_format.py` | Formato binario `.vorn`: read/write/append_record |
| `vorn_hash.py` | Algoritmo privato: `vorn_fingerprint()` + `vorn_hash()` → hash_vorn |
| `test_vorn_manifest.py` | Test suite vorn_manifest (43 test) |
| `test_vorn_engine.py` | Test suite vorn_engine (30 test) |
| `ROADMAP.md` | Mappa concettuale completa del progetto |

## Storico test

### 2026-04-29 — Architettura refactoring: hash_vorn — 73/73 PASS

Introdotto `hash_vorn` come identificatore privato. Rimosso `fingerprint` dai record.
Header `.vorn`: `{"hash_vorn": ..., "bytes": ..., "records": [...]}`.
Record: `{"name", "ts", "session", "machine", "path"}`.

| Suite | Test | Risultato |
|---|---|---|
| `test_vorn_manifest.py` | 43 | OK |
| `test_vorn_engine.py` | 30 | OK |

### 2026-04-29 — Test suite POC completa: 51/51 PASS

Formato binario, fingerprint, backup/restore/deduplicazione validati end-to-end.

## Stato attuale

Architettura a librerie separate, CLI funzionante, `dist/vorn.exe` disponibile.
Protocollo `hash_vorn` definitivo implementato e testato.

## Prossimi passi da valutare

- **Stack definitivo** — si valuta Go per il runtime finale (leggerezza RAM)
- **Interfaccia** — CLI prima, poi UI (Electron o Tauri)

## Come parlare con l'utente

L'utente è Leonardo. Segui le istruzioni nel CLAUDE.md globale (`~/.claude/CLAUDE.md`).
