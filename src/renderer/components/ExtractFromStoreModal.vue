<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4" @click.self="closeIfIdle">
      <div class="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <ArchiveBoxArrowDownIcon class="w-4 h-4 text-indigo-400" />
            </div>
            <h2 class="text-sm font-bold text-white">{{ $t('extractStore.title') }}</h2>
          </div>
          <button @click="closeIfIdle" class="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-5 flex-1 overflow-y-auto">

          <!-- Avviso -->
          <div class="bg-amber-950/30 border border-amber-900/40 rounded-md px-4 py-3 space-y-1.5">
            <div class="flex items-center gap-2">
              <ExclamationTriangleIcon class="w-4 h-4 text-amber-400 shrink-0" />
              <p class="text-xs font-semibold text-amber-300">{{ $t('extractStore.warning.title') }}</p>
            </div>
            <p class="text-[11px] text-amber-200/70 leading-relaxed" v-html="$t('extractStore.warning.text1')" />
            <p class="text-[11px] text-amber-200/70 leading-relaxed" v-html="$t('extractStore.warning.text2')" />
          </div>

          <!-- Filtro sessione -->
          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{{ $t('extractStore.filterLabel') }}</label>
            <p class="text-[11px] text-gray-600 mb-2">{{ $t('extractStore.filterHelp') }}</p>
            <input
              v-model="sessionFilter"
              :disabled="running"
              :placeholder="$t('extractStore.filterPlaceholder')"
              class="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors disabled:opacity-50"
            />
          </div>

          <!-- Destinazione -->
          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{{ $t('extractStore.destLabel') }}</label>
            <div class="flex items-center gap-2">
              <input
                v-model="destDir"
                :disabled="running"
                :placeholder="$t('extractStore.destPlaceholder')"
                class="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors disabled:opacity-50"
              />
              <button
                @click="pickDest"
                :disabled="running"
                class="p-2.5 rounded-md bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors shrink-0 disabled:opacity-50"
              >
                <FolderOpenIcon class="w-4 h-4" />
              </button>
            </div>
            <p class="text-[11px] text-gray-600 mt-1.5">{{ $t('extractStore.destHelp') }}</p>
          </div>

          <!-- Progress -->
          <div v-if="running" class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">{{ $t('extractStore.analyzing') }}</span>
              <span class="text-gray-500 font-mono">{{ progress.current ?? 0 }} / {{ progress.total ?? '…' }}</span>
            </div>
            <div class="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                class="h-full bg-indigo-500 rounded-full transition-all duration-300"
                :style="{ width: progressPct + '%' }"
              />
            </div>
            <div class="flex items-center gap-4 text-[11px] text-gray-500">
              <span class="text-emerald-400">{{ $t('extractStore.extracted', { n: progress.extracted ?? 0 }) }}</span>
              <span v-if="progress.errors" class="text-red-400">{{ $t('extractStore.errorsCount', { n: progress.errors }) }}</span>
            </div>
          </div>

          <!-- Risultato -->
          <div v-if="result && !running" class="space-y-3">
            <div class="flex items-center gap-2 text-sm" :class="result.fatalError ? 'text-red-400' : 'text-emerald-400'">
              <CheckCircleIcon v-if="!result.fatalError" class="w-4 h-4 shrink-0" />
              <ExclamationTriangleIcon v-else class="w-4 h-4 shrink-0" />
              <span v-if="result.fatalError">{{ $t('extractStore.fatalError', { msg: result.fatalError }) }}</span>
              <span v-else-if="result.total === 0">{{ $t('extractStore.empty') }}</span>
              <span v-else>{{ $t('extractStore.success', { extracted: result.extracted, total: result.total }) }}</span>
            </div>

            <!-- Sessioni trovate -->
            <div v-if="result.sessions?.length" class="bg-gray-800/50 border border-gray-800 rounded-md px-4 py-3">
              <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{{ $t('extractStore.sessionsFound') }}</p>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="s in result.sessions" :key="s"
                  class="px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/15 border border-indigo-500/20 text-indigo-300"
                >{{ s }}</span>
              </div>
            </div>

            <!-- File senza intestazione -->
            <div v-if="result.noRecords?.length" class="bg-amber-950/30 border border-amber-900/40 rounded-md px-4 py-3">
              <p class="text-[11px] font-semibold text-amber-500 uppercase tracking-wider mb-1">{{ $t('extractStore.noRecords.title', { n: result.noRecords.length }) }}</p>
              <p class="text-[11px] text-gray-500">{{ $t('extractStore.noRecords.sub') }}</p>
            </div>

            <!-- Errori -->
            <div v-if="result.errors?.length" class="bg-red-950/20 border border-red-900/40 rounded-md px-4 py-3">
              <p class="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-2">{{ $t('extractStore.errorsCount', { n: result.errors.length }) }}</p>
              <div class="max-h-28 overflow-y-auto space-y-1">
                <div v-for="(e, i) in result.errors" :key="i" class="text-[10px] font-mono text-red-300 truncate">
                  {{ e.session ? `[${e.session}] ${e.path}` : e.hash }} — {{ e.error }}
                </div>
              </div>
            </div>
          </div>

          <!-- Errore submit -->
          <p v-if="submitError" class="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{{ submitError }}</p>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-800 flex gap-3 shrink-0">
          <button @click="closeIfIdle" class="flex-1 px-4 py-2 rounded-md text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
            {{ result ? $t('extractStore.closeOrCancel.done') : $t('extractStore.closeOrCancel.running') }}
          </button>
          <button
            v-if="!result"
            @click="start"
            :disabled="running || !destDir.trim()"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowPathIcon v-if="running" class="w-4 h-4 animate-spin" />
            {{ running ? $t('extractStore.extracting') : $t('extractStore.extract') }}
          </button>
          <button
            v-else
            @click="reset"
            class="flex-1 px-4 py-2 rounded-md text-sm font-medium text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
          >
            {{ $t('extractStore.newExtraction') }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArchiveBoxArrowDownIcon, FolderOpenIcon, XMarkIcon, ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import { startExtractStore, extractState } from '../stores/vorn.js'

const { t } = useI18n()
const emit = defineEmits(['close'])

const sessionFilter = ref('')
const destDir       = ref('')
const submitError   = ref('')

const running  = computed(() => extractState.value.running)
const progress = computed(() => extractState.value.progress ?? {})
const result   = computed(() => extractState.value.result)

const progressPct = computed(() => {
  const p = progress.value
  if (!p.total) return 0
  return Math.round((p.current / p.total) * 100)
})

async function pickDest() {
  const path = await window.vorn.pickFolder()
  if (path) destDir.value = path
}

async function start() {
  submitError.value = ''
  if (!destDir.value.trim()) { submitError.value = t('extractStore.errors.noDestination'); return }
  try {
    await startExtractStore(destDir.value.trim(), sessionFilter.value.trim() || null)
  } catch (e) {
    submitError.value = e.message ?? t('extractStore.errors.extractFailed')
  }
}

function reset() {
  sessionFilter.value = ''
}

function closeIfIdle() {
  if (!running.value) emit('close')
}
</script>
