import json
from pathlib import Path

SEPARATOR = b'\x56\x4F\x52\x4E\xFF\x00\xFF\x00'
HEADER_READ_LIMIT = 65536


def write_vorn(path: Path, metadata: dict, content: bytes):
    header = json.dumps(metadata, ensure_ascii=False).encode("utf-8")
    with open(path, "wb") as f:
        f.write(header)
        f.write(SEPARATOR)
        f.write(content)


def read_header(path: Path) -> dict:
    with open(path, "rb") as f:
        buffer = b""
        while len(buffer) < HEADER_READ_LIMIT:
            chunk = f.read(4096)
            if not chunk:
                break
            buffer += chunk
            if SEPARATOR in buffer:
                return json.loads(buffer[:buffer.index(SEPARATOR)].decode("utf-8"))
    raise ValueError(f"Separatore non trovato in {path}")


def read_vorn(path: Path):
    with open(path, "rb") as f:
        buffer = b""
        while True:
            chunk = f.read(4096)
            if not chunk:
                raise ValueError(f"Separatore non trovato in {path}")
            buffer += chunk
            if SEPARATOR in buffer:
                sep_pos = buffer.index(SEPARATOR)
                meta    = json.loads(buffer[:sep_pos].decode("utf-8"))
                content = buffer[sep_pos + len(SEPARATOR):] + f.read()
                return meta, content


def append_record(path: Path, record: dict):
    meta, content = read_vorn(path)
    meta["records"].append(record)
    write_vorn(path, meta, content)
