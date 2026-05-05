# Code Review Prompt — Vorn App

## Contesto

Stai effettuando una revisione critica del codice dell'applicazione **Vorn**, un sistema di backup content-addressable per desktop (Electron + Vue 3 + Node.js).

Il codice da analizzare si trova esclusivamente nella cartella `src/`. Ignora qualsiasi altro contenuto del repository (cartella `proto/`, file di configurazione root, ecc.).

## Ambiti di analisi richiesti

Analizza il codice nei seguenti ambiti, con attenzione critica:

### 1. Architettura e design
- Separazione delle responsabilità tra main process, worker threads e renderer
- Coerenza del flusso IPC (main ↔ preload ↔ renderer)
- Gestione dello stato globale nel renderer (store Pinia/reattivo)
- Dipendenze circolari o accoppiamento eccessivo tra moduli

### 2. Principi SOLID
- **Single Responsibility**: ogni modulo/funzione fa una sola cosa?
- **Open/Closed**: il codice è estendibile senza modificare l'esistente?
- **Liskov / Interface Segregation**: le interfacce sono coerenti e minimali?
- **Dependency Inversion**: le dipendenze puntano verso astrazioni o verso implementazioni concrete?

### 3. Robustezza e stabilità
- Gestione degli errori: tutti i percorsi critici hanno error handling adeguato?
- Casi limite non gestiti (file vuoti, store vuoto, sessioni senza sorgenti, ecc.)
- Race condition residue nella concorrenza tra worker thread e main process
- Correttezza della serializzazione delle operazioni sullo store tramite il proxy IPC

### 4. Sicurezza
- Input non validati provenienti dal renderer (IPC handlers nel main process)
- Path traversal o injection attraverso percorsi file forniti dall'utente
- Esposizione di API sensibili nel preload (`contextBridge`)
- Uso di `shell.openExternal` o API equivalenti senza sanitizzazione

### 5. Qualità del codice
- Funzioni troppo lunghe o con troppe responsabilità
- Duplicazione di logica tra moduli
- Nomi di variabili, funzioni e file chiari e coerenti
- Commenti presenti dove il "perché" non è ovvio; assenza di commenti ridondanti che spiegano il "cosa"
- Documentazione delle interfacce pubbliche (funzioni esportate, IPC handlers)

### 6. Modularità
- I moduli sono riutilizzabili indipendentemente?
- Le funzioni esportate hanno firme stabili e prevedibili?
- Esistono moduli "jolly" che fanno troppo (god objects/modules)?

### 7. Gestione della memoria e risorse
- File descriptor lasciati aperti in caso di errore
- Worker thread terminati correttamente in tutti i percorsi (incluso crash)
- Interval/timer puliti al momento opportuno
- Leak di event listener

## Formato del risultato atteso

Fornisci un elenco ordinato di interventi, dal più critico al meno critico, nel seguente formato:

---

### [CRITICITÀ: ALTA / MEDIA / BASSA] — Titolo breve

**File/modulo:** `percorso/del/file.js`  
**Problema:** Descrizione chiara del problema riscontrato.  
**Impatto:** Cosa può andare storto (crash, corruzione dati, vulnerabilità, debito tecnico).  
**Soluzione suggerita:** Approccio consigliato per risolvere il problema.

---

Raggruppa gli interventi per criticità (prima ALTA, poi MEDIA, poi BASSA). All'interno di ogni gruppo, ordina per impatto pratico. Concludi con un breve paragrafo di **valutazione generale** del codice (3-5 righe).
