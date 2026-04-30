<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div class="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
      
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider">Ripristina Backup</h3>
        <button @click="$emit('close')" class="text-gray-500 hover:text-white transition-colors">
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-6">
        <p class="text-xs text-gray-400 mb-6">
          Seleziona dove vuoi ripristinare i file per la run del 
          <span class="text-indigo-400 font-mono">{{ formatTs(runTs) }}</span>.
        </p>

        <div class="space-y-4">
          <!-- Option: Original Path -->
          <label 
            class="flex items-start gap-4 p-4 rounded-md border cursor-pointer transition-all"
            :class="mode === 'original' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'"
          >
            <input type="radio" v-model="mode" value="original" class="mt-1 accent-indigo-500" />
            <div class="min-w-0">
              <p class="text-sm font-semibold text-white">Percorso Originale</p>
              <p class="text-[10px] text-gray-500 truncate mt-1 font-mono">{{ originalPath }}</p>
            </div>
          </label>

          <!-- Option: Custom Path -->
          <label 
            class="flex items-start gap-4 p-4 rounded-md border cursor-pointer transition-all"
            :class="mode === 'custom' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'"
          >
            <input type="radio" v-model="mode" value="custom" class="mt-1 accent-indigo-500" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-white">Destinazione Personalizzata</p>
              <div v-if="mode === 'custom'" class="mt-3 space-y-2">
                <input 
                  type="text" 
                  v-model="customPath" 
                  placeholder="C:\Percorso\Destinazione"
                  class="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <p class="text-[9px] text-amber-500/80">Nota: La struttura delle sottocartelle verrà ricreata qui.</p>
              </div>
            </div>
          </label>
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
          :disabled="mode === 'custom' && !customPath"
          class="px-5 py-2 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
        >
          Conferma Ripristino
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { formatTs } from '../stores/vorn.js'

const props = defineProps({
  show: Boolean,
  runTs: String,
  originalPath: String
})

const emit = defineEmits(['close', 'confirm'])

const mode = ref('original')
const customPath = ref('')

function handleConfirm() {
  const finalPath = mode.value === 'original' ? props.originalPath : customPath.value
  emit('confirm', finalPath)
}
</script>
