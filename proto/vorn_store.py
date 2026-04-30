from pathlib import Path
from vorn_format import write_vorn, read_vorn, upsert_path


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


def add_path(store: Path, hash_vorn: str, run_ts: str, path_entry: dict, session: str, machine: str):
    upsert_path(_path(store, hash_vorn), run_ts, path_entry, session, machine)
