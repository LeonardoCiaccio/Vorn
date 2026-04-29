import hashlib
from pathlib import Path

SAMPLE_COUNT = 13
SAMPLE_SIZE  = 8
SMALL_FILE   = SAMPLE_COUNT * SAMPLE_SIZE  # 104 byte


def vorn_fingerprint(path: Path) -> str:
    size = path.stat().st_size

    if size == 0:
        return "0:empty"

    with open(path, "rb") as f:
        if size <= SMALL_FILE:
            return f"{size}:full:{f.read().hex()}"

        samples = []
        for i in range(SAMPLE_COUNT):
            pos = int(size * i / SAMPLE_COUNT)
            f.seek(pos)
            samples.append(f.read(SAMPLE_SIZE).hex())

    return f"{size}:{':'.join(samples)}"


def vorn_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
