# Vorn — Protocollo di Backup Content-Addressable

---

## 1. Principi Fondamentali

- **Nessun file viene mai cancellato dallo store**
- **Il contenuto determina l'identità** — l'hash è l'unica chiave, il nome è un'etichetta
- **Deduplicazione automatica** — stesso contenuto = stesso hash = un file solo nello store
- **Idempotenza** — scrivere lo stesso oggetto due volte è innocuo
- **Ogni oggetto è autodescrittivo** — porta i propri metadati
- **Cross-platform by design** — Windows, Linux, Mac trattati allo stesso modo

---

## 2. I Tre Componenti

```
┌─────────────────────────────────────────────────────┐
│  SORGENTE (intoccabile, nessun file aggiunto)       │
│  /progetti/moduli/                                  │
│    A.md                                             │
│    B.md                                             │
│    package.json                                     │
└──────────────┬──────────────────────────────────────┘
               │  backup
               ▼
┌─────────────────────────────────────────────────────┐
│  AMBIENTE VORN (centralizzato)                      │
│  /vorn/                                             │
│    /store/                                          │
│      ab3f9c2d.vorn  (contenuto di A.md v1)          │
│      ff1a234b.vorn  (contenuto di A.md v2)          │
│      cc90112e.vorn  (contenuto di package.json)     │
│    /index/                                          │
│      moduli.vorn-index   ◄── uno per cartella       │
│      altroprogetto.vorn-index                       │
└─────────────────────────────────────────────────────┘
```

---

## 3. Struttura dell'Indice

Un file `.vorn-index` vive nell'ambiente centralizzato dell'app (`/vorn/index/`), uno per ogni cartella sorgente registrata. La cartella sorgente non viene mai toccata.
Traccia solo i file **modificati** — se il fingerprint non cambia, non si tocca nulla.

La chiave di ogni file è il suo **hash del contenuto** — il nome è solo un attributo.

```json
{
  "version": 1,
  "source_path": "progetti/moduli",
  "files": {
    "A.md": {
      "current": {
        "name": "A.md",
        "hash": "ff1a234b..."
      },
      "history": [
        { "hash": "ab3f9c2d...", "name": "A.md", "ts": "2026-04-28T09:00", "machine": "PC1", "bytes": 1024 },
        { "hash": "ff1a234b...", "name": "A.md", "ts": "2026-04-28T16:45", "machine": "PC1", "bytes": 1100 }
      ]
    },
    "package.json": {
      "current": {
        "name": "package.json",
        "hash": "cc90112e..."
      },
      "history": [
        { "hash": "cc90112e...", "name": "package.json", "ts": "2026-04-27T10:00", "machine": "PC2", "bytes": 512 }
      ]
    }
  }
}
```

**Rinominare un file** = aggiornare solo `name` nel record. Lo store non cambia, la storia è intatta.

---

## 4. Struttura di un Oggetto nello Store

Ogni file nello store è un contenitore con due sezioni separate dal **separatore ufficiale Vorn**.
L'hash è calcolato **solo sul contenuto puro**, mai sull'header.

```
[  HEADER JSON  ] [  SEPARATORE  ] [  CONTENUTO RAW  ]
                   56 4F 52 4E
                   FF 00 FF 00
                   V  O  R  N
```

**Header JSON** — tutto il JSON in testa, unico blocco:
```json
{
  "hash":    "ff1a234b...",
  "bytes":   1100,
  "records": [
    {
      "name":        "A.md",
      "ts":          "2026-04-28T16:45:00+00:00",
      "session":     "Pippo",
      "machine":     "PC1",
      "path":        "progetti/moduli",
      "fingerprint": "1100:a3f0..."
    }
  ]
}
```

**Separatore** — 8 byte fissi: `VORN` in ASCII + `FF 00 FF 00`
Impossibile in JSON UTF-8 valido. Marca il confine netto tra metadati e contenuto.

**Contenuto** — byte originali del file, mai toccati.

**Aggiornamento records** — si riscrive l'intero file (header aggiornato + separatore + stesso contenuto).
L'app fa questa operazione in batch a fine sessione, non ad ogni singola richiesta.

nome file nello store: `ff1a234b.vorn`

---

## 5. Processo di BACKUP (SET)

