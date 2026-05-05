# Code Review — Vorn App

---

### [CRITICITÀ: ALTA] — Bug logico in pruneWorker: `referenced` rimane sempre vuoto

**File/modulo:** `src/main/vorn/pruneWorker.js` (riga 42–44)  
**Problema:** Il worker legge `run.files` aspettandosi oggetti con `.hash_vorn`, ma il formato effettivo scritto da `backup.js` memorizza l'hash direttamente come stringa (`run.files[relPath] = hashVorn`). Di conseguenza `fileInfo.hash_vorn` è sempre `undefined`, il Set `referenced` rimane vuoto e **ogni file nello store viene classificato come orfano**.

```js
// pruneWorker.js — ERRATO
for (const fileInfo of Object.values(run.files ?? {})) {
  if (fileInfo.hash_vorn) referenced.add(fileInfo.hash_vorn)  // fileInfo è già la stringa hash
}

// backup.js — formato reale
run.files[relPath] = hashVorn  // stringa diretta, non oggetto
```

**Impatto:** L'operazione Prune elimina la totalità dei file `.vorn` dello store, cancellando tutti i dati dell'utente senza possibilità di recupero. Il bug rimane silenzioso: la UI mostra un report di successo con `deleted = N` che sembra corretto.  
**Soluzione suggerita:**
```js
for (const fileInfo of Object.values(run.files ?? {})) {
  if (typeof fileInfo === 'string') referenced.add(fileInfo)
  else if (fileInfo?.hash_vorn) referenced.add(fileInfo.hash_vorn)
}
```

**✅ Soluzione applicata:** Sostituito il controllo in `pruneWorker.js` (righe 42–44) con la gestione duale: se `fileInfo` è una stringa la aggiunge direttamente al `Set referenced`, altrimenti legge `.hash_vorn` per compatibilità con eventuali formati legacy.

---

### [CRITICITÀ: ALTA] — Race condition nel file lock processuale

**File/modulo:** `src/main/vorn/lockFile.js`  
**Problema:** `checkLock()` e `acquireLock()` sono due operazioni distinte non atomiche. Tra il momento in cui un processo legge "lock non presente" e il momento in cui lo scrive, un secondo processo può fare lo stesso check e ottenere lo stesso risultato. Il lock è scritto con `writeFileSync` (non con `open(..., 'wx')` che garantisce creazione esclusiva a livello OS).  
**Impatto:** Due istanze di Vorn (o due finestre) possono aprire simultaneamente lo stesso store, corrompendo i file `.vorn` durante operazioni di write concorrenti.  
**Soluzione suggerita:** Usare `openSync(path, 'wx')` che lancia `EEXIST` se il file già esiste — operazione atomica garantita dal kernel. In alternativa, usare un vero file lock POSIX con `flock`.

**✅ Soluzione applicata:** Sostituito `writeFileSync` con `openSync(lp, 'wx')` in `lockFile.js`. Il flag `'wx'` garantisce creazione esclusiva a livello OS: se due processi tentano l'acquisizione contemporaneamente, uno ottiene il descrittore e l'altro riceve `EEXIST` e lancia `Error('Store già bloccato da un altro processo')`. Aggiunto anche `fsyncSync` per garantire la persistenza del lock su disco prima di restituire. Aggiornati gli import per includere `openSync`, `writeSync`, `fsyncSync`, `closeSync` e rimosso `writeFileSync`.

---

### [CRITICITÀ: ALTA] — Path traversal su `deleteStoreEntry` e `inspectHash`

**File/modulo:** `src/main/handlers/systemHandlers.js` (righe 59–63)  
**Problema:** Il parametro `hashVorn` ricevuto via IPC non è validato. `vornPath()` costruisce il path con `join(storeDir, hashVorn + '.vorn')`, ma `path.join` **non risolve** i segmenti `..`. Un renderer malevolo (es. dopo una XSS) potrebbe passare `hashVorn = "../../etc/cron.d/evil"` e cancellare o leggere file arbitrari fuori dallo store.  
**Impatto:** Lettura/cancellazione di file di sistema arbitrari, privilege escalation su sistemi Linux/macOS.  
**Soluzione suggerita:** Validare che `hashVorn` corrisponda esattamente al formato di un hash BLAKE3 hex (64 caratteri `[0-9a-f]`) prima di costruire qualsiasi path:
```js
if (!/^[0-9a-f]{64}$/.test(hashVorn)) throw new Error('Hash non valido')
```

