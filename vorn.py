import sys
import argparse
from pathlib import Path

import vorn_manifest as manifest
import vorn_engine   as engine
import vorn_output   as output

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
    sessions = sorted(MANIFESTS_DIR.glob("*.json")) if MANIFESTS_DIR.exists() else []

    if not sessions:
        print("\nNessuna sessione trovata.")
        return

    print(f"\nSessioni ({len(sessions)}):")
    for s in sessions:
        name    = s.stem
        session = manifest.load(MANIFESTS_DIR, name)
        runs    = len(session.get("runs", []))
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

    print(f"\nAvvio backup sessione '{name}'...")
    result = engine.backup(MANIFESTS_DIR, name)
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

    result = engine.restore(MANIFESTS_DIR, name, at=args.date)
    output.restore_summary(result)


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
    p_restore.add_argument("--date", metavar="TIMESTAMP", help="Ripristina allo stato di questa data (ISO 8601)")
    p_restore.set_defaults(func=cmd_restore)

    return parser


def main():
    parser = build_parser()
    args   = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
