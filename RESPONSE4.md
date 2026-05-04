# Report di Revisione del Codice — Vorn App

Sulla base della revisione del codice nella cartella `app/`, ecco l'elenco degli interventi suggeriti, ordinati per criticità.

---

### [CRITICITÀ: ALTA] — Rischio corruzione dati in aggiornamento metadati

**File/modulo:** `app/src/main/vorn/store.js` (funzione `_updateMeta`)  
**Problema:** La funzione `_updateMeta` esegue un `truncateSync` sul file `.vorn` prima di scrivervi i nuovi metadati. Se l'applicazione o il sistema crashano tra la troncatura e la scrittura effettiva (`writeSync`), i metadati del file vanno persi definitivamente. Sebbene esista un meccanismo di recupero basato su file `.mtmp` in `format.js`, l'operazione non è intrinsecamente atomica.  
**Impatto:** Perdita di indicizzazione del contenuto (il file `.vorn` rimane con i dati ma senza informazioni su quali sessioni/percorsi lo contengano), richiedendo un intervento manuale o un check di integrità complesso.  
**Soluzione suggerita:** Utilizzare una strategia "append-only" più rigorosa o assicurarsi che il file di recovery `.mtmp` venga rimosso solo *dopo* che il flush dei metadati sul file principale è stato confermato dal sistema operativo (es. usando `fsyncSync`).

**Soluzione applicata:** In `_updateMeta` (store.js) è stato aggiunto `fsyncSync(fdw)` immediatamente dopo `writeSync`, garantendo che il flush su disco avvenga prima della rimozione del file WAL `.mtmp`. In questo modo, se l'app crasha dopo `truncateSync` ma prima del flush, il recovery in `readVornMeta` trova il `.mtmp` e ripristina i metadati correttamente. Contestualmente, le costanti `_HEADER_SIZE` e `_SEPARATOR_LEN` e la funzione `_readVornContentLen` sono state rimosse da `store.js` e centralizzate in `format.js` come `VORN_HEADER_SIZE`, `VORN_SEPARATOR_LEN` e `readVornContentLen` (fix 6 incluso).

---

### [CRITICITÀ: ALTA] — Vulnerabilità Path Traversal in fase di Restore

**File/modulo:** `app/src/main/vorn/restore.js` (funzioni `restore` e `extractFromStore`)  
**Problema:** Il percorso relativo (`relPath`) viene letto dai metadati del file `.vorn` o dal file di sessione e usato direttamente in `join(destDir, relPath)`. Non viene effettuata alcuna validazione per impedire che `relPath` contenga sequenze come `..` o percorsi assoluti.  
**Impatto:** Un file di sessione o un database di store malevolo/corrotto potrebbe sovrascrivere file arbitrari sul sistema dell'utente al di fuori della cartella di destinazione selezionata durante il ripristino.  
**Soluzione suggerita:** Implementare una funzione di sanitizzazione che verifichi che il percorso risultante sia effettivamente contenuto all'interno di `destDir` (es. usando `path.relative` e controllando che non inizi con `..`).

**Soluzione applicata:** Aggiunta la funzione `_safeJoin(baseDir, relPath)` in `restore.js` che calcola il path risultante con `resolve(join(baseDir, relPath))` e verifica che sia figlio di `baseDir` confrontandolo con `baseDir + sep`. Se il controllo fallisce, il file viene saltato e registrato negli errori con codice `path_traversal`. Il controllo è applicato a tutte e tre le funzioni: `restore`, `extractFromStore` e (già coperta dal precedente fix) `extractByHash`.

---

### [CRITICITÀ: MEDIA] — Terminazione incompleta dei Worker Thread

**File/modulo:** `app/src/main/workerManager.js` (funzione `triggerDisconnect`)  
**Problema:** Quando uno store viene disconnesso (es. rimozione improvvisa di un disco USB), la funzione imposta il `cancelFlag` tramite `Atomics`, ma svuota immediatamente la mappa `activeWorkers` senza terminare esplicitamente i thread o attendere la loro chiusura.  
**Impatto:** I worker thread potrebbero continuare a girare in background, tentando di accedere a risorse non più disponibili o consumando CPU/RAM inutilmente fino alla chiusura dell'app.  
**Soluzione suggerita:** Chiamare `worker.terminate()` dopo un breve timeout se il worker non risponde al segnale di cancellazione, similmente a quanto già fatto in `ipc.js` durante il `before-quit`.