**✅ Soluzione applicata:** Aggiunta la funzione helper `_assertHash(hashVorn)` in `systemHandlers.js` con regex `/^[0-9a-f]{64}$/`. Chiamata all'inizio degli handler `vorn:inspect-hash` e `vorn:delete-store-entry` prima di qualsiasi costruzione di path. Se l'hash non è valido viene lanciata un'eccezione che il renderer riceve come errore IPC.

---

### [CRITICITÀ: ALTA] — `sandbox: false` nel BrowserWindow

**File/modulo:** `src/main/index.js` (riga 20)  
**Problema:** `webPreferences: { sandbox: false }` disabilita completamente il sandboxing del processo renderer. In Electron questo equivale a dare al renderer accesso diretto alle API Node.js native, aggirandosi il modello di sicurezza di Chromium. La presenza di `contextBridge` mitiga ma non elimina il rischio.  
**Impatto:** In caso di XSS o injection di contenuto nel renderer, l'attaccante ha accesso immediato al filesystem, network e processi del sistema operativo senza ulteriori bypass.  
**Soluzione suggerita:** Rimuovere `sandbox: false` (il preload funziona correttamente anche con sandbox abilitato a partire da Electron 20+). Verificare che il preload non usi API Node.js direttamente ma solo `contextBridge`.

**✅ Soluzione applicata:** Rimosso `sandbox: false` da `webPreferences` in `src/main/index.js`. Il preload usa esclusivamente `contextBridge` e `ipcRenderer`, quindi funziona correttamente con sandbox abilitato.

---

### [CRITICITÀ: ALTA] — `vorn:start-backup` e altri handler task non validano `sessionName`

**File/modulo:** `src/main/handlers/taskHandlers.js`  
**Problema:** `sessionHandlers.js` chiama `_validateName(sessionName)` su tutti gli handler relativi alle sessioni, ma `taskHandlers.js` (righe 49–118) avvia worker con `sessionName` non validato. Un renderer malevolo potrebbe passare un `sessionName` con path traversal (`../../../`) che viene scritto in `run.ts` e usato per costruire path su disco.  
**Impatto:** Path traversal nel filesystem del manifest, potenziale scrittura di file `.json` fuori dalla directory `.vorn/sessions/`.  
**Soluzione suggerita:** Chiamare `_validateName(sessionName)` (importandola o copiandola) all'inizio di ogni handler task.

**✅ Soluzione applicata:** La funzione `_validateName` è stata estratta da `sessionHandlers.js` ed esportata come `validateSessionName` da `sessions.js` (il modulo di riferimento per la logica di sessione). `sessionHandlers.js` ora la importa da lì. `taskHandlers.js` importa la stessa funzione e la chiama all'inizio degli handler `vorn:start-backup` e `vorn:start-restore`, prima di qualsiasi operazione su disco.

---

### [CRITICITÀ: MEDIA] — `_cleanCrashedRuns` blocca il main process all'apertura dello store

**File/modulo:** `src/main/handlers/storeHandlers.js` (riga 8–19)  
**Problema:** `_cleanCrashedRuns` esegue una scansione sincrona di tutte le sessioni e di tutti i run al momento dell'apertura dello store. Per store con decine di sessioni e centinaia di run, ogni `loadRun` legge un file JSON da disco in modo sincrono, bloccando il main process per secondi.  
**Impatto:** UI bloccata all'apertura dello store, possibile ANR ("application not responding") su store grandi.  
**Soluzione suggerita:** Eseguire `_cleanCrashedRuns` in modo asincrono (non-blocking) subito dopo il ritorno di `open-store`, oppure limitare la scansione ai soli manifest delle sessioni (che contengono già `runs_meta` con lo status) evitando di caricare i file run completi.

**✅ Soluzione applicata:** `_cleanCrashedRuns` è diventata `async` e inserisce un `await new Promise(r => setImmediate(r))` tra il processing di ogni run, cedendo il controllo all'event loop. La chiamata in `open-store` è ora fire-and-forget (non `await`), quindi l'handler risponde immediatamente al renderer mentre la pulizia avviene in background.

---

### [CRITICITÀ: MEDIA] — WAL recovery in `readVornMeta` non fa `fsyncSync` dopo la scrittura

