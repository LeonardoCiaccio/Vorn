<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4" @click.self="$emit('close')">
      <div class="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col" style="height: 80vh; max-height: 80vh">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <FolderPlusIcon class="w-4 h-4 text-indigo-400" />
            </div>
            <h2 class="text-sm font-bold text-white">{{ $t('newSession.title') }}</h2>
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
              <SessionSourceTree class="flex-1 min-h-0"
                :initialRoot="props.initialRoot"
                :preSelected="props.preSelected"
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

          <!-- Destra: nome + filtri + azioni -->
          <div class="flex flex-col w-1/2 overflow-y-auto px-6 py-6 gap-5">

            <!-- Nome -->
            <div>
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{{ $t('newSession.nameLabel') }}</label>
              <input
                v-model="form.name"
                :placeholder="$t('newSession.namePlaceholder')"
                class="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
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
                {{ $t('newSession.create') }}
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderPlusIcon, XMarkIcon, PlusIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import { createSession, state } from '../stores/vorn.js'
import SessionSourceTree from './SessionSourceTree.vue'
import Toggle from './Toggle.vue'

const { t } = useI18n()

const props = defineProps({
  initialRoot: { type: String, default: '' },
  preSelected: { type: Array,  default: () => [] },
})

const emit = defineEmits(['close', 'created'])

const form = reactive({
  name:               '',
  sources:            [],
  excludePaths:       [],
  patterns:           [...state.defaultExcludePatterns],
  compressionEnabled: true,
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
  if (!form.name.trim())    { error.value = t('newSession.errors.noName'); return }
  if (state.sessions.some(s => s.name === form.name.trim())) { error.value = t('newSession.errors.duplicateName'); return }
  if (!form.sources.length) { error.value = t('newSession.errors.noSource'); return }

  saving.value = true
  try {
    await createSession({
      name:            form.name.trim(),
      sources:         [...form.sources],
      excludes:        { paths: [...form.excludePaths], patterns: [...form.patterns] },
      compressionType: form.compressionEnabled ? 'gzip' : null,
      ts:              new Date().toISOString(),
    })
    emit('created')
    emit('close')
  } catch (e) {
    error.value = e.message ?? t('newSession.errors.createFailed')
  } finally {
    saving.value = false
  }
}
</script>