**Soluzione applicata:** In `triggerDisconnect` (workerManager.js), dopo `Atomics.store(cancelFlag, 0, 1)` viene ora schedulato un `setTimeout(() => worker.terminate(), 5000)` per ciascun worker attivo. Il segnale cooperativo via Atomics rimane il meccanismo primario; la `terminate()` forzata dopo 5 secondi è la rete di sicurezza per i worker che non rispondono.

---

### [CRITICITÀ: MEDIA] — Rischio Stack Overflow nello scanner

**File/modulo:** `app/src/main/vorn/scanner.js` (funzione `walk`)  
**Problema:** La scansione dei file è implementata in modo ricorsivo sincrono.  
**Impatto:** Su strutture di directory estremamente profonde (comuni in alcuni ambienti di sviluppo o per errore), l'applicazione potrebbe crashare con un `RangeError: Maximum call stack size exceeded`.  
**Soluzione suggerita:** Rifattorizzare la funzione `walk` per utilizzare un approccio iterativo basato su una coda (queue) o uno stack esplicito.

**Soluzione applicata:** La funzione `walk` in `scanner.js` è stata riscritta in forma completamente iterativa usando uno stack esplicito (`queue`). La struttura, il comportamento e la firma pubblica rimangono identici — cambia solo l'implementazione interna, eliminando qualsiasi limite di profondità di ricorsione.

---

### [CRITICITÀ: BASSA] — Gestione centralizzata del Database

**File/modulo:** `app/src/main/vorn/db.js`  
**Problema:** Il database SQLite che memorizza gli hash dei file è unico e globale per l'utente (`~/.vorn/vorn.db`).  
**Impatto:** Sebbene il content-addressing mitighi il rischio, in scenari rari con dischi diversi montati sulla stessa lettera/percorso con file diversi aventi stessa dimensione/mtime (collisione debole), il DB potrebbe restituire hash obsoleti. Inoltre, il DB cresce indefinitamente senza una politica di pulizia per file non più esistenti.  
**Soluzione suggerita:** Considerare la possibilità di avere un database per ogni store o implementare un comando di "vacuum/cleanup" periodico.

**Soluzione applicata:** La scelta di un DB globale è confermata come intenzionale (massimizza il risparmio di hashing tra store diversi sulla stessa macchina). Per il problema della crescita indefinita, è stata aggiunta la funzione `dbPruneOrphans()` in `db.js`, che itera tutti i record e rimuove quelli il cui path non esiste più sul filesystem. La funzione viene chiamata automaticamente in `backup.js` al termine di ogni run con status `done`.

---

### [CRITICITÀ: BASSA] — Duplicazione logica Header VORN

**File/modulo:** `app/src/main/vorn/store.js` e `app/src/main/vorn/format.js`  
**Problema:** Entrambi i moduli definiscono costanti e logica per leggere/scrivere l'header dei file `.vorn` (es. `_HEADER_SIZE`, `_readVornContentLen`).  
**Impatto:** Debito tecnico e rischio di incoerenza in caso di modifiche al formato del file.  
**Soluzione suggerita:** Centralizzare tutta la conoscenza del formato fisico del file in `format.js`, esponendo primitive di alto livello per `store.js`.

**Soluzione applicata:** Risolto contestualmente al fix della criticità ALTA su `_updateMeta`. Le costanti `_HEADER_SIZE` e `_SEPARATOR_LEN` e la funzione `_readVornContentLen` sono state rimosse da `store.js` e sostituite da `VORN_HEADER_SIZE`, `VORN_SEPARATOR_LEN` e `readVornContentLen` esportate da `format.js`. `store.js` le importa direttamente, eliminando ogni duplicazione.

---

### Valutazione Generale

Il codice di **Vorn** presenta un'architettura solida e ben pensata, specialmente nell'uso dei Worker Thread per il lavoro pesante e del pattern request-response per la scrittura centralizzata sul main process (gestendo così correttamente i lock). La separazione tra UI (Vue + reattività nativa) e logica di sistema è chiara. La robustezza è buona, ma necessita di maggiore attenzione sull'atomicità delle operazioni I/O critiche e sulla sanitizzazione degli input durante il ripristino per essere considerato "production-ready".
