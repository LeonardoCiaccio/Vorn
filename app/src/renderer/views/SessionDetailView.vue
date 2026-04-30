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
          @click="cancelBackup(session.name)"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-amber-300 border border-amber-600/50 hover:bg-amber-500/10 transition-colors"
        >
          <StopIcon class="w-4 h-4" />
          Sospendi
        </button>
        <button
          v-else
          @click="handleBackup"
          :disabled="isRunning"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
        >
          <ArrowPathIcon class="w-4 h-4" :class="{ 'animate-spin': isRunning }" />
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

    <!-- Scroll area -->
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

      <!-- Two-column: runs list + run detail -->
      <div class="px-8 pb-8 flex gap-5 min-h-0">

        <!-- Runs table -->
        <div class="flex-1 min-w-0 bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
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
                @click="selectRun(run)"
                :class="[
                  'cursor-pointer transition-colors',
                  selectedRun?.ts === run.ts
                    ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500'
                    : 'hover:bg-gray-800/50'
                ]"
              >
                <td class="px-5 py-3 text-gray-300 font-mono text-xs">{{ formatTs(run.ts) }}</td>
                <td class="px-5 py-3"><StatusBadge :status="run.status" /></td>
                <td class="px-5 py-3 text-right font-mono font-medium text-gray-300">{{ run.files_total?.toLocaleString('it-IT') ?? '—' }}</td>
                <td class="px-5 py-3 text-right font-mono text-emerald-400 font-medium">+{{ run.files_new ?? 0 }}</td>
                <td class="px-5 py-3 text-right font-mono text-gray-500">{{ run.files_dedup?.toLocaleString('it-IT') ?? '—' }}</td>
                <td class="px-5 py-3 text-right font-mono text-xs text-gray-500">{{ run.duration_sec != null ? run.duration_sec + 's' : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Run detail -->
        <div class="w-80 shrink-0 bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between">
            <p class="text-sm font-semibold text-gray-200">Dettaglio run</p>
            <span v-if="selectedRun" class="text-xs text-gray-500 font-mono">{{ formatTs(selectedRun.ts) }}</span>
          </div>

          <div v-if="!selectedRun" class="flex flex-col items-center justify-center h-32 text-gray-600 text-sm px-5 text-center">
            Seleziona una run dalla lista
          </div>

          <div v-else class="overflow-auto max-h-72">
            <!-- Run stats -->
            <div class="px-5 py-3 grid grid-cols-3 gap-2 border-b border-gray-800/60">
              <div class="text-center">
                <p class="text-lg font-bold text-white">{{ selectedRun.files_total?.toLocaleString('it-IT') ?? '—' }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider">Totali</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-emerald-400">{{ selectedRun.files_new ?? 0 }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider">Nuovi</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-gray-400">{{ selectedRun.files_dedup ?? 0 }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider">Dedup</p>
              </div>
            </div>

            <!-- Extra stats row -->
            <div v-if="selectedRun.bytes_total != null" class="px-5 py-2 grid grid-cols-2 gap-2 border-b border-gray-800/60 text-center">
              <div>
                <p class="text-sm font-semibold text-white">{{ formatBytes(selectedRun.bytes_total) }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider">Dimensione</p>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">{{ formatBytes(selectedRun.bytes_new) }}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider">Scritti</p>
              </div>
            </div>

            <!-- File list -->
            <div v-if="fullRunFiles.length" class="divide-y divide-gray-800/40">
              <div
                v-for="file in fullRunFiles"
                :key="file.hash_vorn"
                class="px-5 py-2.5 hover:bg-gray-800/40 transition-colors"
              >
                <div class="flex items-start gap-2">
                  <DocumentIcon class="w-3.5 h-3.5 text-gray-600 mt-0.5 shrink-0" />
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-gray-300 truncate">{{ file.name }}</p>
                    <p class="text-[10px] text-gray-600 font-mono truncate mt-0.5">{{ file.hash_vorn }}</p>
                    <p class="text-[10px] text-gray-500 mt-0.5">{{ formatBytes(file.bytes) }}</p>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="state.selectedRunFull" class="px-5 py-4 text-xs text-gray-600 italic text-center">
              Nessun file in questa run
            </div>
            <div v-else class="px-5 py-4 text-xs text-gray-600 italic text-center flex items-center justify-center gap-1.5">
              <ArrowPathIcon class="w-3.5 h-3.5 animate-spin" />
              Caricamento…
            </div>
          </div>

          <!-- Run actions -->
          <div v-if="selectedRun" class="px-5 py-3 border-t border-gray-800 flex gap-2">
            <button class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium text-gray-300 border border-gray-700 hover:bg-gray-800 transition-colors">
              <MagnifyingGlassIcon class="w-3.5 h-3.5" />
              Inspect
            </button>
            <button
              @click="handleRestore"
              class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium text-white bg-indigo-600/80 hover:bg-indigo-600 transition-colors"
            >
              <ArrowDownTrayIcon class="w-3.5 h-3.5" />
              Restore
            </button>
          </div>
        </div>

      </div>
    </div>

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

<script setup>
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  FolderIcon,
  DocumentIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  StopIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import { state, goBack, selectRun, startBackup, cancelBackup, startRestore, formatTs, formatBytes } from '../stores/vorn.js'
import StatusBadge from '../components/StatusBadge.vue'
import RestoreModal from '../components/RestoreModal.vue'

const session  = computed(() => state.selectedSession)
const selectedRun = computed(() => state.selectedRun)
const isRunning  = computed(() => state.runningBackup?.sessionName === session.value?.name)
const backupProgress = computed(() => state.runningBackup?.progress)
const hasPaused = computed(() => session.value?.runs.some(r => r.status === 'paused') ?? false)

const isRestoring    = computed(() => state.runningRestore?.sessionName === session.value?.name)
const restoreProgress = computed(() => state.runningRestore?.progress)
const restoreResult  = computed(() => state.lastRestoreResult)
const restorePct = computed(() => {
  const p = restoreProgress.value
  if (!p || !p.total) return 0
  return Math.round((p.current / p.total) * 100)
})

function clearRestoreResult() { state.lastRestoreResult = null }

const showRestoreModal = ref(false)

const progressPct = computed(() => {
  const p = backupProgress.value
  if (!p || !p.total) return 0
  return Math.round((p.current / p.total) * 100)
})

const fullRunFiles = computed(() => state.selectedRunFull?.filesArray ?? [])

function pct(part, total) {
  if (!total) return '—'
  return Math.round(part / total * 100) + '%'
}

function handleBackup() {
  startBackup(session.value.name)
}

function handleRestore() {
  if (!selectedRun.value) return
  showRestoreModal.value = true
}

async function onRestoreConfirm(destDir) {
  showRestoreModal.value = false
  state.lastRestoreResult = null
  try {
    await startRestore(session.value.name, selectedRun.value.ts, destDir)
  } catch (_) { /* risultato già in state.lastRestoreResult */ }
}
</script>
