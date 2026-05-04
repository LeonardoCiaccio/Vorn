// Applica subito il tema da localStorage (evita flash al primo paint)
const cached = localStorage.getItem('vorn-theme') ?? 'dark'
document.documentElement.classList.add(cached)

// Dopo il boot, sincronizza con settings.json e aggiorna se diverso
export function syncThemeFromSettings(theme) {
  if (!theme || theme === cached) return
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(theme)
  localStorage.setItem('vorn-theme', theme)
}
