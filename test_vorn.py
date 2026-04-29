import sys
import json
import shutil
import hashlib
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hash_vorn import vorn_fingerprint
from vorn import backup, restore, store_dir, read_vorn_header, hash_file

# ── helpers ────────────────────────────────────────────────────────────────

results = []

def check(label, condition, detail=""):
    icon = "  PASS" if condition else "  FAIL"
    line = f"{icon}  {label}"
    if detail:
        line += f"\n         {detail}"
    print(line)
    results.append((label, condition))

def vorn_files(store):
    return list(store.glob("*.vorn"))

def read_header(path):
    return read_vorn_header(path)

# ── setup ──────────────────────────────────────────────────────────────────

tmp   = Path(tempfile.mkdtemp(prefix="vorn_test_"))
src_a = tmp / "progetto_a"
src_b = tmp / "progetto_b"
dest  = str(tmp / "vornstore")   # destinazione store — store_dir aggiunge /store
store = store_dir(dest)

src_a.mkdir()
src_b.mkdir()

print(f"\nCartella temporanea: {tmp}")
print(f"Store: {store}\n")
print("=" * 60)

# ══════════════════════════════════════════════════════════════════════════
print("\n[1] PRIMO BACKUP - file nuovi")
# ══════════════════════════════════════════════════════════════════════════

small = src_a / "piccolo.txt"
big   = src_a / "grande.txt"
small.write_bytes(b"Ciao Vorn!")     # 10 byte - small file
big.write_bytes(b"X" * 500)          # 500 byte - sampled

backup(str(src_a), dest)

check("2 file nello store dopo primo backup", len(vorn_files(store)) == 2)

meta_small = next(
    read_header(f) for f in store.glob("*.vorn")
    if any(r.get("name") == "piccolo.txt" for r in read_header(f).get("records", []))
)
first_record = meta_small["records"][0]
check("file piccolo usa modalita full",    "full" in first_record.get("fingerprint", ""))
check("fingerprint presente nei record",   "fingerprint" in first_record)

# ══════════════════════════════════════════════════════════════════════════
print("\n[2] SECONDO BACKUP - nessuna modifica")
# ══════════════════════════════════════════════════════════════════════════

before = len(vorn_files(store))
backup(str(src_a), dest)
after  = len(vorn_files(store))

check("nessun nuovo file scritto nello store", before == after,
      f"prima: {before}  dopo: {after}")

# ══════════════════════════════════════════════════════════════════════════
print("\n[3] MODIFICA FILE - nuova versione nello store")
# ══════════════════════════════════════════════════════════════════════════

small.write_bytes(b"Ciao Vorn! Modificato.")
before = len(vorn_files(store))
backup(str(src_a), dest)
after  = len(vorn_files(store))

check("un nuovo .vorn scritto per il file modificato", after == before + 1,
      f"prima: {before}  dopo: {after}")

# ══════════════════════════════════════════════════════════════════════════
print("\n[4] RIPRISTINO CONTENUTO ORIGINALE - deduplicazione")
# ══════════════════════════════════════════════════════════════════════════

small.write_bytes(b"Ciao Vorn!")    # torno all'originale
before = len(vorn_files(store))
backup(str(src_a), dest)
after  = len(vorn_files(store))

check("nessun nuovo .vorn - contenuto gia in store", before == after,
      f"prima: {before}  dopo: {after}")

# ══════════════════════════════════════════════════════════════════════════
print("\n[5] DEDUPLICAZIONE CROSS-PROGETTO")
# ══════════════════════════════════════════════════════════════════════════

(src_b / "piccolo.txt").write_bytes(b"Ciao Vorn!")   # identico a src_a

before = len(vorn_files(store))
backup(str(src_b), dest)
after  = len(vorn_files(store))

check("file identico da progetto B non duplicato", before == after,
      f"prima: {before}  dopo: {after}")

# ══════════════════════════════════════════════════════════════════════════
print("\n[6] STESSO NOME, CONTENUTO DIVERSO")
# ══════════════════════════════════════════════════════════════════════════

