import sys
import argparse
from datetime import datetime
from pathlib import Path

import vorn_manifest as manifest
import vorn_engine   as engine
import vorn_output   as output
import vorn_view     as view

MANIFESTS_DIR = Path.home() / ".vorn" / "sessions"


# -- session create -----------------------------------------------------------

def cmd_create(args):
    name  = args.name
    store = Path(args.store).resolve()

    if manifest.exists(MANIFESTS_DIR, name):
        output.error(f"Sessione '{name}' esiste gia.")
        sys.exit(1)

    store.mkdir(parents=True, exist_ok=True)
    manifest.create(MANIFESTS_DIR, name, str(store))
    print(f"\nSessione '{name}' creata.")
    print(f"  Store : {store}")


# -- session add --------------------------------------------------------------

def cmd_add(args):
    name   = args.name
    source = Path(args.source).resolve()

    if not manifest.exists(MANIFESTS_DIR, name):
        output.error(f"Sessione '{name}' non trovata.")
        sys.exit(1)

    if not source.exists():
        output.error(f"Percorso non trovato: {source}")
        sys.exit(1)

    manifest.add_source(MANIFESTS_DIR, name, str(source))
    print(f"\nAggiunto a '{name}': {source}")


# -- session list -------------------------------------------------------------

def cmd_list(args):
    sessions = sorted(MANIFESTS_DIR.glob("*/")) if MANIFESTS_DIR.exists() else []

    if not sessions:
        print("\nNessuna sessione trovata.")
        return

    print(f"\nSessioni ({len(sessions)}):")
    for s in sessions:
        name    = s.name
        if not manifest.exists(MANIFESTS_DIR, name):
            continue
        session = manifest.load(MANIFESTS_DIR, name)
        runs    = len(manifest.list_runs(MANIFESTS_DIR, name))
        sources = len(session.get("sources", []))
        print(f"  {name:<20}  {sources} sorgenti  |  {runs} run")


# -- session info -------------------------------------------------------------

def cmd_info(args):
    name = args.name

    if not manifest.exists(MANIFESTS_DIR, name):
        output.error(f"Sessione '{name}' non trovata.")
        sys.exit(1)

    session = manifest.load(MANIFESTS_DIR, name)
    output.session_info(session)
    print(f"  Store    : {session.get('store', '?')}")


# -- session run --------------------------------------------------------------

def cmd_run(args):
    name = args.name

    if not manifest.exists(MANIFESTS_DIR, name):
        output.error(f"Sessione '{name}' non trovata.")
        sys.exit(1)

    session = manifest.load(MANIFESTS_DIR, name)
    if not session.get("sources"):
        output.error(f"Nessuna sorgente nella sessione '{name}'. Usa: vorn session add {name} <percorso>")
        sys.exit(1)

    resume_ts  = None
    paused_ts  = manifest.get_paused_run(MANIFESTS_DIR, name)
    if paused_ts:
        ts_fmt = datetime.fromisoformat(paused_ts).strftime("%Y-%m-%d %H:%M:%S")
        answer = input(f"\nRun in pausa trovato [{ts_fmt}]. Riprendere? [S/n] ").strip().lower()
        if answer in ("", "s", "si", "y", "yes"):
            resume_ts = paused_ts
            print(f"Ripresa del run [{ts_fmt}]...")
        else:
            print("Avvio nuovo run...")
    else:
        print(f"\nAvvio backup sessione '{name}'...")

    def on_progress(current, total, new, dedup, errors, filename):
        pct       = int(current * 100 / total) if total > 0 else 0
        name_short = filename[-45:] if len(filename) > 45 else filename
        line      = f"\r  [{pct:3d}%]  {current}/{total}  nuovi: {new}  dedup: {dedup}  errori: {len(errors)}  -> {name_short:<45}"
        print(line, end="", flush=True)

    result = engine.backup(MANIFESTS_DIR, name, resume_ts=resume_ts, on_progress=on_progress)
    print()

    if result.get("status") == "paused":
        print(f"\nBackup in pausa. Riprendi con: vorn session run {name}")

    output.backup_summary(result)


# -- session restore ----------------------------------------------------------

def cmd_restore(args):
    name = args.name

    if not manifest.exists(MANIFESTS_DIR, name):
        output.error(f"Sessione '{name}' non trovata.")
        sys.exit(1)

    if args.list:
        runs = manifest.list_runs(MANIFESTS_DIR, name)
        output.runs_list(runs, name)
        return

    try:
        result = engine.restore(MANIFESTS_DIR, name, run_ts=args.ts)
    except FileNotFoundError:
        output.error(f"Run non trovato: {args.ts}\nUsa: vorn session restore {name} --list")
        sys.exit(1)
    output.restore_summary(result)


# -- inspect ------------------------------------------------------------------

def cmd_inspect(args):
    view.view(args.file)


# -- parser -------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(
        prog="vorn",
        description="Vorn — backup content-addressable",
    )
    sub = parser.add_subparsers(dest="command", metavar="comando")
    sub.required = True

    session_p = sub.add_parser("session", help="Gestione sessioni")
    session_sub = session_p.add_subparsers(dest="subcommand", metavar="azione")
    session_sub.required = True

    # create
    p_create = session_sub.add_parser("create", help="Crea una nuova sessione")
    p_create.add_argument("name",  help="Nome della sessione")
    p_create.add_argument("--store", required=True, metavar="CARTELLA", help="Cartella store dei .vorn")
    p_create.set_defaults(func=cmd_create)

    # add
    p_add = session_sub.add_parser("add", help="Aggiunge una sorgente alla sessione")
    p_add.add_argument("name",   help="Nome della sessione")
    p_add.add_argument("source", help="File o cartella da backuppare")
    p_add.set_defaults(func=cmd_add)

    # list
    p_list = session_sub.add_parser("list", help="Elenca tutte le sessioni")
    p_list.set_defaults(func=cmd_list)

    # info
    p_info = session_sub.add_parser("info", help="Dettagli di una sessione")
    p_info.add_argument("name", help="Nome della sessione")
    p_info.set_defaults(func=cmd_info)

    # run
    p_run = session_sub.add_parser("run", help="Esegue il backup della sessione")
    p_run.add_argument("name", help="Nome della sessione")
    p_run.set_defaults(func=cmd_run)

    # restore
    p_restore = session_sub.add_parser("restore", help="Ripristina file da una sessione")
    p_restore.add_argument("name", help="Nome della sessione")
    p_restore.add_argument("--list", action="store_true", help="Mostra i run disponibili")
    p_restore.add_argument("--ts", metavar="TIMESTAMP", help="Timestamp esatto del run da ripristinare (usa --list per vedere i valori)")
    p_restore.set_defaults(func=cmd_restore)

    # inspect
    p_inspect = sub.add_parser("inspect", help="Mostra i metadati di un file .vorn")
    p_inspect.add_argument("file", help="Percorso del file .vorn")
    p_inspect.set_defaults(func=cmd_inspect)

    return parser


def main():
    import sys
    parser = build_parser()
    if len(sys.argv) == 1:
        parser.parse_args(["session", "--help"])
        return
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
