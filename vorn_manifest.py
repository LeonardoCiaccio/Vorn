import json
from datetime import datetime, timezone
from pathlib import Path


def _manifest_path(manifests_dir: Path, session_name: str) -> Path:
    return manifests_dir / f"{session_name}.json"


def create(manifests_dir: Path, session_name: str, store_path: str) -> dict:
    manifests_dir.mkdir(parents=True, exist_ok=True)
    session = {"name": session_name, "store": store_path, "sources": [], "runs": []}
    _save(manifests_dir, session)
    return session


def get_store(manifests_dir: Path, session_name: str) -> Path:
    return Path(load(manifests_dir, session_name)["store"])


def load(manifests_dir: Path, session_name: str) -> dict:
    path = _manifest_path(manifests_dir, session_name)
    if not path.exists():
        raise FileNotFoundError(f"Sessione non trovata: {session_name}")
    return json.loads(path.read_text(encoding="utf-8"))


def exists(manifests_dir: Path, session_name: str) -> bool:
    return _manifest_path(manifests_dir, session_name).exists()


def add_source(manifests_dir: Path, session_name: str, source: str):
    session = load(manifests_dir, session_name)
    if source not in session["sources"]:
        session["sources"].append(source)
        _save(manifests_dir, session)


def open_run(manifests_dir: Path, session_name: str) -> str:
    session = load(manifests_dir, session_name)
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    session["runs"].append({"ts": ts, "files": {}})
    _save(manifests_dir, session)
    return ts


def add_file(manifests_dir: Path, session_name: str, run_ts: str, filename: str, hash: str, source: str, source_is_dir: bool):
    session = load(manifests_dir, session_name)
    run = _find_run(session, run_ts)
    run["files"][filename] = {"hash": hash, "ts": run_ts, "source": source, "source_is_dir": source_is_dir}
    _save(manifests_dir, session)


def get_run_at(manifests_dir: Path, session_name: str, at: str = None) -> dict:
    session = load(manifests_dir, session_name)
    runs = session.get("runs", [])
    if not runs:
        return None
    if at is None:
        return runs[-1]
    target = datetime.fromisoformat(at)
    candidates = [r for r in runs if datetime.fromisoformat(r["ts"]) <= target]
    return candidates[-1] if candidates else None


def list_runs(manifests_dir: Path, session_name: str) -> list:
    session = load(manifests_dir, session_name)
    return [{"ts": r["ts"], "files": len(r["files"])} for r in session.get("runs", [])]


def _find_run(session: dict, run_ts: str) -> dict:
    for run in reversed(session["runs"]):
        if run["ts"] == run_ts:
            return run
    raise KeyError(f"Run non trovato: {run_ts}")


def _save(manifests_dir: Path, session: dict):
    path = _manifest_path(manifests_dir, session["name"])
    path.write_text(json.dumps(session, indent=2, ensure_ascii=False), encoding="utf-8")
