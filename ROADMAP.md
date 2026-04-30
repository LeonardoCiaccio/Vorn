# Vorn — Roadmap

## Stato attuale

Prototipo Python funzionante e validato. Tutti i concetti architetturali sono definiti e testati.
Il codice Python in `proto/` è la specifica di riferimento — non va in produzione.

---

## Stack di produzione

**Electron + Node.js** — Windows / Linux / Mac da un unico codebase.

---

## Protocollo Vorn

### File `.vorn`

```
[header JSON UTF-8] [SEPARATORE 8 byte: 56 4F 52 4E FF 00 FF 00] [contenuto originale in byte]
```

**Header:**
```json
{
  "hash_vorn": "64char_hex",
  "bytes": 1234,
  "records": [
    {
      "ts":      "2026-04-30T10:00:00+00:00",
      "session": "nome_sessione",
      "machine": "NOME_PC",
      "paths": [
        {"name": "rel/path/file.txt", "path": "/sorgente/assoluta"}
      ]
    }
  ]
}
```

- Nome file = `hash_vorn` → deduplicazione automatica
- Un record per run. Se lo stesso contenuto appare in più path durante lo stesso run, si aggiunge alla lista `paths` dello stesso record.

### Algoritmo `hash_vorn`

- File piccoli (≤ 104 byte): SHA-256 del contenuto completo
- File grandi: SHA-256 della stringa di fingerprint (13 campioni × 8 byte distribuiti lungo il file)

Risultato: hash 64-char hex, deterministico, velocissimo su file di qualsiasi dimensione.

### Sessioni

```
~/.vorn/sessions/
└── Pippo/
    ├── Pippo.json                              ← definizione sessione
    └── Pippo-2026-04-30T10-00-00+00-00.json   ← un file per run
```

**Pippo.json:**
```json
{
  "ts": "2026-04-30T10:00:00+00:00",
  "name": "Pippo",
  "store": "/percorso/store",
  "sources": ["/home/user/docs"]
}
```

**Run file:**
```json
{
  "ts": "2026-04-30T10:00:00+00:00",
  "name": "Pippo",
  "store": "/percorso/store",
  "status": "done",
  "files": {
    "docs/report.pdf": {
      "hash_vorn": "64char_hex",
      "source": "/home/user/docs",
      "source_is_dir": true,
      "permissions": 33188
    }
  }
}
```

- Ogni run è un file indipendente — cancellare un run non tocca gli altri
- `status`: `running` | `paused` | `done`
- Se `Pippo.json` viene perso, si può ricostruire da qualsiasi run file

---

## CLI attuale (prototipo)

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

## Fasi di sviluppo

```
FASE 1 — Produzione (Electron + Node.js)
  ├── Reimplementazione protocollo Vorn in Node.js
  ├── UI: gestione sessioni, run, restore
  └── Packaging: .exe / .deb / .dmg

FASE 2 — Automazione
  ├── Watcher: backup automatico su modifica file
  └── Scheduler: backup periodico

FASE 3 — Rete
  ├── Store remoto (NAS, server)
  └── Sincronizzazione tra macchine
```

---

## Principi architetturali

- Nessun database esterno — lo store è una cartella piatta di `.vorn`
- Cartella sorgente mai toccata — Vorn non scrive mai nelle sorgenti
- Hash calcolato solo sul contenuto puro — mai su header o metadati
- Ogni run è autosufficiente — contiene tutto il necessario per il restore
