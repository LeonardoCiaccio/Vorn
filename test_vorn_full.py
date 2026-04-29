"""
VORN — Test Suite Completa con Report Dettagliato
"""
import sys
import json
import shutil
import hashlib
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hash_vorn import vorn_fingerprint
from vorn import (
    backup, restore, store_dir,
    read_vorn_header, read_vorn,
    hash_file, write_vorn, update_vorn_records
)

SEPARATOR = b'\x56\x4F\x52\x4E\xFF\x00\xFF\x00'

# -- Report -----------------------------------------------------------------

class Report:
    def __init__(self):
        self.sections = []
        self.current  = None

    def section(self, title):
        self.current = {"title": title, "tests": []}
        self.sections.append(self.current)
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")

    def check(self, label, condition, detail="", expected=None, got=None):
        status = "PASS" if condition else "FAIL"
        extra  = detail
        if expected is not None and got is not None:
            extra = f"atteso: {expected}  |  ottenuto: {got}"
        self.current["tests"].append({"label": label, "ok": condition, "detail": extra})
        icon = "  [PASS]" if condition else "  [FAIL]"
        print(f"{icon}  {label}")
        if extra:
            print(f"          {extra}")
        return condition

    def summary(self):
        total_pass = sum(t["ok"] for s in self.sections for t in s["tests"])
        total_fail = sum(not t["ok"] for s in self.sections for t in s["tests"])
        total      = total_pass + total_fail

        print(f"\n{'='*60}")
        print(f"  REPORT FINALE")
        print(f"{'='*60}\n")

        for s in self.sections:
            p = sum(t["ok"] for t in s["tests"])
            f = sum(not t["ok"] for t in s["tests"])
            icon = "OK  " if f == 0 else "FAIL"
            print(f"  [{icon}]  {s['title']}  ({p}/{p+f})")
            for t in s["tests"]:
                if not t["ok"]:
                    print(f"           >> {t['label']}")
                    if t["detail"]:
                        print(f"              {t['detail']}")

        print(f"\n{'-'*60}")
        print(f"  Totale : {total}  |  PASS: {total_pass}  |  FAIL: {total_fail}")
        if total_fail == 0:
            print(f"  Risultato: TUTTO OK")
        else:
            print(f"  Risultato: {total_fail} TEST FALLITI")
        print(f"{'-'*60}\n")
        return total_fail == 0


R   = Report()
tmp = Path(tempfile.mkdtemp(prefix="vorn_full_"))
dst = str(tmp / "vornstore")
store = store_dir(dst)

print(f"\nVORN — Test Suite Completa")
print(f"Cartella temp : {tmp}")
print(f"Store         : {store}")
print(f"Data          : {datetime.now().isoformat()}")

# ==========================================================================
R.section("1. FORMATO FILE .VORN")
# ==========================================================================

src = tmp / "formato"
src.mkdir()
(src / "test.txt").write_bytes(b"Hello Vorn!")
backup(str(src), dst, session="test-formato")

vorn_files = list(store.glob("*.vorn"))
R.check("file .vorn creato nello store", len(vorn_files) == 1)

vf = vorn_files[0]
raw = vf.read_bytes()

R.check("separatore presente nel file", SEPARATOR in raw)

sep_pos = raw.index(SEPARATOR)
header_bytes = raw[:sep_pos]
content_bytes = raw[sep_pos + len(SEPARATOR):]

R.check("header e' JSON valido", True if json.loads(header_bytes.decode()) else False)
R.check("contenuto corrisponde al file originale",
        content_bytes == b"Hello Vorn!")

meta = json.loads(header_bytes.decode())
R.check("campo hash presente",    "hash" in meta)
R.check("campo bytes presente",   "bytes" in meta)
R.check("campo records presente", "records" in meta and len(meta["records"]) > 0)

