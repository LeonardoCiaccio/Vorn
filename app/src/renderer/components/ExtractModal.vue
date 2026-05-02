<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
    <div class="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">

      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider">Estrai File</h3>
        <button @click="$emit('close')" class="text-gray-500 hover:text-white transition-colors">
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-6">
        <p class="text-xs text-gray-400 mb-5">
          File: <span class="text-indigo-400 font-mono">{{ filename }}</span>
        </p>

        <label class="block text-xs font-medium text-gray-400 mb-1.5">Cartella destinazione</label>
        <div class="flex items-center gap-2">
          <input
            type="text"
            v-model="destDir"
            placeholder="Seleziona cartella…"
            class="flex-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button @click="pickDest" class="p-2 rounded-md bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors shrink-0">
            <FolderOpenIcon class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 bg-gray-800/30 flex items-center justify-end gap-3">
        <button
          @click="$emit('close')"
          class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors"
        >
          Annulla
        </button>
        <button
          @click="handleConfirm"
          :disabled="!destDir.trim()"
          class="px-5 py-2 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
        >
          Estrai
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { XMarkIcon, FolderOpenIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  show: Boolean,
  filename: { type: String, default: '' },
})

const emit = defineEmits(['close', 'confirm'])

const destDir = ref('')

watch(() => props.show, (v) => { if (v) destDir.value = '' })

async function pickDest() {
  const path = await window.vorn.pickFolder()
  if (path) destDir.value = path
}

function handleConfirm() {
  emit('confirm', destDir.value)
}
</script>