(src_b / "grande.txt").write_bytes(b"Y" * 500)    # stesso nome di src_a, contenuto diverso
before = len(vorn_files(store))
backup(str(src_b), dest)
after  = len(vorn_files(store))

check("file con stesso nome ma contenuto diverso aggiunto", after == before + 1,
      f"prima: {before}  dopo: {after}")

# ══════════════════════════════════════════════════════════════════════════
print("\n[7] RESTORE - ricostruzione cartella")
# ══════════════════════════════════════════════════════════════════════════

# scriviamo un contenuto nuovo e unico, poi cancelliamo e ripristiniamo
unique = src_a / "unico.txt"
unique.write_bytes(b"Contenuto unico per il restore test 12345")
backup(str(src_a), dest)

unique.unlink()
big.unlink()

check("file cancellati prima del restore", not unique.exists() and not big.exists())

restore(str(src_a), dest)

check("unico.txt ripristinato", unique.exists())
check("grande.txt ripristinato", big.exists())
check("contenuto unico.txt corretto", unique.read_bytes() == b"Contenuto unico per il restore test 12345")
check("contenuto grande.txt corretto", big.read_bytes() == b"X" * 500)

# ══════════════════════════════════════════════════════════════════════════
print("\n[8] INTEGRITA - hash nel nome == hash del contenuto")
# ══════════════════════════════════════════════════════════════════════════

SEPARATOR = b'\x56\x4F\x52\x4E\xFF\x00\xFF\x00'
all_valid = True
for vorn_path in store.glob("*.vorn"):
    with open(vorn_path, "rb") as f:
        data = f.read()
    if SEPARATOR not in data:
        all_valid = False
        print(f"         SEPARATORE MANCANTE: {vorn_path.name}")
        continue
    content = data[data.index(SEPARATOR) + len(SEPARATOR):]
    actual  = hashlib.sha256(content).hexdigest()
    if actual != vorn_path.stem:
        all_valid = False
        print(f"         CORROTTO: {vorn_path.name}")

check("tutti i .vorn hanno hash coerente con il contenuto", all_valid)

# ══════════════════════════════════════════════════════════════════════════
print("\n[9] FINGERPRINT - small vs large")
# ══════════════════════════════════════════════════════════════════════════

fp_small = vorn_fingerprint(small)
fp_big   = vorn_fingerprint(big)

check("file piccolo (<=104b) usa modalita full",    ":full:" in fp_small)
check("file grande (>104b) usa modalita campioni",  ":full:" not in fp_big)

# ══════════════════════════════════════════════════════════════════════════
print("\n[10] FINGERPRINT - file vuoto")
# ══════════════════════════════════════════════════════════════════════════

empty = src_a / "vuoto.txt"
empty.write_bytes(b"")
check("file vuoto gestito correttamente", vorn_fingerprint(empty) == "0:empty")

# ══════════════════════════════════════════════════════════════════════════
print("\n[11] FILE BINARIO - immagine/video simulato")
# ══════════════════════════════════════════════════════════════════════════

binary = src_a / "binario.bin"
binary.write_bytes(bytes(range(256)) * 400)    # 102400 byte, pattern binario
before = len(vorn_files(store))
backup(str(src_a), dest)
after  = len(vorn_files(store))

check("file binario backuppato correttamente", after > before)

binary_meta = next(
    read_header(f) for f in store.glob("*.vorn")
    if any(r.get("name") == "binario.bin" for r in read_header(f).get("records", []))
)
binary_record = binary_meta["records"][0]
check("file binario usa modalita campioni",   ":full:" not in binary_record.get("fingerprint", ""))
check("hash binario verificabile",
      hashlib.sha256(binary.read_bytes()).hexdigest() == binary_meta["hash"])

# ── riepilogo ──────────────────────────────────────────────────────────────

print("\n" + "=" * 60)
passed = sum(1 for _, ok in results if ok)
failed = sum(1 for _, ok in results if not ok)
print(f"\nRisultato: {passed} PASS  |  {failed} FAIL\n")

if failed:
    print("Falliti:")
    for label, ok in results:
        if not ok:
            print(f"  - {label}")

shutil.rmtree(tmp)
