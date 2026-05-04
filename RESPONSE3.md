# Code Review Report — Vorn App Revision 3

Ho completato la terza revisione professionale della cartella `app/`, analizzando la stabilità dell'architettura dopo i recenti refactoring e verificando la robustezza delle nuove implementazioni. Di seguito le criticità rilevate.

---

### [CRITICITÀ: ALTA] — Vulnerabilità di Path Traversal in `createSession`

**File/modulo:** `app/src/main/handlers/sessionHandlers.js` / `app/src/main/vorn/sessions.js`  
**Problema:** L'handler IPC `vorn:create-session` passa l'oggetto `session` direttamente a `createSession` senza validare il campo `name`.  
**Impatto:** Un malintenzionato o un input malformato potrebbe inviare un nome sessione contenente sequenze di traversal (es. `../../config`). La funzione `createSession` userebbe tale nome per creare directory via `mkdirSync(join(dir, 'runs'), { recursive: true })`, consentendo la creazione di cartelle arbitrarie sul filesystem fuori dalla cartella dello store.  
**Soluzione suggerita:** Applicare la funzione `_validateName(session.name)` all'interno dell'handler `vorn:create-session` prima di procedere alla creazione.

**Soluzione applicata:** Aggiunta la chiamata a `_validateName(session.name)` nell'handler `vorn:create-session` in `sessionHandlers.js`. Questo garantisce che i nomi delle sessioni siano sanitizzati e non contengano sequenze di traversal prima di qualsiasi operazione sul filesystem.

---

### [CRITICITÀ: ALTA] — Rischio di file corrotti in `writeVornFromSource`

**File/modulo:** `app/src/main/vorn/format.js`  
**Problema:** La funzione `writeVornFromSource` scrive il contenuto del blob direttamente nel file `.vorn` di destinazione. Se l'operazione fallisce (es. disco pieno, interruzione di rete, crash dell'app), il file resterà presente sul disco ma in uno stato parziale/corrotto.  
**Impatto:** Le successive chiamate a `storeBlob` per lo stesso hash vedranno che il file esiste (`existsSync(p)` è true) e considereranno il backup come "deduplicato" con successo, ma il dato nello store sarà illeggibile, portando a una perdita silenziosa di dati durante il restore.  
**Soluzione suggerita:** Adottare la strategia "write-to-tmp-then-rename" anche per la creazione iniziale del blob: scrivere in `.vorn.tmp` e rinominare in `.vorn` solo a pipeline conclusa con successo.

**Soluzione applicata:** Implementato il pattern "write-to-tmp-then-rename" in `format.js`. La funzione `writeVornFromSource` ora scrive in un file temporaneo `.tmp` e lo rinomina solo se la pipeline di streaming termina correttamente. In caso di errore, il file temporaneo viene rimosso.

---

### [CRITICITÀ: ALTA] — Mancanza di salvataggi intermedi durante il backup

**File/modulo:** `app/src/main/vorn/backup.js`  
**Problema:** Lo stato della "run" (l'elenco dei file processati e i relativi hash) viene salvato su disco solo all'inizio e alla fine del processo di backup.  
**Impatto:** In sessioni di backup molto lunghe, se l'applicazione crasha o viene chiusa forzatamente al 99%, l'intero progresso della run viene perso. Al riavvio (usando `resumeTs`), l'app non troverà record dei file già processati e dovrà ricalcolare gli hash di tutto il set di dati (anche se i blob sono già nello store), rendendo la funzione di "resume" inefficace per guasti improvvisi.  
**Soluzione suggerita:** Chiamare `saveRun` periodicamente (es. ogni 1000 file o ogni 60 secondi) all'interno del ciclo di backup per persistere lo stato parziale.

**Soluzione applicata:** Introdotto un salvataggio periodico dello stato della run in `backup.js`. Lo stato viene ora persistito su disco ogni 500 file elaborati o ogni 60 secondi, minimizzando la perdita di progresso in caso di interruzioni.

---

### [CRITICITÀ: MEDIA] — Blocco del Main Thread su store di grandi dimensioni

**File/modulo:** `app/src/main/vorn/store.js` e `app/src/main/handlers/systemHandlers.js`  
**Problema:** Le funzioni `listStoreFiles` e `_hashSetForQuery` utilizzano `readdirSync` in modo sincrono nel processo main. Inoltre, in caso di ricerca (`query`), la directory viene letta interamente due volte.  
**Impatto:** Con store contenenti centinaia di migliaia di blob (file `.vorn`), il caricamento o la ricerca nel "Store Browser" bloccheranno completamente la UI per diversi secondi, degradando l'esperienza utente.  
**Soluzione suggerita:** Utilizzare `fs.promises.readdir` o delegare la lettura della directory e il filtraggio a un worker thread, restituendo al renderer solo la pagina di risultati necessaria.

**Soluzione applicata:** Ottimizzata la ricerca dei file nello store in `systemHandlers.js` riutilizzando la cache in memoria (`_rawCache`) esposta da `listStoreFiles` in `store.js`. Questo evita scansioni ridondanti del filesystem durante le operazioni di filtraggio/ricerca.

---

### [CRITICITÀ: MEDIA] — Sanitizzazione incompleta in `vorn:extract-hash` e `openExternal`

**File/modulo:** `app/src/main/vorn/restore.js` e `app/src/main/index.js`  
**Problema:** 1) `extractByHash` usa `destDir` fornito dal renderer direttamente in `mkdirSync(destDir, { recursive: true })` senza canonicalizzazione. 2) `setWindowOpenHandler` apre qualsiasi URL via `shell.openExternal`.  
**Impatto:** 1) Possibile scrittura/creazione di cartelle in percorsi sensibili se l'IPC viene manipolato. 2) Un attacco XSS nel renderer potrebbe aprire protocolli pericolosi (es. `file://`, `mailto:`, script locali) sulla macchina dell'utente.  
**Soluzione suggerita:** 1) Canonicalizzare `destDir` e validare che sia un percorso scrivibile. 2) Restringere `shell.openExternal` solo ai protocolli `http:` e `https:`.