```
1. Calcola fingerprint del file (13 campioni, veloce)
2. Cerca nello store l'ultimo record con path + name corrispondenti
   ├── fingerprint uguale → non modificato → skip
   └── fingerprint diverso (o assente) →
       3. Calcola SHA-256 del contenuto
       4. Controlla se hash.vorn esiste già nello store
          ├── esiste → aggiunge record all'header (deduplicazione)
          └── non esiste →
              5. Scrivi: header JSON + SEPARATORE + contenuto
              6. Nome file = hash.vorn
```

---

## 6. Processo di RESTORE (GET)

```
1. Scegli il punto di ripristino (timestamp T)
2. Per ogni file nell'indice:
   - Trova l'ultima voce in history con ts ≤ T
   - Recupera l'oggetto dallo store tramite hash
   - Estrai il contenuto (scarta l'header)
   - Riscrivi il file nella destinazione con il nome originale
3. Risultato: cartella ricostruita coerente al tempo T
```

---

## 7. Gestione Concorrenza

| Scenario | Soluzione |
|---|---|
| Stessa macchina, stesso file | File lock sul processo di scrittura |
| Macchine diverse, file diversi | Nessun problema, store è flat |
| Macchine diverse, **stesso file identico** | Write-and-ignore — sovrascrivere byte identici è innocuo |
| Macchine diverse, **stesso file modificato diversamente** | Due hash diversi → due oggetti → nessun conflitto, storia diverge |

---

## 8. Vantaggi della Deduplicazione Cross-Progetto

```
Progetto-1 ──┐
Progetto-2 ──┤──► store/cc90112e... (package.json identico)
Progetto-3 ──┘

100 progetti con lo stesso file = 1 sola copia nello store
```

---

## 9. Roadmap di Sviluppo (fasi)

```
FASE 1 — Proof of Concept (locale)
  ├── Indicizzatore: scansiona cartella, calcola hash, crea .vorn-index
  ├── Backup engine: confronta hash, scrive .vorn nello store
  └── Restore engine: ricostruisce cartella da .vorn-index + store

FASE 2 — Automazione
  ├── Watcher: monitora modifiche, trigger su file stabile (idle 30min)
  └── Scheduler: backup periodico (cron)

FASE 3 — Rete
  ├── Store remoto (NAS, server, chiavetta condivisa)
  ├── Sincronizzazione indici tra macchine
  └── Gestione concorrenza distribuita

FASE 4 — Interfaccia
  ├── CLI: backup, restore, status, history
  └── UI opzionale: timeline visuale delle versioni
```

---

## 10. Compatibilità Cross-Platform

Tre trappole da evitare, risolte by design:

### 10.1 Path Separator
```
Windows:   C:\progetti\moduli\A.md   ✗ nel source_path
Linux/Mac: /home/user/progetti/A.md  ✗ nel source_path
Standard:  progetti/moduli           ✓ sempre forward slash, mai assoluto
```
Il `source_path` nell'indice è sempre **relativo e con `/`**. Il percorso assoluto della macchina non entra mai nell'indice.

### 10.2 Encoding Filename
- Tutto UTF-8, senza eccezioni
- Nomi file non UTF-8 vengono rifiutati o codificati in fase di registrazione

### 10.3 Line Endings (scelta critica)
```
Windows:  \r\n  →  stesso file su Linux:  \n  →  hash diversi → no deduplicazione
```

| Opzione | Pro | Contro |
|---|---|---|
| **Non normalizzare** | Fedeltà assoluta al file originale | Nessuna deduplicazione cross-platform |
| **Normalizzare a \n prima dell'hash** | Deduplicazione cross-platform | Il file restore potrebbe differire dall'originale |
| **Hash doppio** (raw + normalizzato) | Massima info | Complessità maggiore |

**Decisione consigliata:** non normalizzare — fedeltà prima di tutto. La deduplicazione cross-platform su file di testo è un bonus, non un requisito core.

---

## 11. Domande Aperte (da decidere)

- [ ] Formato dell'header: binario (efficiente) o JSON (leggibile)?
- [ ] Formato store: file flat o SQLite per gli oggetti piccoli?
- [ ] Compressione degli oggetti nello store? (es. zstd)
- [ ] Linguaggio di implementazione del prototipo?
- [ ] Limite massimo dimensione file gestiti?
- [ ] Line endings: normalizzare o preservare?
