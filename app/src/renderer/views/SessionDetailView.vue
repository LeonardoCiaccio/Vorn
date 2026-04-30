<template>
  <div class="flex flex-col h-full">

    <!-- Header -->
    <div class="px-8 py-5 border-b border-gray-800 flex items-center gap-4 shrink-0">
      <button @click="goBack" class="p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
        <ArrowLeftIcon class="w-4 h-4" />
      </button>
      <div class="flex items-center gap-3 flex-1">
        <div class="w-9 h-9 rounded-md bg-linear-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center">
          <FolderOpenIcon class="w-4.5 h-4.5 text-indigo-400" />
        </div>
        <div>
          <h1 class="text-lg font-bold text-white">{{ session.name }}</h1>
          <p class="text-xs text-gray-500">Creata il {{ formatTs(session.ts) }}</p>
        </div>
      </div>
      <!-- Actions -->
      <div class="flex items-center gap-2">
        <button
          v-if="isRunning"
          @click="handleCancel"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-amber-300 border border-amber-600/50 hover:bg-amber-500/10 transition-colors"
        >
          <StopIcon class="w-4 h-4" />
          Sospendi
        </button>
        <button
          v-else
          @click="handleBackup"
          :disabled="!!activeTask"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20"
        >
          <ArrowPathIcon class="w-4 h-4" :class="{ 'animate-spin': isRestoring }" />
          {{ hasPaused ? 'Riprendi' : 'Backup' }}
        </button>
      </div>
    </div>

    <!-- Backup progress bar -->
    <div v-if="isRunning && backupProgress" class="px-8 py-3 bg-gray-900/60 border-b border-gray-800 shrink-0">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs text-gray-400">
          {{ backupProgress.file ? backupProgress.file.split(/[\\/]/).at(-1) : 'Preparazione…' }}
        </span>
        <span class="text-xs text-gray-500 font-mono">
          {{ backupProgress.current ?? 0 }} / {{ backupProgress.total ?? '…' }}
        </span>
      </div>
      <div class="w-full h-1 bg-gray-800 rounded-md overflow-hidden">
        <div
          class="h-full bg-indigo-500 rounded-md transition-all duration-300"
          :style="{ width: progressPct + '%' }"
        />
      </div>
      <div class="flex items-center gap-4 mt-1.5 text-[10px] text-gray-600">
        <span class="text-emerald-500">+{{ backupProgress.files_new ?? 0 }} nuovi</span>
        <span>{{ backupProgress.files_dedup ?? 0 }} dedup</span>
        <span v-if="backupProgress.errors">{{ backupProgress.errors }} errori</span>
        <span>{{ formatBytes(backupProgress.bytes_new ?? 0) }} scritti</span>
      </div>
    </div>

    <!-- Restore progress bar -->
    <div v-if="isRestoring && restoreProgress" class="px-8 py-3 bg-amber-950/30 border-b border-amber-900/40 shrink-0">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs text-amber-400 font-medium">Restore in corso…</span>
        <span class="text-xs text-gray-500 font-mono">
          {{ restoreProgress.current ?? 0 }} / {{ restoreProgress.total ?? '…' }}
        </span>
      </div>
      <div class="w-full h-1 bg-gray-800 rounded-md overflow-hidden">
        <div
          class="h-full bg-amber-500 rounded-md transition-all duration-300"
          :style="{ width: restorePct + '%' }"
        />
      </div>
      <div class="flex items-center gap-4 mt-1.5 text-[10px] text-gray-600">
        <span class="text-emerald-500">{{ restoreProgress.restored ?? 0 }} ripristinati</span>
        <span v-if="restoreProgress.errors" class="text-red-400">{{ restoreProgress.errors }} errori</span>
        <span class="font-mono truncate">{{ restoreProgress.file?.split(/[\\/]/).at(-1) }}</span>
      </div>
    </div>

    <!-- Restore result (errori) -->
    <div v-if="restoreResult && !isRestoring" class="px-8 py-3 border-b border-gray-800 shrink-0">
      <div v-if="restoreResult.errors.length === 0" class="flex items-center gap-2 text-xs text-emerald-400">
        <CheckCircleIcon class="w-4 h-4 shrink-0" />
        Restore completato: {{ restoreResult.restored }} file ripristinati su {{ restoreResult.total }}
        <button @click="clearRestoreResult" class="ml-auto text-gray-600 hover:text-gray-400">
          <XMarkIcon class="w-3.5 h-3.5" />
        </button>
      </div>
      <div v-else>
        <div class="flex items-center gap-2 text-xs text-amber-400 mb-2">
          <ExclamationTriangleIcon class="w-4 h-4 shrink-0" />
          {{ restoreResult.restored }}/{{ restoreResult.total }} ripristinati — {{ restoreResult.errors.length }} errori
          <button @click="clearRestoreResult" class="ml-auto text-gray-600 hover:text-gray-400">
            <XMarkIcon class="w-3.5 h-3.5" />
          </button>
        </div>
        <div class="max-h-32 overflow-auto space-y-1">
          <div
            v-for="(err, i) in restoreResult.errors"
            :key="i"
            class="text-[10px] font-mono bg-red-950/30 border border-red-900/30 rounded px-2 py-1.5 space-y-0.5"
          >
            <div class="flex gap-2">
              <span class="text-red-400 shrink-0">ERR</span>
              <span class="text-gray-400 truncate flex-1">{{ err.path }}</span>
              <span class="text-red-300 shrink-0">{{ err.error }}</span>
            </div>
            <div v-if="err.hash" class="text-gray-600 pl-7">{{ err.hash }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scroll area principale -->
    <div class="flex-1 overflow-auto">

        <!-- Info cards -->
        <div class="px-8 pt-6 pb-4 grid grid-cols-4 gap-4">
          <div class="bg-gray-900 border border-gray-800 rounded-md p-4">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Run totali</p>
            <p class="text-3xl font-bold text-white">{{ session.runs.length }}</p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-md p-4">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">File indicizzati</p>
            <p class="text-3xl font-bold text-white">{{ (session.runs[0]?.files_total ?? 0).toLocaleString('it-IT') }}</p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-md p-4">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Deduplicati</p>
            <p class="text-3xl font-bold text-white">
              {{ session.runs[0] ? pct(session.runs[0].files_dedup, session.runs[0].files_total) : '—' }}
            </p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-md p-4">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Sorgenti</p>
            <p class="text-3xl font-bold text-white">{{ session.sources.length }}</p>
          </div>
        </div>

        <!-- Sources -->
        <div class="px-8 pb-4">
          <div class="bg-gray-900/50 border border-gray-800 rounded-md p-4">
            <p class="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Cartelle sorgente</p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="src in session.sources"
                :key="src"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-xs font-mono text-gray-300"
              >
                <FolderIcon class="w-3.5 h-3.5 text-gray-500 shrink-0" />
                {{ src }}
              </span>
            </div>
            <p class="text-xs text-gray-600 mt-2 font-mono">Store: {{ session.store }}</p>
          </div>
        </div>

        <!-- Runs table -->
        <div class="px-8 pb-8">
          <div class="bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
            <div class="px-5 py-3.5 border-b border-gray-800">
              <p class="text-sm font-semibold text-gray-200">Cronologia run</p>
            </div>
            <div v-if="session.runs.length === 0" class="flex flex-col items-center justify-center h-32 text-gray-600 text-sm">
              Nessuna run ancora
            </div>
            <table v-else class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-800">
                  <th class="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Data / Ora</th>
                  <th class="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stato</th>
                  <th class="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">File</th>
                  <th class="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Nuovi</th>
                  <th class="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Dedup</th>
                  <th class="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Durata</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800/60">
                <tr
                  v-for="run in session.runs"
                  :key="run.ts"
                  @click="run.status !== 'running' && selectRun(run)"
                  :class="[
                    'transition-colors',
                    run.status === 'running'
                      ? 'cursor-default'
                      : 'cursor-pointer',
                    selectedRun?.ts === run.ts
                      ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500'
                      : run.status !== 'running' ? 'hover:bg-gray-800/50' : ''
                  ]"
                >
                  <td class="px-5 py-3 text-gray-300 font-mono text-xs">{{ formatTs(run.ts) }}</td>
                  <td class="px-5 py-3"><StatusBadge :status="run.status" /></td>
                  <td class="px-5 py-3 text-right font-mono font-medium text-gray-300">
                    {{ run.status === 'running' && backupProgress
                        ? backupProgress.total?.toLocaleString('it-IT') ?? '…'
                        : run.files_total?.toLocaleString('it-IT') ?? '—' }}
                  </td>
                  <td class="px-5 py-3 text-right font-mono text-emerald-400 font-medium">
                    +{{ run.status === 'running' && backupProgress
                        ? backupProgress.files_new ?? 0
                        : run.files_new ?? 0 }}
                  </td>
                  <td class="px-5 py-3 text-right font-mono text-gray-500">
                    {{ run.status === 'running' && backupProgress
                        ? backupProgress.files_dedup?.toLocaleString('it-IT') ?? '—'
                        : run.files_dedup?.toLocaleString('it-IT') ?? '—' }}
                  </td>
                  <td class="px-5 py-3 text-right font-mono text-xs text-gray-500">
                    {{ run.duration_sec != null ? run.duration_sec + 's' : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

    </div>

    <!-- Sidebar dettaglio run — drawer modale a tutta altezza -->
    <transition name="slide">
      <div v-if="selectedRun" class="fixed inset-0 z-40 flex justify-end">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeRunDetail" />
        <div class="drawer-panel relative w-md h-full bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl overflow-hidden">
          <!-- Header sidebar -->
          <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900/90 backdrop-blur-md z-10">
            <div>
              <p class="text-sm font-bold text-white">Dettaglio run</p>
              <p class="text-[10px] text-gray-500 font-mono mt-0.5">{{ formatTs(selectedRun.ts) }}</p>
            </div>
            <button @click="closeRunDetail" class="p-1 rounded-md text-gray-600 hover:text-white transition-colors">
              <XMarkIcon class="w-4 h-4" />
            </button>
          </div>

          <div class="flex-1 overflow-auto">

            <!-- Stats -->
            <div class="px-5 py-4 grid grid-cols-3 gap-3 border-b border-gray-800">
              <div class="text-center">
                <p class="text-xl font-bold text-white">{{ selectedRun.files_total?.toLocaleString('it-IT') ?? '—' }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Totali</p>
              </div>
              <div class="text-center">
                <p class="text-xl font-bold text-emerald-400">{{ selectedRun.files_new ?? 0 }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Nuovi</p>
              </div>
              <div class="text-center">
                <p class="text-xl font-bold text-gray-400">{{ selectedRun.files_dedup ?? 0 }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Dedup</p>
              </div>
            </div>

            <div v-if="selectedRun.bytes_total != null" class="px-5 py-3 grid grid-cols-2 gap-3 border-b border-gray-800 text-center">
              <div>
                <p class="text-sm font-semibold text-white">{{ formatBytes(selectedRun.bytes_total) }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Dimensione</p>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">{{ formatBytes(selectedRun.bytes_new) }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Scritti</p>
              </div>
            </div>

            <!-- File list -->
            <div class="px-5 py-3 border-b border-gray-800">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">File nel run</p>

              <div v-if="!state.selectedRunFull" class="flex items-center gap-1.5 text-xs text-gray-600 py-4 justify-center">
                <ArrowPathIcon class="w-3.5 h-3.5 animate-spin" />
                Caricamento…
              </div>
              <div v-else-if="fullRunFiles.length === 0" class="text-xs text-gray-600 italic py-4 text-center">
                Nessun file in questa run
              </div>
              <div v-else class="space-y-1">
                <div
                  v-for="file in fullRunFiles"
                  :key="file.hash_vorn"
                  class="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-800/40 transition-colors"
                >
                  <DocumentIcon class="w-3.5 h-3.5 text-gray-600 mt-0.5 shrink-0" />
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-gray-300 truncate">{{ file.name }}</p>
                    <p class="text-[10px] text-gray-600 font-mono truncate mt-0.5">{{ file.hash_vorn }}</p>
                    <p class="text-[10px] text-gray-500 mt-0.5">{{ formatBytes(file.bytes) }}</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- Azioni -->
          <div class="px-5 py-4 border-t border-gray-800 bg-gray-950 flex gap-2">
            <button
              @click="handleDeleteRun"
              :disabled="cannotDeleteRun"
              class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-medium text-red-400 border border-red-900/50 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <TrashIcon class="w-3.5 h-3.5" />
              Cancella
            </button>
            <button
              @click="handleRestore"
              :disabled="sessionBusy"
              class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20"
            >
              <ArrowDownTrayIcon class="w-3.5 h-3.5" />
              Restore
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Modals -->
    <RestoreModal
      :show="showRestoreModal"
      :run-ts="selectedRun?.ts"
      :original-path="session?.sources[0]"
      @close="showRestoreModal = false"
      @confirm="onRestoreConfirm"
    />
  </div>
</template>

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

<script setup>
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  FolderIcon,
  DocumentIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  StopIcon,

  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import {
  state, goBack, selectRun, deleteRun,
  startBackup, startRestore, cancelTask, getActiveTask, getLastTask,
  formatTs, formatBytes
} from '../stores/vorn.js'
import StatusBadge from '../components/StatusBadge.vue'
import RestoreModal from '../components/RestoreModal.vue'

const session     = computed(() => state.selectedSession)
const selectedRun = computed(() => state.selectedRun)
const hasPaused   = computed(() => session.value?.runs.some(r => r.status === 'paused') ?? false)

// Task attivo per questa sessione (backup o restore in corso)
const activeTask      = computed(() => getActiveTask(session.value?.name))

// Sessione occupata (running o paused): blocca restore
const sessionBusy = computed(() => {
  const name = session.value?.name
  if (!name) return false
  return Object.values(state.tasks).some(
    t => t.sessionName === name && (t.status === 'running' || t.status === 'paused')
  ) || hasPaused.value
})

// Cancella disabilitato solo se il run selezionato è quello attivamente in scrittura
const cannotDeleteRun = computed(() => selectedRun.value?.status === 'running')
const isRunning       = computed(() => activeTask.value?.type === 'backup')
const isRestoring     = computed(() => activeTask.value?.type === 'restore')
const backupProgress  = computed(() => isRunning.value   ? activeTask.value?.progress : null)
const restoreProgress = computed(() => isRestoring.value ? activeTask.value?.progress : null)

// Ultimo task completato di restore per questa sessione
const lastRestoreTask = computed(() => getLastTask(session.value?.name, 'restore'))
const restoreResult   = computed(() => lastRestoreTask.value?.status !== 'running' ? lastRestoreTask.value?.result : null)

const progressPct = computed(() => {
  const p = backupProgress.value
  if (!p?.total) return 0
  return Math.round((p.current / p.total) * 100)
})

const restorePct = computed(() => {
  const p = restoreProgress.value
  if (!p?.total) return 0
  return Math.round((p.current / p.total) * 100)
})

function clearRestoreResult() {
  const t = lastRestoreTask.value
  if (t) t.result = null
}

const showRestoreModal = ref(false)
const fullRunFiles = computed(() => state.selectedRunFull?.filesArray ?? [])

function pct(part, total) {
  if (!total) return '—'
  return Math.round(part / total * 100) + '%'
}

function closeRunDetail() {
  state.selectedRun     = null
  state.selectedRunFull = null
}

function handleBackup() { startBackup(session.value.name) }

function handleCancel() {
  if (activeTask.value) cancelTask(activeTask.value.id)
}

async function handleDeleteRun() {
  if (!selectedRun.value) return
  const sessionName = session.value.name
  const runTs = selectedRun.value.ts
  closeRunDetail()
  await deleteRun(sessionName, runTs)
}

function handleRestore() {
  if (!selectedRun.value) return
  showRestoreModal.value = true
}

async function onRestoreConfirm(destDir) {
  showRestoreModal.value = false
  await startRestore(session.value.name, selectedRun.value.ts, destDir)
}
</script>
