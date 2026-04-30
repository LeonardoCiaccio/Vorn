import json
from datetime import datetime, timezone
from pathlib import Path


def _session_dir(manifests_dir: Path, session_name: str) -> Path:
    return manifests_dir / session_name


def _session_path(manifests_dir: Path, session_name: str) -> Path:
    return _session_dir(manifests_dir, session_name) / f"{session_name}.json"


def _run_path(manifests_dir: Path, session_name: str, run_ts: str) -> Path:
    safe_ts = run_ts.replace(":", "-")
    return _session_dir(manifests_dir, session_name) / f"{session_name}-{safe_ts}.json"


def create(manifests_dir: Path, session_name: str, store_path: str) -> dict:
    _session_dir(manifests_dir, session_name).mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    session = {"ts": ts, "name": session_name, "store": store_path, "sources": []}
    _save(manifests_dir, session)
    return session


def exists(manifests_dir: Path, session_name: str) -> bool:
    return _session_path(manifests_dir, session_name).exists()


def load(manifests_dir: Path, session_name: str) -> dict:
    path = _session_path(manifests_dir, session_name)
    if not path.exists():
        raise FileNotFoundError(f"Sessione non trovata: {session_name}")
    return json.loads(path.read_text(encoding="utf-8"))


def get_store(manifests_dir: Path, session_name: str) -> Path:
    return Path(load(manifests_dir, session_name)["store"])


def add_source(manifests_dir: Path, session_name: str, source: str):
    session = load(manifests_dir, session_name)
    if source not in session["sources"]:
        session["sources"].append(source)
        _save(manifests_dir, session)


def open_run(manifests_dir: Path, session_name: str) -> str:
    session = load(manifests_dir, session_name)
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    run = {"ts": ts, "name": session["name"], "store": session["store"], "status": "running", "files": {}}
    _run_path(manifests_dir, session_name, ts).write_text(
        json.dumps(run, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return ts


def set_run_status(manifests_dir: Path, session_name: str, run_ts: str, status: str):
    path = _run_path(manifests_dir, session_name, run_ts)
    run = json.loads(path.read_text(encoding="utf-8"))
    run["status"] = status
    path.write_text(json.dumps(run, indent=2, ensure_ascii=False), encoding="utf-8")


def get_paused_run(manifests_dir: Path, session_name: str) -> str:
    run_files = sorted(_session_dir(manifests_dir, session_name).glob(f"{session_name}-*.json"))
    for f in reversed(run_files):
        run = json.loads(f.read_text(encoding="utf-8"))
        if run.get("status") == "paused":
            return run["ts"]
    return None


def add_file(manifests_dir: Path, session_name: str, run_ts: str, filename: str, hash_vorn: str, source: str, source_is_dir: bool, permissions: int):
    path = _run_path(manifests_dir, session_name, run_ts)
    run = json.loads(path.read_text(encoding="utf-8"))
    run["files"][filename] = {"hash_vorn": hash_vorn, "source": source, "source_is_dir": source_is_dir, "permissions": permissions}
    path.write_text(json.dumps(run, indent=2, ensure_ascii=False), encoding="utf-8")


def load_run(manifests_dir: Path, session_name: str, run_ts: str) -> dict:
    return json.loads(_run_path(manifests_dir, session_name, run_ts).read_text(encoding="utf-8"))


def list_runs(manifests_dir: Path, session_name: str) -> list:
    run_files = sorted(_session_dir(manifests_dir, session_name).glob(f"{session_name}-*.json"))
    result = []
    for f in run_files:
        run = json.loads(f.read_text(encoding="utf-8"))
        result.append({"ts": run["ts"], "files": len(run["files"]), "status": run.get("status", "done")})
    return result


def get_run_at(manifests_dir: Path, session_name: str, at: str = None) -> dict:
    run_files = sorted(_session_dir(manifests_dir, session_name).glob(f"{session_name}-*.json"))
    runs = [json.loads(f.read_text(encoding="utf-8")) for f in run_files]
    if not runs:
        return None
    if at is None:
        return runs[-1]
    target = datetime.fromisoformat(at)
    candidates = [r for r in runs if datetime.fromisoformat(r["ts"]) <= target]
    return candidates[-1] if candidates else None


def recover_session(manifests_dir: Path, session_name: str) -> dict:
    run_files = sorted(_session_dir(manifests_dir, session_name).glob(f"{session_name}-*.json"))
    if not run_files:
        raise FileNotFoundError(f"Nessun run trovato per ricostruire la sessione: {session_name}")
    run = json.loads(run_files[-1].read_text(encoding="utf-8"))
    sources = list({info["source"] for info in run["files"].values()})
    session = {"ts": run["ts"], "name": run["name"], "store": run["store"], "sources": sources}
    _save(manifests_dir, session)
    return session


def _save(manifests_dir: Path, session: dict):
    path = _session_path(manifests_dir, session["name"])
    path.write_text(json.dumps(session, indent=2, ensure_ascii=False), encoding="utf-8")
