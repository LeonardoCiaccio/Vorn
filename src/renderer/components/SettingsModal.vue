<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      @click.self="$emit('close')">
      <div class="w-full max-w-md bg-gray-900 border border-gray-700 rounded-md shadow-2xl flex flex-col max-h-[80vh]">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <Cog6ToothIcon class="w-4 h-4 text-indigo-400" />
            </div>
            <h2 class="text-base font-semibold text-white">{{ $t('settings.title') }}</h2>
          </div>
          <button @click="$emit('close')"
            class="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-6 overflow-y-auto flex-1">

          <!-- Sezione: Interfaccia -->
          <div>
            <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-4">{{
              $t('settings.interface') }}</p>
            <div class="space-y-5">

              <SettingRow :label="$t('settings.lang.label')" :sub="$t('settings.lang.sub')">
                <select v-model="draft.language"
                  class="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer">
                  <option v-for="lang in languages" :key="lang.code" :value="lang.code">
                    {{ lang.label }}
                  </option>
                </select>
              </SettingRow>

            </div>
          </div>

          <div class="border-t border-gray-800" />

          <!-- Sezione: Backup -->
          <div>
            <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-4">{{ $t('settings.backup')
            }}</p>
            <div class="space-y-5">
              <SettingRow :label="$t('settings.notif.label')" :sub="$t('settings.notif.sub')">
                <Toggle v-model="draft.notifications" />
              </SettingRow>
            </div>
          </div>

          <div class="border-t border-gray-800" />

          <!-- Sezione: Informazioni -->
          <div>
            <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-4">{{ $t('settings.info') }}
            </p>
            <div class="space-y-5">

              <SettingRow :label="$t('settings.about.github')" :sub="$t('settings.about.githubSub')">
                <button @click="openExternal('https://github.com/LeonardoCiaccio/Vorn')"
                  class="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer">
                  <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  {{ $t('settings.about.open') }}
                </button>
              </SettingRow>

              <SettingRow :label="$t('settings.about.releases')" :sub="$t('settings.about.releasesSub')">
                <button @click="openExternal('https://github.com/LeonardoCiaccio/Vorn/releases')"
                  class="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer">
                  <ArrowTopRightOnSquareIcon class="w-3.5 h-3.5 shrink-0" />
                  {{ $t('settings.about.open') }}
                </button>
              </SettingRow>

            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button @click="$emit('close')"
            class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors rounded-md hover:bg-gray-800">
            {{ $t('common.cancel') }}
          </button>
          <button @click="save"
            class="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
            {{ $t('common.save') }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive } from 'vue'
import { Cog6ToothIcon, XMarkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/outline'
import SettingRow from './SettingRow.vue'
import Toggle from './Toggle.vue'
import { setLocale } from '../stores/i18n.js'

const props = defineProps({ initialSettings: { type: Object, required: true } })
const emit = defineEmits(['close'])

const languages = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
]

const draft = reactive({
  language: props.initialSettings.language ?? 'it',
  notifications: props.initialSettings.notifications ?? false,
})

function openExternal(url) {
  window.vorn.openExternal(url)
}

async function save() {
  await window.vorn.saveSettings({ language: draft.language, notifications: draft.notifications })
  setLocale(draft.language)
  emit('close')
}
</script>