**File/modulo:** `src/main/vorn/format.js` (righe 56–67)  
**Problema:** Durante il recovery dal file WAL (`.mtmp`), i metadati ripristinati vengono scritti con `writeSync` ma senza `fsyncSync`. Se la macchina crasha durante il recovery, il file `.vorn` si trova in stato troncato senza metadati e senza WAL, risultando irrecuperabile.  
**Impatto:** Corruzione permanente di un file `.vorn` in caso di crash durante il recovery. Perdita del file.  
**Soluzione suggerita:** Aggiungere `fsyncSync(fdw)` dopo `writeSync(fdw, recBuf)` nel blocco di recovery, in modo speculare a quanto già fatto in `_updateMeta`.

**✅ Soluzione applicata:** Aggiunto `fsyncSync(fdw)` immediatamente dopo `writeSync(fdw, recBuf)` nel blocco WAL recovery di `readVornMeta`. Aggiornato l'import di `fs` per includere `fsyncSync`, specularmente a quanto già presente in `_updateMeta`.

---

### [CRITICITÀ: MEDIA] — `_listCache` globale non invalidata dopo `storeBlob`

**File/modulo:** `src/main/vorn/store.js` (righe 37–86)  
**Problema:** `_listCache` viene ricostruita solo quando `offset === 0` oppure quando lo store cambia. L'operazione `storeBlob` (che aggiunge nuovi file `.vorn`) non invalida la cache. Se il renderer chiama `listStoreFiles` con `offset > 0` dopo un backup, la cache restituisce il conteggio e i file precedenti al backup, potenzialmente nascondendo nuove entry o producendo paginazione errata.  
**Impatto:** Store browser che mostra dati stale; conteggio `total` errato nella paginazione.  
**Soluzione suggerita:** Aggiungere `_listCache = null` alla fine di `storeBlob` quando l'esito è `'new'`, oppure marcare la cache come dirty e forzare un rebuild al prossimo accesso indipendentemente dall'offset.

**✅ Soluzione applicata:** Aggiunto `_listCache = null` all'interno del branch `!existsSync(p)` di `storeBlob`, subito dopo `writeVornFromSource`. La cache viene invalidata solo quando viene scritto un file nuovo (esito `'new'`), non in caso di dedup (che non modifica la lista dei file dello store).

---

### [CRITICITÀ: MEDIA] — `saveSettings` non valida il patch ricevuto via IPC

**File/modulo:** `src/main/vorn/settings.js` + `src/main/handlers/storeHandlers.js`  
**Problema:** `saveSettings(patch)` esegue `{ ...loadSettings(), ...patch }` senza validare le chiavi o i tipi del `patch`. Un renderer malevolo può iniettare chiavi arbitrarie nel file `~/.vorn/settings.json`, inclusi path, script o valori booleani che influenzano il comportamento dell'app.  
**Impatto:** Manipolazione del file settings con valori non attesi; in scenari estremi, injection di dati che vengono poi letti da codice che si fida delle settings.  
**Soluzione suggerita:** Applicare una whitelist delle chiavi accettabili: `['theme', 'notifications', 'language', 'recentStores']`. Scartare silenziosamente tutte le altre.

**✅ Soluzione applicata:** Aggiunta la costante `ALLOWED_KEYS = new Set(['theme', 'notifications', 'language', 'recentStores'])` in `settings.js`. In `saveSettings`, il patch viene filtrato con `Object.entries(patch).filter(([k]) => ALLOWED_KEYS.has(k))` prima di essere applicato alle settings correnti. Chiavi non riconosciute vengono scartate silenziosamente. Aggiunta anche cache in-memory `_cache` per evitare letture ripetute da disco (vedi issue CRITICITÀ BASSA correlata).

---

### [CRITICITÀ: MEDIA] — `backup.js`: `source` fallback a `sources[0]` produce path traversal nel run

**File/modulo:** `src/main/vorn/backup.js` (riga 70–71)  
**Problema:** Se un file non corrisponde a nessuna sorgente configurata, la sorgente di riferimento viene impostata a `sources[0]` come fallback. In quel caso `relative(sources[0], filePath)` può produrre un path con `../../...` se il file si trova fuori dall'albero di quella sorgente. Questo path `../../...` viene scritto come chiave in `run.files` e potenzialmente esposto al restore.  
**Impatto:** `restore.js` usa `_safeJoin` che blocca il traversal, quindi il file non viene estratto ma l'entry corrotta rimane nel manifest. Il manifest potrebbe anche diventare inconsistente rispetto ai file effettivamente backuppati.  
**Soluzione suggerita:** Se `sources.find()` non trova una sorgente valida, saltare il file con un errore (come già avviene per i file non leggibili), non fare fallback a `sources[0]`.

