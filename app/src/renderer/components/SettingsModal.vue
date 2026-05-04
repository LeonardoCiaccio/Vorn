<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]" @click.self="$emit('close')">
      <div class="w-full max-w-md bg-gray-900 border border-gray-700 rounded-md shadow-2xl">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <Cog6ToothIcon class="w-4 h-4 text-indigo-400" />
            </div>
            <h2 class="text-base font-semibold text-white">Impostazioni</h2>
          </div>
          <button @click="$emit('close')" class="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-6">

          <!-- Sezione: Interfaccia -->
          <div>
            <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-4">Interfaccia</p>
            <div class="space-y-5">

              <SettingRow label="Lingua" sub="Lingua dell'interfaccia utente">
                <select
                  v-model="draft.language"
                  class="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option v-for="lang in languages" :key="lang.code" :value="lang.code">
                    {{ lang.label }}
                  </option>
                </select>
              </SettingRow>

            </div>
          </div>

          <!-- Divider placeholder (future sections) -->
          <div class="border-t border-gray-800" />

          <!-- Sezione: Backup -->
          <div>
            <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-4">Backup</p>
            <div class="space-y-5">
              <SettingRow label="Notifiche di sistema" sub="Mostra una notifica al termine di ogni run">
                <Toggle v-model="draft.notifications" />
              </SettingRow>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button @click="$emit('close')" class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors rounded-md hover:bg-gray-800">
            Annulla
          </button>
          <button @click="save" class="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
            Salva
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { Cog6ToothIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import SettingRow from './SettingRow.vue'
import Toggle from './Toggle.vue'

const emit = defineEmits(['close'])

const languages = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'zh', label: '中文' },
]

const draft = reactive({
  language:      'it',
  notifications: false,
})

onMounted(async () => {
  const s = await window.vorn.getSettings()
  draft.language      = s.language      ?? 'it'
  draft.notifications = s.notifications ?? false
})

async function save() {
  await window.vorn.saveSettings({ notifications: draft.notifications })
  emit('close')
}
</script>