rec = meta["records"][0]
R.check("record: campo name",        "name" in rec)
R.check("record: campo ts",          "ts" in rec)
R.check("record: campo session",     rec.get("session") == "test-formato")
R.check("record: campo machine",     "machine" in rec)
R.check("record: campo path",        "path" in rec)
R.check("record: campo fingerprint", "fingerprint" in rec)

R.check("hash nel nome = SHA256 del contenuto",
        hashlib.sha256(content_bytes).hexdigest() == vf.stem)

shutil.rmtree(src)

# ==========================================================================
R.section("2. FINGERPRINT")
# ==========================================================================

src = tmp / "fingerprint"
src.mkdir()

# file vuoto
empty = src / "vuoto.txt"
empty.write_bytes(b"")
fp = vorn_fingerprint(empty)
R.check("file vuoto -> '0:empty'", fp == "0:empty", got=fp)

# file piccolo (<=104 byte)
small = src / "small.txt"
small.write_bytes(b"A" * 50)
fp = vorn_fingerprint(small)
R.check("file piccolo usa modalita :full:", ":full:" in fp)

# file grande (>104 byte)
big = src / "big.bin"
big.write_bytes(b"X" * 1000)
fp = vorn_fingerprint(big)
R.check("file grande usa campioni senza :full:", ":full:" not in fp and fp.startswith("1000:"))

# stesso contenuto -> stesso fingerprint
copy = src / "copy.bin"
copy.write_bytes(b"X" * 1000)
R.check("file identici -> fingerprint identico",
        vorn_fingerprint(big) == vorn_fingerprint(copy))

# contenuto diverso -> fingerprint diverso
diff = src / "diff.bin"
diff.write_bytes(b"Y" * 1000)
R.check("file diversi -> fingerprint diverso",
        vorn_fingerprint(big) != vorn_fingerprint(diff))

# file esattamente 104 byte -> soglia
edge = src / "edge.bin"
edge.write_bytes(b"Z" * 104)
fp_edge = vorn_fingerprint(edge)
R.check("file 104 byte (soglia) usa :full:", ":full:" in fp_edge)

# file 105 byte -> campioni
over = src / "over.bin"
over.write_bytes(b"Z" * 105)
fp_over = vorn_fingerprint(over)
R.check("file 105 byte usa campioni", ":full:" not in fp_over)

shutil.rmtree(src)

# ==========================================================================
R.section("3. BACKUP — SCENARI BASE")
# ==========================================================================

src = tmp / "backup_base"
src.mkdir()
(src / "a.txt").write_bytes(b"Contenuto A")
(src / "b.txt").write_bytes(b"Contenuto B")
(src / "c.txt").write_bytes(b"Contenuto C")

before = len(list(store.glob("*.vorn")))
backup(str(src), dst, session="base-v1")
after = len(list(store.glob("*.vorn")))
R.check("3 nuovi file nello store", after - before == 3,
        expected=before+3, got=after)

# secondo backup senza modifiche
before = len(list(store.glob("*.vorn")))
backup(str(src), dst, session="base-v2")
after = len(list(store.glob("*.vorn")))
R.check("secondo backup senza modifiche: zero nuovi file", before == after,
        expected=before, got=after)

# modifica un file
(src / "a.txt").write_bytes(b"Contenuto A modificato")
before = len(list(store.glob("*.vorn")))
backup(str(src), dst, session="base-v3")
after = len(list(store.glob("*.vorn")))
R.check("modifica un file: un solo nuovo .vorn", after - before == 1,
        expected=before+1, got=after)

shutil.rmtree(src)

# ==========================================================================
R.section("4. DEDUPLICAZIONE")
# ==========================================================================

src_x = tmp / "dedup_x"
src_y = tmp / "dedup_y"
src_x.mkdir()
src_y.mkdir()

shared_content = b"Contenuto condiviso tra progetti"
(src_x / "shared.txt").write_bytes(shared_content)
(src_y / "shared.txt").write_bytes(shared_content)
(src_x / "unico_x.txt").write_bytes(b"Solo in X")
(src_y / "unico_y.txt").write_bytes(b"Solo in Y")

