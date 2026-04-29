import sys
import io
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from vorn_output import backup_summary, restore_summary, session_info, runs_list, error, info

PASS = 0
FAIL = 0


def check(label, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS]  {label}")
    else:
        FAIL += 1
        print(f"  [FAIL]  {label}" + (f" -- {detail}" if detail else ""))


def capture(fn, *args, **kwargs) -> str:
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    fn(*args, **kwargs)
    sys.stdout = old
    return buf.getvalue()


print("\nbackup_summary")

res_ok = {"session": "Pippo", "run_ts": "2026-04-29T10:00:00+00:00", "new": 3, "deduped": 1, "skipped": 0, "errors": []}
out = capture(backup_summary, res_ok)
check("contiene nome sessione", "Pippo" in out)
check("contiene data formattata", "2026-04-29" in out)
check("contiene nuovi file", "3" in out)
check("contiene deduplicati", "1" in out)
check("nessuna riga errore se errors vuoto", "!" not in out)

res_err = {"session": "Pippo", "run_ts": "2026-04-29T10:00:00+00:00", "new": 1, "deduped": 0, "skipped": 0,
           "errors": [{"file": "x.txt", "error": "permesso negato"}]}
out_err = capture(backup_summary, res_err)
check("errori presenti nell'output", "x.txt" in out_err and "permesso negato" in out_err)


print("\nrestore_summary")

res_r = {"run_ts": "2026-04-29T10:00:00+00:00", "restored": 5, "errors": []}
out_r = capture(restore_summary, res_r)
check("contiene numero file ripristinati", "5" in out_r)
check("contiene data", "2026-04-29" in out_r)

res_r_fail = {"restored": 0, "errors": ["Nessun run trovato per la data richiesta"]}
out_fail = capture(restore_summary, res_r_fail)
check("restore fallito produce output", len(out_fail) > 0)


print("\nsession_info")

session = {"name": "Pippo", "sources": ["/home/docs", "/home/photos"], "runs": [{}, {}]}
out_s = capture(session_info, session)
check("contiene nome sessione", "Pippo" in out_s)
check("contiene sorgenti", "/home/docs" in out_s)
check("contiene numero run", "2" in out_s)


print("\nruns_list")

runs = [
    {"ts": "2026-04-29T08:00:00+00:00", "files": 10},
    {"ts": "2026-04-29T18:00:00+00:00", "files": 11},
]
out_rl = capture(runs_list, runs, "Pippo")
check("contiene nome sessione", "Pippo" in out_rl)
check("contiene primo run", "2026-04-29" in out_rl)
check("contiene conteggio file", "10" in out_rl)

out_empty = capture(runs_list, [], "Vuota")
check("runs vuoti produce messaggio apposito", "Nessun" in out_empty)


print("\nerror / info")

out_e = capture(error, "qualcosa e' andato storto")
check("error produce output", "qualcosa e' andato storto" in out_e)

out_i = capture(info, "operazione in corso")
check("info produce output", "operazione in corso" in out_i)


# --- report ------------------------------------------------------------------

total = PASS + FAIL
esito = "OK" if FAIL == 0 else f"{FAIL} FAIL"
print(f"\n{'='*50}")
print(f"  vorn_output.py  {PASS}/{total} PASS  [{esito}]")
print(f"{'='*50}\n")
sys.exit(0 if FAIL == 0 else 1)
