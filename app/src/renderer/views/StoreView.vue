<template>
  <div class="flex h-full overflow-hidden">

    <!-- Main panel -->
    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">

      <!-- Header -->
      <div class="px-8 py-6 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div>
          <h1 class="text-xl font-semibold text-white">Store</h1>
          <p class="text-sm text-gray-500 mt-0.5 font-mono">{{ storePath }}</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 transition-colors">
            <WrenchScrewdriverIcon class="w-4 h-4" />
            Verifica integrità
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="px-8 py-4 grid grid-cols-4 gap-4 border-b border-gray-800 shrink-0">
        <div v-for="stat in storeStats" :key="stat.label"
          class="bg-gray-900 border border-gray-800 rounded-md p-4">
          <p class="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">{{ stat.label }}</p>
          <p class="text-2xl font-bold text-white">{{ stat.value }}</p>
          <p v-if="stat.sub" class="text-xs text-gray-600 mt-0.5">{{ stat.sub }}</p>
        </div>
      </div>

      <!-- Search + filter -->
      <div class="px-8 py-3 border-b border-gray-800 shrink-0 flex items-center gap-3">
        <div class="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            v-model="search"
            placeholder="Cerca per hash o nome file…"
            class="w-full bg-gray-900 border border-gray-700 rounded-md pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          />
        </div>
        <div class="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-md p-1">
          <button
            v-for="f in filters"
            :key="f.id"
            @click="activeFilter = f.id"
            :class="[
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeFilter === f.id
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            ]"
          >{{ f.label }}</button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="!state.storeLoaded" class="flex-1 flex items-center justify-center px-8">
        <div class="flex items-center gap-3 text-gray-500">
          <ArrowPathIcon class="w-5 h-5 animate-spin" />
          <span class="text-sm">Aggregazione dati store…</span>
        </div>
      </div>

      <!-- Table -->
      <div v-else class="flex-1 overflow-auto px-8 py-4">
        <table class="w-full text-sm">
          <thead>
            <tr>
              <th class="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">Hash</th>
              <th class="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">Nome / Percorso</th>
              <th class="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">Tipo</th>
              <th class="pb-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">Dimensione</th>
              <th class="pb-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">Sessioni</th>
              <th class="pb-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">Ref.</th>
              <th class="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ultimo accesso</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800/60">
            <tr
              v-for="entry in filteredEntries"
              :key="entry.hash_vorn"
              @click="selectStoreEntry(entry)"
              :class="[
                'group cursor-pointer transition-colors',
                state.selectedStoreEntry?.hash_vorn === entry.hash_vorn
                  ? 'bg-indigo-500/10'
                  : 'hover:bg-gray-800/40'
              ]"
            >
              <!-- Hash -->
              <td class="py-3 pr-5">
                <span class="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md group-hover:bg-indigo-500/20 transition-colors">
                  {{ shortHash(entry.hash_vorn) }}
                </span>
              </td>

              <!-- Name -->
              <td class="py-3 pr-5">
                <div class="flex items-center gap-2">
                  <component :is="fileIcon(primaryName(entry))" class="w-4 h-4 text-gray-500 shrink-0" />
                  <div>
                    <p class="text-gray-200 font-medium truncate max-w-55">{{ primaryName(entry) }}</p>
                    <p class="text-xs text-gray-600 truncate max-w-55 font-mono mt-0.5">{{ primaryPath(entry) }}</p>
                  </div>
                </div>
              </td>

              <!-- Ext badge -->
              <td class="py-3 pr-5">
                <span class="text-xs font-mono px-2 py-0.5 rounded-md bg-gray-800 text-gray-400 uppercase">
                  {{ ext(primaryName(entry)) }}
                </span>
              </td>

              <!-- Size -->
              <td class="py-3 pr-5 text-right font-mono text-sm text-gray-300">
                {{ formatBytes(entry.bytes) }}
              </td>

              <!-- Sessions count -->
              <td class="py-3 pr-5 text-right">
                <div class="flex items-center justify-end gap-1">
                  <span
                    v-for="sess in uniqueSessions(entry)"
                    :key="sess"
                    class="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400"
                  >{{ sess }}</span>
                </div>
              </td>

              <!-- Refs -->
              <td class="py-3 pr-5 text-right font-mono text-sm text-gray-400">
                {{ totalRefs(entry) }}
              </td>

              <!-- Last seen -->
              <td class="py-3 text-xs text-gray-400">
                {{ formatTs(entry.records.at(-1)?.ts) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="filteredEntries.length === 0" class="flex flex-col items-center justify-center h-48 text-center">
          <MagnifyingGlassIcon class="w-8 h-8 text-gray-700 mb-3" />
          <p class="text-gray-500 text-sm">Nessun file trovato</p>
        </div>
      </div>
    </div>

    <!-- Side panel: entry detail -->
    <transition name="slide">
      <div
        v-if="state.selectedStoreEntry"
        class="w-80 shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col overflow-hidden"
      >
        <!-- Panel header -->
        <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <p class="text-sm font-semibold text-gray-200">Dettaglio</p>
          <button @click="state.selectedStoreEntry = null" class="p-1 rounded-md text-gray-600 hover:text-gray-300 transition-colors">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 overflow-auto">
          <!-- Hash block -->
          <div class="px-5 py-4 border-b border-gray-800">
            <p class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">hash_vorn</p>
            <p class="font-mono text-xs text-indigo-400 break-all leading-relaxed">{{ state.selectedStoreEntry.hash_vorn }}</p>
          </div>

          <!-- Metadata -->
          <div class="px-5 py-4 border-b border-gray-800 grid grid-cols-2 gap-3">
            <div>
              <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Dimensione</p>
              <p class="text-sm font-semibold text-white">{{ formatBytes(state.selectedStoreEntry.bytes) }}</p>
            </div>
            <div>
              <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Tipo</p>
              <p class="text-sm font-semibold text-white uppercase">{{ ext(primaryName(state.selectedStoreEntry)) }}</p>
            </div>
            <div>
              <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Sessioni</p>
              <p class="text-sm font-semibold text-white">{{ uniqueSessions(state.selectedStoreEntry).length }}</p>
            </div>
            <div>
              <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Riferimenti</p>
              <p class="text-sm font-semibold text-white">{{ totalRefs(state.selectedStoreEntry) }}</p>
            </div>
          </div>

          <!-- Records / history -->
          <div class="px-5 py-4">
            <p class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-3">
              Cronologia record ({{ state.selectedStoreEntry.records.length }})
            </p>
            <div class="space-y-3">
              <div
                v-for="(rec, i) in state.selectedStoreEntry.records"
                :key="i"
                class="bg-gray-800/50 border border-gray-700/50 rounded-md p-3"
              >
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold text-violet-400">{{ rec.session }}</span>
                  <span class="text-[10px] text-gray-500 font-mono">{{ formatTs(rec.ts) }}</span>
                </div>
                <p class="text-[10px] text-gray-500 mb-2">Macchina: <span class="text-gray-400">{{ rec.machine }}</span></p>
                <div class="space-y-1">
                  <div
                    v-for="(p, j) in rec.paths"
                    :key="j"
                    class="flex items-start gap-1.5"
                  >
                    <DocumentIcon class="w-3 h-3 text-gray-600 mt-0.5 shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[11px] text-gray-300 font-medium truncate">{{ p.name }}</p>
                      <p class="text-[10px] text-gray-600 font-mono truncate">{{ p.path }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Panel actions -->
        <div class="px-5 py-3 border-t border-gray-800 flex gap-2">
          <button class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium text-gray-300 border border-gray-700 hover:bg-gray-800 transition-colors">
            <ArrowDownTrayIcon class="w-3.5 h-3.5" />
            Estrai
          </button>
          <button class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium text-gray-300 border border-gray-700 hover:bg-gray-800 transition-colors">
            <EyeIcon class="w-3.5 h-3.5" />
            Inspect
          </button>
        </div>
      </div>
    </transition>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
  DocumentIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  PhotoIcon,
  FilmIcon,
  MusicalNoteIcon,
  ArchiveBoxIcon,
  CodeBracketIcon,
  ArrowPathIcon,
} from '@heroicons/vue/24/outline'
import { state, selectStoreEntry, loadStoreEntries, formatTs, formatBytes, shortHash } from '../stores/vorn.js'

onMounted(() => loadStoreEntries())

const search = ref('')
const activeFilter = ref('all')

const filters = [
  { id: 'all',   label: 'Tutti' },
  { id: 'multi', label: 'Multi-sessione' },
  { id: 'large', label: 'Grandi' },
]

const storePath = computed(() => {
  const paths = [...new Set(state.sessions.map(s => s.store))]
  return paths.join(', ')
})

const storeStats = computed(() => {
  const entries = state.storeEntries
  const totalSize = entries.reduce((acc, e) => acc + e.bytes, 0)
  const refs = entries.reduce((acc, e) => acc + e.records.reduce((a, r) => a + r.paths.length, 0), 0)
  const dedup = refs - entries.length
  return [
    { label: 'File .vorn', value: entries.length.toLocaleString('it-IT') },
    { label: 'Dimensione totale', value: formatBytes(totalSize) },
    { label: 'Riferimenti totali', value: refs.toLocaleString('it-IT') },
    { label: 'Deduplicati', value: dedup > 0 ? '+' + dedup : '0', sub: 'path aggiuntivi risparmiati' },
  ]
})

const filteredEntries = computed(() => {
  let list = state.storeEntries
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(e =>
      e.hash_vorn.includes(q) ||
      e.records.some(r => r.paths.some(p => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)))
    )
  }
  if (activeFilter.value === 'multi') list = list.filter(e => uniqueSessions(e).length > 1)
  if (activeFilter.value === 'large') list = list.filter(e => e.bytes > 1024 * 1024)
  return list
})

