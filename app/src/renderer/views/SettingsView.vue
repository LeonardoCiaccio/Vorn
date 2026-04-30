<template>
  <div class="flex h-full overflow-hidden">

    <!-- Left nav -->
    <div class="w-52 shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col py-5">
      <p class="px-5 mb-3 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
        Impostazioni
      </p>
      <button
        v-for="cat in categories"
        :key="cat.id"
        @click="active = cat.id"
        :class="[
          'mx-2 flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all group',
          active === cat.id
            ? 'bg-indigo-500/15 text-indigo-400'
            : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'
        ]"
      >
        <component :is="cat.icon" :class="[
          'w-4 h-4 shrink-0',
          active === cat.id ? 'text-indigo-400' : 'text-gray-600 group-hover:text-gray-300'
        ]" />
        {{ cat.label }}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto">
      <div class="max-w-2xl px-10 py-8 space-y-8">

        <!-- ── GENERALE ── -->
        <template v-if="active === 'general'">
          <SectionHeader title="Generale" />

          <!-- Theme -->
          <SettingRow label="Tema" sub="Scegli l'aspetto visivo dell'applicazione">
            <div class="flex gap-2">
              <button
                @click="setTheme('dark')"
                :class="[
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-all',
                  settings.theme === 'dark'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-700'
                ]"
              >
                <MoonIcon class="w-4 h-4" />
                Scuro
              </button>
              <button
                @click="setTheme('light')"
                :class="[
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-all',
                  settings.theme === 'light'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-700'
                ]"
              >
                <SunIcon class="w-4 h-4" />
                Chiaro
              </button>
            </div>
          </SettingRow>

          <Divider />

          <!-- Language placeholder -->
          <SettingRow label="Lingua" sub="Lingua dell'interfaccia — disponibile a UI stabile">
            <div class="flex flex-wrap gap-2">
              <button
                v-for="lang in languages"
                :key="lang.code"
                @click="setLanguage(lang.code)"
                :class="[
                  'flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium border transition-all',
                  i18nState.lang === lang.code
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-700'
                ]"
              >
                <span class="text-base leading-none">{{ lang.flag }}</span>
                {{ lang.label }}
              </button>
            </div>
          </SettingRow>

          <Divider />

          <!-- Startup -->
          <SettingRow label="Avvia con il sistema" sub="Lancia Vorn automaticamente all'avvio di Windows">
            <Toggle v-model="settings.startWithSystem" />
          </SettingRow>
          <SettingRow label="Avvia minimizzato" sub="Apre l'app nella barra delle applicazioni">
            <Toggle v-model="settings.startMinimized" />
          </SettingRow>
        </template>

        <!-- ── STORE ── -->
        <template v-if="active === 'store'">
          <SectionHeader title="Store" />

          <SettingRow label="Store predefinito" sub="Cartella usata di default per nuove sessioni">
            <div class="flex items-center gap-2">
              <input
                v-model="settings.defaultStore"
                placeholder="es. D:\VornStore"
                class="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 font-mono w-56 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
              />
              <button class="px-3 py-2 rounded-md text-sm text-gray-300 border border-gray-700 hover:bg-gray-800 transition-colors">
                Sfoglia
              </button>
            </div>
          </SettingRow>

          <Divider />

          <SettingRow label="Esclusioni globali" sub="Pattern ignorati in tutti i backup (si sommano a quelli per sessione)">
            <div class="space-y-2">
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="(excl, i) in settings.excludes"
                  :key="i"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-800 border border-gray-700 text-xs font-mono text-gray-300"
                >
                  {{ excl }}
                  <button @click="settings.excludes.splice(i, 1)" class="text-gray-600 hover:text-red-400 transition-colors">
                    <XMarkIcon class="w-3 h-3" />
                  </button>
                </span>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="newExclude"
                  @keydown.enter="addExclude"
                  placeholder="es. *.tmp"
                  class="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-gray-200 font-mono w-36 focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
                />
                <button
                  @click="addExclude"
                  :disabled="!newExclude.trim()"
                  class="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  + Aggiungi
                </button>
              </div>
            </div>
          </SettingRow>
        </template>

        <!-- ── BACKUP ── -->
        <template v-if="active === 'backup'">
          <SectionHeader title="Backup" />

          <SettingRow label="Compressione" sub="Comprimi il contenuto nei file .vorn (riduce lo spazio, aumenta il tempo)">
            <Toggle v-model="settings.compress" />
          </SettingRow>

          <Divider />

          <SettingRow label="Limite dimensione file" sub="Salta i file più grandi del limite (0 = nessun limite)">
            <div class="flex items-center gap-2">
              <input
                v-model="settings.maxFileMB"
                type="number" min="0"
                class="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-24 text-right font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <span class="text-sm text-gray-500">MB</span>
            </div>
          </SettingRow>

          <Divider />

          <SettingRow label="Backup automatico" sub="Esegui il backup periodicamente in background">
            <Toggle v-model="settings.autoBackup" />
          </SettingRow>

          <SettingRow v-if="settings.autoBackup" label="Intervallo" sub="Ogni quante ore eseguire il backup automatico">
            <div class="flex items-center gap-2">
              <input
                v-model="settings.autoBackupHours"
                type="number" min="1" max="168"
                class="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-20 text-right font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <span class="text-sm text-gray-500">ore</span>
            </div>
          </SettingRow>
        </template>

        <!-- ── NOTIFICHE ── -->
        <template v-if="active === 'notifications'">
          <SectionHeader title="Notifiche" />

          <SettingRow label="Backup completato" sub="Mostra una notifica di sistema al termine di ogni run">
            <Toggle v-model="settings.notifyDone" />
          </SettingRow>
          <SettingRow label="Errori durante il backup" sub="Avvisa se ci sono file che non è stato possibile processare">
            <Toggle v-model="settings.notifyErrors" />
          </SettingRow>

          <Divider />

          <SettingRow label="Suono notifica" sub="Riproduci un suono al completamento del backup">
            <Toggle v-model="settings.notifySound" />
          </SettingRow>
        </template>

        <!-- ── AVANZATE ── -->
        <template v-if="active === 'advanced'">
          <SectionHeader title="Avanzate" />

          <SettingRow label="Livello log" sub="Verbosità dei log interni — debug solo per sviluppo">
            <div class="flex gap-1.5">
              <button
                v-for="lvl in logLevels"
                :key="lvl"
                @click="settings.logLevel = lvl"
                :class="[
                  'px-3 py-1.5 rounded-md text-xs font-mono font-medium border transition-colors',
                  settings.logLevel === lvl
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                ]"
              >{{ lvl }}</button>
            </div>
          </SettingRow>

          <Divider />

          <SettingRow label="DevTools" sub="Apri gli strumenti per sviluppatori di Electron">
            <Toggle v-model="settings.devTools" />
          </SettingRow>

          <Divider />

          <!-- Version info -->
          <div class="bg-gray-900 border border-gray-800 rounded-md p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-200">Vorn</p>
                <p class="text-xs text-gray-500 mt-0.5 font-mono">
                  v{{ appVersion }} · Electron · {{ appPlatform }}
                </p>
              </div>
              <button class="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-gray-300 border border-gray-700 hover:bg-gray-800 transition-colors">
                <ArrowPathIcon class="w-3.5 h-3.5" />
                Controlla aggiornamenti
              </button>
            </div>
            <p class="text-[10px] text-gray-600 font-mono mt-3 break-all">Sessioni: {{ manifestsDir }}</p>
          </div>
        </template>

      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  Cog6ToothIcon,
  CircleStackIcon,
  ArchiveBoxIcon,
  BellIcon,
  WrenchScrewdriverIcon,
  MoonIcon,
  SunIcon,
  XMarkIcon,
  ArrowPathIcon,
} from '@heroicons/vue/24/outline'
import { t, i18nState, languages, setLanguage } from '../stores/i18n.js'
import { settings, setTheme } from '../stores/settings.js'
import { state } from '../stores/vorn.js'
import SectionHeader from '../components/SectionHeader.vue'
import SettingRow from '../components/SettingRow.vue'
import Divider from '../components/Divider.vue'
import Toggle from '../components/Toggle.vue'

const active = ref('general')

const categories = [
  { id: 'general',       label: 'Generale',     icon: Cog6ToothIcon },
  { id: 'store',         label: 'Store',         icon: CircleStackIcon },
  { id: 'backup',        label: 'Backup',        icon: ArchiveBoxIcon },
  { id: 'notifications', label: 'Notifiche',     icon: BellIcon },
  { id: 'advanced',      label: 'Avanzate',      icon: WrenchScrewdriverIcon },
]

const logLevels = ['error', 'warn', 'info', 'debug']
const newExclude = ref('')

const appVersion    = computed(() => state.appInfo?.version  ?? '—')
const appPlatform   = computed(() => state.appInfo?.platform ?? '—')
const manifestsDir  = computed(() => state.appInfo?.manifestsDir ?? '—')

function addExclude() {
  const v = newExclude.value.trim()
  if (v && !settings.excludes.includes(v)) {
    settings.excludes.push(v)
    newExclude.value = ''
  }
}
</script>