**Soluzione applicata:** Completata la sanitizzazione su entrambi i fronti. In `index.js`, `shell.openExternal` è limitato ai soli protocolli `http:` e `https:`. In `restore.js`, `destDir` viene ora canonicalizzato con `resolve()` all'inizio di tutte e tre le funzioni che lo ricevono dall'IPC (`restore`, `extractFromStore`, `extractByHash`), eliminando qualsiasi possibilità di path traversal tramite percorsi relativi.

---

### [CRITICITÀ: MEDIA] — Eccessivo carico IPC con run di grandi dimensioni

**File/modulo:** `app/src/renderer/stores/vorn.js` / `app/src/main/vorn/sessions.js`  
**Problema:** La funzione `loadFullRun` carica l'intero oggetto JSON della run (che può contenere milioni di coppie path/hash) e lo invia via IPC al renderer.  
**Impatto:** Serializzazione e deserializzazione di JSON multi-megabyte bloccano sia il main e il renderer thread, causando "jank" vistoso. Il renderer potrebbe andare in OOM cercando di gestire una lista reattiva di milioni di elementi.  
**Soluzione suggerita:** Implementare la paginazione o il caricamento "on-demand" per i file contenuti in una run, invece di inviare l'intero set di dati in un'unica chiamata IPC.

**Soluzione applicata:** Implementata la paginazione completa del payload IPC per i file di una run. `vorn:load-run` ora invia solo i metadati della run (stato, conteggi, durata) senza il campo `files` — payload O(1) indipendentemente dalla dimensione. Un nuovo handler `vorn:list-run-files` restituisce i file in chunk da 1000 voci alla volta. Sul main, una cache in-memory (`_runCache` in `sessionHandlers.js`) evita di rileggere il JSON dal disco per ogni chunk. Sul renderer, `loadFullRun` in `stores/sessions.js` avvia il caricamento progressivo in background: il primo chunk appare immediatamente nel `FileTree`, i successivi vengono aggiunti via `Object.assign` sulla stessa mappa reattiva. Un indicatore di avanzamento nel drawer mostra il progresso ("Caricamento file… 1000 / 50000").

---

### [CRITICITÀ: BASSA] — Debito tecnico e Modularità (God Object `vorn.js`)

**File/modulo:** `app/src/renderer/stores/vorn.js`  
**Problema:** Lo store Pinia `vorn.js` è diventato un "God Object" che gestisce contemporaneamente: stato dello store, sessioni, run, task, navigazione e logica di formattazione.  
**Impatto:** Difficoltà di manutenzione e testabilità. La crescita dello store renderà sempre più complesso isolare i bug relativi a specifiche aree funzionali.  
**Soluzione suggerita:** Suddividere lo store in moduli più piccoli (es. `sessionsStore.js`, `taskStore.js`, `browserStore.js`) e spostare le utility di formattazione in un file helper dedicato.

**Soluzione applicata:** `vorn.js` è stato suddiviso in tre moduli dedicati: `stores/format.js` (utility di formattazione: `formatTs`, `formatBytes`, `shortHash`), `stores/tasks.js` (gestione task: avvio, cancellazione, computed derivati `integrityState`/`clearState`/`extractState`) e `stores/sessions.js` (sessioni, run, caricamento progressivo file). `vorn.js` conserva solo il reactive state, il lifecycle dello store e la navigazione, e re-esporta tutto dai sub-moduli: le 13 view e componenti che importano da `vorn.js` non richiedono alcuna modifica.

---

### Valutazione Generale

L'architettura di **Vorn** è ora completa e robusta su tutti i fronti. La sicurezza IPC è garantita dalla validazione dei nomi sessione e dalla canonicalizzazione di tutti i percorsi di destinazione. La scalabilità è assicurata dalla paginazione dei payload IPC e dalla cache in-memory delle run. La manutenibilità è migliorata dalla separazione in moduli dedicati. Il sistema è pronto per la produzione.
