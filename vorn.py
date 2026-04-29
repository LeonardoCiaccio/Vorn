import os
import sys
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path

from hash_vorn import vorn_fingerprint

# separatore ufficiale del protocollo Vorn
# VORN in ASCII + sequenza nulla/non-nulla — impossibile in JSON UTF-8 valido
SEPARATOR = b'\x56\x4F\x52\x4E\xFF\x00\xFF\x00'


def store_dir(destination: str) -> Path:
    return Path(destination).resolve() / "store"


def init(destination: str):
    store_dir(destination).mkdir(parents=True, exist_ok=True)


def hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def write_vorn(store_path: Path, metadata: dict, content: bytes):
    header_bytes = json.dumps(metadata, ensure_ascii=False).encode("utf-8")
    with open(store_path, "wb") as f:
        f.write(header_bytes)
        f.write(SEPARATOR)
        f.write(content)


def read_vorn_header(store_path: Path) -> dict:
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


def read_vorn(store_path: Path):
    with open(store_path, "rb") as f:
        buffer = b""
        while True:
            chunk = f.read(4096)
            if not chunk:
                raise ValueError(f"Separatore non trovato in {store_path}")
            buffer += chunk
            if SEPARATOR in buffer:
                sep_pos = buffer.index(SEPARATOR)
                meta    = json.loads(buffer[:sep_pos].decode("utf-8"))
                content = buffer[sep_pos + len(SEPARATOR):] + f.read()
                return meta, content


def update_vorn_records(store_path: Path, new_record: dict):
    meta, content = read_vorn(store_path)
    meta["records"].append(new_record)
    write_vorn(store_path, meta, content)


def find_latest_in_store(store: Path, source: Path, rel: str):
    latest_meta  = None
    latest_ts    = None
    latest_path  = None

    for vorn_path in store.glob("*.vorn"):
        try:
            meta = read_vorn_header(vorn_path)
        except Exception:
            continue
        for record in meta.get("records", []):
            if record.get("path") == str(source) and record.get("name") == rel:
                if latest_ts is None or record["ts"] > latest_ts:
                    latest_ts   = record["ts"]
                    latest_meta = meta
                    latest_path = vorn_path
    return latest_meta, latest_path


def backup(source_str: str, destination: str, session: str = None):
    source = Path(source_str).resolve()
    if not source.exists():
        print(f"Errore: cartella non trovata -> {source}")
        return

    init(destination)
    store   = store_dir(destination)
    machine = os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "unknown"
    new_files = 0
    deduped   = 0
    unchanged = 0

    for file_path in sorted(source.rglob("*")):
        if not file_path.is_file():
            continue

        rel = str(file_path.relative_to(source))
        fp  = vorn_fingerprint(file_path)

        latest_meta, _ = find_latest_in_store(store, source, rel)
        if latest_meta:
            last_record = max(
                (r for r in latest_meta["records"] if r.get("path") == str(source) and r.get("name") == rel),
                key=lambda r: r["ts"]
            )
            if last_record.get("fingerprint") == fp:
                unchanged += 1
                continue

        file_hash  = hash_file(file_path)
        store_path = store / (file_hash + ".vorn")
        record     = {
            "name":        rel,
            "ts":          datetime.now(timezone.utc).isoformat(),
            "session":     session,
            "machine":     machine,
            "path":        str(source),
            "fingerprint": fp,
        }

        if store_path.exists():
            update_vorn_records(store_path, record)
            deduped += 1
        else:
            content  = file_path.read_bytes()
            metadata = {
                "hash":    file_hash,
                "bytes":   len(content),
                "records": [record],
            }
            write_vorn(store_path, metadata, content)
            new_files += 1

    print(f"\nBackup completato: {source}")
    print(f"  Destinazione      : {store}")
    print(f"  Nuovi nello store : {new_files}")
    print(f"  Deduplicati       : {deduped}")
    print(f"  Non modificati    : {unchanged}")


def status(source_str: str, destination: str):
    source = Path(source_str).resolve()
    init(destination)
    store  = store_dir(destination)

    files = {}
    for vorn_path in store.glob("*.vorn"):
        try:
            meta = read_vorn_header(vorn_path)
        except Exception:
            continue
        for record in meta.get("records", []):
            if record.get("path") != str(source):
                continue
            name = record["name"]
            if name not in files:
                files[name] = []
            files[name].append(record)

    if not files:
        print("Nessun backup trovato per questa cartella.")
        return

    print(f"\nSorgente : {source}")
    print(f"Tracciati: {len(files)} file\n")

    for name, records in sorted(files.items()):
        records.sort(key=lambda x: x["ts"])
        last = records[-1]
        print(f"  {name}")
        print(f"    versioni: {len(records)}  |  ultimo: {last['ts']}  |  sessione: {last.get('session') or '-'}")


def restore(source_str: str, destination: str, at: str = None):
    source    = Path(source_str).resolve()
    init(destination)
    store     = store_dir(destination)
    target_ts = datetime.fromisoformat(at) if at else None

    files = {}
    for vorn_path in store.glob("*.vorn"):
        try:
            meta = read_vorn_header(vorn_path)
        except Exception:
            continue
        for record in meta.get("records", []):
            if record.get("path") != str(source):
                continue
            if target_ts and datetime.fromisoformat(record["ts"]) > target_ts:
                continue
            name = record["name"]
            if name not in files or record["ts"] > files[name][0]["ts"]:
                files[name] = (record, meta["hash"])

    if not files:
        print("Nessun backup trovato per questa cartella.")
        return

    restored = 0
    for name, (record, file_hash) in files.items():
        _, content = read_vorn(store / (file_hash + ".vorn"))
        dest = source / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        restored += 1

    print(f"\nRestore completato: {source}")
    print(f"  File ripristinati : {restored}")


def inspect(hash_str: str, destination: str):
    store_path = store_dir(destination) / (hash_str + ".vorn")
    if not store_path.exists():
        print(f"File non trovato: {hash_str}.vorn")
        return
    meta = read_vorn_header(store_path)
    print(json.dumps(meta, indent=2, ensure_ascii=False))


def main():
    if len(sys.argv) < 4:
        print("Uso:")
        print("  python vorn.py backup  <cartella> <destinazione> [--session nome]")
        print("  python vorn.py restore <cartella> <destinazione> [--at 'YYYY-MM-DDTHH:MM:SS+00:00']")
        print("  python vorn.py status  <cartella> <destinazione>")
        print("  python vorn.py inspect <hash>    <destinazione>")
        return

    cmd  = sys.argv[1]
    arg  = sys.argv[2]
    dest = sys.argv[3]

    if cmd == "backup":
        session = None
        if "--session" in sys.argv:
            session = sys.argv[sys.argv.index("--session") + 1]
        backup(arg, dest, session)
    elif cmd == "restore":
        at = None
        if "--at" in sys.argv:
            at = sys.argv[sys.argv.index("--at") + 1]
        restore(arg, dest, at)
    elif cmd == "status":
        status(arg, dest)
    elif cmd == "inspect":
        inspect(arg, dest)
    else:
        print(f"Comando sconosciuto: {cmd}")


if __name__ == "__main__":
    main()
