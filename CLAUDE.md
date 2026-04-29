# Contesto progetto — Vorn

Stiamo costruendo **Vorn**, un protocollo di backup content-addressable inventato da zero.

## Cos'è Vorn

Un sistema di backup dove ogni file è identificato dall'hash SHA-256 del suo contenuto. Lo store è una cartella piatta di file `.vorn` — nessun database esterno, nessun indice separato. Ogni `.vorn` è autosufficiente: header JSON con metadati + contenuto binario originale.

Formato binario del file `.vorn`:
```
[header JSON UTF-8] [SEPARATORE 8 byte: 56 4F 52 4E FF 00 FF 00] [contenuto originale in byte]
```
Il separatore è `VORN` in ASCII + `FF 00 FF 00` — impossibile in JSON UTF-8 valido.
L'header contiene `hash`, `bytes`, e un array `records` con tutta la storia del file.
Ogni record ha: `name`, `ts`, `session`, `machine`, `path`, `fingerprint`.

## Decisioni architetturali già prese

- **Nessun index separato** — i metadati vivono dentro ogni `.vorn`, lo store è l'unica fonte di verità
- **Nome file = hash SHA-256** — garantisce deduplicazione automatica e verifica integrità
- **Cartella sorgente intoccabile** — Vorn non scrive mai nulla nella cartella che sta backuppando
- **Cross-platform** — path sempre relativi con `/`, encoding UTF-8, no normalizzazione line endings
- **Hash calcolato solo sul contenuto puro** — mai su header o metadati

## File del progetto

| File | Ruolo |
|---|---|
| `vorn.py` | Core: backup, restore, status, inspect |
| `vorn_view.py` | Legge header di un `.vorn` senza caricare il contenuto |
| `vorn_extract.py` | Estrae contenuto da un `.vorn` e salva con nome originale |
| `vorn_read.py` | Scansiona store e mostra tutti i metadati ordinati |
| `hash_vorn.py` | Fingerprint veloce (13 campioni o full per file <=104 byte) |
| `test_vorn.py` | Test suite base |
| `test_vorn_full.py` | Test suite completa con report dettagliato |
| `ROADMAP.md` | Mappa concettuale completa del progetto |
| `flusso-backup.html` | Flusso visuale del processo di backup passo per passo |

## Storico test

### 2026-04-29 — Test suite completa: 51/51 PASS

Tutti i test superati sul formato definitivo del protocollo Vorn.

| Sezione | Test | Risultato |
|---|---|---|
| 1. Formato file .vorn | 14 | OK |
| 2. Fingerprint | 7 | OK |
| 3. Backup scenari base | 3 | OK |
| 4. Deduplicazione | 5 | OK |
| 5. Restore | 5 | OK |
| 6. Records / storia richieste | 7 | OK |
| 7. Integrità | 1 | OK |
| 8. File binari e tipi diversi | 5 | OK |
| 9. Query per path e macchina | 4 | OK |

## Stato attuale

POC funzionante in Python puro. Protocollo validato end-to-end con test suite completa.

## Prossimi passi da valutare

- **Manifesto/sessione** — struttura client-side per tracciare quale file punta a quale hash
- **Stack definitivo** — attualmente Python per il POC, si valuta Go per il runtime finale (leggerezza RAM)
- **Interfaccia** — CLI prima, poi UI (Electron o Tauri)

## Come parlare con l'utente

L'utente è Leonardo. Segui le istruzioni nel CLAUDE.md globale (`~/.claude/CLAUDE.md`).
