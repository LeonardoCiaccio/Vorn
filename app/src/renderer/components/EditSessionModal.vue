<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]" @click.self="$emit('close')">
      <div class="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-md shadow-2xl">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <PencilSquareIcon class="w-4 h-4 text-indigo-400" />
            </div>
            <h2 class="text-base font-semibold text-white">Modifica sessione</h2>
          </div>
          <button @click="$emit('close')" class="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-5">

          <!-- Name (immutabile) -->
          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nome sessione</label>
            <input
              :value="session.name"
              disabled
              class="w-full bg-gray-800/40 border border-gray-700/50 rounded-md px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>

          <!-- Sources -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Cartelle sorgente <span class="normal-case font-normal text-gray-600">(origine)</span></label>
              <button @click="addSource" class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                <PlusIcon class="w-3.5 h-3.5" />
                Aggiungi
              </button>
            </div>
            <div class="space-y-2">
              <div v-for="(src, i) in form.sources" :key="i" class="flex items-center gap-2">
                <input
                  v-model="form.sources[i]"
                  placeholder="Percorso cartella sorgente"
                  class="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                />
                <button @click="pickSource(i)" class="p-2 rounded-md bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors shrink-0">
                  <FolderOpenIcon class="w-4 h-4" />
                </button>
                <button
                  v-if="form.sources.length > 1"
                  @click="removeSource(i)"
                  class="p-2 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <XMarkIcon class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Store path -->
          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cartella store <span class="normal-case font-normal text-gray-600">(destinazione)</span></label>
            <div class="flex items-center gap-2">
              <input
                v-model="form.store"
                placeholder="es. D:\VornStore o /mnt/backup/vorn"
                class="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
              />
              <button @click="pickStore" class="p-2.5 rounded-md bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors shrink-0">
                <FolderOpenIcon class="w-4 h-4" />
              </button>
            </div>
            <p class="text-[11px] text-gray-600 mt-1.5">La cartella dove verranno salvati i file .vorn</p>
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
            Salva modifiche
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { PencilSquareIcon, FolderOpenIcon, XMarkIcon, PlusIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import { updateSession } from '../stores/vorn.js'

const props = defineProps({
  session: { type: Object, required: true },
})
const emit = defineEmits(['close', 'saved'])

const form = reactive({
  store:   props.session.store ?? '',
  sources: [...(props.session.sources ?? [''])],
})
const saving = ref(false)
const error  = ref('')

function addSource() {
  form.sources.push('')
}
function removeSource(i) {
  if (form.sources.length > 1) form.sources.splice(i, 1)
}
async function pickStore() {
  const path = await window.vorn.pickFolder()
  if (path) form.store = path
}
async function pickSource(i) {
  const path = await window.vorn.pickFolder()
  if (path) form.sources[i] = path
}

async function submit() {
  error.value = ''
  if (!form.store.trim()) { error.value = 'Inserisci il percorso dello store'; return }
  const sources = form.sources.map(s => s.trim()).filter(Boolean)
  if (!sources.length) { error.value = 'Inserisci almeno una cartella sorgente'; return }

  saving.value = true
  try {
    await updateSession(props.session.name, form.store.trim(), sources)
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e.message ?? 'Errore nel salvataggio'
  } finally {
    saving.value = false
  }
}
</script>
