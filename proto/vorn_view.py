import sys
import json
from pathlib import Path

SEPARATOR = b'\x56\x4F\x52\x4E\xFF\x00\xFF\x00'


def view(vorn_path: str):
    path = Path(vorn_path).resolve()
    if not path.exists():
        print(f"File non trovato: {path}")
        return

    with open(path, "rb") as f:
        buffer = b""
        while len(buffer) < 65536:
            chunk = f.read(4096)
            if not chunk:
                break
            buffer += chunk
            if SEPARATOR in buffer:
                sep_pos = buffer.index(SEPARATOR)
                meta    = json.loads(buffer[:sep_pos].decode("utf-8"))
                content_size = path.stat().st_size - sep_pos - len(SEPARATOR)

                print(f"\n  hash_vorn   : {meta.get('hash_vorn')}")
                print(f"  bytes dati  : {meta.get('bytes')}")
                print(f"  header size : {sep_pos} bytes")
                print(f"  totale file : {path.stat().st_size} bytes")
                print(f"  records     : {len(meta.get('records', []))}")

                print(f"\n  --- STORIA ---")
                for i, r in enumerate(meta.get("records", []), 1):
                    print(f"\n  [{i}]  {r.get('ts')}  sessione: {r.get('session')}  macchina: {r.get('machine')}")
                    for p in r.get("paths", []):
                        print(f"    -> {p.get('name')}  ({p.get('path')})")
                return

    print("Separatore non trovato — file corrotto.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python vorn_view.py <file.vorn>")
        sys.exit(1)
    view(sys.argv[1])
