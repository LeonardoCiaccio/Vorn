import sys
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vorn_manifest as manifest
import vorn_store    as store
from vorn_engine import backup, restore

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


tmp  = Path(tempfile.mkdtemp(prefix="test_engine_"))
mdir = tmp / "manifests"
sdir = tmp / "store"
src  = tmp / "source"
src.mkdir()


def make_session(name, sources):
    manifest.create(mdir, name, str(sdir))
    for s in sources:
        manifest.add_source(mdir, name, str(s))


# --- backup base -------------------------------------------------------------

print("\nbackup base")

(src / "a.txt").write_bytes(b"Contenuto A")
(src / "b.txt").write_bytes(b"Contenuto B")
(src / "sub").mkdir()
(src / "sub" / "c.txt").write_bytes(b"Contenuto C")

make_session("S1", [src])
result = backup(mdir, "S1")
import time; time.sleep(1)

check("backup restituisce dict", isinstance(result, dict))
check("3 nuovi file nello store", result["new"] == 3, str(result))
check("0 deduplicati al primo run", result["deduped"] == 0)
check("0 errori", result["errors"] == [])
check("3 file .vorn creati", len(list(sdir.glob("*.vorn"))) == 3)

run = manifest.get_run_at(mdir, "S1")
check("manifest ha 3 file nel run", len(run["files"]) == 3)
check("file in sottocartella tracciato", "sub/c.txt" in run["files"] or "sub\\c.txt" in run["files"])
check("source salvata nel file entry", any("source" in v for v in run["files"].values()))


# --- backup senza modifiche (deduplicazione) ---------------------------------

print("\nbackup senza modifiche")

result2 = backup(mdir, "S1")
check("nessun nuovo file", result2["new"] == 0)
check("3 deduplicati (stessi hash)", result2["deduped"] == 3, str(result2))
check("store invariato: ancora 3 file .vorn", len(list(sdir.glob("*.vorn"))) == 3)


# --- backup con modifica -----------------------------------------------------

print("\nbackup con modifica")

(src / "a.txt").write_bytes(b"Contenuto A modificato")
result3 = backup(mdir, "S1")
check("1 nuovo file (a.txt modificato)", result3["new"] == 1, str(result3))
check("2 deduplicati (b.txt e c.txt invariati)", result3["deduped"] == 2)
check("store ora ha 4 file .vorn", len(list(sdir.glob("*.vorn"))) == 4)

runs = manifest.list_runs(mdir, "S1")
check("3 run in totale", len(runs) == 3)


# --- deduplicazione cross-sessione -------------------------------------------

print("\ndeduplicazione cross-sessione")

src2 = tmp / "source2"
src2.mkdir()
(src2 / "b.txt").write_bytes(b"Contenuto B")

make_session("S2", [src2])
result4 = backup(mdir, "S2")
check("file identico non crea nuovo .vorn", result4["new"] == 0, str(result4))
check("file identico registrato come deduplicato", result4["deduped"] == 1)


# --- restore ultima versione sui path originali ------------------------------

print("\nrestore ultima versione")

(src / "a.txt").unlink()
(src / "b.txt").unlink()
(src / "sub" / "c.txt").unlink()

res = restore(mdir, "S1")
check("restore senza errori", res["errors"] == [], str(res))
check("a.txt ripristinato nel path originale", (src / "a.txt").exists())
check("contenuto a.txt e' ultima versione", (src / "a.txt").read_bytes() == b"Contenuto A modificato")
check("b.txt ripristinato", (src / "b.txt").exists())
check("sub/c.txt ripristinato", (src / "sub" / "c.txt").exists())
check("numero file ripristinati", res["restored"] == 3, str(res))


# --- restore a punto nel tempo -----------------------------------------------

print("\nrestore a punto nel tempo")

runs = manifest.list_runs(mdir, "S1")
ts_primo_run = runs[0]["ts"]

res2 = restore(mdir, "S1", at=ts_primo_run)
check("restore al primo run senza errori", res2["errors"] == [], str(res2))
check("a.txt al primo run ha contenuto originale",
      (src / "a.txt").read_bytes() == b"Contenuto A")


# --- restore edge cases ------------------------------------------------------

print("\nrestore edge cases")

res3 = restore(mdir, "S1", at="2000-01-01T00:00:00+00:00")
check("restore con data ante-run: 0 file ripristinati", res3["restored"] == 0)

manifest.create(mdir, "Vuota", str(sdir))
res4 = restore(mdir, "Vuota")
check("restore sessione senza run: 0 file ripristinati", res4["restored"] == 0)


# --- backup di file singolo --------------------------------------------------

print("\nbackup file singolo")

f_single = tmp / "singolo.txt"
f_single.write_bytes(b"File singolo")
make_session("S3", [f_single])
result5 = backup(mdir, "S3")
check("backup file singolo: 1 nuovo file", result5["new"] == 1, str(result5))

f_single.unlink()
res5 = restore(mdir, "S3")
check("restore file singolo: 1 file ripristinato", res5["restored"] == 1)
check("contenuto file singolo integro", f_single.read_bytes() == b"File singolo")


# --- report ------------------------------------------------------------------

shutil.rmtree(tmp)

total = PASS + FAIL
esito = "OK" if FAIL == 0 else f"{FAIL} FAIL"
print(f"\n{'='*50}")
print(f"  vorn_engine.py  {PASS}/{total} PASS  [{esito}]")
print(f"{'='*50}\n")
sys.exit(0 if FAIL == 0 else 1)