before = len(list(store.glob("*.vorn")))
backup(str(src_x), dst, session="dedup-x")
after_x = len(list(store.glob("*.vorn")))
backup(str(src_y), dst, session="dedup-y")
after_y = len(list(store.glob("*.vorn")))

R.check("backup X: 2 nuovi file", after_x - before == 2,
        expected=before+2, got=after_x)
R.check("backup Y: solo 1 nuovo (shared gia presente)", after_y - after_x == 1,
        expected=after_x+1, got=after_y)

# verifica records nel file condiviso
shared_hash = hashlib.sha256(shared_content).hexdigest()
shared_vorn = store / (shared_hash + ".vorn")
R.check("file condiviso esiste nello store", shared_vorn.exists())

meta = read_vorn_header(shared_vorn)
sessions_in_records = [r.get("session") for r in meta.get("records", [])]
R.check("records contiene entrambe le sessioni",
        "dedup-x" in sessions_in_records and "dedup-y" in sessions_in_records,
        got=str(sessions_in_records))

# ripristino contenuto originale -> dedup
(src_x / "unico_x.txt").write_bytes(b"Modificato")
backup(str(src_x), dst, session="dedup-x2")
(src_x / "unico_x.txt").write_bytes(b"Solo in X")   # torno all'originale
before = len(list(store.glob("*.vorn")))
backup(str(src_x), dst, session="dedup-x3")
after = len(list(store.glob("*.vorn")))
R.check("contenuto tornato all'originale: zero nuovi .vorn (dedup)", before == after,
        expected=before, got=after)

shutil.rmtree(src_x)
shutil.rmtree(src_y)

# ==========================================================================
R.section("5. RESTORE")
# ==========================================================================

src = tmp / "restore_test"
src.mkdir()
(src / "doc.txt").write_bytes(b"Versione originale")
(src / "img.bin").write_bytes(bytes(range(256)) * 10)

backup(str(src), dst, session="restore-v1")

(src / "doc.txt").write_bytes(b"Versione modificata")
backup(str(src), dst, session="restore-v2")

# cancello i file
(src / "doc.txt").unlink()
(src / "img.bin").unlink()
R.check("file cancellati prima del restore", not (src / "doc.txt").exists())

restore(str(src), dst)

R.check("doc.txt ripristinato", (src / "doc.txt").exists())
R.check("img.bin ripristinato", (src / "img.bin").exists())
R.check("contenuto doc.txt e' l'ultima versione",
        (src / "doc.txt").read_bytes() == b"Versione modificata")
R.check("contenuto img.bin corretto",
        (src / "img.bin").read_bytes() == bytes(range(256)) * 10)

shutil.rmtree(src)

# ==========================================================================
R.section("6. RECORDS — STORIA DELLE RICHIESTE")
# ==========================================================================

# due sorgenti diverse con stesso contenuto -> dedup -> due record nello stesso .vorn
src_alpha = tmp / "records_alpha"
src_beta  = tmp / "records_beta"
src_alpha.mkdir()
src_beta.mkdir()

content = b"File con storia condivisa"
(src_alpha / "storico.txt").write_bytes(content)
(src_beta  / "storico.txt").write_bytes(content)  # stesso contenuto, sorgente diversa

backup(str(src_alpha), dst, session="sessione-alpha")  # crea .vorn
backup(str(src_beta),  dst, session="sessione-beta")   # dedup -> aggiunge record

file_hash = hashlib.sha256(content).hexdigest()
vorn_path = store / (file_hash + ".vorn")
meta      = read_vorn_header(vorn_path)
records   = meta.get("records", [])

R.check("due record nel file dopo due sessioni diverse", len(records) == 2,
        expected=2, got=len(records))
