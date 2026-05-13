<template>
  <div class="flex flex-col items-center justify-center h-screen bg-gray-950 px-8">

    <!-- Disconnected banner -->
    <div v-if="state.phase === 'disconnected'" class="mb-8 flex items-center gap-3 px-5 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
      <ExclamationTriangleIcon class="w-5 h-5 shrink-0 text-amber-400" />
      {{ $t('storeSelect.disconnected') }}
    </div>

    <!-- Brand -->
    <div class="mb-10 text-center">
      <p class="text-3xl font-bold tracking-widest text-white uppercase">Vorn</p>
      <p class="text-xs text-gray-600 mt-1">v{{ state.appInfo?.version ?? '…' }}</p>
    </div>

    <!-- Card -->
    <div class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">

      <!-- Header -->
      <div class="px-6 py-5 border-b border-gray-800">
        <p class="text-sm font-semibold text-white">{{ $t('storeSelect.title') }}</p>
        <p class="text-xs text-gray-500 mt-0.5">{{ $t('storeSelect.subtitle') }}</p>
      </div>

      <!-- Error -->
      <div v-if="error" class="mx-6 mt-4 px-4 py-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
        {{ error }}
      </div>

      <!-- Store recenti -->
      <div class="px-6 py-4">
        <div v-if="state.recentStores.length" class="space-y-2 mb-4">
          <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{{ $t('storeSelect.recent') }}</p>
          <div
            v-for="s in state.recentStores"
            :key="s.path"
            class="flex items-center gap-1 group/btn rounded-lg border border-gray-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors"
            :class="loading ? 'opacity-50 pointer-events-none' : ''"
          >
            <button
              @click="selectStore(s.path)"
              :disabled="loading"
              class="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
            >
              <CircleStackIcon class="w-4 h-4 text-gray-600 group-hover/btn:text-indigo-400 shrink-0 transition-colors" />
              <div class="min-w-0 flex-1">
                <p class="text-xs text-gray-200 font-mono truncate">{{ s.path }}</p>
                <p class="text-[10px] text-gray-600 mt-0.5">{{ formatTs(s.lastUsed) }}</p>
              </div>
              <ArrowRightIcon class="w-3.5 h-3.5 text-gray-700 group-hover/btn:text-indigo-400 shrink-0 transition-colors" />
            </button>
            <button
              @click.stop="removeRecent(s.path)"
              :disabled="loading"
              class="opacity-0 group-hover/btn:opacity-100 p-1 mr-2 rounded text-gray-600 hover:text-red-400 transition-all disabled:cursor-not-allowed shrink-0"
            >
              <TrashIcon class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Browse -->
        <button
          @click="browseStore"
          :disabled="loading"
          class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-700 hover:border-gray-600 hover:bg-gray-800/60 text-sm text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FolderOpenIcon class="w-4 h-4" />
          {{ $t('storeSelect.browse') }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="px-6 pb-5 flex items-center gap-2 text-xs text-gray-500">
        <ArrowPathIcon class="w-3.5 h-3.5 animate-spin text-indigo-500" />
        {{ $t('storeSelect.opening') }}
      </div>

    </div>

    <!-- Footer credit -->
    <i18n-t keypath="storeSelect.madeBy" tag="p" class="mt-8 text-xs text-gray-700 text-center inline-flex items-center gap-1 justify-center">
      <template #name>
        <a
          href="https://github.com/LeonardoCiaccio"
          target="_blank"
          class="text-gray-500 hover:text-gray-300 transition-colors"
        >Leonardo Ciaccio</a>
      </template>
      <template #heart>
        <HeartIcon class="w-3 h-3 text-red-500/70 inline" />
      </template>
    </i18n-t>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CircleStackIcon,
  FolderOpenIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { HeartIcon } from '@heroicons/vue/24/solid'
import { state, openStore, formatTs } from '../stores/vorn.js'

const { t, te } = useI18n()

const loading = ref(false)
const error   = ref(null)

async function selectStore(path) {
  error.value   = null
  loading.value = true
  try {
    await openStore(path)
  } catch (e) {
    const code = e.message.split('Error: ').pop()
    const key  = `ipcErrors.${code}`
    error.value = te(key) ? t(key) : code
  } finally {
    loading.value = false
  }
}

async function browseStore() {
  const dir = await window.vorn.pickFolder()
  if (dir) await selectStore(dir)
}

async function removeRecent(path) {
  await window.vorn.removeRecentStore(path)
  state.recentStores = state.recentStores.filter(s => s.path !== path)
}
</script>
