from pathlib import Path
from vorn_format import write_vorn, read_vorn, append_record


def _path(store: Path, hash_vorn: str) -> Path:
    return store / f"{hash_vorn}.vorn"


def exists(store: Path, hash_vorn: str) -> bool:
    return _path(store, hash_vorn).exists()


def put(store: Path, hash_vorn: str, metadata: dict, content: bytes):
    store.mkdir(parents=True, exist_ok=True)
    write_vorn(_path(store, hash_vorn), metadata, content)


def get(store: Path, hash_vorn: str) -> bytes:
    _, content = read_vorn(_path(store, hash_vorn))
    return content


def update_records(store: Path, hash_vorn: str, record: dict):
    append_record(_path(store, hash_vorn), record)
