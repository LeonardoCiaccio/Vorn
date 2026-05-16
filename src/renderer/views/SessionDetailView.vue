<template>
  <div class="flex flex-col h-full">

    <!-- Header -->
    <div class="px-8 py-5 border-b border-gray-800 flex items-center gap-4 shrink-0">
      <button @click="goBack"
        class="p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
        <ArrowLeftIcon class="w-4 h-4" />
      </button>
      <div class="flex items-center gap-3 flex-1">
        <div class="flex flex-col items-center gap-0.5 shrink-0">
          <div
            class="w-9 h-9 rounded-md bg-linear-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center">
            <FolderOpenIcon class="w-4.5 h-4.5 text-indigo-400" />
          </div>
          <!-- Badge config sotto-icona: se entrambi attivi mostriamo solo le iniziali
               coi rispettivi colori (i nomi pieni eccedono la larghezza dell'icona);
               se uno solo è attivo c'è spazio per il nome esteso. -->
          <div class="flex items-center gap-0.5">
            <template v-if="session.compressionType && session.strategy === 'chunks'">
              <span class="text-[9px] font-bold uppercase text-emerald-400 leading-none">{{ session.compressionType[0]
              }}</span>
              <span class="text-[9px] font-bold uppercase text-violet-400 leading-none">C</span>
            </template>
            <template v-else>
              <span v-if="session.compressionType"
                class="text-[9px] font-bold uppercase tracking-wide text-emerald-400 leading-none">{{
                  session.compressionType }}</span>
              <span v-if="session.strategy === 'chunks'"
                class="text-[9px] font-bold uppercase tracking-wide text-violet-400 leading-none">chunks</span>
            </template>
          </div>
        </div>
        <div>
          <h1 class="text-lg font-bold text-white">{{ session.name }}</h1>
          <p class="text-xs text-gray-500">{{ $t('sessionDetail.createdAt', { date: formatTs(session.ts) }) }}</p>
        </div>
      </div>
      <!-- Actions -->
      <div class="flex items-center gap-2">
        <!-- Modalità selezione run -->
        <template v-if="runSelectionMode">
          <button @click="exitRunSelection"
            class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-400 border border-gray-700 hover:text-white hover:bg-gray-800 transition-colors">{{
              $t('sessionDetail.cancel') }}</button>
          <button @click="askDeleteSelectedRuns" :disabled="!selectedRuns.size"
            class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-red-400 border border-red-600/40 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <TrashIcon class="w-4 h-4" />
            {{ $t('sessionDetail.deleteSelectedRuns', { n: selectedRuns.size }) }}
          </button>
        </template>
        <template v-else>
          <button @click="enterRunSelection" :disabled="!session.runs.length"
            class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-400 border border-gray-700 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <CheckCircleIcon class="w-4 h-4" />
            {{ $t('sessionDetail.select') }}
          </button>
        </template>
        <!-- Backup / Sospendi -->
        <button v-if="isRunning" @click="handleCancel" :disabled="cancelling"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-amber-300 border border-amber-600/50 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <ArrowPathIcon v-if="cancelling" class="w-4 h-4 animate-spin" />
          <StopIcon v-else class="w-4 h-4" />
          {{ cancelling ? $t('sessionDetail.suspending') : $t('sessionDetail.suspend') }}
        </button>
        <button v-else @click="handleBackup" :disabled="!!activeTask || anyBackupRunning"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20">
          <ArrowPathIcon class="w-4 h-4" :class="{ 'animate-spin': isRestoring }" />
          {{ hasPaused ? $t('sessionDetail.resume') : $t('sessionDetail.backup') }}
        </button>
      </div>
    </div>

    <!-- Backup progress bar -->
    <div v-if="isRunning && backupProgress" class="px-8 py-3 bg-gray-900/60 border-b border-gray-800 shrink-0">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs text-gray-400 flex items-center gap-1.5">
          <template v-if="backupProgress.file">
            <span class="shrink-0"><span v-if="isStoreSlow" class="text-red-400 font-semibold">{{
              $t('common.storeLento') }}</span>{{ (isStoreSlow ? ' ' : '') + backupProgress.file.split(/[\\/]/).at(-1)
                }}</span>
            <span v-if="backupProgress.chunking" class="text-violet-400 font-mono shrink-0">{{ $t('common.chunking')
            }}</span>
            <span v-else-if="backupProgress.storing" class="text-indigo-400 font-mono shrink-0">{{ $t('common.storing')
            }}</span>
            <span v-else-if="backupProgress.compressing" class="text-emerald-400 font-mono shrink-0">{{
              $t('common.compressing') }}</span>
            <span v-else-if="backupProgress.bytes_compressing_total > 0" class="text-emerald-500 font-mono shrink-0">{{
              $t('common.compressing') }} {{ formatBytes(backupProgress.bytes_compressing ?? 0) }}/{{
                formatBytes(backupProgress.bytes_compressing_total) }}</span>
            <span v-else-if="backupProgress.bytes_hashing_total > 0" class="text-sky-400 font-mono shrink-0">{{
              $t('common.hashing') }} {{ formatBytes(backupProgress.bytes_hashing ?? 0) }}/{{
                formatBytes(backupProgress.bytes_hashing_total) }}</span>
          </template>
          <template v-else>{{ $t('sessionDetail.preparing') }}</template>
        </span>
        <span class="text-xs text-gray-500 font-mono">
          {{ backupProgress.current ?? 0 }} / {{ backupProgress.total ?? '…' }}
        </span>
      </div>
      <div class="w-full h-1 bg-gray-800 rounded-md overflow-hidden">
        <div class="h-full bg-indigo-500 rounded-md transition-all duration-300"
          :style="{ width: progressPct + '%' }" />
      </div>
      <div class="flex items-center gap-4 mt-1.5 text-[10px] text-gray-600">
        <span class="text-emerald-500">{{ $t('sessionDetail.progress.new', { n: backupProgress.files_new ?? 0 })
        }}</span>
        <span>{{ $t('sessionDetail.progress.dedup', { n: backupProgress.files_dedup ?? 0 }) }}</span>
        <template v-if="backupProgress.chunks_new != null || backupProgress.chunks_dedup != null">
          <span class="text-emerald-400/70">{{ $t('sessionDetail.progress.chunks_new', {
            n: backupProgress.chunks_new ??
              0
          }) }}</span>
          <span class="text-gray-600">{{ $t('sessionDetail.progress.chunks_dedup', {
            n: backupProgress.chunks_dedup ?? 0
          }) }}</span>
        </template>
        <span v-if="backupProgress.errors" class="text-amber-400">{{ $t('sessionDetail.progress.errors', {
          n:
            backupProgress.errors
        }) }}</span>
        <span>{{ $t('sessionDetail.progress.written', { n: formatBytes(backupProgress.bytes_new ?? 0) }) }}</span>
        <span v-if="backupProgress.last_error" class="text-amber-400/70 font-mono truncate max-w-65"
          :title="backupProgress.last_error.path">
          {{ backupProgress.last_error.path.split(/[\\/]/).at(-1) }} ({{ backupProgress.last_error.error ===
            'ERR_STORE_TIMEOUT' ? $t('common.errStoreTimeout') : backupProgress.last_error.error }})
        </span>
      </div>
    </div>

    <!-- Restore progress bar -->
    <div v-if="isRestoring && restoreProgress" class="px-8 py-3 bg-amber-950/30 border-b border-amber-900/40 shrink-0">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs text-amber-400 font-medium">{{ $t('sessionDetail.restoring') }}</span>
        <span class="text-xs text-gray-500 font-mono">
          {{ restoreProgress.current ?? 0 }} / {{ restoreProgress.total ?? '…' }}
        </span>
      </div>
      <div class="w-full h-1 bg-gray-800 rounded-md overflow-hidden">
        <div class="h-full bg-amber-500 rounded-md transition-all duration-300" :style="{ width: restorePct + '%' }" />
      </div>
      <div class="flex items-center gap-4 mt-1.5 text-[10px] text-gray-600">
        <span class="text-emerald-500">{{ $t('sessionDetail.progress.restored', { n: restoreProgress.restored ?? 0 })
        }}</span>
        <span v-if="restoreProgress.errors" class="text-red-400">{{ $t('sessionDetail.progress.errors', {
          n:
            restoreProgress.errors
        }) }}</span>
        <span class="font-mono truncate">{{ restoreProgress.file?.split(/[\\/]/).at(-1) }}</span>
      </div>
    </div>

    <!-- Restore result -->
    <div v-if="restoreResult && !isRestoring" class="px-8 py-3 border-b border-gray-800 shrink-0">
      <div v-if="restoreResult.errors.length === 0" class="flex items-center gap-2 text-xs text-emerald-400">
        <CheckCircleIcon class="w-4 h-4 shrink-0" />
        {{ $t('sessionDetail.restoreOk', { restored: restoreResult.restored, total: restoreResult.total }) }}
        <button @click="clearRestoreResult" class="ml-auto text-gray-600 hover:text-gray-400">
          <XMarkIcon class="w-3.5 h-3.5" />
        </button>
      </div>
      <div v-else>
        <div class="flex items-center gap-2 text-xs text-amber-400 mb-2">
          <ExclamationTriangleIcon class="w-4 h-4 shrink-0" />
          {{ $t('sessionDetail.restorePartial', {
            restored: restoreResult.restored, total: restoreResult.total, errors:
              restoreResult.errors.length
          }) }}
          <button @click="clearRestoreResult" class="ml-auto text-gray-600 hover:text-gray-400">
            <XMarkIcon class="w-3.5 h-3.5" />
          </button>
        </div>
        <div class="max-h-32 overflow-auto space-y-1">
          <div v-for="(err, i) in restoreResult.errors" :key="i"
            class="text-[10px] font-mono bg-red-950/30 border border-red-900/30 rounded px-2 py-1.5 space-y-0.5">
            <div class="flex gap-2">
              <span class="text-red-400 shrink-0">ERR</span>
              <span class="text-gray-400 truncate flex-1">{{ err.path }}</span>
              <span v-if="err.error === 'not_found'" class="text-amber-400 shrink-0">{{ $t('sessionDetail.fileNotFound')
              }}</span>
              <span v-else class="text-red-300 shrink-0">{{ err.error }}</span>
            </div>
            <div v-if="err.hash" class="text-gray-600 pl-7">hash: {{ err.hash }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scroll area principale -->
    <div class="flex-1 overflow-auto">
      <div class="flex items-start gap-6 px-8 py-6">

        <!-- Runs — 2/3 -->
        <div class="flex-1 min-w-0">

          <!-- Empty state -->
          <div v-if="session.runs.length === 0"
            class="flex flex-col items-center justify-center h-32 text-gray-600 text-sm">
            {{ $t('sessionDetail.noRuns') }}
          </div>

          <!-- Vista tabella -->
          <table v-else-if="runsView === 'table'" class="w-full text-sm">
            <thead>
              <tr class="text-left">
                <th v-if="runSelectionMode" class="pb-3 w-10 pl-4">
                  <input type="checkbox" :checked="allRunsSelected" @change="toggleAllRuns"
                    class="accent-indigo-500 cursor-pointer" />
                </th>
                <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4">{{
                  $t('sessionDetail.hdr.datetime') }}</th>
                <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4">{{
                  $t('sessionDetail.hdr.status') }}</th>
                <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 text-right">{{
                  $t('sessionDetail.hdr.files') }}</th>
                <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 text-right">{{
                  $t('sessionDetail.hdr.new') }}</th>
                <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 text-right">{{
                  $t('sessionDetail.hdr.written') }}</th>
                <th class="pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 text-right">{{
                  $t('sessionDetail.hdr.errors') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="run in session.runs" :key="run.ts" @click="handleRunRowClick(run)"
                class="group relative border-t border-gray-800/60 transition-colors" :class="[
                  run.status === 'running' ? 'cursor-default' : 'cursor-pointer',
                  selectedRun?.ts === run.ts
                    ? 'bg-indigo-500/10'
                    : run.status !== 'running' ? 'hover:bg-gray-800/40' : ''
                ]">
                <td v-if="runSelectionMode" class="py-3.5 pl-4 w-10" @click.stop>
                  <input type="checkbox" :checked="selectedRuns.has(run.ts)" @change="toggleSelectRun(run.ts)"
                    :disabled="run.status === 'running'"
                    class="accent-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                </td>
                <td class="py-3.5 px-4 text-gray-300 font-mono text-xs">{{ formatTs(run.ts) }}</td>
                <td class="py-3.5 px-4">
                  <StatusBadge :status="run.status" />
                </td>
                <td class="py-3.5 px-4 text-right font-mono font-medium text-gray-300">
                  {{ run.status === 'running' && backupProgress
                    ? backupProgress.total?.toLocaleString('it-IT') ?? '…'
                    : run.files_total?.toLocaleString('it-IT') ?? '—' }}
                </td>
                <td class="py-3.5 px-4 text-right font-mono text-xs">
                  <span v-if="run.status === 'running' && backupProgress" class="text-emerald-400">
                    {{ (backupProgress.files_new ?? 0).toLocaleString('it-IT') }}
                  </span>
                  <span v-else-if="run.files_new != null" class="text-emerald-400">{{
                    run.files_new.toLocaleString('it-IT')
                  }}</span>
                  <span v-else class="text-gray-700">—</span>
                </td>
                <td class="py-3.5 px-4 text-right font-mono text-xs">
                  <span v-if="run.status === 'running' && backupProgress" class="text-gray-300">
                    {{ formatBytes(backupProgress.bytes_new ?? 0) }}
                  </span>
                  <span v-else-if="run.bytes_new != null" class="text-gray-300">{{ formatBytes(run.bytes_new) }}</span>
                  <span v-else class="text-gray-700">—</span>
                </td>
                <td class="py-3.5 px-4 text-right font-mono text-xs">
                  <span v-if="run.status === 'running' && backupProgress?.errors" class="text-red-400">
                    {{ backupProgress.errors }}
                  </span>
                  <span v-else-if="run.errors_count" class="text-red-400">{{ run.errors_count }}</span>
                  <span v-else class="text-gray-700">—</span>
                </td>
                <!-- Overlay azioni -->
                <td v-if="run.status !== 'running'" class="w-0 p-0 overflow-visible" @click.stop>
                  <div class="absolute right-0 inset-y-0 z-10 flex items-center transition-opacity"
                    :class="pendingDeleteRun?.ts === run.ts ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'"
                    @click.stop>
                    <div class="w-16 h-full"
                      style="background: linear-gradient(to right, transparent, var(--bg-base))" />
                    <div class="flex items-center gap-1.5 px-3 h-full" style="background-color: var(--bg-base)">
                      <template v-if="pendingDeleteRun?.ts === run.ts">
                        <button @click.stop="pendingDeleteRun = null"
                          class="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">{{
                            $t('common.cancel') }}</button>
                        <button @click.stop="confirmDeleteRun(run)"
                          class="px-2 py-1 rounded text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors">{{
                            $t('common.delete') }}</button>
                      </template>
                      <button v-else @click.stop="pendingDeleteRun = run"
                        class="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <TrashIcon class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Vista timeline -->
          <div v-else-if="runsView === 'timeline'" class="relative">
            <div class="absolute left-3.5 top-2 bottom-2 w-px bg-gray-800" />

            <div class="space-y-4">
              <div v-for="run in session.runs" :key="run.ts" class="relative flex gap-4 group">
                <!-- Dot -->
                <div
                  class="shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center z-10 transition-colors"
                  :class="run.status === 'done' ? 'bg-gray-900 border-emerald-500/70' :
                    run.status === 'paused' ? 'bg-gray-900 border-amber-500/70' :
                      run.status === 'running' ? 'bg-gray-900 border-indigo-500' :
                        run.status === 'error' ? 'bg-gray-900 border-red-500/70' :
                          'bg-gray-900 border-gray-600'">
                  <CheckCircleIcon v-if="run.status === 'done'" class="w-3 h-3 text-emerald-400" />
                  <StopIcon v-else-if="run.status === 'paused'" class="w-3 h-3 text-amber-400" />
                  <ArrowPathIcon v-else-if="run.status === 'running'" class="w-3 h-3 text-indigo-400 animate-spin" />
                  <ExclamationTriangleIcon v-else-if="run.status === 'error'" class="w-3 h-3 text-red-400" />
                  <ExclamationTriangleIcon v-else class="w-3 h-3 text-gray-500" />
                </div>

                <!-- Card -->
                <div class="flex-1 mb-1 bg-gray-900 border rounded-lg overflow-hidden transition-colors cursor-pointer"
                  :class="run.status !== 'running'
                    ? 'border-gray-800 hover:border-gray-700'
                    : 'border-indigo-500/30 bg-indigo-950/10'" @click="handleRunRowClick(run)">
                  <!-- Card header -->
                  <div class="px-4 py-3 flex items-center justify-between border-b border-gray-800/60">
                    <div class="flex items-center gap-2.5">
                      <input v-if="runSelectionMode" type="checkbox" :checked="selectedRuns.has(run.ts)"
                        @change="toggleSelectRun(run.ts)" :disabled="run.status === 'running'"
                        class="accent-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        @click.stop />
                      <p class="text-xs font-mono text-gray-300 font-medium">{{ formatTs(run.ts) }}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <StatusBadge :status="run.status" />
                      <button v-if="run.status !== 'running'"
                        @click.stop="pendingDeleteRun = pendingDeleteRun?.ts === run.ts ? null : run"
                        class="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <TrashIcon class="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <!-- Conferma eliminazione inline -->
                  <div v-if="pendingDeleteRun?.ts === run.ts"
                    class="px-4 py-2.5 flex items-center gap-2 bg-red-950/20 border-b border-red-900/30">
                    <span class="text-xs text-gray-400 flex-1">{{ $t('sessionDetail.deleteRun') }}</span>
                    <button @click.stop="pendingDeleteRun = null"
                      class="px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-200 transition-colors">{{
                        $t('common.cancel') }}</button>
                    <button @click.stop="confirmDeleteRun(run)"
                      class="px-2 py-1 rounded text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors">{{
                        $t('common.delete') }}</button>
                  </div>

                  <!-- Stats grid -->
                  <div class="px-4 py-3 grid grid-cols-3 gap-x-4 gap-y-2.5">
                    <div>
                      <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{{
                        $t('sessionDetail.tl.total')
                      }}</p>
                      <p class="text-sm font-mono font-medium text-gray-300">{{ run.files_total?.toLocaleString('it-IT')
                        ??
                        '—' }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{{ $t('sessionDetail.tl.new')
                      }}
                      </p>
                      <p class="text-sm font-mono font-medium text-emerald-400">{{
                        run.files_new?.toLocaleString('it-IT') ??
                        '—' }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{{
                        $t('sessionDetail.tl.dedup')
                      }}</p>
                      <p class="text-sm font-mono font-medium text-indigo-400">{{
                        run.files_dedup?.toLocaleString('it-IT')
                        ?? '—' }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{{
                        $t('sessionDetail.tl.written')
                      }}</p>
                      <p class="text-sm font-mono font-medium text-gray-300">{{ run.bytes_new != null ?
                        formatBytes(run.bytes_new) : '—' }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{{
                        $t('sessionDetail.tl.totalBytes') }}</p>
                      <p class="text-sm font-mono font-medium text-gray-500">{{ run.bytes_total != null ?
                        formatBytes(run.bytes_total) : '—' }}</p>
                    </div>
                    <div>
                      <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{{
                        $t('sessionDetail.tl.duration') }}</p>
                      <p class="text-sm font-mono font-medium text-gray-300">{{ run.duration_sec != null ?
                        formatDuration(run.duration_sec) : '—' }}</p>
                    </div>
                  </div>

                  <!-- Barra dedup/new -->
                  <div v-if="run.files_total && (run.files_new != null || run.files_dedup != null)" class="px-4 pb-3">
                    <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden flex">
                      <div class="h-full bg-emerald-500 transition-all"
                        :style="{ width: ((run.files_new ?? 0) / run.files_total * 100) + '%' }" />
                      <div class="h-full bg-indigo-500/60 transition-all"
                        :style="{ width: ((run.files_dedup ?? 0) / run.files_total * 100) + '%' }" />
                    </div>
                    <div class="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
                      <span class="flex items-center gap-1"><span
                          class="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> {{
                            $t('sessionDetail.tl.new_legend')
                          }}</span>
                      <span class="flex items-center gap-1"><span
                          class="w-2 h-2 rounded-full bg-indigo-500/60 inline-block" /> {{
                            $t('sessionDetail.tl.dedup_legend') }}</span>
                      <span v-if="run.errors_count" class="text-red-400 ml-auto">{{ $t('sessionDetail.hdr.errors') }}:
                        {{
                          run.errors_count }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Pannello dettagli sessione — 1/3, sticky -->
        <div class="w-72 shrink-0 sticky top-6 space-y-3">

          <!-- Toggle vista -->
          <div class="flex items-center gap-1 p-1 bg-gray-900 border border-gray-800 rounded-lg">
            <button @click="runsView = 'table'"
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              :class="runsView === 'table' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'">
              <TableCellsIcon class="w-3.5 h-3.5" />
              {{ $t('sessionDetail.list') }}
            </button>
            <button @click="runsView = 'timeline'"
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              :class="runsView === 'timeline' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'">
              <ClockIcon class="w-3.5 h-3.5" />
              {{ $t('sessionDetail.timeline') }}
            </button>
          </div>

          <!-- Intestazione -->
          <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-2.5">
              <div class="flex flex-col items-center gap-0.5 shrink-0">
                <div
                  class="w-7 h-7 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
                  <FolderOpenIcon class="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <!-- Stesso pattern del header: iniziali se entrambi, nome esteso se solo uno. -->
                <div class="flex items-center gap-0.5">
                  <template v-if="session.compressionType && session.strategy === 'chunks'">
                    <span class="text-[9px] font-bold uppercase text-emerald-400 leading-none">{{
                      session.compressionType[0] }}</span>
                    <span class="text-[9px] font-bold uppercase text-violet-400 leading-none">C</span>
                  </template>
                  <template v-else>
                    <span v-if="session.compressionType"
                      class="text-[9px] font-bold uppercase tracking-wide text-emerald-400 leading-none">{{
                        session.compressionType }}</span>
                    <span v-if="session.strategy === 'chunks'"
                      class="text-[9px] font-bold uppercase tracking-wide text-violet-400 leading-none">chunks</span>
                  </template>
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-white truncate">{{ session.name }}</p>
                <p class="text-[10px] text-gray-500 mt-0.5">{{ formatTs(session.ts) }}</p>
              </div>
              <button @click="editingSession = session" :disabled="sessionBusy"
                class="p-1.5 rounded-md text-gray-600 hover:text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                :title="$t('sessions.actions.edit')">
                <PencilSquareIcon class="w-3.5 h-3.5" />
              </button>
            </div>
            <div v-if="session.id" class="px-4 py-2.5 border-b border-gray-800/60 flex items-center gap-2">
              <span class="text-[10px] text-gray-600 uppercase tracking-wider font-semibold w-8 shrink-0">{{
                $t('sessionDetail.id') }}</span>
              <span class="text-[10px] font-mono text-gray-500 truncate">{{ session.id }}</span>
            </div>
            <div class="px-4 py-2.5 border-b border-gray-800/60 flex items-center gap-2">
              <span class="text-[10px] text-gray-600 uppercase tracking-wider font-semibold shrink-0">{{
                $t('sessionDetail.runs') }}</span>
              <span class="text-[10px] font-mono text-gray-400 ml-auto">{{ session.runs.length }}</span>
            </div>
            <div class="px-4 py-2.5 flex items-center gap-2">
              <span class="text-[10px] text-gray-600 uppercase tracking-wider font-semibold shrink-0">{{
                $t('sessionDetail.config') }}</span>
              <div class="ml-auto flex items-center gap-1">
                <span v-if="session.compressionType"
                  class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{{
                    session.compressionType }}</span>
                <span v-if="session.strategy === 'chunks'"
                  class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400">chunks</span>
                <span v-if="!session.compressionType && session.strategy !== 'chunks'"
                  class="text-[9px] font-mono text-gray-600">blob</span>
              </div>
            </div>
          </div>

          <!-- Sorgenti -->
          <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div class="px-4 py-2.5 border-b border-gray-800/60">
              <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{{ $t('sessionDetail.sources')
              }}
              </p>
            </div>
            <div class="px-4 py-3 space-y-2">
              <div v-for="src in session.sources" :key="src" class="flex items-start gap-2" :title="src">
                <FolderIcon class="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
                <span class="text-[11px] font-mono text-gray-400 break-all leading-relaxed">{{ src }}</span>
              </div>
            </div>
          </div>

          <!-- Percorsi esclusi -->
          <div v-if="session.excludes?.paths?.length"
            class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div class="px-4 py-2.5 border-b border-gray-800/60">
              <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{{
                $t('sessionDetail.excludedPaths') }}</p>
            </div>
            <div class="px-4 py-3 space-y-1.5">
              <div v-for="p in session.excludes.paths" :key="p" class="flex items-start gap-2">
                <XMarkIcon class="w-3 h-3 text-red-500/60 shrink-0 mt-0.5" />
                <span class="text-[11px] font-mono text-gray-500 break-all leading-relaxed">{{ p }}</span>
              </div>
            </div>
          </div>

          <!-- Pattern esclusioni -->
          <div v-if="session.excludes?.patterns?.length"
            class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div class="px-4 py-2.5 border-b border-gray-800/60">
              <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{{
                $t('sessionDetail.excludePatterns') }}</p>
            </div>
            <div class="px-4 py-3 flex flex-wrap gap-1.5">
              <span v-for="pat in session.excludes.patterns" :key="pat"
                class="px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-400 bg-gray-800 border border-gray-700">{{
                  pat
                }}</span>
            </div>
          </div>

        </div>

      </div>
    </div>

    <!-- Sidebar dettaglio run -->
    <transition name="slide">
      <div v-if="selectedRun" class="fixed inset-0 z-40 flex justify-end">
        <div class="backdrop absolute inset-0 bg-black/30 backdrop-blur-[2px]" @click="closeRunDetail" />
        <div
          class="drawer-panel relative w-md h-full bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl overflow-hidden">
          <!-- Header sidebar -->
          <div
            class="px-5 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900/90 backdrop-blur-md z-10">
            <div>
              <p class="text-sm font-bold text-white">{{ $t('sessionDetail.runDetail') }}</p>
              <p class="text-[10px] text-gray-500 font-mono mt-0.5">{{ formatTs(selectedRun.ts) }}</p>
            </div>
            <button @click="closeRunDetail" class="p-1 rounded-md text-gray-600 hover:text-white transition-colors">
              <XMarkIcon class="w-4 h-4" />
            </button>
          </div>

          <div class="flex-1 overflow-auto">

            <!-- Barra caricamento file progressivo -->
            <div v-if="state.selectedRunFull?._filesLoading"
              class="mx-3 mt-3 px-3 py-2 rounded-md bg-gray-800/60 border border-gray-700/50 flex items-center gap-2">
              <ArrowPathIcon class="w-3 h-3 text-indigo-400 animate-spin shrink-0" />
              <span class="text-[10px] text-gray-500">
                {{ $t('sessionDetail.loadingFiles') }}
                {{ state.selectedRunFull._filesLoaded.toLocaleString('it-IT') }}
                / {{ state.selectedRunFull._filesTotal.toLocaleString('it-IT') }}
              </span>
            </div>

            <!-- Errori del run -->
            <div v-if="state.selectedRunFull?.errors?.length"
              class="mx-3 mt-3 rounded-md border border-red-900/40 overflow-hidden">
              <button class="w-full px-3 py-2 flex items-center gap-2 bg-red-950/30 text-left"
                @click="errorsExpanded = !errorsExpanded">
                <ExclamationTriangleIcon class="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span class="text-[11px] font-semibold text-red-400 flex-1">
                  {{ $t('sessionDetail.errorsInRun', { n: state.selectedRunFull.errors.length }) }}
                </span>
                <ChevronDownIcon class="w-3.5 h-3.5 text-gray-500 transition-transform"
                  :class="errorsExpanded ? 'rotate-180' : ''" />
              </button>
              <div v-if="errorsExpanded" class="max-h-48 overflow-auto divide-y divide-gray-800/60">
                <div v-for="(err, i) in state.selectedRunFull.errors" :key="i" class="px-3 py-2 flex items-start gap-2">
                  <span class="text-[9px] font-mono px-1 py-0.5 rounded shrink-0 mt-0.5 uppercase tracking-wider"
                    :class="{
                      'bg-orange-900/50 text-orange-400': err.phase === 'scan',
                      'bg-yellow-900/50 text-yellow-400': err.phase === 'stat',
                      'bg-purple-900/50 text-purple-400': err.phase === 'hash',
                      'bg-red-900/50   text-red-400': err.phase === 'store',
                      'bg-gray-800     text-gray-500': !err.phase,
                    }">{{ err.phase ?? '?' }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[10px] font-mono text-gray-400 break-all leading-relaxed">{{ err.path }}</p>
                    <p class="text-[10px] text-red-400/80 mt-0.5">{{ err.error }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- File explorer -->
            <div class="px-3 py-3">
              <FileTree :files="state.selectedRunFull?.files ?? null" @update:selected="selectedFiles = $event"
                @update:selectionMode="inSelectionMode = $event" />
            </div>

          </div>

          <!-- Azioni -->
          <div class="px-5 py-4 border-t border-gray-800 bg-gray-950">
            <!-- Conferma eliminazione -->
            <div v-if="confirmingDelete" class="flex items-center gap-2">
              <ExclamationTriangleIcon class="w-4 h-4 text-amber-400 shrink-0" />
              <span class="text-xs text-gray-400 flex-1">{{ $t('sessionDetail.deleteRun') }}</span>
              <button @click="confirmDeleteSelectedRun"
                class="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors">{{
                  $t('common.delete') }}</button>
              <button @click="confirmingDelete = false"
                class="px-3 py-1.5 rounded-md text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">{{
                  $t('common.cancel') }}</button>
            </div>
            <!-- Selezione attiva -->
            <div v-else-if="inSelectionMode" class="flex items-center gap-3">
              <span class="text-[11px] text-gray-500 flex-1">
                <template v-if="selectedFiles.length">{{ $t('sessionDetail.selectedFiles', { n: selectedFiles.length })
                }}</template>
                <template v-else>{{ $t('sessionDetail.noFileSelected') }}</template>
              </span>
              <button @click="selectedFiles.length ? handleRestore() : null"
                :disabled="sessionBusy || anyBackupRunning || !selectedFiles.length"
                class="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20">
                <ArrowDownTrayIcon class="w-3.5 h-3.5" />
                {{ $t('sessionDetail.restore') }}
              </button>
            </div>
            <!-- Azioni normali -->
            <div v-else class="flex gap-2">
              <button @click="confirmingDelete = true" :disabled="cannotDeleteRun"
                class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-medium text-red-400 border border-red-900/50 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <TrashIcon class="w-3.5 h-3.5" />
                {{ $t('sessionDetail.deleteRun_btn') }}
              </button>
              <button @click="handleRestore" :disabled="sessionBusy || anyBackupRunning"
                class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20">
                <ArrowDownTrayIcon class="w-3.5 h-3.5" />
                {{ $t('sessionDetail.restoreBtn') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <EditSessionModal v-if="editingSession" :session="editingSession" @close="editingSession = null"
      @saved="editingSession = null" />

    <!-- Modals -->
    <RestoreModal :show="showRestoreModal" :run-ts="selectedRun?.ts" :original-path="_restoreDest(session?.sources)"
      :selected-files="selectedFiles.length ? selectedFiles : null" @close="showRestoreModal = false"
      @confirm="onRestoreConfirm" />

    <!-- Modal conferma eliminazione bulk runs -->
    <Teleport to="body">
      <div v-if="runDeleteConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
        <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
              <TrashIcon class="w-4 h-4 text-red-400" />
            </div>
            <h3 class="text-sm font-bold text-white">{{ $t('sessionDetail.confirmDeleteRuns.title') }}</h3>
          </div>
          <div class="px-6 py-5">
            <p class="text-sm text-gray-300">
              {{ $t('sessionDetail.confirmDeleteRuns.message', { count: selectedRuns.size }) }}
              {{ $t('common.cannotUndo') }}
            </p>
          </div>
          <div class="px-6 py-4 bg-gray-800/30 flex justify-end gap-3">
            <button @click="runDeleteConfirm = false"
              class="px-4 py-2 rounded-md text-sm text-gray-400 hover:text-white transition-colors">{{
                $t('common.cancel')
              }}</button>
            <button @click="confirmDeleteSelectedRuns"
              class="px-4 py-2 rounded-md text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors">{{
                $t('common.delete') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.slide-enter-active .backdrop,
.slide-leave-active .backdrop {
  transition: opacity 0.25s ease;
}

.slide-enter-from .backdrop,
.slide-leave-to .backdrop {
  opacity: 0;
}

.slide-enter-active .drawer-panel,
.slide-leave-active .drawer-panel {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
  ArrowPathIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  StopIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  TableCellsIcon,
  ClockIcon,
  ChevronDownIcon,
  PencilSquareIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import {
  state, goBack, selectRun, deleteRun,
  startBackup, startRestore, cancelTask, getActiveTask, getLastTask,
  formatTs, formatBytes, anyBackupRunning,
} from '../stores/vorn.js'
import EditSessionModal from '../components/EditSessionModal.vue'

function formatDuration(sec) {
  if (sec == null) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}
import StatusBadge from '../components/StatusBadge.vue'
import RestoreModal from '../components/RestoreModal.vue'
import FileTree from '../components/FileTree.vue'

const session = computed(() => state.selectedSession)
const selectedRun = computed(() => state.selectedRun)
const pausedRun = computed(() => session.value?.runs[0]?.status === 'paused' ? session.value.runs[0] : null)
const hasPaused = computed(() => !!pausedRun.value)

const activeTask = computed(() => getActiveTask(session.value?.name))
const sessionBusy = computed(() => !!getActiveTask(session.value?.name))
const cannotDeleteRun = computed(() => selectedRun.value?.status === 'running')
const isRunning = computed(() => activeTask.value?.type === 'backup')
const isRestoring = computed(() => activeTask.value?.type === 'restore')
const backupProgress = computed(() => isRunning.value ? activeTask.value?.progress : null)
const restoreProgress = computed(() => isRestoring.value ? activeTask.value?.progress : null)

const lastRestoreTask = computed(() => getLastTask(session.value?.name, 'restore'))
const restoreResult = computed(() => lastRestoreTask.value?.status !== 'running' ? lastRestoreTask.value?.result : null)

const STORE_SLOW_MS = 7000
const isStoreSlow = ref(false)
let _storeSlowTimer = null
let _storeSlowFile = null

watch(backupProgress, p => {
  const file = p?.file ?? null
  // Trigger del "store lento" attivo anche durante chunking: anch'esso è scrittura sullo store.
  const storing = (p?.storing || p?.chunking) ?? false

  if (file !== _storeSlowFile) {
    clearTimeout(_storeSlowTimer)
    _storeSlowTimer = null
    isStoreSlow.value = false
    _storeSlowFile = file
  }

  if (storing && !_storeSlowTimer) {
    _storeSlowTimer = setTimeout(() => { isStoreSlow.value = true }, STORE_SLOW_MS)
  } else if (!storing && _storeSlowTimer) {
    clearTimeout(_storeSlowTimer)
    _storeSlowTimer = null
    isStoreSlow.value = false
  }
}, { immediate: true })
watch(isRunning, running => {
  if (!running) {
    clearTimeout(_storeSlowTimer)
    _storeSlowTimer = null
    isStoreSlow.value = false
    _storeSlowFile = null
  }
})

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

async function confirmDeleteRun(run) {
  pendingDeleteRun.value = null
  await deleteRun(session.value.name, run.ts)
}

function clearRestoreResult() {
  const t = lastRestoreTask.value
  if (t) t.result = null
}

const editingSession = ref(null)
const runsView = ref('table')
const showRestoreModal = ref(false)
const confirmingDelete = ref(false)
const selectedFiles = ref([])
const inSelectionMode = ref(false)
const pendingDeleteRun = ref(null)
const errorsExpanded = ref(false)

const runSelectionMode = ref(false)
const selectedRuns = ref(new Set())
const runDeleteConfirm = ref(false)

const selectableRuns = computed(() => (session.value?.runs ?? []).filter(r => r.status !== 'running'))
const allRunsSelected = computed(() => selectableRuns.value.length > 0 && selectableRuns.value.every(r => selectedRuns.value.has(r.ts)))

function enterRunSelection() { runSelectionMode.value = true }
function exitRunSelection() { runSelectionMode.value = false; selectedRuns.value = new Set() }

function toggleSelectRun(ts) {
  const s = new Set(selectedRuns.value)
  s.has(ts) ? s.delete(ts) : s.add(ts)
  selectedRuns.value = s
}

function toggleAllRuns() {
  if (allRunsSelected.value) selectedRuns.value = new Set()
  else selectedRuns.value = new Set(selectableRuns.value.map(r => r.ts))
}

function askDeleteSelectedRuns() { runDeleteConfirm.value = true }

async function confirmDeleteSelectedRuns() {
  const tsList = [...selectedRuns.value]
  runDeleteConfirm.value = false
  exitRunSelection()
  for (const ts of tsList) await deleteRun(session.value.name, ts)
}

function handleRunRowClick(run) {
  if (runSelectionMode.value) {
    if (run.status !== 'running') toggleSelectRun(run.ts)
  } else {
    if (run.status !== 'running') selectRun(run)
  }
}

function closeRunDetail() {
  state.selectedRun = null
  state.selectedRunFull = null
  confirmingDelete.value = false
  selectedFiles.value = []
  inSelectionMode.value = false
  errorsExpanded.value = false
}

const cancelling = computed(() => activeTask.value?.cancelling ?? false)

function handleBackup() { startBackup(session.value.name, pausedRun.value?.ts ?? null) }

function handleCancel() {
  if (activeTask.value) cancelTask(activeTask.value.id)
}

async function confirmDeleteSelectedRun() {
  if (!selectedRun.value) return
  const sessionName = session.value.name
  const runTs = selectedRun.value.ts
  closeRunDetail()
  await deleteRun(sessionName, runTs)
}

function _restoreDest(_sources) {
  // relPaths ora sono path assolute: il ripristino originale scrive direttamente alle path originali
  return null
}

function handleRestore() {
  if (!selectedRun.value) return
  showRestoreModal.value = true
}

async function onRestoreConfirm(destDir) {
  const sessionName = session.value.name
  const runTs = selectedRun.value.ts
  const files = selectedFiles.value.length ? [...selectedFiles.value] : null
  showRestoreModal.value = false
  closeRunDetail()
  await startRestore(sessionName, runTs, destDir, files)
}
</script>
