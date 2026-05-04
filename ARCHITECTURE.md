# Vorn — Architettura v2

## Store

Deposito stupido di blob immutabili.

Ogni file `.vorn` contiene:
- Header binario (`MAGIC 4B` + `CONTENT-LENGTH 8B`)
- Blob (contenuto originale del file)
- Separatore (`FF 00 FF 00`)
- Metadati minimi:

```json
{
  "hash_vorn": "abc123...",
  "bytes": 4096
}
```

`bytes` è indispensabile per verifica corruzione e integrity check.
Nessun riferimento a sessioni, run, percorsi o macchine — lo store non sa chi usa i suoi blob.

---

## Sessione

Immutabile — creata una volta, mai modificata.

Creata interattivamente con una tree del filesystem: l'utente seleziona cartelle e file esplicitamente, esclude path specifici e pattern globali.

Se l'utente vuole cambiare qualcosa crea una nuova sessione. Le sessioni esistenti con i loro run rimangono intatte.

```json
{
  "name": "Pippo",
  "sources": ["C:/Users/leo/Documents"],
  "excludes": {
    "paths": ["C:/Users/leo/Documents/Temp"],
    "patterns": ["*.tmp", "*.log", "node_modules/"]
  }
}
```

---

## Run

Istantanea generata automaticamente al momento del backup.

Il walker scansiona le cartelle della sessione seguendo esattamente la mappa definita alla creazione, calcola gli hash, salva i blob nuovi nello store. Il run contiene solo data e mappa path→hash:

```json
{
  "ts": "2024-01-15T10-00-00",
  "files": {
    "Documents/foto.jpg": "abc123...",
    "Documents/cv.pdf":   "def456..."
  }
}
```

Immutabile — fotografia del passato. Il restore legge questa mappa, chiede i byte allo store, scrive nei percorsi giusti.

---

## Struttura fisica dello store

```
<store>/
  abc123.vorn
  def456.vorn
  ...
  vorn/
    sessions/
      Pippo/
        manifest.json
        runs/
          2024-01-15T10-00-00.json
          2024-01-16T08-30-00.json
      Lavoro/
        manifest.json
        runs/
          2024-01-15T11-00-00.json
```

Lo store è autosufficiente — contiene blob, sessioni e run. Portabile su qualsiasi macchina senza dipendenze locali.

La cartella `vorn/` separa i metadati dai blob, evita conflitti di nome e rende lo store leggibile anche fuori dall'app.

I `:` nei timestamp sono sostituiti da `-` per compatibilità con il filesystem Windows.

---

## Prima schermata — Selezione store

All'avvio l'app mostra obbligatoriamente la schermata di selezione store. L'utente sceglie una cartella esistente o ne crea una nuova. Solo dopo aver aperto uno store con successo l'app mostra l'interfaccia principale.

La schermata mostra gli store aperti di recente per accesso rapido.

---

## Lock file — una sola istanza per store

Due istanze dell'app non possono aprire lo stesso store contemporaneamente. Il meccanismo è un lock file creato all'apertura e cancellato alla chiusura.

**Posizione:** `<store>/vorn/lock`

**Contenuto:**
```json
{
  "pid": 12345,
  "machine": "DESKTOP-XYZ",
  "openedAt": "2024-01-15T10-00-00"
}
```

**Regole:**
1. All'apertura dello store → controlla se `vorn/lock` esiste
2. Se esiste → leggi il `pid` e verifica se il processo è ancora vivo (`process.kill(pid, 0)`)
3. Processo vivo → blocca l'accesso, mostra errore "Store in uso da un'altra istanza su DESKTOP-XYZ"
4. Processo morto (crash precedente) → lock stale, sovrascrivilo e procedi
5. Alla chiusura dell'app → cancella `vorn/lock`

---

## Monitoraggio store aperto

Una volta aperto lo store, l'app lo monitora con `chokidar` — usa le API native dell'OS (`ReadDirectoryChangesW` su Windows, `FSEvents` su macOS, `inotify` su Linux). Nessun poll, nessun heartbeat.

Se lo store diventa inaccessibile (chiavetta staccata, cartella cancellata, volume smontato):
1. Cancella il lock file se ancora raggiungibile
2. Interrompe qualsiasi operazione in corso
3. Blocca l'interfaccia e torna alla schermata di selezione store

Nessun automatismo al reinserimento — l'utente deve riselezionare lo store esplicitamente. Questo evita ambiguità nel caso in cui venga inserita una chiavetta diversa sullo stesso path.

---

## Seconda schermata — Sessioni

Schermata principale dopo l'apertura dello store. Mostra la lista delle sessioni con i rispettivi run.

- Lista sessioni con data di creazione
- Click su sessione → dettaglio con lista run (timestamp e stato)
- Nessuna statistica — solo nome, date, stato
- Da qui si avvia il backup o il restore

---

## Terza schermata — Store

Browser dei blob presenti nello store.

- Lista file `.vorn` con hash e dimensione
- Click su blob → pannello laterale con metadati (`hash_vorn`, `bytes`) ed estrazione
- Eliminazione singolo blob
- Verifica integrità (controlla che ogni blob non sia corrotto)
- Svuota store (elimina tutti i blob)

Niente sanitize, niente reconstruct.

---

## Topbar

Presente in tutte le schermate tranne la selezione store.

- Sinistra: brand "Vorn" + versione
- Centro: navigazione (Sessioni, Store)
- Destra: toggle tema sole/luna — switch diretto, nessuna schermata impostazioni

Nessuna schermata impostazioni — le preferenze verranno definite quando ci sarà chiarezza su cosa serve e dove salvarle.

---

## Niente DB

Nessun database locale. La fonte di verità è lo store. Sessioni e run sono file JSON leggibili direttamente. Statistiche e indici sono derivati a runtime dallo store quando servono.
