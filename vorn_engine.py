import os
from pathlib import Path

import vorn_manifest as manifest
import vorn_store    as store
from vorn_hash   import vorn_hash


def backup(manifests_dir: Path, session_name: str) -> dict:
    session    = manifest.load(manifests_dir, session_name)
    store_path = Path(session["store"])
    machine    = os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "unknown"
    run_ts     = manifest.open_run(manifests_dir, session_name)

    new_files = 0
    deduped   = 0
    errors    = []

    for source_str in session["sources"]:
        source = Path(source_str)
        files  = [source] if source.is_file() else sorted(source.rglob("*"))

        for file_path in files:
            if not file_path.is_file():
                continue

            rel = str(file_path.relative_to(source.parent) if source.is_file() else file_path.relative_to(source))

            try:
                h = vorn_hash(file_path)
            except Exception as e:
                errors.append({"file": str(file_path), "error": str(e)})
                continue

            path_entry = {"name": rel, "path": str(source)}

            if store.exists(store_path, h):
                store.add_path(store_path, h, run_ts, path_entry, session_name, machine)
                deduped += 1
            else:
                meta = {
                    "hash_vorn": h,
                    "bytes":     file_path.stat().st_size,
                    "records":   [{"ts": run_ts, "session": session_name, "machine": machine, "paths": [path_entry]}],
                }
                store.put(store_path, h, meta, file_path.read_bytes())
                new_files += 1

            manifest.add_file(manifests_dir, session_name, run_ts, rel, h, str(source), source.is_dir(), file_path.stat().st_mode)

    return {
        "session": session_name,
        "run_ts":  run_ts,
        "new":     new_files,
        "deduped": deduped,
        "errors":  errors,
    }


def restore(manifests_dir: Path, session_name: str, at: str = None) -> dict:
    store_path = manifest.get_store(manifests_dir, session_name)
    run        = manifest.get_run_at(manifests_dir, session_name, at=at)

    if run is None:
        return {"restored": 0, "errors": ["Nessun run trovato per la data richiesta"]}

    restored = 0
    errors   = []

    for filename, info in run["files"].items():
        h      = info["hash_vorn"]
        source       = Path(info["source"])
        source_is_dir = info.get("source_is_dir", True)

        if not store.exists(store_path, h):
            errors.append({"file": filename, "error": f"hash non trovato nello store: {h[:16]}..."})
            continue
        try:
            content  = store.get(store_path, h)
            out_path = (source if source_is_dir else source.parent) / filename
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(content)
            if "permissions" in info:
                os.chmod(out_path, info["permissions"])
            restored += 1
        except Exception as e:
            errors.append({"file": filename, "error": str(e)})

    return {"run_ts": run["ts"], "restored": restored, "errors": errors}
