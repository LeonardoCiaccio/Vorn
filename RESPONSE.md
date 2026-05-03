# Code Review Report — Vorn App Revision

Ho completato la revisione critica della cartella `app/`. Di seguito l'elenco degli interventi ordinati per criticità, come richiesto in `REVISION.md`.

---

### [CRITICITÀ: ALTA] — Vulnerabilità di Path Traversal in `list-dir`

**File/modulo:** `app/src/main/ipc.js`  
**Problema:** L'handler IPC `vorn:list-dir` accetta un percorso arbitrario dal renderer e lo passa direttamente a `readdirSync` senza alcuna validazione o restrizione.  
**Impatto:** Un malintenzionato (o un bug nel renderer) potrebbe esplorare l'intero file system dell'utente, inclusi file di configurazione sensibili, chiavi SSH o documenti personali, bypassando la sandbox di Electron.  
**Soluzione suggerita:** Implementare una sanitizzazione dei percorsi. Consentire l'esplorazione solo all'interno di percorsi autorizzati o utilizzare un approccio basato su "root" sicure.

---

### [CRITICITÀ: ALTA] — Rischio di corruzione dati in `updateVornMeta`

**File/modulo:** `app/src/main/vorn/format.js`  
**Problema:** La funzione `updateVornMeta` esegue un `truncateSync` seguito da un `writeSync`. L'operazione non è atomica.  
**Impatto:** Se l'applicazione o il sistema crashano tra il truncate e la scrittura dei nuovi metadati, il file `.vorn` rimarrà privo di separatore e JSON, diventando illeggibile e corrompendo l'entry dello store (perdita di informazioni sui percorsi e sessioni).  
**Soluzione suggerita:** Utilizzare una strategia "write-to-temporary-and-rename". Scrivere i nuovi metadati in un file temporaneo e poi rinominarlo sopra l'originale (operazione atomica sul filesystem), oppure appendere i nuovi metadati e aggiornare un puntatore se il formato lo consentisse.

---

### [CRITICITÀ: ALTA] — Memory Leak nel sistema di locking dei file

**File/modulo:** `app/src/main/vorn/fileLock.js`  
**Problema:** La mappa `_locks` memorizza una promessa per ogni percorso file mai bloccato, ma non rimuove mai le entry una volta che il lock è stato rilasciato.  
**Impatto:** Durante un backup di milioni di file, la memoria occupata dal processo main crescerà linearmente con il numero di file univoci processati, portando eventualmente a un crash per Out Of Memory (OOM).  
**Soluzione suggerita:** Rimuovere la entry dalla mappa `_locks` nel blocco `finally` della funzione `withFileLock` se non ci sono altre operazioni in attesa per quel percorso.

---

### [CRITICITÀ: MEDIA] — Leak potenziale nel worker di backup (`_pending` map)

**File/modulo:** `app/src/main/vorn/backupWorker.js`  
**Problema:** Il worker mantiene una mappa `_pending` per gestire le richieste di scrittura allo store inviate al processo main. Se il main non risponde (es. per un errore non gestito nell'IPC), la entry rimane nella mappa per sempre.  
**Impatto:** Accumulo di memoria nel worker thread durante sessioni di backup lunghe o in caso di errori intermittenti di comunicazione IPC.  
**Soluzione suggerita:** Implementare un timeout per le richieste `store-request` o assicurarsi che il main process invii sempre una risposta (anche di errore) per ogni messaggio ricevuto.

---

### [CRITICITÀ: MEDIA] — Gestione errori dei flussi (Stream) incompleta

**File/modulo:** `app/src/main/vorn/engine.js` e `app/src/main/vorn/format.js`  
**Problema:** Molte operazioni di I/O usano `.pipe()` o promesse manuali che non gestiscono correttamente tutti gli eventi di errore (es. errore sul readable dopo che il pipe è iniziato).  
**Impatto:** Possibili file descriptor lasciati aperti o promesse che non si risolvono mai (hang dell'applicazione) in caso di errori disco (es. spazio esaurito).  
**Soluzione suggerita:** Utilizzare `stream.pipeline` o `finished` dal modulo `stream/promises` (Node.js 16+) per gestire correttamente il ciclo di vita e gli errori degli stream.

---

### [CRITICITÀ: MEDIA] — Duplicazione logica e costanti tra moduli

**File/modulo:** `app/src/main/vorn/integrityWorker.js` vs `app/src/main/vorn/hash.js`  
**Problema:** La logica di hashing (campionamento a 13 punti) è duplicata quasi identicamente nel worker di integrità invece di essere importata.  
**Impatto:** Debito tecnico elevato. Se l'algoritmo di hashing venisse modificato, il worker di integrità darebbe falsi positivi o fallirebbe silenziosamente.  
**Soluzione suggerita:** Centralizzare la logica di fingerprinting in `hash.js` ed esportarla affinché possa essere usata sia dal backup che dall'integrity check.

---

### [CRITICITÀ: BASSA] — God Module `ipc.js`

**File/modulo:** `app/src/main/ipc.js`  
**Problema:** Il file gestisce troppe responsabilità: polling dello store, gestione dei worker, lock dello store e decine di handler IPC disparati.  
**Impatto:** Difficoltà di manutenzione e testabilità. Il modulo viola palesemente il principio di Single Responsibility (SOLID).  
**Soluzione suggerita:** Suddividere `ipc.js` in moduli specializzati (es. `storeHandlers.js`, `taskHandlers.js`, `systemHandlers.js`) e spostare la logica di spawn dei worker in un `workerManager.js`.

---

### [CRITICITÀ: BASSA] — Stato ridondante nel Renderer Store

**File/modulo:** `app/src/renderer/stores/vorn.js`  
**Problema:** Lo stato mantiene campi separati per `integrity`, `clear` e `extractStore`, nonostante queste informazioni siano già presenti (o dovrebbero esserlo) nell'oggetto globale `tasks`.  
**Impatto:** Rischio di de-sincronizzazione tra la UI e lo stato reale dei task.  
**Soluzione suggerita:** Utilizzare `computed` properties per estrarre lo stato dei task specifici dalla collezione `tasks` principale, evitando la duplicazione delle proprietà reattive.

---

### Valutazione Generale

Il codice di **Vorn** presenta una solida base logica, specialmente nell'uso dei Worker Thread per non bloccare la UI e nella gestione del deduplicatore atomico. Tuttavia, soffre di alcuni problemi strutturali tipici della crescita rapida: la mancanza di atomicità nelle scritture dei metadati e i leak di memoria nelle mappe di supporto rappresentano i rischi più immediati per la stabilità a lungo termine e l'integrità dei dati. Una rifattorizzazione verso la modularità (specialmente nel processo Main) e un irrigidimento della sicurezza IPC sono passi necessari per rendere l'app pronta per un ambiente di produzione.
