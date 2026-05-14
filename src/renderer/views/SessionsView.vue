<template>
  <div
    ref="dropZone"
    class="flex flex-col h-full relative"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >

    <!-- Header -->
    <div class="px-8 py-6 border-b border-gray-800 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-xl font-semibold text-white">{{ $t('sessions.title') }}</h1>
        <p class="text-sm text-gray-500 mt-0.5">{{ $t('sessions.subtitle', { sessions: sessions.length, runs: totalRuns }) }}</p>
      </div>
      <div class="flex items-center gap-2">
        <!-- Modalità normale -->
        <template v-if="!selectionMode">
          <button
            @click="enterSelection"
            :disabled="!sessions.length"
            class="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 hover:bg-gray-800 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircleIcon class="w-4 h-4" />
            {{ $t('sessions.select') }}
          </button>
          <button
            @click="handleStartQueue"
            :disabled="!sessions.length || queueState.active || anyBackupRunning"
            class="flex items-center gap-2 px-4 py-2 rounded-md border border-emerald-600/40 text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <QueueListIcon class="w-4 h-4" />
            {{ $t('sessions.queue.start') }}
          </button>
          <button
            @click="askDeleteAll"
            :disabled="!sessions.length || anyRunning"
            class="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-700 text-gray-300 hover:text-red-400 hover:border-red-600/50 hover:bg-red-500/5 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <TrashIcon class="w-4 h-4" />
            {{ $t('sessions.deleteAll') }}
          </button>
        </template>
        <!-- Modalità selezione -->
        <template v-else>
          <button
            @click="exitSelection"
            class="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            {{ $t('sessions.cancel') }}
          </button>
          <button
            @click="handleStartQueue"
            :disabled="!selected.size || queueState.active || anyBackupRunning"
            class="flex items-center gap-2 px-4 py-2 rounded-md border border-emerald-600/40 text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <QueueListIcon class="w-4 h-4" />
            {{ selected.size ? $t('sessions.queue.startCount', { n: selected.size }) : $t('sessions.queue.start') }}
          </button>
          <button
            @click="askDeleteSelected"
            :disabled="!selected.size || anySelectedRunning"
            class="flex items-center gap-2 px-4 py-2 rounded-md border border-red-600/40 text-red-400 hover:bg-red-500/10 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <TrashIcon class="w-4 h-4" />
            {{ selected.size ? $t('sessions.deleteSelectedCount', { n: selected.size }) : $t('sessions.deleteSelected') }}
          </button>
        </template>
        <div class="w-px h-5 bg-gray-700 mx-1" />
        <button
          @click="showModal = true"
          class="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
        >
          <PlusIcon class="w-4 h-4" />
          {{ $t('sessions.newSession') }}
        </button>
      </div>
    </div>

    <!-- Drop overlay -->
    <Transition name="drop-fade">
      <div
        v-if="isDragging"
        class="absolute inset-0 z-40 flex items-center justify-center bg-gray-950/85 backdrop-blur-[2px]"
        @dragover.prevent
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div class="flex flex-col items-center gap-4 border-2 border-dashed border-indigo-500/60 rounded-xl px-16 py-12">
          <div class="w-14 h-14 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <ArrowDownTrayIcon class="w-7 h-7 text-indigo-400" />
          </div>
          <p class="text-sm font-semibold text-indigo-300">{{ $t('sessions.drop.title') }}</p>
          <p class="text-xs text-gray-500">{{ $t('sessions.drop.sub') }}</p>
        </div>
      </div>
    </Transition>

    <!-- Queue banner -->
    <Transition name="drop-fade">
      <div
        v-if="queueState.active"
        class="mx-8 mt-4 px-4 py-3 bg-indigo-950/40 border border-indigo-800/40 rounded-md flex items-center gap-2.5 shrink-0"
      >
        <QueueListIcon class="w-4 h-4 text-indigo-400 shrink-0" />
        <p class="text-sm text-indigo-300 flex-1">
          {{ $t('sessions.queue.banner', { n: queueState.pending.length }) }}
        </p>
        <button
          @click="cancelQueue"
          class="flex items-center gap-1 text-xs text-indigo-400 hover:text-white transition-colors"
        >
          <XMarkIcon class="w-3.5 h-3.5" />
          {{ $t('sessions.queue.cancel') }}
        </button>
      </div>
    </Transition>

    <!-- Drop error banner -->
    <Transition name="drop-fade">
      <div
        v-if="dropError"
        class="mx-8 mt-4 px-4 py-3 bg-red-950/40 border border-red-700/50 rounded-md flex items-center gap-2.5 shrink-0"
      >
        <ExclamationCircleIcon class="w-4 h-4 text-red-400 shrink-0" />
        <p class="text-sm text-red-300">{{ dropError }}</p>
      </div>
    </Transition>

    <!-- Loading -->
    <div v-if="state.loading" class="flex-1 flex items-center justify-center">
      <div class="flex items-center gap-3 text-gray-500">
        <ArrowPathIcon class="w-5 h-5 animate-spin" />
        <span class="text-sm">{{ $t('sessions.loading') }}</span>
      </div>
    </div>

    <!-- Table -->
    <div v-else class="flex-1 overflow-auto px-8 py-6">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left">
            <th v-if="selectionMode" class="pb-3 w-10 pl-4">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" class="accent-indigo-500 cursor-pointer" />
            </th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4">{{ $t('sessions.hdr.session') }}</th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4">{{ $t('sessions.hdr.lastRun') }}</th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4">{{ $t('sessions.hdr.status') }}</th>
            <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 text-right">{{ $t('sessions.hdr.runs') }}</th>
            <th class="pb-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">{{ $t('sessions.hdr.files') }}</th>
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
              <!-- Checkbox -->
              <td v-if="selectionMode" class="py-3.5 pl-4 w-10" @click.stop>
                <input type="checkbox" :checked="selected.has(session.name)" @change="toggleSelect(session.name)" :disabled="!!activeTask(session.name)" class="accent-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
              </td>
              <!-- Name + sources -->
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-3">
                  <div class="flex flex-col items-center gap-0.5 shrink-0">
                    <div class="w-8 h-8 rounded-md bg-gray-800 border border-gray-700 flex items-center justify-center group-hover:border-indigo-500/50 group-hover:bg-indigo-500/10 transition-colors"
                      :class="activeTask(session.name) ? 'border-indigo-500/40 bg-indigo-500/10' : ''"
                    >
                      <FolderIcon v-if="!activeTask(session.name)" class="w-4 h-4 text-gray-500 group-hover:text-indigo-400 transition-colors" />
                      <ArrowPathIcon v-else class="w-4 h-4 text-indigo-400 animate-spin" />
                    </div>
                    <span
                      v-if="session.compressionType"
                      class="text-[9px] font-bold uppercase tracking-wide text-emerald-400 leading-none"
                    >{{ session.compressionType }}</span>
                  </div>
                  <div>
                    <p class="font-semibold text-gray-100">{{ session.name }}</p>
                    <p class="text-xs text-gray-500 mt-0.5">{{ $t('sessions.sourcesCount', session.sources.length, { count: session.sources.length }) }}</p>
                  </div>
                </div>
              </td>

              <!-- Last run -->
              <td class="py-3.5 px-4">
                <span v-if="session.runs.length" class="text-gray-300">{{ formatTs(session.runs[0].ts) }}</span>
                <span v-else class="text-gray-600 italic">{{ $t('sessions.neverRun') }}</span>
              </td>

              <!-- Status -->
              <td class="py-3.5 px-4">
                <template v-if="activeTask(session.name)">
                  <div class="flex items-center gap-2">
                    <StatusBadge status="running" />
                    <span class="text-xs font-mono text-indigo-300">
                      {{ progressPct(session.name) }}%
                    </span>
                  </div>
                </template>
                <template v-else-if="isInQueue(session.name)">
                  <div class="flex items-center gap-1.5">
                    <QueueListIcon class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span class="text-xs text-indigo-400">{{ $t('sessions.queue.inQueue') }}</span>
                  </div>
                </template>
                <StatusBadge v-else-if="session.runs.length" :status="session.runs[0].status" />
                <span v-else class="text-gray-600 text-xs">—</span>
              </td>

              <!-- Run count -->
              <td class="py-3.5 px-4 text-right">
                <span class="text-gray-300 font-mono font-medium">{{ session.runs.length }}</span>
              </td>

              <!-- Files + azioni -->
              <td class="py-3.5 px-4 text-right" @click.stop>
                <div class="flex items-center justify-end gap-2">
                  <!-- Conferma eliminazione -->
                  <div v-if="confirmName === session.name" class="flex items-center gap-1.5">
                    <button
                      @click="confirmDelete($event, session.name)"
                      class="px-2 py-1 rounded text-[11px] font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors"
                    >{{ $t('common.delete') }}</button>
                    <button
                      @click="cancelDelete($event)"
                      class="px-2 py-1 rounded text-[11px] text-gray-400 hover:text-white transition-colors"
                    >{{ $t('common.cancel') }}</button>
                  </div>
                  <!-- Tasti azione (visibili su hover) -->
                  <div v-else class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      v-if="activeTask(session.name)"
                      @click.stop="cancelTask(activeTask(session.name).id)"
                      class="p-1.5 rounded-md text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                      :title="$t('sessions.actions.suspend')"
                    >
                      <PauseIcon class="w-3.5 h-3.5" />
                    </button>
                    <button
                      v-else
                      @click.stop="startBackup(session.name, _resumeTs(session))"
                      :disabled="anyBackupRunning"
                      class="p-1.5 rounded-md text-gray-600 hover:text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      :title="_resumeTs(session) ? $t('sessions.actions.resume') : $t('sessions.actions.start')"
                    >
                      <PlayIcon class="w-3.5 h-3.5" />
                    </button>
                    <button
                      @click.stop="editingSession = session"
                      :disabled="!!activeTask(session.name)"
                      class="p-1.5 rounded-md text-gray-600 hover:text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      :title="$t('sessions.actions.edit')"
                    >
                      <PencilSquareIcon class="w-3.5 h-3.5" />
                    </button>
                    <button
                      @click="askDelete($event, session.name)"
                      :disabled="!!activeTask(session.name)"
                      class="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      :title="$t('sessions.actions.delete')"
                    >
                      <TrashIcon class="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span class="text-gray-300 font-mono font-medium min-w-12 text-right">
                    <template v-if="activeTask(session.name) && activeTask(session.name).progress">
                      {{ (activeTask(session.name).progress.current ?? 0).toLocaleString('it-IT') }}
                      <span class="text-gray-600">/ {{ (activeTask(session.name).progress.total ?? 0).toLocaleString('it-IT') }}</span>
                    </template>
                    <template v-else>
                      {{ session.runs.length ? (session.runs[0].files_total ?? session.runs[0].files_count ?? 0).toLocaleString('it-IT') : '—' }}
                    </template>
                  </span>
                </div>
              </td>
            </tr>

            <!-- Sub-row progresso -->
            <tr v-if="activeTask(session.name)" @click="selectSession(session)" class="cursor-pointer bg-indigo-950/10 hover:bg-indigo-950/20 transition-colors">
              <td colspan="6" class="px-6 pb-3 pt-0">
                <div class="pl-11">
                  <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden mb-2">
                    <div
                      class="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      :style="{ width: progressPct(session.name) + '%' }"
                    />
                  </div>
                  <div class="flex items-center gap-5 text-[11px]">
                    <span class="text-emerald-400 font-medium">
                      {{ $t('sessions.progress.new', { n: (activeTask(session.name).progress?.files_new ?? 0).toLocaleString('it-IT') }) }}
                    </span>
                    <span class="text-gray-500">
                      {{ $t('sessions.progress.dedup', { n: (activeTask(session.name).progress?.files_dedup ?? 0).toLocaleString('it-IT') }) }}
                    </span>
                    <span class="text-gray-400">
                      {{ $t('sessions.progress.written', { n: formatBytes(activeTask(session.name).progress?.bytes_new ?? 0) }) }}
                    </span>
                    <span class="text-gray-500">
                      {{ $t('sessions.progress.total', { n: formatBytes(activeTask(session.name).progress?.bytes_total ?? 0) }) }}
                    </span>
                    <span v-if="activeTask(session.name).progress?.errors" class="text-red-400">
                      {{ $t('sessions.progress.errors', { n: activeTask(session.name).progress.errors }) }}
                    </span>
                    <div v-if="activeTask(session.name).progress?.file" class="ml-auto flex items-center gap-1.5 min-w-0">
                      <span v-if="isExecutable(activeTask(session.name).progress.file)" class="text-red-400 text-[10px] font-semibold shrink-0">
                        {{ $t('common.avScan') }}
                      </span>
                      <span class="text-gray-600 font-mono truncate max-w-72">
                        {{ activeTask(session.name).progress.file.split(/[\\/]/).at(-1) }}
                      </span>
                      <span v-if="activeTask(session.name).progress?.storing" class="text-indigo-400/70 font-mono shrink-0">
                        {{ $t('common.storing') }}
                      </span>
                      <span v-else-if="activeTask(session.name).progress?.compressing" class="text-emerald-400/70 font-mono shrink-0">
                        {{ $t('common.compressing') }}
                      </span>
                      <span v-else-if="activeTask(session.name).progress?.bytes_compressing_total > 0" class="text-emerald-400/50 font-mono shrink-0">
                        {{ $t('common.compressing') }} {{ formatBytes(activeTask(session.name).progress.bytes_compressing ?? 0) }}/{{ formatBytes(activeTask(session.name).progress.bytes_compressing_total) }}
                      </span>
                      <span v-else-if="activeTask(session.name).progress?.bytes_hashing_total > 0" class="text-gray-600 font-mono shrink-0">
                        {{ formatBytes(activeTask(session.name).progress.bytes_hashing ?? 0) }}/{{ formatBytes(activeTask(session.name).progress.bytes_hashing_total) }}
                      </span>
                    </div>
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
        <p class="text-gray-400 font-medium">{{ $t('sessions.noSessions') }}</p>
        <p class="text-gray-600 text-sm mt-1">{{ $t('sessions.noSessionsHelp') }}</p>
      </div>
    </div>

  </div>

  <NewSessionModal
    v-if="showModal"
    :initialRoot="dropSources?.initialRoot ?? ''"
    :preSelected="dropSources?.preSelected ?? []"
    @close="showModal = false; dropSources = null"
    @created="showModal = false; dropSources = null"
  />

  <EditSessionModal
    v-if="editingSession"
    :session="editingSession"
    @close="editingSession = null"
    @saved="editingSession = null"
  />

  <!-- Modal conferma eliminazione -->
  <Teleport to="body">
    <div v-if="deleteConfirm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
      <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
          <div class="w-8 h-8 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
            <TrashIcon class="w-4 h-4 text-red-400" />
          </div>
          <h3 class="text-sm font-bold text-white">{{ $t('sessions.confirmDelete.title') }}</h3>
        </div>
        <div class="px-6 py-5">
          <p class="text-sm text-gray-300">
            {{ $t('sessions.confirmDelete.message', deleteConfirm.names.length, { count: deleteConfirm.names.length }) }}
            {{ $t('common.cannotUndo') }}
          </p>
          <ul class="mt-3 space-y-1 max-h-32 overflow-y-auto">
            <li v-for="n in deleteConfirm.names" :key="n" class="text-xs text-gray-500 font-mono truncate">· {{ n }}</li>
          </ul>
        </div>
        <div class="px-6 py-4 bg-gray-800/30 flex justify-end gap-3">
          <button @click="deleteConfirm.show = false" class="px-4 py-2 rounded-md text-sm text-gray-400 hover:text-white transition-colors">{{ $t('common.cancel') }}</button>
          <button @click="confirmDeleteBulk" class="px-4 py-2 rounded-md text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors">{{ $t('common.delete') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PlusIcon, FolderIcon, ArchiveBoxIcon, ArrowPathIcon, TrashIcon, PlayIcon, PauseIcon, CheckCircleIcon, ArrowDownTrayIcon, ExclamationCircleIcon, PencilSquareIcon, QueueListIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { state, selectSession, deleteSession, getActiveTask, startBackup, cancelTask, formatTs, formatBytes, anyBackupRunning, queueState, startQueue, cancelQueue } from '../stores/vorn.js'
import { isExecutable } from '../utils/executable.js'
import StatusBadge from '../components/StatusBadge.vue'
import NewSessionModal from '../components/NewSessionModal.vue'
import EditSessionModal from '../components/EditSessionModal.vue'

const { t } = useI18n()

// ── Path utilities ────────────────────────────────────────────────────────────

function pathSegments(p) {
  return p.replace(/\\/g, '/').split('/').filter(Boolean)
}

function pathRoot(p) {
  return pathSegments(p)[0]?.toLowerCase() ?? ''
}

function commonAncestor(paths) {
  if (!paths.length) return ''
  const segs = paths.map(pathSegments)
  let common = [...segs[0]]
  for (let i = 1; i < segs.length; i++) {
    let j = 0
    while (j < common.length && j < segs[i].length && common[j].toLowerCase() === segs[i][j].toLowerCase()) j++
    common = common.slice(0, j)
  }
  if (!common.length) return ''
  const isWin = /^[a-zA-Z]:$/.test(common[0])
  if (isWin) return common.length === 1 ? common[0] + '\\' : common[0] + '\\' + common.slice(1).join('\\')
  return '/' + common.join('/')
}

// ── Drag & drop ───────────────────────────────────────────────────────────────

const dropZone    = ref(null)
const isDragging  = ref(false)
const dropError   = ref('')
const dropSources = ref(null)
let   dropErrorTimer = null

function onDragEnter(e) {
  if (!e.dataTransfer?.types.includes('Files')) return
  isDragging.value = true
}

function onDragLeave(e) {
  if (dropZone.value && dropZone.value.contains(e.relatedTarget)) return
  isDragging.value = false
}

function onDrop(e) {
  isDragging.value  = false
  const paths = [...(e.dataTransfer?.files ?? [])].map(f => window.vorn.getPathForFile(f)).filter(Boolean)
  if (!paths.length) return

  const roots = [...new Set(paths.map(pathRoot))]
  if (roots.length > 1) {
    clearTimeout(dropErrorTimer)
    dropError.value  = t('sessions.drop.errorDrives', { drives: roots.map(r => r.toUpperCase()).join(', ') })
    dropErrorTimer   = setTimeout(() => { dropError.value = '' }, 5000)
    return
  }

  dropError.value   = ''
  const root        = commonAncestor(paths)
  dropSources.value = { initialRoot: root, preSelected: paths }
  showModal.value   = true
}

// ── State ─────────────────────────────────────────────────────────────────────

const showModal      = ref(false)
const editingSession = ref(null)
const sessions       = computed(() => state.sessions)
const confirmName    = ref(null)

const totalRuns  = computed(() => sessions.value.reduce((acc, s) => acc + s.runs.length, 0))
const anyRunning         = computed(() => sessions.value.some(s => !!getActiveTask(s.name)))
const anySelectedRunning = computed(() => [...selected.value].some(name => !!getActiveTask(name)))
const selectionMode = ref(false)
const selected      = ref(new Set())
const selectableSessions = computed(() => sessions.value.filter(s => !getActiveTask(s.name)))
const allSelected        = computed(() => selectableSessions.value.length > 0 && selectableSessions.value.every(s => selected.value.has(s.name)))

function enterSelection() { selectionMode.value = true }
function exitSelection()  { selectionMode.value = false; selected.value = new Set() }

function toggleSelect(name) {
  const s = new Set(selected.value)
  s.has(name) ? s.delete(name) : s.add(name)
  selected.value = s
}

function toggleAll() {
  if (allSelected.value) selected.value = new Set()
  else selected.value = new Set(selectableSessions.value.map(s => s.name))
}

function _resumeTs(session) {
  return session.runs.find(r => r.status === 'paused')?.ts ?? null
}

function isInQueue(sessionName) {
  return queueState.active && queueState.pending.includes(sessionName) && !getActiveTask(sessionName)
}

function handleStartQueue() {
  const names = selectionMode.value && selected.value.size
    ? [...selected.value]
    : sessions.value.map(s => s.name)
  if (selectionMode.value) exitSelection()
  startQueue(names)
}


const deleteConfirm = ref({ show: false, names: [] })

function askDeleteAll() {
  deleteConfirm.value = { show: true, names: sessions.value.map(s => s.name) }
}

function askDeleteSelected() {
  deleteConfirm.value = { show: true, names: [...selected.value] }
}

async function confirmDeleteBulk() {
  const names = [...deleteConfirm.value.names]
  deleteConfirm.value.show = false
  for (const name of names) await deleteSession(name)
  exitSelection()
}

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

</script>

<style scoped>
.drop-fade-enter-active, .drop-fade-leave-active { transition: opacity 0.15s ease; }
.drop-fade-enter-from, .drop-fade-leave-to       { opacity: 0; }
</style>