function primaryName(entry) {
  return entry.records[0]?.paths[0]?.name ?? '—'
}
function primaryPath(entry) {
  return entry.records[0]?.paths[0]?.path ?? ''
}
function uniqueSessions(entry) {
  return [...new Set(entry.records.map(r => r.session))]
}
function totalRefs(entry) {
  return entry.records.reduce((acc, r) => acc + r.paths.length, 0)
}
function ext(name) {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1) : '—'
}

const imageExts   = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'bmp'])
const videoExts   = new Set(['mp4', 'mov', 'avi', 'mkv', 'wmv', 'webm'])
const audioExts   = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'])
const archiveExts = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2'])
const codeExts    = new Set(['js', 'ts', 'vue', 'py', 'json', 'yaml', 'yml', 'md', 'html', 'css'])

function fileIcon(name) {
  const e = ext(name).toLowerCase()
  if (imageExts.has(e))   return PhotoIcon
  if (videoExts.has(e))   return FilmIcon
  if (audioExts.has(e))   return MusicalNoteIcon
  if (archiveExts.has(e)) return ArchiveBoxIcon
  if (codeExts.has(e))    return CodeBracketIcon
  return DocumentIcon
}
</script>

<style scoped>
.slide-enter-active, .slide-leave-active {
  transition: all 0.2s ease;
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
