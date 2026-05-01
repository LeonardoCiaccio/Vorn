<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')" />
    <div class="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

      <!-- Header -->
      <div class="px-6 py-5 border-b border-gray-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <CircleStackIcon class="w-4.5 h-4.5 text-indigo-400" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-white">Ricostruisci sessioni</h2>
            <p class="text-xs text-gray-500 mt-0.5">Legge i metadati dallo store e ripristina il database</p>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="px-6 py-5 space-y-4">

        <!-- Store path -->
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Percorso store</label>
          <input
            v-model="storeDir"
            :disabled="running"
            type="text"
            placeholder="/percorso/allo/store"
            class="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
        </div>

        <!-- Warning sessioni esistenti -->
        <div class="flex gap-2.5 px-3 py-3 rounded-md bg-amber-500/8 border border-amber-500/20 text-xs text-amber-300">
          <ExclamationTriangleIcon class="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>Le sessioni già presenti nel database con lo stesso nome verranno aggiornate con i dati trovati nello store. Le run esistenti non vengono duplicate.</span>
        </div>

        <!-- Progress -->
        <div v-if="running || result" class="space-y-2">
          <div v-if="running">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs text-gray-400">Analisi in corso…</span>
              <span class="text-xs text-gray-500 font-mono">{{ progress?.current ?? 0 }} / {{ progress?.total ?? '…' }}</span>
            </div>
            <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
              <div class="h-full bg-indigo-500 rounded-full transition-all duration-200"
                :style="{ width: progressPct + '%' }" />
            </div>
            <p v-if="progress?.file" class="text-[10px] text-gray-600 font-mono mt-1 truncate">{{ progress.file }}</p>
          </div>

          <!-- Risultato -->
          <div v-if="result && !running" class="px-3 py-3 rounded-md bg-emerald-500/8 border border-emerald-500/20 text-xs space-y-1">
            <p class="font-semibold text-emerald-400">Ricostruzione completata</p>
            <div class="text-gray-400 space-y-0.5 mt-1">
              <p>{{ result.sessionsCreated }} sessioni create · {{ result.sessionsUpdated }} aggiornate</p>
              <p>{{ result.runsCreated }} run ripristinate</p>
              <p>{{ result.filesScanned }} file .vorn analizzati</p>
            </div>
          </div>

          <!-- Errore -->
          <div v-if="taskError" class="px-3 py-3 rounded-md bg-red-500/8 border border-red-500/20 text-xs text-red-400">
            {{ taskError }}
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-800 flex justify-end gap-2">
        <button
          @click="$emit('close')"
          class="px-4 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          {{ result || taskError ? 'Chiudi' : 'Annulla' }}
        </button>
        <button
          v-if="!result && !taskError"
          @click="run"
          :disabled="!storeDir.trim() || running"
          class="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="running" class="flex items-center gap-2">
            <ArrowPathIcon class="w-4 h-4 animate-spin" />
            Analisi…
          </span>
          <span v-else>Ricostruisci</span>
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { CircleStackIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import { state, startReconstruct } from '../stores/vorn.js'

defineEmits(['close'])

const storeDir  = ref(state.activeStore ?? '')
const taskId    = ref(null)
const running   = ref(false)

const task      = computed(() => taskId.value ? state.tasks[taskId.value] : null)
const progress  = computed(() => task.value?.progress ?? null)
const result    = computed(() => (!running.value && task.value?.status === 'done') ? task.value.result : null)
const taskError = computed(() => (!running.value && task.value?.status === 'error') ? task.value.error : null)

const progressPct = computed(() => {
  const p = progress.value
  if (!p?.total) return 0
  return Math.round((p.current / p.total) * 100)
})

async function run() {
  running.value = true
  try {
    taskId.value = await startReconstruct(storeDir.value.trim())
    // Aspetta il completamento osservando il task reattivo
    await new Promise(resolve => {
      const stop = setInterval(() => {
        const t = state.tasks[taskId.value]
        if (t && t.status !== 'running') { clearInterval(stop); resolve() }
      }, 100)
    })
  } finally {
    running.value = false
  }
}
</script>
