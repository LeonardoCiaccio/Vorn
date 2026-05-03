# Code Review Report — Vorn App Revision 2

Ho completato la seconda revisione professionale della cartella `app/`, analizzando i miglioramenti apportati e cercando criticità residue o nuovi problemi introdotti. Di seguito l'elenco degli interventi suggeriti.

---

### [CRITICITÀ: ALTA] — Mancanza di atomicità in `saveRun` e `saveSettings`

**File/modulo:** `app/src/main/vorn/sessions.js` e `app/src/main/vorn/settings.js`  
**Problema:** Le funzioni `saveRun` e `saveSettings` utilizzano `writeFileSync` direttamente sul file di destinazione.  
**Impatto:** Se il sistema crasha o l'app viene chiusa forzatamente durante la scrittura (specialmente per i file di run che possono essere grandi), il JSON risulterà troncato o corrotto. Questo impedirebbe il caricamento della sessione o la visualizzazione dello storico, e nel caso dei settings, il reset delle preferenze utente.  
**Soluzione suggerita:** Adottare la stessa strategia "write-then-rename" implementata per i metadati dei blob, scrivendo in un file temporaneo e rinominandolo solo a scrittura completata.

**Soluzione applicata:** `saveRun` e `createSession` in `sessions.js` e `saveSettings` in `settings.js` ora scrivono su un file `.tmp` e poi chiamano `renameSync` verso la destinazione finale. L'operazione di rename è atomica a livello di filesystem: in caso di crash durante la scrittura, il file originale resta intatto.

---

### [CRITICITÀ: MEDIA] — Gestione stream non ottimale in `restore` ed `extractFromStore`

**File/modulo:** `app/src/main/vorn/engine.js`  
**Problema:** Le funzioni di restore ed estrazione utilizzano ancora il pattern manuale `rs.pipe(ws)` avvolto in una Promise, invece di `pipeline` dal modulo `stream/promises`.  
**Impatto:** In caso di errore durante lo streaming (es. disco pieno o permessi negati improvvisi), i file descriptor potrebbero non essere chiusi correttamente o gli errori potrebbero non propagarsi in modo pulito, portando a potenziali leak di risorse o stati inconsistenti nei worker.  
**Soluzione suggerita:** Rifattorizzare l'uso di `pipe` in `pipeline` per garantire la chiusura automatica di entrambi i lati dello stream in ogni scenario di errore.

**Soluzione applicata:** Nel nuovo `restore.js` (nato dallo split di `engine.js`), tutte le operazioni di streaming — in `restore`, `extractFromStore` ed `extractByHash` — usano `pipeline` da `stream/promises`. In caso di errore, entrambi i lati dello stream vengono chiusi automaticamente senza rischio di fd leak.

---

### [CRITICITÀ: MEDIA] — Esecuzione di `extractByHash` nel Main Process

**File/modulo:** `app/src/main/handlers/taskHandlers.js` / `app/src/main/vorn/engine.js`  
**Problema:** L'handler IPC `vorn:extract-hash` esegue l'estrazione di un blob direttamente nel processo main invece di delegare a un worker.  
**Impatto:** Se l'utente tenta di estrarre un file molto grande (es. un archivio da vari GB), l'I/O intensivo nel processo main potrebbe rallentare la reattività della UI (anche se asincrono, il carico di sistema e la gestione degli eventi IPC potrebbero risentirne). Inoltre, rompe la coerenza architettonica dell'app ("heavy lifting in workers").  
**Soluzione suggerita:** Spostare la logica di estrazione singola in un worker o assicurarsi che venga usata solo per file di dimensioni contenute, segnalando il limite all'utente.

**Soluzione applicata:** `extractByHash` in `restore.js` legge `contentLen` tramite `readVornMeta` prima di aprire lo stream. Se il contenuto supera 500 MB (`EXTRACT_MAX_BYTES`), lancia un errore esplicito con la dimensione effettiva, bloccando l'operazione nel main process e restituendo un messaggio leggibile all'utente nel drawer di StoreView.

