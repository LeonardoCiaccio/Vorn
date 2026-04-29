import sys
import json
import hashlib
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from vorn_format import write_vorn, read_header, read_vorn, append_record, SEPARATOR

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


tmp  = Path(tempfile.mkdtemp(prefix="test_format_"))
vorn = tmp / "test.vorn"

meta = {
    "hash":    "abc123",
    "bytes":   11,
    "records": [{"name": "hello.txt", "ts": "2026-04-29T10:00:00+00:00"}]
}
content = b"Hello Vorn!"


# --- write_vorn --------------------------------------------------------------

print("\nwrite_vorn")

write_vorn(vorn, meta, content)
check("file .vorn creato", vorn.exists())

raw = vorn.read_bytes()
check("separatore presente nel file", SEPARATOR in raw)

sep_pos = raw.index(SEPARATOR)
check("header precede il separatore", sep_pos > 0)
check("contenuto segue il separatore", raw[sep_pos + len(SEPARATOR):] == content)

header_bytes = raw[:sep_pos]
parsed = json.loads(header_bytes.decode("utf-8"))
check("header e' JSON valido", parsed == meta)

check("separatore e' esattamente 8 byte", len(SEPARATOR) == 8)
check("separatore contiene VORN in ASCII", SEPARATOR[:4] == b"VORN")


# --- read_header -------------------------------------------------------------

print("\nread_header")

h = read_header(vorn)
check("read_header restituisce dict", isinstance(h, dict))
check("campo hash corretto", h.get("hash") == "abc123")
check("campo bytes corretto", h.get("bytes") == 11)
check("campo records presente", isinstance(h.get("records"), list))
check("read_header non carica il contenuto (file piccolo ok)", True)

vorn_large = tmp / "large.vorn"
large_content = b"X" * 200000
write_vorn(vorn_large, meta, large_content)
h2 = read_header(vorn_large)
check("read_header su file grande legge solo header", h2.get("hash") == "abc123")


# --- read_vorn ---------------------------------------------------------------

print("\nread_vorn")

m, c = read_vorn(vorn)
check("read_vorn restituisce meta e contenuto", isinstance(m, dict) and isinstance(c, bytes))
check("contenuto corretto", c == content)
check("meta corretto", m.get("hash") == "abc123")

m2, c2 = read_vorn(vorn_large)
check("read_vorn su file grande: contenuto integro", c2 == large_content)

vorn_bin = tmp / "binary.vorn"
bin_content = bytes(range(256)) * 100
write_vorn(vorn_bin, meta, bin_content)
_, c3 = read_vorn(vorn_bin)
check("contenuto binario round-trip senza alterazioni", c3 == bin_content)

vorn_empty = tmp / "empty.vorn"
write_vorn(vorn_empty, meta, b"")
_, c4 = read_vorn(vorn_empty)
check("contenuto vuoto round-trip", c4 == b"")

vorn_unicode = tmp / "unicode.vorn"
meta_unicode = {"hash": "xyz", "bytes": 0, "records": [{"name": "ciaoà.txt"}]}
write_vorn(vorn_unicode, meta_unicode, b"")
h_u = read_header(vorn_unicode)
check("caratteri UTF-8 nell'header preservati", h_u["records"][0]["name"] == "ciaoà.txt")


# --- append_record -----------------------------------------------------------

print("\nappend_record")

vorn_rec = tmp / "records.vorn"
write_vorn(vorn_rec, {"hash": "r1", "bytes": 5, "records": [{"ts": "T1", "session": "s1"}]}, b"ciao!")

append_record(vorn_rec, {"ts": "T2", "session": "s2"})
m3, c5 = read_vorn(vorn_rec)
check("dopo append_record ci sono 2 records", len(m3["records"]) == 2)
check("primo record invariato", m3["records"][0]["session"] == "s1")
check("secondo record aggiunto correttamente", m3["records"][1]["session"] == "s2")
check("contenuto invariato dopo append_record", c5 == b"ciao!")

append_record(vorn_rec, {"ts": "T3", "session": "s3"})
m4, _ = read_vorn(vorn_rec)
check("doppio append: 3 records totali", len(m4["records"]) == 3)

vorn_large_rec = tmp / "large_rec.vorn"
write_vorn(vorn_large_rec, {"hash": "big", "bytes": len(large_content), "records": [{"ts": "T0"}]}, large_content)
append_record(vorn_large_rec, {"ts": "T1", "session": "s_large"})
m5, c6 = read_vorn(vorn_large_rec)
check("append_record su file grande: contenuto integro", c6 == large_content)
check("append_record su file grande: 2 records", len(m5["records"]) == 2)


# --- report ------------------------------------------------------------------

shutil.rmtree(tmp)

total = PASS + FAIL
esito = "OK" if FAIL == 0 else f"{FAIL} FAIL"
print(f"\n{'='*50}")
print(f"  vorn_format.py  {PASS}/{total} PASS  [{esito}]")
print(f"{'='*50}\n")
sys.exit(0 if FAIL == 0 else 1)
