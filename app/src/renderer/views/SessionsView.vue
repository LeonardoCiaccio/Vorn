<template>
  <div class="flex flex-col h-full">

    <!-- Header -->
    <div class="px-8 py-6 border-b border-gray-800 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-xl font-semibold text-white">Sessioni</h1>
        <p class="text-sm text-gray-500 mt-0.5">{{ sessions.length }} sessioni configurate</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="showReconstructModal = true"
          :disabled="anyTaskRunning"
          class="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Ricostruisci sessioni leggendo i metadati dallo store"
        >
          <CircleStackIcon class="w-4 h-4" />
          Ricostruisci dallo store
        </button>
        <button
          @click="showModal = true"
          class="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
        >
          <PlusIcon class="w-4 h-4" />
          Nuova sessione
        </button>
      </div>
    </div>

    <!-- Stats strip -->
    <div class="px-8 py-4 grid grid-cols-4 gap-4 border-b border-gray-800 shrink-0">
      <div v-for="stat in globalStats" :key="stat.label" class="bg-gray-900 rounded-md p-4 border border-gray-800">
        <p class="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{{ stat.label }}</p>
        <p class="text-2xl font-bold text-white">{{ stat.value }}</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="state.loading" class="flex-1 flex items-center justify-center">
      <div class="flex items-center gap-3 text-gray-500">
        <ArrowPathIcon class="w-5 h-5 animate-spin" />
        <span class="text-sm">Caricamento sessioni…</span>
      </div>
    </div>

    <!-- Table -->
    <div v-else class="flex-1 overflow-auto px-8 py-6">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left">
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider pr-6">Sessione</th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider pr-6">Store</th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider pr-6">Ultima run</th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider pr-6">Stato</th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider pr-6 text-right">Run</th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">File</th>
            <th class="pb-3 w-10"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="session in sessions" :key="session.name">
            <!-- Riga principale -->
            <tr
              @click="selectSession(session)"
              class="group cursor-pointer hover:bg-gray-800/40 transition-colors border-t border-gray-800/60"
              :class="activeTask(session.name) ? 'bg-indigo-950/20' : ''"
            >
              <!-- Name + sources -->
              <td class="py-3.5 pr-6">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-md bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/10 transition-colors"
                    :class="activeTask(session.name) ? 'border-indigo-500/40 bg-indigo-500/10' : ''"
                  >
                    <FolderIcon v-if="!activeTask(session.name)" class="w-4 h-4 text-gray-500 group-hover:text-indigo-400 transition-colors" />
                    <ArrowPathIcon v-else class="w-4 h-4 text-indigo-400 animate-spin" />
                  </div>
                  <div>
                    <p class="font-semibold text-gray-100">{{ session.name }}</p>
                    <p class="text-xs text-gray-500 mt-0.5">{{ session.sources.length }} sorgente{{ session.sources.length !== 1 ? 'i' : '' }}</p>
                  </div>
                </div>
              </td>

              <!-- Store -->
              <td class="py-3.5 pr-6">
                <p class="text-gray-400 font-mono text-xs truncate max-w-45">{{ session.store }}</p>
              </td>

              <!-- Last run -->
              <td class="py-3.5 pr-6">
                <span v-if="session.runs.length" class="text-gray-300">{{ formatTs(session.runs[0].ts) }}</span>
                <span v-else class="text-gray-600 italic">Mai eseguita</span>
              </td>

              <!-- Status -->
              <td class="py-3.5 pr-6">
                <template v-if="activeTask(session.name)">
                  <div class="flex items-center gap-2">
                    <StatusBadge status="running" />
                    <span class="text-xs font-mono text-indigo-300">
                      {{ progressPct(session.name) }}%
                    </span>
                  </div>
                </template>
                <StatusBadge v-else-if="session.runs.length" :status="session.runs[0].status" />
                <span v-else class="text-gray-600 text-xs">—</span>
              </td>

              <!-- Run count -->
              <td class="py-3.5 pr-6 text-right">
                <span class="text-gray-300 font-mono font-medium">{{ session.runs.length }}</span>
              </td>

              <!-- Files: live se in corso, altrimenti dall'ultima run -->
              <td class="py-3.5 text-right">
                <span class="text-gray-300 font-mono font-medium">
                  <template v-if="activeTask(session.name) && activeTask(session.name).progress">
                    {{ (activeTask(session.name).progress.current ?? 0).toLocaleString('it-IT') }}
                    <span class="text-gray-600">/ {{ (activeTask(session.name).progress.total ?? 0).toLocaleString('it-IT') }}</span>
                  </template>
                  <template v-else>
                    {{ session.runs.length ? (session.runs[0].files_total ?? session.runs[0].files_count ?? 0).toLocaleString('it-IT') : '—' }}
                  </template>
                </span>
              </td>

              <!-- Azioni -->
              <td class="py-3.5 pl-3 text-right" @click.stop>
                <!-- Conferma eliminazione -->
                <div v-if="confirmName === session.name" class="flex items-center justify-end gap-1.5">
                  <ExclamationTriangleIcon class="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <button
                    @click="confirmDelete($event, session.name)"
                    class="px-2 py-1 rounded text-[11px] font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors"
                  >Elimina</button>
                  <button
                    @click="cancelDelete($event)"
                    class="px-2 py-1 rounded text-[11px] text-gray-400 hover:text-white transition-colors"
                  >Annulla</button>
                </div>
                <!-- Tasto cestino (visibile su hover, disabilitato se task attivo) -->
                <button
                  v-else
                  @click="askDelete($event, session.name)"
                  :disabled="!!activeTask(session.name)"
                  class="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                  title="Elimina sessione"
                >
                  <TrashIcon class="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>

            <!-- Sub-row progresso — visibile solo quando il backup è in corso -->
            <tr v-if="activeTask(session.name)" @click="selectSession(session)" class="cursor-pointer bg-indigo-950/10 hover:bg-indigo-950/20 transition-colors">
              <td colspan="7" class="px-6 pb-3 pt-0">
                <div class="pl-11">
                  <!-- Barra di avanzamento -->
                  <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden mb-2">
                    <div
                      class="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      :style="{ width: progressPct(session.name) + '%' }"
                    />
                  </div>

                  <!-- Stats inline -->
                  <div class="flex items-center gap-5 text-[11px]">
                    <span class="text-emerald-400 font-medium">
                      +{{ (activeTask(session.name).progress?.files_new ?? 0).toLocaleString('it-IT') }} nuovi
                    </span>
                    <span class="text-gray-500">
                      {{ (activeTask(session.name).progress?.files_dedup ?? 0).toLocaleString('it-IT') }} dedup
                    </span>
                    <span class="text-gray-400">
                      {{ formatBytes(activeTask(session.name).progress?.bytes_new ?? 0) }} scritti
                    </span>
                    <span class="text-gray-500">
                      {{ formatBytes(activeTask(session.name).progress?.bytes_total ?? 0) }} totali
                    </span>
                    <span v-if="activeTask(session.name).progress?.errors" class="text-red-400">
                      {{ activeTask(session.name).progress.errors }} errori
                    </span>
                    <span v-if="activeTask(session.name).progress?.file" class="text-gray-600 font-mono truncate max-w-72 ml-auto">
                      {{ activeTask(session.name).progress.file.split(/[\\/]/).at(-1) }}
                    </span>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Empty state -->
      <div v-if="sessions.length === 0" class="flex flex-col items-center justify-center h-64 text-center">
        <div class="w-16 h-16 rounded-md bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
          <ArchiveBoxIcon class="w-8 h-8 text-gray-600" />
        </div>
        <p class="text-gray-400 font-medium">Nessuna sessione</p>
        <p class="text-gray-600 text-sm mt-1">Crea la tua prima sessione per iniziare a fare backup</p>
      </div>
    </div>

  </div>

  <NewSessionModal v-if="showModal" @close="showModal = false" @created="showModal = false" />
  <ReconstructModal v-if="showReconstructModal" @close="showReconstructModal = false" />