**✅ Soluzione applicata:** Rimosso il fallback `?? sources[0]` in `backup.js`. Se `sources.find()` restituisce `undefined`, il file viene saltato con `errors.push({ path: filePath, error: 'Sorgente non trovata per il file', phase: 'scan' })` e il loop continua con `continue`, esattamente come già avviene per errori di `stat` e `hash`.

---

### [CRITICITÀ: MEDIA] — `readVorn()` carica l'intero contenuto in RAM

**File/modulo:** `src/main/vorn/format.js` (righe 78–88)  
**Problema:** `readVorn()` legge l'intero contenuto del file `.vorn` in un `Buffer` in memoria via event-based stream. Per file di grandi dimensioni (ad es. video o archivi), questo può saturare la memoria del processo main.  
**Impatto:** OOM del processo main se `readVorn` viene chiamata su file grandi. Attualmente `readVorn` è esportata ma non sembra usata nel flusso principale (backup/restore usa `contentStream`). Rimane un rischio se usata in futuro.  
**Soluzione suggerita:** Se `readVorn` è necessaria, aggiungere un limite di dimensione prima di allocare il buffer; altrimenti rimuoverla o renderla esplicitamente interna. Il flusso corretto per contenuti grandi è `contentStream`.

**✅ Soluzione applicata:** Aggiunto controllo `if (contentLen > BigInt(READ_VORN_MAX_BYTES))` all'inizio di `readVorn` con limite a 128 MB. Se il file supera la soglia, lancia un'eccezione esplicita che invita a usare `contentStream`. La costante `READ_VORN_MAX_BYTES` è documentata nel file.

---

### [CRITICITÀ: BASSA] — `matchPattern` costruisce una `RegExp` a ogni chiamata

**File/modulo:** `src/main/vorn/scanner.js` (righe 29–40)  
**Problema:** Ogni invocazione di `matchPattern` compila una nuova `RegExp`. Su directory con migliaia di file e multipli pattern di esclusione, il costo si moltiplica: `N file × M pattern` compilazioni regex per ogni walk.  
**Impatto:** Performance degradata su backup di directory grandi con molti pattern. Nessun rischio di correttezza.  
**Soluzione suggerita:** Memoizzare le regex compilate usando una `Map<string, RegExp>` a livello di modulo, invalidata tra sessioni di backup diverse.

**✅ Soluzione applicata:** Aggiunta `_patternCache = new Map()` a livello di modulo in `scanner.js`. `matchPattern` controlla la cache prima di compilare: se il pattern è già presente restituisce la regex cached, altrimenti la compila, la memorizza e la restituisce. Esportata anche `clearPatternCache()` per permettere l'invalidazione tra sessioni di backup diverse.

---

### [CRITICITÀ: BASSA] — `_notifyRunDone` legge le settings da disco a ogni notifica

**File/modulo:** `src/main/handlers/taskHandlers.js` (riga 22)  
**Problema:** `loadSettings()` legge e parsa il file JSON da disco in modo sincrono ogni volta che un backup completa. Se le notifiche sono frequenti (molte sessioni in parallelo), questo aggiunge latenza sincrona sul main process.  
**Impatto:** Lieve — solo al completamento di backup, non durante il backup. Nessun rischio di correttezza.  
**Soluzione suggerita:** Mantenere le settings in cache in memoria (già fatto in parte da `addRecentStore` che chiama `loadSettings` e poi `saveSettings`). Un semplice singleton con invalidazione su `saveSettings` eliminerebbe la lettura ripetuta.

**✅ Soluzione applicata:** Aggiunta cache in-memory `_cache` in `settings.js`. `loadSettings()` restituisce `{ ..._cache }` senza accesso a disco se la cache è popolata. `saveSettings()` aggiorna `_cache` contestualmente alla scrittura su disco, garantendo coerenza. Il codice di `_notifyRunDone` non richiede modifiche: chiama già `loadSettings()`, che ora è O(1) dopo la prima lettura.

---

