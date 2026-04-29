import sys
import json
from pathlib import Path

SEPARATOR = b'\x56\x4F\x52\x4E\xFF\x00\xFF\x00'


def extract(vorn_path: str, destination: str):
    path = Path(vorn_path).resolve()
    dest = Path(destination).resolve()

    if not path.exists():
        print(f"File non trovato: {path}")
        return

    with open(path, "rb") as f:
        buffer = b""
        while True:
            chunk = f.read(4096)
            if not chunk:
                print("Separatore non trovato — file corrotto.")
                return
            buffer += chunk
            if SEPARATOR in buffer:
                sep_pos = buffer.index(SEPARATOR)
                meta    = json.loads(buffer[:sep_pos].decode("utf-8"))
                content = buffer[sep_pos + len(SEPARATOR):] + f.read()
                break

    last_record   = sorted(meta.get("records", []), key=lambda r: r["ts"])[-1]
    original_name = Path(last_record["name"]).name

    dest.mkdir(parents=True, exist_ok=True)
    output_path = dest / original_name
    output_path.write_bytes(content)

    print(f"  estratto  : {original_name}")
    print(f"  salvato in: {output_path}")
    print(f"  bytes     : {len(content)}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python vorn_extract.py <file.vorn> <destinazione>")
        sys.exit(1)
    extract(sys.argv[1], sys.argv[2])
