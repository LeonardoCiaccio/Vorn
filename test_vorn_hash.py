import sys
import hashlib
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from vorn_hash import vorn_fingerprint, vorn_hash, SMALL_FILE

PASS = 0
FAIL = 0


def check(label, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS]  {label}")
    else:
        FAIL += 1
        print(f"  [FAIL]  {label}" + (f" — {detail}" if detail else ""))


tmp = Path(tempfile.mkdtemp(prefix="test_hash_"))


# --- vorn_fingerprint --------------------------------------------------------

print("\nvorn_fingerprint")

f_empty = tmp / "empty.bin"
f_empty.write_bytes(b"")
check("file vuoto -> '0:empty'", vorn_fingerprint(f_empty) == "0:empty")

f_small = tmp / "small.bin"
f_small.write_bytes(b"A" * 50)
fp = vorn_fingerprint(f_small)
check("file piccolo usa :full:", ":full:" in fp, fp)

f_edge = tmp / "edge.bin"
f_edge.write_bytes(b"Z" * SMALL_FILE)
fp = vorn_fingerprint(f_edge)
check(f"file esattamente {SMALL_FILE} byte (soglia) usa :full:", ":full:" in fp, fp)

f_over = tmp / "over.bin"
f_over.write_bytes(b"Z" * (SMALL_FILE + 1))
fp = vorn_fingerprint(f_over)
check(f"file {SMALL_FILE + 1} byte usa campioni", ":full:" not in fp, fp)

f_big = tmp / "big.bin"
f_big.write_bytes(b"X" * 10000)
f_copy = tmp / "copy.bin"
f_copy.write_bytes(b"X" * 10000)
check("file identici -> fingerprint identico",
      vorn_fingerprint(f_big) == vorn_fingerprint(f_copy))

f_diff = tmp / "diff.bin"
f_diff.write_bytes(b"Y" * 10000)
check("file diversi -> fingerprint diverso",
      vorn_fingerprint(f_big) != vorn_fingerprint(f_diff))

f_size = tmp / "sizeonly.bin"
f_size.write_bytes(b"X" * 10001)
check("file stesso contenuto, dimensione diversa -> fingerprint diverso",
      vorn_fingerprint(f_big) != vorn_fingerprint(f_size))

fp_big = vorn_fingerprint(f_big)
check("fingerprint include dimensione come prefisso",
      fp_big.startswith("10000:"))


# --- vorn_hash ---------------------------------------------------------------

print("\nvorn_hash")

f_txt = tmp / "hello.txt"
f_txt.write_bytes(b"Hello Vorn!")
expected = hashlib.sha256(b"Hello Vorn!").hexdigest()
check("hash corretto su file testo", vorn_hash(f_txt) == expected, vorn_hash(f_txt))

f_bin = tmp / "binary.bin"
f_bin.write_bytes(bytes(range(256)) * 100)
expected_bin = hashlib.sha256(bytes(range(256)) * 100).hexdigest()
check("hash corretto su file binario", vorn_hash(f_bin) == expected_bin)

f_a = tmp / "a.bin"
f_b = tmp / "b.bin"
f_a.write_bytes(b"stesso contenuto")
f_b.write_bytes(b"stesso contenuto")
check("file identici -> hash identico", vorn_hash(f_a) == vorn_hash(f_b))

f_c = tmp / "c.bin"
f_c.write_bytes(b"contenuto diverso")
check("file diversi -> hash diverso", vorn_hash(f_a) != vorn_hash(f_c))

f_empty2 = tmp / "empty2.bin"
f_empty2.write_bytes(b"")
check("file vuoto -> hash SHA-256 di stringa vuota",
      vorn_hash(f_empty2) == hashlib.sha256(b"").hexdigest())

f_large = tmp / "large.bin"
f_large.write_bytes(b"L" * 200000)
expected_large = hashlib.sha256(b"L" * 200000).hexdigest()
check("file grande (200KB) -> hash corretto", vorn_hash(f_large) == expected_large)

check("vorn_hash restituisce stringa da 64 caratteri hex",
      len(vorn_hash(f_txt)) == 64)

check("fingerprint e hash sono valori diversi",
      vorn_fingerprint(f_txt) != vorn_hash(f_txt))


# --- report ------------------------------------------------------------------

import shutil
shutil.rmtree(tmp)

total = PASS + FAIL
print(f"\n{'='*50}")
esito = "OK" if FAIL == 0 else f"{FAIL} FAIL"
print(f"  vorn_hash.py  {PASS}/{total} PASS  [{esito}]")
print(f"{'='*50}\n")
sys.exit(0 if FAIL == 0 else 1)
