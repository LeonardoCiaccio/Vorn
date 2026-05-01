<template>
  <div class="flex h-full overflow-hidden">

    <!-- Main panel -->
    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">

      <!-- Header -->
      <div class="px-8 py-6 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div>
          <h1 class="text-xl font-semibold text-white">Store</h1>
          <p class="text-sm text-gray-500 mt-0.5 font-mono">{{ currentStorePath }}</p>
        </div>
        <div class="flex items-center gap-2">
          <button @click="refreshStore" class="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <ArrowPathIcon class="w-5 h-5" :class="{ 'animate-spin': state.loading }" />
          </button>
          <button
            @click="showSanitizeModal = true"
            :disabled="state.sanitize.running"
            class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-amber-600/50 hover:text-amber-300 hover:bg-amber-500/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowPathIcon v-if="state.sanitize.running" class="w-4 h-4 animate-spin" />
            <SparklesIcon v-else class="w-4 h-4" />
            <span v-if="state.sanitize.running">{{ state.sanitize.progress?.current ?? 0 }}/{{ state.sanitize.progress?.total ?? 0 }}</span>
            <span v-else>Sanitizza</span>
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

      <!-- Stats (Simplified) -->
      <div class="px-8 py-4 grid grid-cols-2 gap-4 border-b border-gray-800 shrink-0">
        <div class="bg-gray-900 border border-gray-800 rounded-md p-4">
          <p class="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">File .vorn rilevati</p>
          <p class="text-2xl font-bold text-white">{{ totalFilesCount }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-md p-4">
          <p class="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Stato Store</p>
          <p class="text-2xl font-bold text-emerald-500">Ottimizzato</p>
          <p class="text-xs text-gray-600 mt-0.5">Lettura chirurgica attiva</p>
        </div>
      </div>

      <!-- Table Area -->
      <div class="flex-1 overflow-hidden flex flex-col">

        <!-- Header fisso -->
        <div class="shrink-0 bg-gray-950 border-b border-gray-800 px-8">
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
            <tbody class="divide-y divide-gray-800/60">
              <tr
                v-for="entry in state.storeEntries"
                :key="entry.hash_vorn"
                @click="onEntrySelect(entry)"
                :class="[
                  'group cursor-pointer transition-colors',
                  state.selectedStoreEntry?.hash_vorn === entry.hash_vorn
                    ? 'bg-indigo-500/10'
                    : 'hover:bg-gray-800/40'
                ]"
              >
                <td class="py-3 pr-5">
                  <span class="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md group-hover:bg-indigo-500/20 transition-colors break-all">
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
    </div>

    <!-- Modal: configurazione sanitize -->
    <div
      v-if="showSanitizeModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      @click.self="showSanitizeModal = false"
    >
      <div class="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <SparklesIcon class="w-4 h-4 text-amber-400" />
            </div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">Sanitizza Store</h3>
          </div>
          <button @click="showSanitizeModal = false" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-5">
          <!-- Range selector -->
          <div>
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Finestra temporale da mantenere</p>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="m in [1, 3, 6, 12]" :key="m"
                @click="sanitizeMonths = m"
                :class="[
                  'py-2.5 rounded-md text-sm font-semibold border transition-all',
                  sanitizeMonths === m
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                ]"
              >{{ m }} {{ m === 1 ? 'mese' : 'mesi' }}</button>
            </div>
          </div>

          <!-- Cutoff info -->
          <div class="rounded-md bg-gray-800/60 border border-gray-700 px-4 py-3 space-y-1">
            <p class="text-xs text-gray-400">Verranno eliminati tutti i dati <span class="text-white font-semibold">precedenti al {{ sanitizeCutoffLabel }}</span>.</p>
          </div>

          <!-- Conseguenze -->
          <div class="rounded-md bg-amber-950/30 border border-amber-900/40 px-4 py-3 space-y-2">
            <p class="text-xs font-semibold text-amber-300 uppercase tracking-wider">Cosa verrà eliminato</p>
            <ul class="space-y-1.5 text-xs text-gray-400">
              <li class="flex items-start gap-2">
                <ExclamationTriangleIcon class="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                I record storici nei file <span class="font-mono text-gray-300">.vorn</span> più vecchi della data di taglio.
              </li>
              <li class="flex items-start gap-2">
                <TrashIcon class="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <span>
                  <span class="text-white font-semibold">{{ affectedRuns }} run</span> eliminate da tutte le sessioni.
                  <span class="text-gray-500"> (i dati nello store rimangono)</span>
                </span>
              </li>
            </ul>
          </div>

          <p class="text-[10px] text-gray-600">Questa operazione è irreversibile. Il contenuto dei file di backup non viene toccato.</p>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-gray-800/30 flex items-center justify-end gap-3">
          <button @click="showSanitizeModal = false" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            Annulla
          </button>
          <button
            @click="confirmSanitize"
            class="px-5 py-2 rounded-md text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors shadow-lg shadow-amber-500/20"
          >
            Avvia Sanitizzazione
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: report sanitize -->
    <div
      v-if="state.sanitize.report"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      @click.self="state.sanitize.report = null"
    >
      <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircleIcon class="w-4 h-4 text-emerald-400" />
            </div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">Sanitizzazione completata</h3>
          </div>
          <button @click="state.sanitize.report = null" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
        <div class="px-6 py-5 grid grid-cols-3 gap-4 border-b border-gray-800">
          <div class="text-center">
            <p class="text-2xl font-bold text-white">{{ state.sanitize.report.vornFilesModified ?? 0 }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">File .vorn</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-amber-400">{{ state.sanitize.report.vornRecordsRemoved ?? 0 }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Record rimossi</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-red-400">{{ state.sanitize.report.runsDeleted ?? 0 }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Run eliminate</p>
          </div>
        </div>
        <div class="px-6 py-4 flex justify-end">
          <button @click="state.sanitize.report = null" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: report integrità -->
    <div
      v-if="state.integrity.report"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      @click.self="state.integrity.report = null"
    >
      <div class="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">

        <!-- Header -->
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

        <!-- Summary -->
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

        <!-- Error list -->
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

        <!-- Footer -->
        <div class="px-6 py-4 bg-gray-800/30 flex justify-end shrink-0">
          <button
            @click="state.integrity.report = null"
            class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors"
          >
            Chiudi
          </button>
        </div>

      </div>
    </div>

    <!-- Drawer: metadata entry -->
    <transition name="slide">
      <div v-if="state.selectedStoreEntry" class="fixed inset-0 z-40 flex justify-end">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="state.selectedStoreEntry = null" />
        <div class="drawer-panel relative w-md h-full bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl overflow-hidden">

          <!-- Header -->
          <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900/90 backdrop-blur-md z-10">
            <div>
              <p class="text-sm font-bold text-white">Metadati</p>
              <p class="text-[10px] text-gray-500 font-mono mt-0.5 truncate max-w-60">{{ state.selectedStoreEntry.hash_vorn }}</p>
            </div>
            <button @click="state.selectedStoreEntry = null" class="p-1 rounded-md text-gray-600 hover:text-white transition-colors">
              <XMarkIcon class="w-4 h-4" />
            </button>
          </div>

          <!-- Loading -->
          <div v-if="state.selectedStoreEntry.loading" class="p-10 flex flex-col items-center gap-4 text-gray-500">
            <ArrowPathIcon class="w-8 h-8 animate-spin text-indigo-500" />
            <p class="text-xs italic">Estrazione metadati in corso...</p>
          </div>

          <div v-else class="flex-1 overflow-auto">
            <!-- Fingerprint -->
            <div class="px-5 py-4 border-b border-gray-800 bg-indigo-500/5">
              <p class="text-[10px] font-semibold text-indigo-400 uppercase tracking-widest mb-2">Fingerprint</p>
              <p class="font-mono text-xs text-gray-200 break-all leading-relaxed">{{ state.selectedStoreEntry.hash_vorn }}</p>
            </div>

            <!-- Stats -->
            <div class="px-5 py-4 border-b border-gray-800 grid grid-cols-2 gap-4">
              <div>
                <p class="text-[10px] text-gray-500 uppercase mb-1">Dati puri</p>
                <p class="text-sm font-mono text-white">{{ formatBytes(state.selectedStoreEntry.bytes) }}</p>
              </div>
              <div>
                <p class="text-[10px] text-gray-500 uppercase mb-1">Records</p>
                <p class="text-sm font-mono text-white">{{ state.selectedStoreEntry.records?.length ?? 0 }}</p>
              </div>
            </div>

            <!-- History -->
            <div class="px-5 py-5">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Storia dei percorsi</p>
              <div class="space-y-3">
                <div
                  v-for="(rec, i) in state.selectedStoreEntry.records"
                  :key="i"
                  class="bg-gray-800/30 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
                >
                  <div class="flex items-center justify-between mb-3">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 uppercase">{{ rec.session }}</span>
                    <span class="text-[10px] text-gray-500 font-mono">{{ formatTs(rec.ts) }}</span>
                  </div>
                  <div class="space-y-2">
                    <div v-for="(p, j) in rec.paths" :key="j">
                      <div class="flex items-start gap-2">
                        <DocumentIcon class="w-3.5 h-3.5 text-gray-600 mt-0.5 shrink-0" />
                        <div class="min-w-0 flex-1">
                          <p class="text-xs text-gray-200 font-medium truncate">{{ p.name.split(/[\\/]/).pop() }}</p>
                          <p class="text-[9px] text-gray-500 font-mono truncate mt-0.5">{{ p.path }}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </transition>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  WrenchScrewdriverIcon,
  XMarkIcon,
  DocumentIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { state, fetchStorePage, handleSelectStoreEntry, startIntegrity, startSanitize, formatTs, formatBytes } from '../stores/vorn.js'

const ITEMS_PER_PAGE = 20

// Sanitize
const showSanitizeModal = ref(false)
const sanitizeMonths    = ref(3)

const sanitizeCutoff = computed(() => {
  const d = new Date()
  d.setMonth(d.getMonth() - sanitizeMonths.value)
  return d
})

const sanitizeCutoffTs = computed(() => sanitizeCutoff.value.toISOString())

const sanitizeCutoffLabel = computed(() =>
  sanitizeCutoff.value.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
)

const affectedRuns = computed(() => {
  let count = 0
  for (const session of state.sessions) {
    for (const run of (session.runs ?? [])) {
      if (run.ts < sanitizeCutoffTs.value) count++
    }
  }
  return count
})

async function confirmSanitize() {
  showSanitizeModal.value = false
  await startSanitize(currentStorePath.value, sanitizeCutoffTs.value)
}

async function runIntegrity() {
  const storeDir = currentStorePath.value
  if (!storeDir || storeDir === 'In attesa di sessioni...') return
  await startIntegrity(storeDir)
}

const totalFilesCount = ref(0)
const sentinel = ref(null)
let currentOffset = 0
let hasMore = true
let observer = null

const currentStorePath = computed(() => {
  if (state.sessions.length === 0) return 'In attesa di sessioni...'
  return state.sessions[0].store
})

async function loadNextPage() {
  if (!hasMore || state.loading) return
  const storeDir = currentStorePath.value
  if (!storeDir || storeDir === 'In attesa di sessioni...') return

  const result = await fetchStorePage(storeDir, currentOffset, ITEMS_PER_PAGE)
  totalFilesCount.value = result.total
  currentOffset += result.files.length
  if (currentOffset >= result.total) hasMore = false
}

async function refreshStore() {
  currentOffset = 0
  hasMore = true
  state.storeEntries = []
  state.storeLoaded = false
  await loadNextPage()
}

function onEntrySelect(entry) {
  handleSelectStoreEntry(currentStorePath.value, entry)
}

function setupObserver() {
  if (!sentinel.value) return
  observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadNextPage() },
    { threshold: 0.1 }
  )
  observer.observe(sentinel.value)
}

onMounted(async () => {
  if (state.sessions.length > 0) await refreshStore()
  setupObserver()
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.25s ease;
}
.slide-enter-active .drawer-panel,
.slide-leave-active .drawer-panel {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
.slide-enter-from .drawer-panel,
.slide-leave-to .drawer-panel {
  transform: translateX(100%);
}
</style>