R.check("primo record: sessione-alpha",  records[0].get("session") == "sessione-alpha")
R.check("secondo record: sessione-beta", records[1].get("session") == "sessione-beta")
R.check("timestamps in ordine crescente", records[0]["ts"] <= records[1]["ts"])
R.check("path diversi nei due record",
        records[0]["path"] != records[1]["path"])
R.check("path alpha corretto", records[0]["path"] == str(src_alpha))
R.check("path beta corretto",  records[1]["path"] == str(src_beta))

shutil.rmtree(src_alpha)
shutil.rmtree(src_beta)

# ==========================================================================
R.section("7. INTEGRITA")
# ==========================================================================

all_valid = True
checked   = 0
for vorn_path in store.glob("*.vorn"):
    raw = vorn_path.read_bytes()
    if SEPARATOR not in raw:
        R.check(f"separatore presente in {vorn_path.name[:12]}...", False)
        all_valid = False
        continue
    content = raw[raw.index(SEPARATOR) + len(SEPARATOR):]
    actual  = hashlib.sha256(content).hexdigest()
    if actual != vorn_path.stem:
        all_valid = False
    checked += 1

R.check(f"hash coerente con contenuto in tutti i {checked} file .vorn", all_valid)

# ==========================================================================
R.section("8. FILE BINARI E TIPI DIVERSI")
# ==========================================================================

src = tmp / "tipi"
src.mkdir()

types = {
    "documento.txt":  b"Testo semplice " * 10,
    "dati.json":      json.dumps({"key": "value", "num": 42}).encode(),
    "binario.bin":    bytes(range(256)) * 100,
    "vuoto.txt":      b"",
    "grande.bin":     b"G" * 50000,
}

before = len(list(store.glob("*.vorn")))
for name, content in types.items():
    (src / name).write_bytes(content)

backup(str(src), dst, session="tipi-vari")
after = len(list(store.glob("*.vorn")))

non_empty_types = sum(1 for c in types.values() if len(c) > 0)
R.check(f"tutti i file non vuoti backuppati ({non_empty_types})",
        after - before >= non_empty_types,
        expected=f">={before+non_empty_types}", got=after)

# verifica restore di ciascuno
for name, content in types.items():
    if len(content) == 0:
        continue
    (src / name).unlink()

restore(str(src), dst)

for name, content in types.items():
    if len(content) == 0:
        continue
    restored_ok = (src / name).exists() and (src / name).read_bytes() == content
    R.check(f"restore corretto: {name}", restored_ok)

shutil.rmtree(src)

# ==========================================================================
R.section("9. QUERY PER PATH E MACCHINA")
# ==========================================================================

src_q = tmp / "query_test"
src_q.mkdir()
(src_q / "file1.txt").write_bytes(b"Query test 1")
(src_q / "file2.txt").write_bytes(b"Query test 2")
backup(str(src_q), dst, session="query-session")

# simula query: dammi tutti i file del path src_q
risultati = []
for vorn_path in store.glob("*.vorn"):
    meta = read_vorn_header(vorn_path)
    for r in meta.get("records", []):
        if r.get("path") == str(src_q):
            risultati.append(r.get("name"))

R.check("query per path restituisce 2 file", len(risultati) == 2,
        expected=2, got=len(risultati))
R.check("file1.txt trovato nella query", "file1.txt" in risultati)
R.check("file2.txt trovato nella query", "file2.txt" in risultati)

# query per sessione
risultati_sessione = []
for vorn_path in store.glob("*.vorn"):
    meta = read_vorn_header(vorn_path)
    for r in meta.get("records", []):
        if r.get("session") == "query-session":
            risultati_sessione.append(r.get("name"))

R.check("query per sessione restituisce file corretti",
        "file1.txt" in risultati_sessione and "file2.txt" in risultati_sessione)

shutil.rmtree(src_q)

# -- Cleanup e Report finale ---------------------------------------------

shutil.rmtree(tmp)
ok = R.summary()
sys.exit(0 if ok else 1)
