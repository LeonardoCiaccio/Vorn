import sys
import struct
from pathlib import Path

SAMPLE_COUNT = 13
SAMPLE_SIZE  = 8  # byte per campione
SMALL_FILE   = SAMPLE_COUNT * SAMPLE_SIZE  # 104 byte — soglia minima


def vorn_fingerprint(path: Path) -> str:
    size = path.stat().st_size

    if size == 0:
        return "0:empty"

    with open(path, "rb") as f:

        if size <= SMALL_FILE:
            # file piccolo — contenuto intero come impronta, zero approssimazione
            return f"{size}:full:{f.read().hex()}"

        # file grande — 13 campioni distribuiti
        samples = []
        for i in range(SAMPLE_COUNT):
            pos = int(size * i / SAMPLE_COUNT)
            f.seek(pos)
            samples.append(f.read(SAMPLE_SIZE).hex())

    return f"{size}:{':'.join(samples)}"


def compare(path_a: str, path_b: str):
    a = Path(path_a).resolve()
    b = Path(path_b).resolve()

    if not a.exists():
        print(f"File non trovato: {a}")
        return
    if not b.exists():
        print(f"File non trovato: {b}")
        return

    fp_a = vorn_fingerprint(a)
    fp_b = vorn_fingerprint(b)

    print(f"\nFile A : {a.name}")
    print(f"File B : {b.name}")
    print(f"\nImpronta A : {fp_a}")
    print(f"Impronta B : {fp_b}")

    if fp_a == fp_b:
        print("\n  IDENTICI — stessa impronta")
    else:
        print("\n  DIVERSI — impronta differente")


def fingerprint(path_str: str):
    path = Path(path_str).resolve()
    if not path.exists():
        print(f"File non trovato: {path}")
        return

    fp = vorn_fingerprint(path)
    size = path.stat().st_size
    reads = min(SAMPLE_COUNT, 1) if size == 0 else SAMPLE_COUNT

    print(f"\nFile       : {path.name}")
    print(f"Dimensione : {size} bytes")
    print(f"Campioni   : {reads} x {SAMPLE_SIZE} byte")
    print(f"Impronta   : {fp}")


def main():
    if len(sys.argv) < 2:
        print("Uso:")
        print("  python hash_vorn.py fingerprint <file>")
        print("  python hash_vorn.py compare     <file_a> <file_b>")
        return

    cmd = sys.argv[1]

    if cmd == "fingerprint" and len(sys.argv) >= 3:
        fingerprint(sys.argv[2])
    elif cmd == "compare" and len(sys.argv) >= 4:
        compare(sys.argv[2], sys.argv[3])
    else:
        print(f"Argomenti mancanti per il comando: {cmd}")


if __name__ == "__main__":
    main()
