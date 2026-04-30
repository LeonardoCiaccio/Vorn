<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="$emit('close')">
      <div class="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-md shadow-2xl">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <FolderPlusIcon class="w-4 h-4 text-indigo-400" />
            </div>
            <h2 class="text-base font-semibold text-white">Nuova sessione</h2>
          </div>
          <button @click="$emit('close')" class="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-5">

          <!-- Name -->
          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nome sessione</label>
            <input
              v-model="form.name"
              placeholder="es. Documenti, Progetti, Foto…"
              class="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
          </div>

          <!-- Store path -->
          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cartella store</label>
            <input
              v-model="form.store"
              placeholder="es. D:\VornStore o /mnt/backup/vorn"
              class="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
            <p class="text-[11px] text-gray-600 mt-1.5">La cartella dove verranno salvati i file .vorn</p>
          </div>

          <!-- Sources -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Cartelle sorgente</label>
              <button @click="addSource" class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                <PlusIcon class="w-3.5 h-3.5" />
                Aggiungi
              </button>
            </div>
            <div class="space-y-2">
              <div
                v-for="(src, i) in form.sources"
                :key="i"
                class="flex items-center gap-2"
              >
                <input
                  v-model="form.sources[i]"
                  :placeholder="`es. C:\\Users\\leona\\${['Documents','Pictures','Music'][i] ?? 'Cartella'}`"
                  class="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                />
                <button
                  v-if="form.sources.length > 1"
                  @click="removeSource(i)"
                  class="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <XMarkIcon class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Error -->
          <p v-if="error" class="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{{ error }}</p>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
          <button
            @click="$emit('close')"
            class="px-4 py-2 rounded-md text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            Annulla
          </button>
          <button
            @click="submit"
            :disabled="saving"
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon v-if="saving" class="w-4 h-4 animate-spin" />
            Crea sessione
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { FolderPlusIcon, XMarkIcon, PlusIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import { createSession } from '../stores/vorn.js'

const emit = defineEmits(['close', 'created'])

const form = reactive({
  name: '',
  store: '',
  sources: [''],
})
const saving = ref(false)
const error  = ref('')

function addSource() {
  form.sources.push('')
}
function removeSource(i) {
  form.sources.splice(i, 1)
}

async function submit() {
  error.value = ''
  if (!form.name.trim()) { error.value = 'Inserisci un nome per la sessione'; return }
  if (!form.store.trim()) { error.value = 'Inserisci il percorso dello store'; return }
  const sources = form.sources.map(s => s.trim()).filter(Boolean)
  if (!sources.length) { error.value = 'Inserisci almeno una cartella sorgente'; return }

  saving.value = true
  try {
    await createSession(form.name.trim(), form.store.trim(), sources)
    emit('created')
    emit('close')
  } catch (e) {
    error.value = e.message ?? 'Errore nella creazione della sessione'
  } finally {
    saving.value = false
  }
}
</script>
