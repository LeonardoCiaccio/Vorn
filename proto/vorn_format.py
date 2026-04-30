import json
import struct
from pathlib import Path

MAGIC = b'VORN'
SEPARATOR = b'\xFF\x00\xFF\x00'
HEADER_STRUCT = ">4sQ"  # VORN (4s) + Length (Q = uint64)
HEADER_SIZE = struct.calcsize(HEADER_STRUCT)

def write_vorn(path: Path, metadata: dict, content: bytes):
    content_len = len(content)
    header = struct.pack(HEADER_STRUCT, MAGIC, content_len)
    meta_json = json.dumps(metadata, ensure_ascii=False).encode("utf-8")
    
    with open(path, "wb") as f:
        f.write(header)
        f.write(content)
        f.write(SEPARATOR)
        f.write(meta_json)

def _get_content_info(f):
    f.seek(0)
    data = f.read(HEADER_SIZE)
    if len(data) < HEADER_SIZE:
        raise ValueError("File troppo piccolo per contenere l'header VORN")
    magic, content_len = struct.unpack(HEADER_STRUCT, data)
    if magic != MAGIC:
        raise ValueError("Firma VORN non trovata")
    return content_len

def read_header(path: Path) -> dict:
    with open(path, "rb") as f:
        content_len = _get_content_info(f)
        # Il separatore inizia dopo il contenuto
        f.seek(HEADER_SIZE + content_len)
        sep = f.read(len(SEPARATOR))
        if sep != SEPARATOR:
            raise ValueError(f"Separatore non trovato alla posizione attesa in {path}")
        return json.loads(f.read().decode("utf-8"))

def read_vorn(path: Path):
    with open(path, "rb") as f:
        content_len = _get_content_info(f)
        content = f.read(content_len)
        sep = f.read(len(SEPARATOR))
        if sep != SEPARATOR:
            raise ValueError(f"Separatore non trovato in {path}")
        meta = json.loads(f.read().decode("utf-8"))
        return meta, content

def upsert_path(path: Path, run_ts: str, path_entry: dict, session: str, machine: str):
    with open(path, "r+b") as f:
        content_len = _get_content_info(f)
        
        # Posizioniamoci dove dovrebbe esserci il separatore
        meta_pos = HEADER_SIZE + content_len
        f.seek(meta_pos)
        sep = f.read(len(SEPARATOR))
        
        if sep != SEPARATOR:
             # Se per qualche motivo il separatore non è lì, dobbiamo cercarlo o dare errore
             raise ValueError(f"Integrità file compromessa: separatore non trovato in {path}")
        
        # Leggiamo i vecchi metadati (il resto del file)
        old_meta = json.loads(f.read().decode("utf-8"))
        
        # Aggiorniamo i metadati
        updated = False
        for record in old_meta["records"]:
            if record["ts"] == run_ts:
                record["paths"].append(path_entry)
                updated = True
                break
        
        if not updated:
            old_meta["records"].append({
                "ts":      run_ts,
                "session": session,
                "machine": machine,
                "paths":   [path_entry],
            })

        # OPERAZIONE CHIRURGICA
        new_meta_json = json.dumps(old_meta, ensure_ascii=False).encode("utf-8")
        
        f.seek(meta_pos)
        f.truncate() # "Sottraiamo" i vecchi meta (taglio chirurgico)
        f.write(SEPARATOR)
        f.write(new_meta_json) # "Sommiamo" i nuovi meta
