import sys
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from vorn_store import exists, put, get, update_records

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


tmp   = Path(tempfile.mkdtemp(prefix="test_store_"))
store = tmp / "mystore"

HASH    = "a" * 64
meta    = {"hash": HASH, "bytes": 5, "records": [{"ts": "T1", "session": "s1"}]}
content = b"ciao!"


# --- exists ------------------------------------------------------------------

print("\nexists")

check("file non ancora presente -> False", not exists(store, HASH))

put(store, HASH, meta, content)
check("dopo put -> True", exists(store, HASH))

check("hash diverso -> False", not exists(store, "b" * 64))


# --- put ---------------------------------------------------------------------

print("\nput")

vorn_path = store / f"{HASH}.vorn"
check("put crea il file .vorn nel path corretto", vorn_path.exists())

HASH2    = "c" * 64
content2 = bytes(range(256)) * 50
put(store, HASH2, {"hash": HASH2, "bytes": len(content2), "records": []}, content2)
check("put su secondo hash crea secondo file", (store / f"{HASH2}.vorn").exists())

store2 = tmp / "nonexistent" / "deep" / "store"
put(store2, HASH, meta, content)
check("put crea cartella store se non esiste", store2.exists())

HASH3 = "d" * 64
put(store, HASH3, {"hash": HASH3, "bytes": 0, "records": []}, b"")
check("put con contenuto vuoto crea file", (store / f"{HASH3}.vorn").exists())


# --- get ---------------------------------------------------------------------

print("\nget")

c = get(store, HASH)
check("get restituisce il contenuto corretto", c == content)

c2 = get(store, HASH2)
check("get su file binario grande: contenuto integro", c2 == content2)

c3 = get(store, HASH3)
check("get su contenuto vuoto", c3 == b"")


# --- update_records ----------------------------------------------------------

print("\nupdate_records")

update_records(store, HASH, {"ts": "T2", "session": "s2"})
from vorn_format import read_header
m = read_header(store / f"{HASH}.vorn")
check("update_records aggiunge il record", len(m["records"]) == 2)
check("primo record invariato", m["records"][0]["session"] == "s1")
check("secondo record corretto", m["records"][1]["session"] == "s2")

c_after = get(store, HASH)
check("contenuto invariato dopo update_records", c_after == content)

update_records(store, HASH, {"ts": "T3", "session": "s3"})
m2 = read_header(store / f"{HASH}.vorn")
check("secondo update_records: 3 records totali", len(m2["records"]) == 3)


# --- report ------------------------------------------------------------------

shutil.rmtree(tmp)

total = PASS + FAIL
esito = "OK" if FAIL == 0 else f"{FAIL} FAIL"
print(f"\n{'='*50}")
print(f"  vorn_store.py  {PASS}/{total} PASS  [{esito}]")
print(f"{'='*50}\n")
sys.exit(0 if FAIL == 0 else 1)
