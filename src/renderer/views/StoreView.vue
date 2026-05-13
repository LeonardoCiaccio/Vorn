<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Header -->
    <div class="px-8 py-6 border-b border-gray-800 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-xl font-semibold text-white">{{ $t('store.title') }}</h1>
        <p class="text-sm text-gray-500 mt-0.5 font-mono">
          {{ state.activeStore }}
          <span v-if="storeFileCount !== null" class="text-gray-600"> · {{ storeFileCount.toLocaleString() }} vorn</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button @click="refreshStore" class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 transition-colors">
          <ArrowPathIcon class="w-4 h-4" :class="{ 'animate-spin': state.loading }" />
          {{ $t('store.refresh') }}
        </button>
        <button
          @click="closeStore"
          :disabled="anyTaskRunning"
          :title="anyTaskRunning ? $t('common.operationWait') : ''"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowRightStartOnRectangleIcon class="w-4 h-4" />
          {{ $t('store.changeStore') }}
        </button>
        <button
          @click="showExtractModal = true"
          :disabled="anyTaskRunning"
          :title="anyTaskRunning ? $t('common.operationWait') : ''"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-500/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ArchiveBoxArrowDownIcon class="w-4 h-4" />
          {{ $t('store.extractFiles') }}
        </button>
        <button
          @click="showClearModal = true"
          :disabled="clearState.running || anyTaskRunning"
          :title="anyTaskRunning && !clearState.running ? $t('common.operationWait') : ''"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-red-600/50 hover:text-red-400 hover:bg-red-500/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowPathIcon v-if="clearState.running" class="w-4 h-4 animate-spin" />
          <TrashIcon v-else class="w-4 h-4" />
          <span v-if="clearState.running">{{ clearState.progress?.deleted ?? 0 }}/{{ clearState.progress?.total ?? 0 }}</span>
          <span v-else>{{ $t('store.clearStore') }}</span>
        </button>
        <button
          @click="runIntegrity"
          :disabled="integrityState.running || anyTaskRunning"
          :title="anyTaskRunning && !integrityState.running ? $t('common.operationWait') : ''"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowPathIcon v-if="integrityState.running" class="w-4 h-4 animate-spin" />
          <WrenchScrewdriverIcon v-else class="w-4 h-4" />
          <span v-if="integrityState.running">{{ integrityState.progress?.current ?? 0 }}/{{ integrityState.progress?.total ?? 0 }}</span>
          <span v-else>{{ $t('store.verifyIntegrity') }}</span>
        </button>
        <button
          @click="showPruneConfirm = true"
          :disabled="pruneState.running || anyTaskRunning"
          :title="anyTaskRunning && !pruneState.running ? $t('common.operationWait') : ''"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-300 border border-gray-700 hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-500/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowPathIcon v-if="pruneState.running" class="w-4 h-4 animate-spin" />
          <ScissorsIcon  v-else class="w-4 h-4" />
          <span v-if="pruneState.running">{{ pruneState.progress?.deleted ?? 0 }}/{{ pruneState.progress?.orphanCount ?? '…' }}</span>
          <span v-else>{{ $t('store.prune.button') }}</span>
        </button>
      </div>
    </div>

    <!-- Modal bloccante: svuota in corso -->
    <div v-if="clearState.running" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px]">
      <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
          <div class="w-8 h-8 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
            <ArrowPathIcon class="w-4 h-4 text-red-400 animate-spin" />
          </div>
          <div>
            <p class="text-sm font-bold text-white">{{ $t('store.clearing.title') }}</p>
            <p class="text-xs text-gray-500 mt-0.5">{{ $t('store.clearing.dontClose') }}</p>
          </div>
        </div>
        <div class="px-6 py-5 space-y-4">
          <div class="flex items-center justify-between text-xs font-mono mb-1">
            <span class="text-red-400">{{ $t('store.clearing.deleted', { n: (clearState.progress?.deleted ?? 0).toLocaleString() }) }}</span>
            <span class="text-gray-500">{{ $t('store.clearing.total', { n: (clearState.progress?.total ?? 0).toLocaleString() }) }}</span>
          </div>
          <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-red-500 rounded-full transition-all duration-300"
              :style="{ width: clearProgressPct + '%' }"
            />
          </div>
          <p v-if="clearState.progress?.failed" class="text-xs text-amber-400">
            {{ $t('store.clearing.errors', { n: clearState.progress.failed }) }}
          </p>
        </div>
        <div class="px-6 py-4 bg-gray-800/30 flex justify-end">
          <button
            @click="stopClear"
            class="px-4 py-2 rounded-md text-xs font-semibold text-white bg-red-700 hover:bg-red-600 transition-colors"
          >
            {{ $t('common.stop') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal bloccante: pulizia in corso -->
    <div v-if="pruneState.running" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px]">
      <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
          <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <ArrowPathIcon class="w-4 h-4 text-indigo-400 animate-spin" />
          </div>
          <div>
            <p class="text-sm font-bold text-white">{{ $t('store.prune.runningTitle') }}</p>
            <p class="text-xs text-gray-500 mt-0.5">{{ $t('store.prune.dontClose') }}</p>
          </div>
        </div>
        <div class="px-6 py-5 space-y-3">
          <!-- fase scanning / computing -->
          <template v-if="!pruneState.progress || pruneState.progress.phase !== 'deleting'">
            <p class="text-xs text-gray-400">
              <span v-if="pruneState.progress?.phase === 'scanning'">
                {{ $t('store.prune.scanning', { scanned: pruneState.progress.scanned, total: pruneState.progress.totalSessions }) }}
              </span>
              <span v-else>{{ $t('store.prune.computing') }}</span>
            </p>
            <div class="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div class="h-full w-2/5 bg-indigo-400 rounded-full animate-pulse" />
            </div>
          </template>
          <!-- fase deleting -->
          <template v-else>
            <p class="text-xs text-gray-400">{{ $t('store.prune.deleting') }}</p>
            <div class="flex items-center justify-between text-xs font-mono mb-1">
              <span class="text-indigo-400">{{ $t('store.prune.deleted', { n: pruneState.progress.deleted }) }}</span>
              <span class="text-gray-500">{{ $t('store.prune.orphansFound', { n: pruneState.progress.orphanCount }) }}</span>
            </div>
            <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                class="h-full bg-indigo-500 rounded-full transition-all duration-300"
                :style="{ width: pruneProgressPct + '%' }"
              />
            </div>
            <p v-if="pruneState.progress.failed" class="text-xs text-amber-400">
              {{ $t('store.prune.failed', { n: pruneState.progress.failed }) }}
            </p>
          </template>
        </div>
        <div class="px-6 py-4 bg-gray-800/30 flex justify-end gap-2">
          <button
            @click="doStopPrune"
            :disabled="pruneSuspending"
            class="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold text-white bg-red-700 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowPathIcon v-if="pruneSuspending" class="w-3 h-3 animate-spin" />
            {{ pruneSuspending ? $t('store.prune.suspending') : $t('common.stop') }}
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
              <th class="py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">{{ $t('store.hdr.hash') }}</th>
              <th class="py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider pr-5">{{ $t('store.hdr.size') }}</th>
              <th class="py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{{ $t('store.hdr.lastModified') }}</th>
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
            <tr
              v-for="(entry, i) in state.storeEntries"
              :key="entry.hash_vorn"
              @click="toggleEntry(entry)"
              class="cursor-pointer hover:bg-gray-800/20 transition-colors"
              :class="[
                i > 0 ? 'border-t border-gray-800/60' : '',
                selectedEntry?.hash_vorn === entry.hash_vorn ? 'bg-indigo-500/10' : '',
              ]"
            >
              <td class="py-3 pr-5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md break-all">
                    {{ entry.content_hash ?? entry.hash_vorn }}
                  </span>
                  <span
                    v-if="entry.compressedType"
                    class="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  >
                    {{ entry.compressedType }}
                  </span>
                </div>
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
          <p class="text-gray-500 text-sm">{{ $t('store.noFiles') }}</p>
        </div>
      </div>
    </div>

    <!-- Drawer: dettaglio file -->
    <transition name="slide">
      <div v-if="selectedEntry" class="fixed inset-0 z-40 flex justify-end">
        <div class="backdrop absolute inset-0 bg-black/30 backdrop-blur-[2px]" @click="selectedEntry = null" />
        <div class="drawer-panel relative w-md h-full bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl overflow-hidden">

          <!-- Header -->
          <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900/90 backdrop-blur-md z-10">
            <div>
              <p class="text-sm font-bold text-white">{{ $t('store.detail.title') }}</p>
              <p class="text-[10px] text-gray-500 font-mono mt-0.5">{{ selectedEntry.hash_vorn.slice(0, 16) }}…</p>
            </div>
            <button @click="selectedEntry = null" class="p-1 rounded-md text-gray-600 hover:text-white transition-colors">
              <XMarkIcon class="w-4 h-4" />
            </button>
          </div>

          <!-- Banner feedback ripristino -->
          <transition name="fade">
            <div
              v-if="extractResult"
              class="shrink-0 flex items-center gap-3 px-5 py-3 border-b text-xs"
              :class="extractResult.ok
                ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-300'
                : 'bg-red-950/40 border-red-900/50 text-red-300'"
            >
              <CheckCircleIcon v-if="extractResult.ok" class="w-4 h-4 shrink-0" />
              <ExclamationTriangleIcon v-else class="w-4 h-4 shrink-0" />
              <span class="flex-1">{{ extractResult.message }}</span>
              <button @click="extractResult = null" class="opacity-60 hover:opacity-100 transition-opacity">
                <XMarkIcon class="w-3.5 h-3.5" />
              </button>
            </div>
          </transition>

          <!-- Corpo scrollabile -->
          <div class="flex-1 overflow-auto px-5 py-5 space-y-5">

            <!-- Hash -->
            <div class="space-y-1.5">
              <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{{ $t('store.detail.hash') }}</p>
              <div class="flex items-start gap-2">
                <p class="font-mono text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-1.5 rounded-md break-all flex-1 leading-relaxed">
                  {{ selectedEntry.content_hash ?? selectedEntry.hash_vorn }}
                </p>
                <button
                  @click="copyHash"
                  :title="hashCopied ? $t('store.detail.copied') : $t('store.detail.copyHash')"
                  class="p-1.5 rounded-md transition-colors shrink-0 mt-0.5"
                  :class="hashCopied ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-500 hover:text-white hover:bg-gray-800'"
                >
                  <CheckCircleIcon v-if="hashCopied" class="w-3.5 h-3.5" />
                  <DocumentDuplicateIcon v-else class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Dimensione -->
            <div class="space-y-1">
              <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{{ $t('store.detail.size') }}</p>
              <p class="text-sm font-mono text-gray-300">{{ formatBytes(selectedEntry.bytes_file) }}</p>
            </div>

            <!-- Compressione -->
            <div class="space-y-1">
              <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{{ $t('store.detail.compression') }}</p>
              <p v-if="selectedEntry.compressedType" class="text-sm font-mono text-emerald-400">{{ selectedEntry.compressedType }}</p>
              <p v-else class="text-sm font-mono text-gray-500">{{ $t('store.detail.compressionNone') }}</p>
            </div>

            <!-- Date -->
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{{ $t('store.detail.created') }}</p>
                <p class="text-xs text-gray-400">{{ formatTs(selectedEntry.ctime) }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{{ $t('store.detail.modified') }}</p>
                <p class="text-xs text-gray-400">{{ formatTs(selectedEntry.mtime) }}</p>
              </div>
            </div>

            <!-- Sessioni / Record -->
            <div class="space-y-2">
              <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {{ $t('store.detail.sessions', { n: selectedEntry.records?.length ?? 0 }) }}
              </p>
              <p v-if="!selectedEntry.records?.length" class="text-xs text-gray-600">{{ $t('store.detail.noSessions') }}</p>
              <div
                v-for="record in selectedEntry.records"
                :key="record.id"
                class="group rounded-md bg-gray-800/40 border border-gray-800 p-3 space-y-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs font-semibold text-gray-300 truncate">{{ record.session }}</p>
                  <button
                    @click.stop="openExtractModal(record)"
                    :disabled="anyTaskRunning"
                    :title="anyTaskRunning ? $t('store.detail.operationInProgress') : $t('store.detail.restoreFile')"
                    class="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-500 hover:text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                  >
                    <ArrowDownTrayIcon class="w-3.5 h-3.5" />
                  </button>
                </div>
                <ul class="space-y-1">
                  <li
                    v-for="(path, pi) in record.paths"
                    :key="pi"
                    class="font-mono text-[10px] text-gray-500 break-all leading-snug"
                  >
                    {{ path }}
                  </li>
                </ul>
              </div>
            </div>

          </div>
        </div>
      </div>
    </transition>

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
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">{{ $t('store.clearModal.title') }}</h3>
          </div>
          <button @click="closeClearModal" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <div class="rounded-md bg-red-950/30 border border-red-900/40 px-4 py-3 space-y-2">
            <p class="text-xs font-semibold text-red-300 uppercase tracking-wider">{{ $t('store.clearModal.irrev') }}</p>
            <p class="text-xs text-gray-400">{{ $t('store.clearModal.warning', { count: storeFileCount ?? '?' }) }}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400 mb-2">
              {{ $t('store.clearModal.typeToConfirm', { word: $t('store.clearModal.confirmWord') }) }}
            </p>
            <input
              v-model="clearConfirmText"
              type="text"
              :placeholder="$t('store.clearModal.confirmWord')"
              class="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 transition-colors"
            />
          </div>
        </div>
        <div class="px-6 py-4 bg-gray-800/30 flex items-center justify-end gap-3">
          <button @click="closeClearModal" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            {{ $t('common.cancel') }}
          </button>
          <button
            @click="confirmClearStore"
            :disabled="clearConfirmText !== $t('store.clearModal.confirmWord')"
            class="px-5 py-2 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-lg shadow-red-500/20"
          >
            {{ $t('store.clearModal.deleteAll') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: report clear store -->
    <div
      v-if="showClearReport && clearState.report"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
      @click.self="showClearReport = false"
    >
      <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <TrashIcon class="w-4 h-4 text-red-400" />
            </div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">{{ $t('store.clearReport.title') }}</h3>
          </div>
          <button @click="showClearReport = false" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
        <div class="px-6 py-5 grid grid-cols-2 gap-4 border-b border-gray-800">
          <div class="text-center">
            <p class="text-2xl font-bold text-white">{{ clearState.report.deleted ?? 0 }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{{ $t('store.clearReport.deleted') }}</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold" :class="(clearState.report.failed ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'">
              {{ clearState.report.failed ?? 0 }}
            </p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{{ $t('store.clearReport.errors') }}</p>
          </div>
        </div>
        <div class="px-6 py-4 flex justify-end">
          <button @click="showClearReport = false" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            {{ $t('common.close') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: report integrità -->
    <div
      v-if="showIntegrityReport && integrityState.report"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
      @click.self="showIntegrityReport = false"
    >
      <div class="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div
              :class="integrityState.report.errors.length ? 'bg-red-500/15 border-red-500/30' : 'bg-emerald-500/15 border-emerald-500/30'"
              class="w-8 h-8 rounded-md border flex items-center justify-center shrink-0"
            >
              <ExclamationTriangleIcon v-if="integrityState.report.errors.length" class="w-4 h-4 text-red-400" />
              <CheckCircleIcon v-else class="w-4 h-4 text-emerald-400" />
            </div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">{{ $t('store.integrityReport.title') }}</h3>
          </div>
          <button @click="showIntegrityReport = false" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
        <div class="px-6 py-4 border-b border-gray-800 grid grid-cols-3 gap-4 shrink-0">
          <div class="text-center">
            <p class="text-2xl font-bold text-white">{{ integrityState.report.total }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{{ $t('store.integrityReport.checked') }}</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-emerald-400">{{ integrityState.report.ok }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{{ $t('store.integrityReport.ok') }}</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold" :class="integrityState.report.errors.length ? 'text-red-400' : 'text-gray-500'">
              {{ integrityState.report.errors.length }}
            </p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{{ $t('store.integrityReport.corrupt') }}</p>
          </div>
        </div>
        <div class="flex-1 overflow-auto">
          <div v-if="integrityState.report.errors.length === 0" class="flex flex-col items-center justify-center py-12 text-center gap-3">
            <CheckCircleIcon class="w-10 h-10 text-emerald-500" />
            <p class="text-sm text-gray-300 font-medium">{{ $t('store.integrityReport.allOk') }}</p>
            <p class="text-xs text-gray-500">{{ $t('store.integrityReport.noIssues') }}</p>
          </div>
          <div v-else class="px-6 py-4 space-y-3">
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{{ $t('store.integrityReport.corruptFiles') }}</p>
            <div
              v-for="(entry, i) in integrityState.report.errors"
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
          <button @click="showIntegrityReport = false" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            {{ $t('common.close') }}
          </button>
        </div>
      </div>
    </div>

  </div>

  <!-- Modal: ripristina file da store -->
  <div
    v-if="restoreRecord"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
    @click.self="restoreRecord = null"
  >
    <div class="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <ArrowDownTrayIcon class="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">{{ $t('store.restoreModal.title') }}</h3>
            <p class="text-[10px] text-gray-500 font-mono mt-0.5">{{ selectedEntry?.hash_vorn.slice(0, 16) }}…</p>
          </div>
        </div>
        <button @click="restoreRecord = null" class="text-gray-500 hover:text-white transition-colors">
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>

      <div class="p-6 space-y-3">
        <p class="text-xs text-gray-400 mb-1">
          {{ $t('store.restoreModal.session') }} <span class="text-white font-semibold">{{ restoreRecord.session }}</span>
        </p>

        <!-- Opzione: percorso originale -->
        <label
          class="flex items-start gap-4 p-4 rounded-md border cursor-pointer transition-all"
          :class="extractMode === 'original' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'"
        >
          <input type="radio" v-model="extractMode" value="original" class="mt-1 accent-indigo-500" :disabled="!extractOriginalInfo" />
          <div class="min-w-0">
            <p class="text-sm font-semibold" :class="extractOriginalInfo ? 'text-white' : 'text-gray-600'">{{ $t('store.restoreModal.originalPath') }}</p>
            <p v-if="extractOriginalInfo" class="text-[10px] text-gray-500 break-all mt-1 font-mono leading-relaxed">{{ extractOriginalInfo.displayPath }}</p>
            <p v-else class="text-[10px] text-amber-500/80 mt-1">{{ $t('store.restoreModal.notAvailable') }}</p>
          </div>
        </label>

        <!-- Opzione: destinazione personalizzata -->
        <label
          class="flex items-start gap-4 p-4 rounded-md border cursor-pointer transition-all"
          :class="extractMode === 'custom' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'"
        >
          <input type="radio" v-model="extractMode" value="custom" class="mt-1 accent-indigo-500" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white">{{ $t('store.restoreModal.customDest') }}</p>
            <div v-if="extractMode === 'custom'" class="mt-3 space-y-2">
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  v-model="extractCustomPath"
                  :placeholder="$t('store.restoreModal.placeholder')"
                  class="flex-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button @click="pickExtractDest" class="p-2 rounded-md bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors shrink-0">
                  <FolderOpenIcon class="w-4 h-4" />
                </button>
              </div>
              <p class="text-[9px] text-amber-500/80">{{ $t('store.restoreModal.savedDirectly') }}</p>
            </div>
          </div>
        </label>
      </div>

      <div class="px-6 py-4 bg-gray-800/30 flex items-center justify-end gap-3">
        <button @click="restoreRecord = null" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
          {{ $t('common.cancel') }}
        </button>
        <button
          @click="confirmExtract"
          :disabled="(extractMode === 'original' && !extractOriginalInfo) || (extractMode === 'custom' && !extractCustomPath)"
          class="px-5 py-2 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
        >
          {{ $t('store.restoreModal.confirm') }}
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: conferma pulizia -->
  <div
    v-if="showPruneConfirm"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
    @click.self="showPruneConfirm = false"
  >
    <div class="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
            <ScissorsIcon class="w-4 h-4 text-indigo-400" />
          </div>
          <h3 class="text-sm font-bold text-white uppercase tracking-wider">{{ $t('store.prune.confirmTitle') }}</h3>
        </div>
        <button @click="showPruneConfirm = false" class="text-gray-500 hover:text-white transition-colors">
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>
      <div class="p-6">
        <div class="rounded-md bg-red-950/30 border border-red-900/40 px-4 py-3 space-y-1.5">
          <p class="text-xs font-semibold text-red-300 uppercase tracking-wider">{{ $t('common.cannotUndo') }}</p>
          <p class="text-xs text-gray-400">{{ $t('store.prune.confirmBody') }}</p>
        </div>
      </div>
      <div class="px-6 py-4 bg-gray-800/30 flex items-center justify-end gap-3">
        <button @click="showPruneConfirm = false" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
          {{ $t('common.cancel') }}
        </button>
        <button
          @click="confirmPrune"
          class="px-5 py-2 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
        >
          {{ $t('store.prune.confirm') }}
        </button>
      </div>
    </div>
  </div>

  <!-- Modal: report / pausa pulizia -->
  <div
    v-if="showPruneStatus"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
    @click.self="showPruneStatus = false"
  >
    <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden">
      <!-- Done -->
      <template v-if="pruneState.report">
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md flex items-center justify-center"
              :class="pruneState.report.fatalError ? 'bg-red-500/15 border border-red-500/30' : 'bg-emerald-500/15 border border-emerald-500/30'"
            >
              <ExclamationTriangleIcon v-if="pruneState.report.fatalError" class="w-4 h-4 text-red-400" />
              <CheckCircleIcon v-else class="w-4 h-4 text-emerald-400" />
            </div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider">
              {{ pruneState.report.fatalError
                ? $t('common.error')
                : pruneState.report.status === 'cancelled'
                  ? $t('store.prune.reportTitleCancelled')
                  : $t('store.prune.reportTitle') }}
            </h3>
          </div>
          <button @click="showPruneStatus = false" class="text-gray-500 hover:text-white transition-colors">
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
        <!-- Errore fatale -->
        <div v-if="pruneState.report.fatalError" class="px-6 py-5">
          <p class="text-xs text-red-400 font-mono">{{ pruneState.report.fatalError }}</p>
        </div>
        <!-- Store già pulito -->
        <div v-else-if="pruneState.report.orphanCount === 0 && pruneState.report.status !== 'cancelled'" class="flex flex-col items-center justify-center py-10 text-center gap-3">
          <CheckCircleIcon class="w-10 h-10 text-emerald-500" />
          <p class="text-sm text-gray-300 font-medium">{{ $t('store.prune.allClean') }}</p>
          <p class="text-xs text-gray-500">{{ $t('store.prune.allCleanSub') }}</p>
        </div>
        <!-- Con risultati -->
        <div v-else class="px-6 py-5 grid grid-cols-3 gap-4 border-b border-gray-800">
          <div class="text-center">
            <p class="text-2xl font-bold text-white">{{ pruneState.report.orphanCount ?? 0 }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{{ $t('store.prune.orphanCount') }}</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-emerald-400">{{ pruneState.report.deleted ?? 0 }}</p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{{ $t('store.prune.reportDeleted') }}</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold" :class="(pruneState.report.failed ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'">
              {{ pruneState.report.failed ?? 0 }}
            </p>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{{ $t('store.prune.reportFailed') }}</p>
          </div>
        </div>
        <div class="px-6 py-4 flex justify-end">
          <button @click="showPruneStatus = false" class="px-4 py-2 rounded-md text-xs font-medium text-gray-400 hover:text-white transition-colors">
            {{ $t('common.close') }}
          </button>
        </div>
      </template>
    </div>
  </div>

  <ExtractFromStoreModal v-if="showExtractModal" @close="showExtractModal = false" />
</template>

<style scoped>
.slide-enter-active .backdrop,
.slide-leave-active .backdrop {
  transition: opacity 0.25s ease;
}
.slide-enter-from .backdrop,
.slide-leave-to   .backdrop {
  opacity: 0;
}

.slide-enter-active .drawer-panel,
.slide-leave-active .drawer-panel {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-enter-from .drawer-panel,
.slide-leave-to   .drawer-panel {
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  WrenchScrewdriverIcon,
  XMarkIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  TrashIcon,
  ArrowRightStartOnRectangleIcon,
  ArchiveBoxArrowDownIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  FolderOpenIcon,
  ScissorsIcon,
} from '@heroicons/vue/24/outline'
import { state, clearState, integrityState, pruneState, fetchStorePage, startIntegrity, startClearStore, startPrune, cancelTask, formatTs, formatBytes, closeStore } from '../stores/vorn.js'
import ExtractFromStoreModal from '../components/ExtractFromStoreModal.vue'

const { t } = useI18n()

const anyTaskRunning = computed(() => Object.values(state.tasks).some(task => task.status === 'running'))

const ITEMS_PER_PAGE = 20

const showExtractModal = ref(false)

// Entry selezionata — sidebar dettaglio
const selectedEntry = ref(null)
const hashCopied    = ref(false)
let   _copyTimer    = null

function toggleEntry(entry) {
  selectedEntry.value = selectedEntry.value?.hash_vorn === entry.hash_vorn ? null : entry
  hashCopied.value = false
}

function copyHash() {
  if (!selectedEntry.value) return
  navigator.clipboard.writeText(selectedEntry.value.content_hash ?? selectedEntry.value.hash_vorn)
  hashCopied.value = true
  clearTimeout(_copyTimer)
  _copyTimer = setTimeout(() => { hashCopied.value = false }, 2000)
}

// Ripristino singolo file da hash
const restoreRecord     = ref(null)
const extractMode       = ref('original')
const extractCustomPath = ref('')
const extractResult     = ref(null)
let   _extractTimer     = null

const extractOriginalInfo = computed(() => {
  if (!restoreRecord.value || !selectedEntry.value) return null
  const session = state.sessions.find(s => s.name === restoreRecord.value.session)
  if (!session?.sources?.length) return null
  const relPath = restoreRecord.value.paths[0] ?? ''
  const parts   = relPath.replace(/\\/g, '/').split('/').filter(Boolean)
  const filename = parts.at(-1) ?? selectedEntry.value.hash_vorn
  const relDir   = parts.slice(0, -1)
  const sep      = session.sources[0].includes('\\') ? '\\' : '/'
  const destDir  = relDir.length
    ? session.sources[0] + sep + relDir.join(sep)
    : session.sources[0]
  return { destDir, filename, displayPath: session.sources[0] + sep + relPath.replace(/\//g, sep) }
})

function openExtractModal(record) {
  restoreRecord.value     = record
  const hasOriginal       = !!state.sessions.find(s => s.name === record.session)?.sources?.length
  extractMode.value       = hasOriginal ? 'original' : 'custom'
  extractCustomPath.value = ''
}

async function pickExtractDest() {
  const path = await window.vorn.pickFolder()
  if (path) extractCustomPath.value = path
}

async function confirmExtract() {
  if (!selectedEntry.value || !restoreRecord.value) return
  const hashVorn = selectedEntry.value.hash_vorn
  const relPath  = restoreRecord.value.paths[0] ?? hashVorn
  const filename = relPath.replace(/\\/g, '/').split('/').at(-1) ?? hashVorn
  const destDir  = extractMode.value === 'original'
    ? extractOriginalInfo.value?.destDir
    : extractCustomPath.value
  if (!destDir) return
  restoreRecord.value = null
  try {
    await window.vorn.extractHash(hashVorn, destDir, filename)
    _showExtractResult(true, t('store.restoreModal.fileRestored', { name: filename }))
  } catch (e) {
    _showExtractResult(false, e?.message ?? t('store.restoreModal.restoreFailed'))
  }
}

function _showExtractResult(ok, message) {
  extractResult.value = { ok, message }
  clearTimeout(_extractTimer)
  _extractTimer = setTimeout(() => { extractResult.value = null }, 4000)
}

// Prune store
const showPruneConfirm  = ref(false)
const showPruneStatus   = ref(false)
const pruneSuspending   = ref(false)

const pruneProgressPct = computed(() => {
  const p = pruneState.value.progress
  if (!p || p.phase !== 'deleting' || !p.total) return 0
  return Math.round((p.current / p.total) * 100)
})

async function confirmPrune() {
  showPruneConfirm.value = false
  await startPrune()
}

function doStopPrune() {
  for (const [id, t] of Object.entries(state.tasks)) {
    if (t.type === 'prune' && t.status === 'running') {
      pruneSuspending.value = true
      cancelTask(t.id)
    }
  }
}

// Clear store
const showClearModal   = ref(false)
const clearConfirmText = ref('')

function closeClearModal() {
  showClearModal.value   = false
  clearConfirmText.value = ''
}

const clearProgressPct = computed(() => {
  const p = clearState.value.progress
  if (!p?.total) return 0
  return Math.round((p.deleted / p.total) * 100)
})

const showClearReport     = ref(false)
const showIntegrityReport = ref(false)

async function confirmClearStore() {
  if (clearConfirmText.value !== t('store.clearModal.confirmWord')) return
  closeClearModal()
  await startClearStore()
}

function stopClear() {
  const task = Object.values(state.tasks).find(task => task.type === 'clear' && task.status === 'running')
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

watch(() => pruneState.value.running, (running, wasRunning) => {
  if (wasRunning && !running) {
    pruneSuspending.value = false
    if (pruneState.value.report) showPruneStatus.value = true
    if (pruneState.value.report && pruneState.value.report.status !== 'cancelled' && !pruneState.value.report.fatalError) {
      refreshStore()
    }
  }
})

watch(() => clearState.value.running, (running, wasRunning) => {
  if (wasRunning && !running) {
    showClearReport.value = true
    if (!clearState.value.report?.fatalError) {
      storeFileCount.value = 0
      state.storeEntries   = []
      state.storeLoaded    = false
      currentOffset        = 0
      hasMore              = false
    }
  }
})

watch(() => integrityState.value.running, (running, wasRunning) => {
  if (wasRunning && !running) showIntegrityReport.value = true
})

onMounted(async () => {
  if (!state.activeStore) return
  window.vorn.countStoreFiles(state.activeStore).then(n => { storeFileCount.value = n })
  await refreshStore()
  setupObserver()
})

onUnmounted(() => observer?.disconnect())
</script>
