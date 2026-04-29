# Vorn

Protocollo di backup content-addressable con deduplicazione e storico delle versioni.

## Concetto

Ogni file backuppato viene identificato dal suo contenuto tramite hash SHA-256. Lo store è una cartella piatta di file `.vorn` — nessuna sottocartella, nessun database esterno. Ogni `.vorn` è autosufficiente: contiene header JSON con tutta la storia del file, un separatore fisso, e il contenuto originale.

```
[header JSON + records] [SEPARATORE: 56 4F 52 4E FF 00 FF 00] [contenuto originale]
                         V  O  R  N
```

Il separatore `VORN` + `FF 00 FF 00` è impossibile in JSON UTF-8 valido — marca il confine netto tra metadati e contenuto senza ambiguità.

Lo stesso file usato da 100 progetti viene salvato una volta sola. La deduplicazione è automatica e garantita dal nome del file, che è l'hash del contenuto.

## Struttura store

Lo store è una cartella piatta scelta dall'utente. Nessuna sottocartella imposta dall'app.

```
<cartella_scelta_dall_utente>/
  ab3f9c2d....vorn
  ff1a234b....vorn
  cc90112e....vorn
```

Il nome del file è l'hash del contenuto — accesso diretto, nessuna ricerca.

## Architettura — librerie

| Modulo | Responsabilità |
|---|---|
| `vorn_hash.py` | `vorn_fingerprint(path)` — impronta veloce a campioni. `vorn_hash(path)` — hash contenuto (SHA-256 incapsulato). Nessun altro modulo conosce SHA-256. |
| `vorn_format.py` | Formato binario `.vorn`: legge/scrive header JSON, separatore, contenuto raw. Aggiorna records in un `.vorn` esistente. |
| `vorn_store.py` | Accesso diretto allo store per hash: `exists`, `put`, `get`, `update_records`. Nessuna scansione — conosci l'hash, conosci il path. |
| `vorn_manifest.py` | Sessione e run: crea sessioni con nome, gestisce le sorgenti, crea run con timestamp, mappa `filename → hash` per run, recupera il run più recente prima di una data. |
| `vorn_engine.py` | Orchestrazione: `backup(session)` e `restore(session, at)`. Usa manifest + store, non fa mai print. |
| `vorn_output.py` | Tutto il formatting: progress, tabelle, errori, riepilogo. |
| `vorn.py` | Entry point CLI: parsing argomenti, chiama engine. Zero logica. |

## Flusso backup

```
Crea/carica sessione per nome
Apri nuovo run con timestamp

Per ogni file nella sessione:
  → calcola vorn_hash(file)
  → hash già nello store?
    → NO → scrivi nuovo .vorn
    → SI → aggiorna records nel .vorn esistente
  → aggiungi {filename, hash, ts} al run corrente nel manifest
```

## Flusso restore

```
Carica sessione
Trova il run più recente con ts ≤ data richiesta
Per ogni file nel run:
  → leggi hash → get(hash) dallo store → scrivi file a destinazione
```

## Principi

- Nessun file viene mai cancellato dallo store
- Il contenuto determina l'identità — l'hash è la chiave, il nome è un'etichetta
- Stesso contenuto = stesso hash = un file solo nello store
- Ogni `.vorn` è autodescrittivo — i metadati sono nell'header
- La cartella sorgente non viene mai toccata
- Cross-platform: Windows, Linux, Mac

## Stato del progetto

POC validato (51/51 test). In costruzione: CLI robusta su architettura a librerie.
