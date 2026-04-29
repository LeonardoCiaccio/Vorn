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

```
VornStore/
  store/
    ab3f9c2d...sha256....vorn
    ff1a234b...sha256....vorn
    cc90112e...sha256....vorn
```

## Script disponibili

| Script | Uso |
|---|---|
| `vorn.py` | Backup, restore, status di una cartella |
| `vorn_view.py` | Legge solo i metadati di un `.vorn` senza caricare il contenuto |
| `vorn_extract.py` | Estrae il contenuto di un `.vorn` e lo salva con il nome originale |
| `vorn_read.py` | Scansiona uno store e mostra tutti i metadati ordinati |

## Comandi

```bash
# Backup
python vorn.py backup  <cartella_sorgente> <destinazione_store>

# Restore (ultima versione)
python vorn.py restore <cartella_sorgente> <destinazione_store>

# Restore a un punto nel tempo
python vorn.py restore <cartella_sorgente> <destinazione_store> --at "2026-04-29T12:00:00+00:00"

# Stato dello storico
python vorn.py status  <cartella_sorgente> <destinazione_store>

# Ispeziona un singolo .vorn (metadati)
python vorn_view.py <file.vorn>

# Estrai contenuto da un .vorn
python vorn_extract.py <file.vorn> <cartella_destinazione>

# Leggi tutti i metadati dello store
python vorn_read.py <destinazione_store>
```

## Principi

- Nessun file viene mai cancellato dallo store
- Il contenuto determina l'identità — l'hash è la chiave, il nome è un'etichetta
- Stesso contenuto = stesso hash = un file solo nello store
- Ogni `.vorn` è autodescrittivo — i metadati sono nell'header
- La cartella sorgente non viene mai toccata
- Cross-platform: Windows, Linux, Mac

## Stato del progetto

POC funzionante. In valutazione:
- Hash pigro (skip se data modifica + bytes invariati)
- Stack definitivo per il runtime (attualmente Python puro)
- Interfaccia utente
