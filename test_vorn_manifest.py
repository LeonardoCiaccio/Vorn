import sys
import tempfile
import shutil
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vorn_manifest as manifest

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


tmp  = Path(tempfile.mkdtemp(prefix="test_manifest_"))
mdir = tmp / "manifests"


# --- create / exists / load --------------------------------------------------

print("\ncreate / exists / load")

check("sessione non esiste prima di create", not manifest.exists(mdir, "Pippo"))

s = manifest.create(mdir, "Pippo", "/vorn/store")
check("create restituisce dict", isinstance(s, dict))
check("nome sessione corretto", s["name"] == "Pippo")
check("store salvato nella sessione", s["store"] == "/vorn/store")
check("sources vuoto alla creazione", s["sources"] == [])
check("runs vuoto alla creazione", s["runs"] == [])
check("exists -> True dopo create", manifest.exists(mdir, "Pippo"))
check("file JSON creato su disco", (mdir / "Pippo.json").exists())

loaded = manifest.load(mdir, "Pippo")
check("load restituisce la sessione corretta", loaded["name"] == "Pippo")

try:
    manifest.load(mdir, "Inesistente")
    check("load su sessione inesistente lancia eccezione", False)
except FileNotFoundError:
    check("load su sessione inesistente lancia eccezione", True)

check("get_store restituisce Path corretto",
      manifest.get_store(mdir, "Pippo") == Path("/vorn/store"))


# --- add_source --------------------------------------------------------------

print("\nadd_source")

manifest.add_source(mdir, "Pippo", "/home/user/docs")
s = manifest.load(mdir, "Pippo")
check("prima sorgente aggiunta", "/home/user/docs" in s["sources"])

manifest.add_source(mdir, "Pippo", "/home/user/photos")
s = manifest.load(mdir, "Pippo")
check("seconda sorgente aggiunta", len(s["sources"]) == 2)

manifest.add_source(mdir, "Pippo", "/home/user/docs")
s = manifest.load(mdir, "Pippo")
check("sorgente duplicata non aggiunta due volte", s["sources"].count("/home/user/docs") == 1)


# --- open_run ----------------------------------------------------------------

print("\nopen_run")

ts1 = manifest.open_run(mdir, "Pippo")
check("open_run restituisce timestamp stringa", isinstance(ts1, str) and len(ts1) > 0)
check("timestamp senza microsecondi", "." not in ts1)

s = manifest.load(mdir, "Pippo")
check("run creato nella sessione", len(s["runs"]) == 1)
check("run ha campo ts", s["runs"][0]["ts"] == ts1)
check("run ha campo files vuoto", s["runs"][0]["files"] == {})

time.sleep(1.01)
ts2 = manifest.open_run(mdir, "Pippo")
s = manifest.load(mdir, "Pippo")
check("secondo run: due run totali", len(s["runs"]) == 2)
check("secondo run ha ts diverso dal primo", ts1 != ts2)
check("ts in ordine cronologico", ts1 < ts2)


# --- add_file ----------------------------------------------------------------

print("\nadd_file")

manifest.add_file(mdir, "Pippo", ts1, "doc.txt", "hash_doc_v1", "/home/user/docs", True)
s = manifest.load(mdir, "Pippo")
run1 = s["runs"][0]
check("file aggiunto al run corretto", "doc.txt" in run1["files"])
check("hash corretto nel run", run1["files"]["doc.txt"]["hash"] == "hash_doc_v1")
check("source salvata nel file entry", run1["files"]["doc.txt"]["source"] == "/home/user/docs")
check("source_is_dir salvato nel file entry", run1["files"]["doc.txt"]["source_is_dir"] is True)

manifest.add_file(mdir, "Pippo", ts1, "img.png", "hash_img", "/home/user/photos", False)
run1 = manifest.load(mdir, "Pippo")["runs"][0]
check("secondo file aggiunto allo stesso run", len(run1["files"]) == 2)
check("source_is_dir False per file singolo", run1["files"]["img.png"]["source_is_dir"] is False)

manifest.add_file(mdir, "Pippo", ts2, "doc.txt", "hash_doc_v2", "/home/user/docs", True)
run2 = manifest.load(mdir, "Pippo")["runs"][1]
check("stesso file su run diverso ha hash diverso", run2["files"]["doc.txt"]["hash"] == "hash_doc_v2")

manifest.add_file(mdir, "Pippo", ts1, "doc.txt", "hash_doc_aggiornato", "/home/user/docs", True)
run1 = manifest.load(mdir, "Pippo")["runs"][0]
check("add_file sovrascrive hash se file gia presente nel run", run1["files"]["doc.txt"]["hash"] == "hash_doc_aggiornato")


# --- get_run_at --------------------------------------------------------------

print("\nget_run_at")

run_last = manifest.get_run_at(mdir, "Pippo")
check("get_run_at senza at restituisce ultimo run", run_last["ts"] == ts2)

run_at1 = manifest.get_run_at(mdir, "Pippo", at=ts1)
check("get_run_at con ts esatto restituisce quel run", run_at1["ts"] == ts1)

from datetime import datetime, timezone, timedelta
future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
run_future = manifest.get_run_at(mdir, "Pippo", at=future)
check("get_run_at con data futura restituisce ultimo run disponibile", run_future["ts"] == ts2)

past = "2000-01-01T00:00:00+00:00"
run_past = manifest.get_run_at(mdir, "Pippo", at=past)
check("get_run_at con data precedente a tutti i run restituisce None", run_past is None)


# --- list_runs ---------------------------------------------------------------

print("\nlist_runs")

runs = manifest.list_runs(mdir, "Pippo")
check("list_runs restituisce lista", isinstance(runs, list))
check("list_runs conta i run corretti", len(runs) == 2)
check("ogni entry ha ts e files", all("ts" in r and "files" in r for r in runs))
check("files e' il conteggio dei file nel run", runs[0]["files"] == 2)


# --- sessioni multiple -------------------------------------------------------

print("\nsessioni multiple")

manifest.create(mdir, "Pluto", "/store/pluto")
manifest.create(mdir, "Paperino", "/store/paperino")
check("sessione Pippo esiste ancora", manifest.exists(mdir, "Pippo"))
check("sessione Pluto esiste", manifest.exists(mdir, "Pluto"))
check("sessione Paperino esiste", manifest.exists(mdir, "Paperino"))
check("sessioni sono file separati",
      (mdir / "Pippo.json").exists() and
      (mdir / "Pluto.json").exists() and
      (mdir / "Paperino.json").exists())
check("store di Pluto corretto", manifest.get_store(mdir, "Pluto") == Path("/store/pluto"))


# --- report ------------------------------------------------------------------

shutil.rmtree(tmp)

total = PASS + FAIL
esito = "OK" if FAIL == 0 else f"{FAIL} FAIL"
print(f"\n{'='*50}")
print(f"  vorn_manifest.py  {PASS}/{total} PASS  [{esito}]")
print(f"{'='*50}\n")
sys.exit(0 if FAIL == 0 else 1)
