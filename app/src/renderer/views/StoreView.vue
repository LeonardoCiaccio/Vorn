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
          <button class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 transition-colors">
            <WrenchScrewdriverIcon class="w-4 h-4" />
            Verifica integrità
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
              <col style="width:50%" />
              <col style="width:25%" />
              <col style="width:25%" />
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
              <col style="width:50%" />
              <col style="width:25%" />
              <col style="width:25%" />
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
                  <span class="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md group-hover:bg-indigo-500/20 transition-colors">
                    {{ entry.hash_vorn.slice(0, 12) }}…{{ entry.hash_vorn.slice(-8) }}
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

    <!-- Side panel: metadata surgeon -->
    <transition name="slide">
      <div
        v-if="state.selectedStoreEntry"
        class="w-96 shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col overflow-hidden shadow-2xl"
      >
        <!-- Panel header -->
        <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
          <p class="text-sm font-bold text-white uppercase tracking-tighter">Metadati Chirurgici</p>
          <button @click="state.selectedStoreEntry = null" class="p-1 rounded-md text-gray-600 hover:text-white transition-colors">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 overflow-auto">
          <!-- Loading Full Meta -->
          <div v-if="state.selectedStoreEntry.loading" class="p-10 flex flex-col items-center gap-4 text-gray-500">
            <ArrowPathIcon class="w-8 h-8 animate-spin text-indigo-500" />
            <p class="text-xs italic">Estrazione metadati in corso...</p>
          </div>

          <div v-else>
            <!-- Hash block -->
            <div class="px-5 py-6 border-b border-gray-800 bg-indigo-500/5">
              <p class="text-[10px] font-semibold text-indigo-400 uppercase tracking-widest mb-2">Fingerprint</p>
              <p class="font-mono text-xs text-gray-200 break-all leading-relaxed">{{ state.selectedStoreEntry.hash_vorn }}</p>
            </div>

            <!-- Stats Grid -->
            <div class="px-5 py-4 border-b border-gray-800 grid grid-cols-2 gap-4">
              <div>
                <p class="text-[10px] text-gray-500 uppercase mb-1">Dati Puri</p>
                <p class="text-sm font-mono text-white">{{ formatBytes(state.selectedStoreEntry.bytes) }}</p>
              </div>
              <div>
                <p class="text-[10px] text-gray-500 uppercase mb-1">Records</p>
                <p class="text-sm font-mono text-white">{{ state.selectedStoreEntry.records?.length ?? 0 }}</p>
              </div>
            </div>

            <!-- History -->
            <div class="px-5 py-6">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                Storia dei percorsi
              </p>
              <div class="space-y-4">
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
                    <div v-for="(p, j) in rec.paths" :key="j" class="group">
                      <div class="flex items-start gap-2">
                        <DocumentIcon class="w-3.5 h-3.5 text-gray-600 mt-0.5" />
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

        <!-- Panel actions -->
        <div class="px-5 py-4 border-t border-gray-800 bg-gray-950 flex gap-2">
          <button class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/10">
            <ArrowDownTrayIcon class="w-4 h-4" />
            Estrai Dati
          </button>
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
  ArrowDownTrayIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
} from '@heroicons/vue/24/outline'
import { state, fetchStorePage, handleSelectStoreEntry, formatTs, formatBytes } from '../stores/vorn.js'

const ITEMS_PER_PAGE = 20

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
.slide-enter-active, .slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
