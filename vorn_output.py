from datetime import datetime


def backup_summary(result: dict):
    ts = datetime.fromisoformat(result["run_ts"]).strftime("%Y-%m-%d %H:%M:%S")
    print(f"\nBackup completato  [{ts}]  sessione: {result['session']}")
    print(f"  Nuovi nello store : {result['new']}")
    print(f"  Deduplicati       : {result['deduped']}")
    if result.get("errors"):
        print(f"  Errori            : {len(result['errors'])}")
        for e in result["errors"]:
            print(f"    ! {e['file']} -- {e['error']}")


def restore_summary(result: dict):
    if result.get("errors") and result["restored"] == 0 and not result.get("run_ts"):
        print(f"\nRestore fallito: {result['errors'][0]}")
        return
    ts = datetime.fromisoformat(result["run_ts"]).strftime("%Y-%m-%d %H:%M:%S")
    print(f"\nRestore completato  [al {ts}]")
    print(f"  File ripristinati : {result['restored']}")
    if result.get("errors"):
        print(f"  Errori            : {len(result['errors'])}")
        for e in result["errors"]:
            print(f"    ! {e['file']} -- {e['error']}")


def session_info(session: dict):
    print(f"\nSessione: {session['name']}")
    print(f"  Sorgenti : {len(session['sources'])}")
    for s in session["sources"]:
        print(f"    - {s}")
    print(f"  Run      : {len(session['runs'])}")


def runs_list(runs: list, session_name: str):
    print(f"\nRun sessione '{session_name}':")
    if not runs:
        print("  Nessun run ancora.")
        return
    for i, r in enumerate(runs, 1):
        ts = datetime.fromisoformat(r["ts"]).strftime("%Y-%m-%d %H:%M:%S")
        print(f"  [{i}]  {ts}  ({r['files']} file)")


def error(msg: str):
    print(f"\nErrore: {msg}")


def info(msg: str):
    print(f"  {msg}")