---

### [CRITICITÀ: MEDIA] — Rischio di Race Condition in `updateVornMeta` (uso interno)

**File/modulo:** `app/src/main/vorn/format.js`  
**Problema:** La funzione `updateVornMeta` è esportata ed esegue modifiche distruttive sul filesystem senza un meccanismo di lock interno.  
**Impatto:** Sebbene attualmente sia chiamata solo da `storeBlob` (che gestisce correttamente il lock), la sua firma pubblica la rende pericolosa per utilizzi futuri o test. Se due chiamate concorrenti agissero sullo stesso file, i metadati verrebbero irrimediabilmente corrotti.  
**Soluzione suggerita:** Considerare `updateVornMeta` come un'operazione "privata" o forzare l'uso di `withFileLock` anche al suo interno per garantire la sicurezza del modulo indipendentemente dal chiamante.

**Soluzione applicata:** `updateVornMeta` è stata rimossa da `format.js` (non più esportata). La logica è stata spostata in `store.js` come funzione privata `_updateMeta`, inaccessibile dall'esterno del modulo. Essendo definita nello stesso file di `storeBlob` — l'unico chiamante — l'invariante "deve essere dentro `withFileLock`" è ora garantita dalla struttura del codice, non da una convenzione.

---

### [CRITICITÀ: BASSA] — Validazione input IPC in `sessionHandlers.js`

**File/modulo:** `app/src/main/handlers/sessionHandlers.js`  
**Problema:** Gli handler per la gestione delle sessioni (delete, get, load run) accettano nomi di sessione come stringhe senza sanitizzazione.  
**Impatto:** Sebbene il rischio sia limitato dall'uso di `join` con un percorso di base controllato (`activeStore`), è teoricamente possibile tentare un path traversal limitato all'interno della cartella dello store (es. `name = "../../altre_cartelle"`).  
**Soluzione suggerita:** Applicare una validazione simile a quella implementata in `systemHandlers.js` per `list-dir`, impedendo caratteri di traversal nei nomi delle sessioni.

**Soluzione applicata:** Aggiunta la funzione privata `_validateName` in `sessionHandlers.js` che rifiuta stringhe vuote, non-stringa, contenenti `/`, `\` o la sequenza `..`. Applicata agli handler `vorn:get-session`, `vorn:delete-session`, `vorn:list-runs`, `vorn:load-run` e `vorn:delete-run`.

---

### [CRITICITÀ: BASSA] — "God Module" `engine.js`

**File/modulo:** `app/src/main/vorn/engine.js`  
**Problema:** Il file contiene ancora logiche molto diverse tra loro: scansione filesystem (`walk`), backup, restore ed estrazione disaster recovery.  
**Impatto:** Debito tecnico e difficoltà di testing unitario.  
**Soluzione suggerita:** Suddividere il modulo in `backup.js`, `restore.js` e `scanner.js`.

**Soluzione applicata:** `engine.js` è stato eliminato e suddiviso in tre moduli con responsabilità distinte: `scanner.js` (walk + matchPattern), `backup.js` (logica di backup), `restore.js` (restore, extractFromStore, extractByHash). Tutti i file che importavano da `engine.js` (`backupWorker.js`, `restoreWorker.js`, `extractStoreWorker.js`, `taskHandlers.js`) sono stati aggiornati agli import corretti.

---

### Valutazione Generale

Il progetto ha fatto grandi passi avanti in termini di modularità e sicurezza IPC dopo la prima revisione. L'uso dei Worker Thread è ben implementato e il sistema di locking dei file previene corruzioni dovute alla concorrenza. Le criticità residue riguardano principalmente l'atomicità di alcune operazioni sui file di supporto (run/settings) e la gestione degli stream, che andrebbero uniformate agli standard più sicuri già adottati nel cuore del motore di deduplicazione. Nel complesso, il codice è ordinato, ben strutturato e pronto per un consolidamento finale.