### [CRITICITÀ: BASSA] — `require('os')` CommonJS usato inline in un modulo ESM

**File/modulo:** `src/main/handlers/systemHandlers.js` (riga 29)  
**Problema:** `require('os').homedir()` usa la sintassi CommonJS all'interno di un file che usa `import/export` ESM. Funziona in Electron con electron-vite grazie al bundler, ma è uno stile incoerente e fragile se il bundle strategy cambia.  
**Impatto:** Nessuno a runtime attuale. Manutenibilità ridotta.  
**Soluzione suggerita:** Sostituire con `import { homedir } from 'os'` in cima al file.

**✅ Soluzione applicata:** Aggiunto `import { homedir } from 'os'` agli import in cima a `systemHandlers.js`. Sostituito `require('os').homedir()` con `homedir()` nel corpo di `vorn:get-app-info`.

---

### [CRITICITÀ: BASSA] — `runs_meta` troncata a 500 senza documentazione né notifica

**File/modulo:** `src/main/vorn/sessions.js` (righe 79, 124)  
**Problema:** `runs_meta` nel manifest della sessione viene troncata a 500 elementi sia al rebuild che all'aggiornamento. I file run su disco rimangono integri, ma la UI mostra solo i più recenti 500. Non c'è alcuna indicazione all'utente che la history è troncata.  
**Impatto:** L'utente con sessioni molto longeve (>500 run) non vede i run più vecchi nella UI pur avendo i dati su disco. Nessuna perdita di dati.  
**Soluzione suggerita:** Esporre il conteggio reale dei file in `runsDir` e mostrare nella UI un messaggio tipo "Mostrati gli ultimi 500 run su N totali" quando il limite è raggiunto.

**✅ Soluzione applicata (backend):** Aggiunto il campo `runs_total` nel manifest della sessione. In `saveRun`, dopo il troncamento di `runs_meta`, viene calcolato il conteggio reale dei file `.json` in `runsDir` con `readdirSync` e salvato in `session.runs_total`. In `deleteRun` il campo viene decrementato. Nel path di rebuild (in `listRuns`) `runs_total` viene impostato al numero effettivo di run trovati. Il frontend può leggere `session.runs_total` per confrontarlo con `session.runs_meta.length` e mostrare il messaggio di troncamento.

---

### [CRITICITÀ: BASSA] — La connessione SQLite non viene mai chiusa esplicitamente

**File/modulo:** `src/main/vorn/db.js`  
**Problema:** `getDb()` apre la connessione `better-sqlite3` al primo accesso e non la chiude mai. In `ipc.js`, al `before-quit`, viene rilasciato il lock e terminati i worker, ma il DB viene lasciato aperto affidate alla garbage collection di Node.js.  
**Impatto:** Su macOS e Linux, `better-sqlite3` chiude il file correttamente alla distruzione dell'oggetto. Su Windows, un file DB non chiuso può bloccare operazioni di pulizia o backup del file stesso. Rischio basso ma vale la pena gestirlo.  
**Soluzione suggerita:** Aggiungere una funzione `closeDb()` in `db.js` e chiamarla nell'handler `before-quit` di `ipc.js`, dopo aver terminato i worker.

**✅ Soluzione applicata:** Aggiunta la funzione `closeDb()` in `db.js` che chiama `_db.close()` e azzera `_db = null`. In `ipc.js` importata `closeDb` e chiamata nel handler `before-quit`: sia nel path senza worker attivi (ritorno immediato) sia nel path con worker attivi (dopo `Promise.all(promises)`), garantendo che il DB venga sempre chiuso prima di `app.quit()`.

---

## Valutazione generale

Il codice è complessivamente ben strutturato e dimostra una buona consapevolezza dei problemi di concorrenza (file lock, SharedArrayBuffer per i cancel flag, pattern WAL per la scrittura atomica). Il flusso IPC è coerente e il task system è pulito. Tuttavia, sono presenti due problemi di severità critica: il bug nel pruneWorker che in produzione comporterebbe la cancellazione totale dei dati dell'utente, e il lock processuale non atomico che espone a corruzione in caso di apertura concorrente dello store. La mancanza di validazione sistematica degli input hashVorn e sessionName negli handler IPC è un pattern che va risolto uniformemente prima di qualsiasi release pubblica. Il resto dei problemi segnalati riguarda robustezza e performance ma non compromettono la correttezza nelle condizioni d'uso normali.
