<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4" @click.self="$emit('close')">
      <div class="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col" style="height: 80vh; max-height: 80vh">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <PencilSquareIcon class="w-4 h-4 text-indigo-400" />
            </div>
            <h2 class="text-sm font-bold text-white">{{ $t('editSession.title') }}</h2>
          </div>
          <button @click="$emit('close')" class="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors">
            <XMarkIcon class="w-4 h-4" />
          </button>
        </div>

        <!-- Body: 2 colonne -->
        <div class="flex flex-1 overflow-hidden divide-x divide-gray-800/30">

          <!-- Sinistra: tree -->
          <div class="flex flex-col w-1/2 overflow-hidden">
            <div class="px-6 pt-6 pb-3 shrink-0">
              <div class="flex items-center justify-between mb-1">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">{{ $t('newSession.foldersLabel') }}</p>
              </div>
              <p class="text-[11px] text-gray-600">{{ $t('newSession.instructions') }}</p>
            </div>
            <div class="flex-1 min-h-0 px-6 pb-6 flex flex-col">
              <SessionSourceTree
                class="flex-1 min-h-0"
                :initialRoot="initialRoot"
                :preSelected="session.sources ?? []"
                :preExcluded="session.excludes?.paths ?? []"
                :excludePatterns="form.patterns"
                @update:sources="form.sources = $event"
                @update:excludePaths="form.excludePaths = $event"
              />
              <p v-if="form.sources.length" class="text-[11px] text-gray-500 mt-2">
                {{ $t('newSession.sourcesCount', form.sources.length, { count: form.sources.length }) }}
                <span v-if="form.excludePaths.length" class="text-gray-600">
                  {{ $t('newSession.excludedCount', { count: form.excludePaths.length }) }}
                </span>
              </p>
            </div>
          </div>

          <!-- Destra: impostazioni -->
          <div class="flex flex-col w-1/2 overflow-y-auto px-6 py-6 gap-5">

            <!-- Nome (immutabile) -->
            <div>
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{{ $t('editSession.nameLabel') }}</label>
              <input
                :value="session.name"
                disabled
                class="w-full bg-gray-800/40 border border-gray-700/50 rounded-md px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed font-mono"
              />
            </div>

            <!-- Pattern esclusioni -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">{{ $t('newSession.patternsLabel') }}</label>
                <button
                  v-if="form.patterns.length"
                  @click="form.patterns = []"
                  :title="$t('newSession.resetPatterns')"
                  class="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <ArrowPathIcon class="w-3 h-3" />
                </button>
              </div>
              <p class="text-[11px] text-gray-600 mb-3">{{ $t('newSession.patternsHelp') }}</p>
              <div class="flex flex-wrap gap-2 mb-3">
                <div
                  v-for="pat in form.patterns"
                  :key="pat"
                  class="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-xs font-mono text-gray-300"
                >
                  {{ pat }}
                  <button @click="removePattern(pat)" class="ml-0.5 text-gray-600 hover:text-red-400 transition-colors">
                    <XMarkIcon class="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model="newPattern"
                  @keydown.enter.prevent="addPattern"
                  :placeholder="$t('newSession.patternPlaceholder')"
                  class="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  @click="addPattern"
                  :disabled="!newPattern.trim()"
                  class="px-3 py-2 rounded-md text-xs font-medium text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <PlusIcon class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Compressione -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">{{ $t('compression.label') }}</label>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500">{{ $t('compression.gzip') }}</span>
                  <Toggle v-model="form.compressionEnabled" />
                </div>
              </div>
              <p class="text-[11px] text-gray-600">{{ $t('compression.help') }}</p>
            </div>

            <!-- Strategia -->
            <div>
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{{ $t('strategy.label') }}</label>
              <p class="text-[11px] text-gray-600 mb-2">{{ $t('strategy.help') }}</p>
              <div class="flex gap-2">
                <button
                  v-for="opt in [{ value: null, label: $t('strategy.standard') }, { value: 'chunks', label: $t('strategy.chunks') }]"
                  :key="String(opt.value)"
                  @click="form.strategy = opt.value"
                  :class="[
                    'flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors',
                    form.strategy === opt.value
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'bg-gray-800/40 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                  ]"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Spacer -->
            <div class="flex-1" />

            <!-- Errore -->
            <p v-if="error" class="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{{ error }}</p>

            <!-- Azioni -->
            <div class="flex gap-3">
              <button @click="$emit('close')" class="flex-1 px-4 py-2 rounded-md text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
                {{ $t('common.cancel') }}
              </button>
              <button
                @click="submit"
                :disabled="saving"
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                <ArrowPathIcon v-if="saving" class="w-4 h-4 animate-spin" />
                {{ $t('editSession.saveChanges') }}
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PencilSquareIcon, XMarkIcon, PlusIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import { updateSession } from '../stores/vorn.js'
import SessionSourceTree from './SessionSourceTree.vue'
import Toggle from './Toggle.vue'

const { t } = useI18n()

const props = defineProps({
  session: { type: Object, required: true },
})
const emit = defineEmits(['close', 'saved'])

const initialRoot = computed(() => {
  const sources = props.session.sources ?? []
  if (!sources.length) return ''
  const sep     = sources[0].includes('\\') ? '\\' : '/'
  const splitAll = sources.map(s => s.split(/[\\/]/).filter(Boolean))

  let parts
  if (splitAll.length === 1) {
    // Sorgente singola: usa il genitore diretto
    parts = splitAll[0].slice(0, -1)
  } else {
    // Sorgenti multiple: calcola il prefisso comune tra tutti i percorsi
    const first = splitAll[0]
    let commonLen = 0
    for (let i = 0; i < first.length; i++) {
      if (splitAll.every(p => p[i] === first[i])) commonLen = i + 1
      else break
    }
    parts = first.slice(0, commonLen)
  }

  if (!parts.length) return sep === '\\' ? (splitAll[0][0] ?? '') + '\\' : '/'
  if (/^[a-zA-Z]:$/.test(parts[0]))
    return parts.length === 1 ? parts[0] + '\\' : parts[0] + '\\' + parts.slice(1).join('\\')
  return '/' + parts.join('/')
})

const form = reactive({
  sources:            [...(props.session.sources ?? [])],
  excludePaths:       [...(props.session.excludes?.paths ?? [])],
  patterns:           [...(props.session.excludes?.patterns ?? [])],
  compressionEnabled: !!(props.session.compressionType),
  strategy:           props.session.strategy ?? null,
})
const saving     = ref(false)
const error      = ref('')
const newPattern = ref('')

function addPattern() {
  const p = newPattern.value.trim()
  if (p && !form.patterns.includes(p)) form.patterns.push(p)
  newPattern.value = ''
}
function removePattern(pat) {
  form.patterns = form.patterns.filter(p => p !== pat)
}

async function submit() {
  error.value = ''
  if (!form.sources.length) { error.value = t('editSession.errors.noSource'); return }

  saving.value = true
  try {
    await updateSession(props.session.name, {
      sources:         [...form.sources],
      excludes:        { paths: [...form.excludePaths], patterns: [...form.patterns] },
      compressionType: form.compressionEnabled ? 'gzip' : null,
      strategy:        form.strategy,
    })
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e.message ?? t('editSession.errors.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>
