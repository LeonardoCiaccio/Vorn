from pathlib import Path
from vorn_format import write_vorn, read_vorn, append_record


def _path(store: Path, hash: str) -> Path:
    return store / f"{hash}.vorn"


def exists(store: Path, hash: str) -> bool:
    return _path(store, hash).exists()


def put(store: Path, hash: str, metadata: dict, content: bytes):
    store.mkdir(parents=True, exist_ok=True)
    write_vorn(_path(store, hash), metadata, content)


def get(store: Path, hash: str) -> bytes:
    _, content = read_vorn(_path(store, hash))
    return content


def update_records(store: Path, hash: str, record: dict):
    append_record(_path(store, hash), record)
