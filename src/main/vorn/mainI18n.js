import { loadSettings } from './settings.js'

const _strings = {
  it: {
    backupDoneTitle: (session) => `Backup completato — ${session}`,
    backupDoneBody:  (total, errors) => errors > 0
      ? `${total} file — ${errors} errori`
      : `${total} file completati`,
  },
  en: {
    backupDoneTitle: (session) => `Backup completed — ${session}`,
    backupDoneBody:  (total, errors) => errors > 0
      ? `${total} files — ${errors} errors`
      : `${total} files completed`,
  },
  fr: {
    backupDoneTitle: (session) => `Sauvegarde terminée — ${session}`,
    backupDoneBody:  (total, errors) => errors > 0
      ? `${total} fichiers — ${errors} erreurs`
      : `${total} fichiers complétés`,
  },
  de: {
    backupDoneTitle: (session) => `Backup abgeschlossen — ${session}`,
    backupDoneBody:  (total, errors) => errors > 0
      ? `${total} Dateien — ${errors} Fehler`
      : `${total} Dateien abgeschlossen`,
  },
  es: {
    backupDoneTitle: (session) => `Copia de seguridad completada — ${session}`,
    backupDoneBody:  (total, errors) => errors > 0
      ? `${total} archivos — ${errors} errores`
      : `${total} archivos completados`,
  },
  pt: {
    backupDoneTitle: (session) => `Backup concluído — ${session}`,
    backupDoneBody:  (total, errors) => errors > 0
      ? `${total} ficheiros — ${errors} erros`
      : `${total} ficheiros concluídos`,
  },
}

export function getMainT() {
  const lang = loadSettings().language ?? 'it'
  return _strings[lang] ?? _strings.en
}