</template>

<script setup>
import { ref, computed } from 'vue'
import { PlusIcon, FolderIcon, ArchiveBoxIcon, ArrowPathIcon, TrashIcon, ExclamationTriangleIcon, CircleStackIcon } from '@heroicons/vue/24/outline'
import { state, selectSession, deleteSession, getActiveTask, formatTs, formatBytes } from '../stores/vorn.js'
import StatusBadge from '../components/StatusBadge.vue'
import NewSessionModal from '../components/NewSessionModal.vue'
import ReconstructModal from '../components/ReconstructModal.vue'

const showModal            = ref(false)
const showReconstructModal = ref(false)
const sessions             = computed(() => state.sessions)
const anyTaskRunning       = computed(() => Object.values(state.tasks).some(t => t.status === 'running'))
const confirmName = ref(null) // nome sessione in attesa di conferma eliminazione

function activeTask(sessionName) {
  return getActiveTask(sessionName)
}

function progressPct(sessionName) {
  const p = getActiveTask(sessionName)?.progress
  if (!p?.total) return 0
  return Math.round((p.current / p.total) * 100)
}

function askDelete(e, sessionName) {
  e.stopPropagation()
  confirmName.value = sessionName
}

function cancelDelete(e) {
  e.stopPropagation()
  confirmName.value = null
}

async function confirmDelete(e, sessionName) {
  e.stopPropagation()
  confirmName.value = null
  await deleteSession(sessionName)
}

const globalStats = computed(() => {
  const totalRuns  = sessions.value.reduce((acc, s) => acc + s.runs.length, 0)
  const totalFiles = sessions.value.reduce((acc, s) => acc + (s.runs[0]?.files_total ?? s.runs[0]?.files_count ?? 0), 0)
  const lastRun    = sessions.value.flatMap(s => s.runs).sort((a, b) => b.ts.localeCompare(a.ts))[0]

  return [
    { label: 'Sessioni',        value: sessions.value.length },
    { label: 'Run totali',      value: totalRuns },
    { label: 'File indicizzati',value: totalFiles.toLocaleString('it-IT') },
    { label: 'Ultimo backup',   value: lastRun ? formatTs(lastRun.ts).split(',')[0] : '—' },
  ]
})
</script>
