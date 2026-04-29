import sys
import json
from pathlib import Path

SEPARATOR = b'\x56\x4F\x52\x4E\xFF\x00\xFF\x00'


def read_header(store_path: Path) -> dict:
    with open(store_path, "rb") as f:
        buffer = b""
        while len(buffer) < 65536:
            chunk = f.read(4096)
            if not chunk:
                break
            buffer += chunk
            if SEPARATOR in buffer:
                return json.loads(buffer[:buffer.index(SEPARATOR)].decode("utf-8"))
    raise ValueError(f"Separatore non trovato in {store_path}")


def scan(destination: str):
    store = Path(destination).resolve() / "store"
    if not store.exists():
        print(f"Store non trovato: {store}")
        return

    records_all = []
    for vorn_path in store.glob("*.vorn"):
        try:
            meta = read_header(vorn_path)
            for record in meta.get("records", []):
                records_all.append({**record, "_hash": meta.get("hash", "?"), "_bytes": meta.get("bytes", 0)})
        except Exception as e:
            print(f"  Errore su {vorn_path.name}: {e}")

    if not records_all:
        print("Store vuoto.")
        return

    records_all.sort(key=lambda x: (x.get("path", ""), x.get("name", ""), x.get("ts", "")))

    current_source = None
    for r in records_all:
        source = r.get("path", "?")
        if source != current_source:
            current_source = source
            print(f"\nSORGENTE: {source}")
            print("-" * 60)

        print(f"  file     : {r.get('name')}")
        print(f"  hash     : {r.get('_hash', '?')[:16]}...")
        print(f"  ts       : {r.get('ts')}")
        print(f"  sessione : {r.get('session') or '-'}")
        print(f"  macchina : {r.get('machine')}")
        print(f"  bytes    : {r.get('_bytes')}")
        print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python vorn_read.py <destinazione>")
        sys.exit(1)
    scan(sys.argv[1])
