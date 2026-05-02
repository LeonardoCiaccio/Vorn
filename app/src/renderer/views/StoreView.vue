<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Header -->
    <div class="px-8 py-6 border-b border-gray-800 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-xl font-semibold text-white">Store</h1>
        <p class="text-sm text-gray-500 mt-0.5 font-mono">
          {{ state.activeStore }}
          <span v-if="storeFileCount !== null" class="text-gray-600"> · {{ storeFileCount.toLocaleString('it-IT') }} vorn</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button @click="closeStore" class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 transition-colors">
          <ArrowRightStartOnRectangleIcon class="w-4 h-4" />
          Cambia store
        </button>
        <button @click="refreshStore" class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 transition-colors">
          <ArrowPathIcon class="w-4 h-4" :class="{ 'animate-spin': state.loading }" />
          Aggiorna
        </button>
        <button
          @click="showClearModal = true"
          :disabled="state.clear.running"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-red-600/50 hover:text-red-400 hover:bg-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowPathIcon v-if="state.clear.running" class="w-4 h-4 animate-spin" />
          <TrashIcon v-else class="w-4 h-4" />
          <span v-if="state.clear.running">{{ state.clear.progress?.deleted ?? 0 }}/{{ state.clear.progress?.total ?? 0 }}</span>
          <span v-else>Svuota store</span>
        </button>
        <button
          @click="runIntegrity"
          :disabled="state.integrity.running"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowPathIcon v-if="state.integrity.running" class="w-4 h-4 animate-spin" />
          <WrenchScrewdriverIcon v-else class="w-4 h-4" />
          <span v-if="state.integrity.running">{{ state.integrity.progress?.current ?? 0 }}/{{ state.integrity.progress?.total ?? 0 }}</span>
          <span v-else>Verifica integrità</span>
        </button>
      </div>
    </div>

    <!-- Modal bloccante: svuota in corso -->
    <div v-if="state.clear.running" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px]">
      <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
          <div class="w-8 h-8 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
            <ArrowPathIcon class="w-4 h-4 text-red-400 animate-spin" />
          </div>
          <div>
            <p class="text-sm font-bold text-white">Svuotamento in corso…</p>
            <p class="text-xs text-gray-500 mt-0.5">Non chiudere l'applicazione</p>
          </div>
        </div>
        <div class="px-6 py-5 space-y-4">
          <div class="flex items-center justify-between text-xs font-mono mb-1">
            <span class="text-red-400">{{ (state.clear.progress?.deleted ?? 0).toLocaleString('it-IT') }} eliminati</span>
            <span class="text-gray-500">{{ (state.clear.progress?.total ?? 0).toLocaleString('it-IT') }} totali</span>
          </div>
          <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-red-500 rounded-full transition-all duration-300"
              :style="{ width: clearProgressPct + '%' }"
            />
          </div>
          <p v-if="state.clear.progress?.failed" class="text-xs text-amber-400">
            {{ state.clear.progress.failed }} errori
          </p>
        </div>
        <div class="px-6 py-4 bg-gray-800/30 flex justify-end">
          <button
            @click="stopClear"
            class="px-4 py-2 rounded-md text-xs font-semibold text-white bg-red-700 hover:bg-red-600 transition-colors"
          >
            Stop
          </button>
        </div>
      </div>
    </div>

    <!-- Table Area -->
    <div class="flex-1 overflow-hidden flex flex-col">

      <!-- Header fisso -->
      <div class="shrink-0 bg-gray-950 border-b border-gray-800/60 px-8">
        <table class="w-full text-sm" style="table-layout:fixed">
          <colgroup>
            <col style="width:60%" />
            <col style="width:18%" />
            <col style="width:22%" />
          </colgroup>
          <thead>
            <tr>
              <th class="py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">Hash</th>
              <th class="py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">Dimensione</th>
              <th class="py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ultima modifica</th>
            </tr>
          </thead>
        </table>
      </div>

      <!-- Body scrollabile -->
      <div class="flex-1 overflow-auto px-8 pb-4">
        <table class="w-full text-sm" style="table-layout:fixed">
          <colgroup>
            <col style="width:60%" />
            <col style="width:18%" />
            <col style="width:22%" />
          </colgroup>
          <tbody>
            <tr v-for="(entry, i) in state.storeEntries" :key="entry.hash_vorn" class="hover:bg-gray-800/20 transition-colors" :class="i > 0 ? 'border-t border-gray-800/60' : ''">
              <td class="py-3 pr-5">
                <span class="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md break-all">
                  {{ entry.hash_vorn }}
                </span>
              </td>
              <td class="py-3 pr-5 text-right font-mono text-sm text-gray-300">
                {{ formatBytes(entry.bytes_file) }}
              </td>
              <td class="py-3 text-xs text-gray-400">
                {{ formatTs(entry.mtime) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div ref="sentinel" class="h-4"></div>

        <div v-if="state.loading" class="py-6 flex justify-center">
          <ArrowPathIcon class="w-6 h-6 text-indigo-500 animate-spin" />
        </div>

        <div v-if="state.storeEntries.length === 0 && !state.loading" class="flex flex-col items-center justify-center h-48 text-center">
          <ArchiveBoxIcon class="w-8 h-8 text-gray-700 mb-3" />
          <p class="text-gray-500 text-sm">Nessun file nel cassetto</p>
        </div>
      </div>
    </div>

    <!-- Modal: svuota store -->
    <div
      v-if="showClearModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
      @click.self="closeClearModal"
    >
      <div class="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <TrashIcon class="w-4 h-4 text-red-400" />
            </div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">Svuota Store</h3>
          </div>
          <button @click="closeClearModal" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <div class="rounded-md bg-red-950/30 border border-red-900/40 px-4 py-3 space-y-2">
            <p class="text-xs font-semibold text-red-300 uppercase tracking-wider">Operazione irreversibile</p>
            <p class="text-xs text-gray-400">
              Tutti i <span class="text-white font-semibold">{{ storeFileCount ?? '?' }} file .vorn</span> nello store verranno eliminati definitivamente.
              I manifest delle sessioni non vengono toccati, ma i dati di backup saranno irrecuperabili.
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400 mb-2">Digita <span class="font-mono font-bold text-white">ELIMINA</span> per confermare</p>
            <input
              v-model="clearConfirmText"
              type="text"
              placeholder="ELIMINA"
              class="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 transition-colors"
            />
          </div>
        </div>
        <div class="px-6 py-4 bg-gray-800/30 flex items-center justify-end gap-3">
          <button @click="closeClearModal" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            Annulla
          </button>
          <button
            @click="confirmClearStore"
            :disabled="clearConfirmText !== 'ELIMINA'"
            class="px-5 py-2 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-lg shadow-red-500/20"
          >
            Elimina tutto
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: report clear store -->
    <div
      v-if="state.clear.report"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
      @click.self="state.clear.report = null"
    >
      <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <TrashIcon class="w-4 h-4 text-red-400" />
            </div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">Store svuotato</h3>
          </div>
          <button @click="state.clear.report = null" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
        <div class="px-6 py-5 grid grid-cols-2 gap-4 border-b border-gray-800">
          <div class="text-center">
            <p class="text-2xl font-bold text-white">{{ state.clear.report.deleted ?? 0 }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Eliminati</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold" :class="(state.clear.report.failed ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'">
              {{ state.clear.report.failed ?? 0 }}
            </p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Errori</p>
          </div>
        </div>
        <div class="px-6 py-4 flex justify-end">
          <button @click="state.clear.report = null" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: report integrità -->
    <div
      v-if="state.integrity.report"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
      @click.self="state.integrity.report = null"
    >
      <div class="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div
              :class="state.integrity.report.errors.length ? 'bg-red-500/15 border-red-500/30' : 'bg-emerald-500/15 border-emerald-500/30'"
              class="w-8 h-8 rounded-md border flex items-center justify-center shrink-0"
            >
              <ExclamationTriangleIcon v-if="state.integrity.report.errors.length" class="w-4 h-4 text-red-400" />
              <CheckCircleIcon v-else class="w-4 h-4 text-emerald-400" />
            </div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">Report Integrità</h3>
          </div>
          <button @click="state.integrity.report = null" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
        <div class="px-6 py-4 border-b border-gray-800 grid grid-cols-3 gap-4 shrink-0">
          <div class="text-center">
            <p class="text-2xl font-bold text-white">{{ state.integrity.report.total }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Controllati</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-emerald-400">{{ state.integrity.report.ok }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Integri</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold" :class="state.integrity.report.errors.length ? 'text-red-400' : 'text-gray-500'">
              {{ state.integrity.report.errors.length }}
            </p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Corrotti</p>
          </div>
        </div>
        <div class="flex-1 overflow-auto">
          <div v-if="state.integrity.report.errors.length === 0" class="flex flex-col items-center justify-center py-12 text-center gap-3">
            <CheckCircleIcon class="w-10 h-10 text-emerald-500" />
            <p class="text-sm text-gray-300 font-medium">Tutti i file sono integri</p>
            <p class="text-xs text-gray-500">Nessuna anomalia rilevata nello store.</p>
          </div>
          <div v-else class="px-6 py-4 space-y-3">
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">File corrotti</p>
            <div
              v-for="(entry, i) in state.integrity.report.errors"
              :key="i"
              class="bg-red-950/20 border border-red-900/40 rounded-lg p-4"
            >
              <p class="font-mono text-xs text-red-300 mb-2 break-all">{{ entry.hashVorn }}</p>
              <ul class="space-y-1">
                <li v-for="(issue, j) in entry.issues" :key="j" class="flex items-start gap-2">
                  <ExclamationTriangleIcon class="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span class="text-xs text-gray-400">{{ issue }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 bg-gray-800/30 flex justify-end shrink-0">
          <button @click="state.integrity.report = null" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  WrenchScrewdriverIcon,
  XMarkIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  TrashIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/vue/24/outline'
import { state, fetchStorePage, startIntegrity, startClearStore, cancelTask, formatTs, formatBytes, closeStore } from '../stores/vorn.js'

const ITEMS_PER_PAGE = 20

// Clear store
const showClearModal   = ref(false)
const clearConfirmText = ref('')

function closeClearModal() {
  showClearModal.value   = false
  clearConfirmText.value = ''
}

const clearProgressPct = computed(() => {
  const p = state.clear.progress
  if (!p?.total) return 0
  return Math.round((p.deleted / p.total) * 100)
})

async function confirmClearStore() {
  if (clearConfirmText.value !== 'ELIMINA') return
  closeClearModal()
  await startClearStore()
}

function stopClear() {
  const task = Object.values(state.tasks).find(t => t.type === 'clear' && t.status === 'running')
  if (task) cancelTask(task.id)
}

async function runIntegrity() {
  if (!state.activeStore) return
  await startIntegrity()
}

// Infinite scroll
const storeFileCount = ref(null)
const sentinel = ref(null)
let currentOffset = 0
let hasMore = true
let observer = null

async function loadNextPage() {
  if (!hasMore || state.loading || !state.activeStore) return
  const result = await fetchStorePage(currentOffset, ITEMS_PER_PAGE)
  currentOffset += result.files.length
  if (currentOffset >= result.total) hasMore = false
}

async function refreshStore() {
  currentOffset = 0
  hasMore = true
  state.storeEntries = []
  state.storeLoaded  = false
  if (state.activeStore)
    window.vorn.countStoreFiles(state.activeStore).then(n => { storeFileCount.value = n })
  await loadNextPage()
}

function setupObserver() {
  if (!sentinel.value) return
  observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadNextPage() },
    { threshold: 0.1 }
  )
  observer.observe(sentinel.value)
}

watch(() => state.clear.running, (running, wasRunning) => {
  if (wasRunning && !running && !state.clear.report?.fatalError) {
    storeFileCount.value = 0
    state.storeEntries   = []
    state.storeLoaded    = false
    currentOffset        = 0
    hasMore              = false
  }
})

onMounted(async () => {
  if (!state.activeStore) return
  window.vorn.countStoreFiles(state.activeStore).then(n => { storeFileCount.value = n })
  await refreshStore()
  setupObserver()
})

onUnmounted(() => observer?.disconnect())
</script>
