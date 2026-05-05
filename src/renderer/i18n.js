import { createI18n } from 'vue-i18n'
import it from './locales/it.json'
import en from './locales/en.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import es from './locales/es.json'
import pt from './locales/pt.json'

const saved = localStorage.getItem('vorn-language') ?? 'it'

export const i18n = createI18n({
  legacy: false,
  locale: saved,
  fallbackLocale: 'en',
  messages: { it, en, fr, de, es, pt },
})

export function setLocale(lang) {
  if (!lang) return
  const supported = ['it', 'en', 'fr', 'de', 'es', 'pt']
  const locale = supported.includes(lang) ? lang : 'en'
  i18n.global.locale.value = locale
  localStorage.setItem('vorn-language', locale)
}
