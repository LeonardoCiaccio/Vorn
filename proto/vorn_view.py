import sys
from pathlib import Path
import vorn_format

def view(vorn_path: str):
    path = Path(vorn_path).resolve()
    if not path.exists():
        print(f"File non trovato: {path}")
        return

    try:
        # Usiamo read_header che ora sa gestire il formato in coda
        meta = vorn_format.read_header(path)
        
        # Per avere info sulla dimensione, leggiamo l'header internamente
        with open(path, "rb") as f:
            content_size = vorn_format._get_content_info(f)
        
        total_size = path.stat().st_size
        header_plus_content = vorn_format.HEADER_SIZE + content_size
        meta_size = total_size - header_plus_content - len(vorn_format.SEPARATOR)

        print(f"\n  hash_vorn   : {meta.get('hash_vorn')}")
        print(f"  bytes dati  : {content_size} (dichiarati: {meta.get('bytes')})")
        print(f"  meta size   : {meta_size} bytes")
        print(f"  totale file : {total_size} bytes")
        print(f"  records     : {len(meta.get('records', []))}")

        print(f"\n  --- STORIA ---")
        for i, r in enumerate(meta.get("records", []), 1):
            ts = r.get('ts', '?').replace('T', ' ')
            print(f"\n  [{i}]  {ts}  sessione: {r.get('session')}  macchina: {r.get('machine')}")
            for p in r.get("paths", []):
                print(f"    -> {p.get('name')}  ({p.get('path')})")

    except Exception as e:
        print(f"Errore nella lettura del file: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python vorn_view.py <file.vorn>")
        sys.exit(1)
    view(sys.argv[1])
