# Vorn

Backup content-addressable con deduplicazione automatica e storico completo delle versioni.
Windows / Linux / Mac.

---

## Come funziona

Ogni file backuppato viene identificato dal suo contenuto tramite `hash_vorn`. Lo store è una cartella piatta di file `.vorn` — nessun database, nessun indice separato. Ogni `.vorn` è autosufficiente.

```
[header JSON] [SEPARATORE: VORN FF 00 FF 00] [contenuto originale in byte]
```

Lo stesso file presente in 100 sessioni diverse viene salvato **una sola volta**. La deduplicazione è automatica e garantita dall'hash.

---

## Algoritmo hash_vorn

- File piccoli (≤ 104 byte): SHA-256 del contenuto completo
- File grandi: fingerprint a 13 campioni distribuiti → SHA-256 della stringa risultante

Risultato: identificatore 64-char hex, deterministico, **velocissimo** su file di qualsiasi dimensione.

---

## Struttura store

```
<store>/
  ab3f9c2d...vorn
  ff1a234b...vorn
  cc90112e...vorn
```

Nome file = `hash_vorn`. Accesso diretto, nessuna ricerca.

---

## Sessioni e run

```
~/.vorn/sessions/
└── Pippo/
    ├── Pippo.json                              ← definizione sessione
    └── Pippo-2026-04-30T10-00-00+00-00.json   ← un file per run
```

Ogni run è un file indipendente. Puoi cancellarne uno senza toccare gli altri. Se la sessione viene persa, si ricostruisce da qualsiasi run.

---

## CLI

```
vorn session create <nome> --store <cartella>
vorn session add <nome> <percorso>
vorn session list
vorn session info <nome>
vorn session run <nome>
vorn session restore <nome> --list
vorn session restore <nome> --ts "2026-04-30T10:00:00+00:00"
vorn inspect <file.vorn>
```

---

## Stack

- **Prototipo**: Python — `proto/`
- **Produzione**: Electron + Node.js (in sviluppo)

---

## Principi

- Nessun file viene mai cancellato dallo store
- La cartella sorgente non viene mai toccata
- Hash calcolato solo sul contenuto puro — mai su metadati
- Ogni run è autosufficiente per il restore
