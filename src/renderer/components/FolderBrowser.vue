<template>
  <div class="flex flex-col gap-2">

    <!-- Breadcrumb -->
    <div class="flex items-center gap-1 px-2 py-1.5 bg-gray-800/60 border border-gray-700 rounded-md overflow-x-auto whitespace-nowrap scrollbar-none">
      <button @click="goHome" class="shrink-0 text-gray-500 hover:text-indigo-400 transition-colors" :title="$t('folderBrowser.home')">
        <HomeIcon class="w-3.5 h-3.5" />
      </button>
      <template v-for="(seg, i) in pathSegments" :key="i">
        <span class="text-gray-700 shrink-0">/</span>
        <button
          @click="navigateTo(pathUpTo(i))"
          class="text-xs font-mono shrink-0 transition-colors"
          :class="i === pathSegments.length - 1 ? 'text-white' : 'text-gray-400 hover:text-white'"
        >{{ seg }}</button>
      </template>
    </div>

    <!-- Directory listing -->
    <div class="border border-gray-700 rounded-md overflow-hidden">
      <div class="overflow-y-auto" style="max-height: 220px">

        <!-- Up row -->
        <button
          v-if="canGoUp"
          @click="navigateUp"
          class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors border-b border-gray-800"
        >
          <ArrowUpIcon class="w-3 h-3 shrink-0" />
          <span class="font-mono">..</span>
        </button>

        <div v-if="loading" class="flex items-center justify-center py-6">
          <ArrowPathIcon class="w-4 h-4 animate-spin text-gray-600" />
        </div>

        <div v-else-if="dirs.length === 0" class="py-6 text-center text-xs text-gray-600 italic">
          {{ $t('folderBrowser.noSubfolders') }}
        </div>

        <div
          v-else
          v-for="dir in dirs"
          :key="dir.path"
          class="group flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-800/60 transition-colors border-b border-gray-800/40 last:border-0"
        >
          <!-- Navigate into -->
          <button @click="navigateTo(dir.path)" class="flex items-center gap-2 flex-1 min-w-0 text-left">
            <FolderIcon class="w-3.5 h-3.5 text-amber-400/80 group-hover:text-amber-300 shrink-0 transition-colors" />
            <span class="text-gray-300 font-mono truncate" :class="{ 'text-gray-500 italic': dir.name.startsWith('.') }">{{ dir.name }}</span>
          </button>
          <!-- Add button -->
          <button
            @click.stop="$emit('add', dir.path)"
            :disabled="selected.includes(dir.path)"
            class="shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-all"
            :class="selected.includes(dir.path)
              ? 'text-emerald-500 opacity-100 cursor-default'
              : 'text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10'"
          >
            <CheckIcon v-if="selected.includes(dir.path)" class="w-3 h-3" />
            <PlusIcon v-else class="w-3 h-3" />
            {{ selected.includes(dir.path) ? $t('folderBrowser.added') : $t('folderBrowser.add') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Add current folder -->
    <button
      @click="$emit('add', currentPath)"
      :disabled="selected.includes(currentPath)"
      class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors"
      :class="selected.includes(currentPath)
        ? 'border-emerald-700/40 text-emerald-500 cursor-default'
        : 'border-gray-700 text-gray-400 hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-500/5'"
    >
      <CheckIcon v-if="selected.includes(currentPath)" class="w-3.5 h-3.5" />
      <FolderPlusIcon v-else class="w-3.5 h-3.5" />
      {{ selected.includes(currentPath) ? $t('folderBrowser.currentAdded') : $t('folderBrowser.addCurrent') }}
    </button>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { FolderIcon, FolderPlusIcon, ArrowUpIcon, ArrowPathIcon, PlusIcon, CheckIcon, HomeIcon } from '@heroicons/vue/24/outline'
import { state } from '../stores/vorn.js'

const props = defineProps({
  selected: { type: Array, default: () => [] },
})
defineEmits(['add'])

const currentPath = ref('')
const dirs        = ref([])
const loading     = ref(false)

watch(() => state.appInfo?.homedir, (h) => {
  if (h && !currentPath.value) navigateTo(h)
}, { immediate: true })

async function navigateTo(path) {
  loading.value = true
  dirs.value    = []
  try {
    dirs.value    = await window.vorn.listDir(path)
    currentPath.value = path
  } catch { /* permission denied etc */ }
  loading.value = false
}

function goHome() {
  const h = state.appInfo?.homedir
  if (h) navigateTo(h)
}

const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.replace(/\\/g, '/').split('/').filter(Boolean)
})

function pathUpTo(index) {
  const sep   = currentPath.value.includes('\\') ? '\\' : '/'
  const parts = currentPath.value.replace(/\\/g, '/').split('/').filter(Boolean)
  const slice = parts.slice(0, index + 1)
  if (sep === '\\') {
    const joined = slice.join('\\')
    return /^[A-Za-z]:$/.test(joined) ? joined + '\\' : joined
  }
  return '/' + slice.join('/')
}

const canGoUp = computed(() => {
  if (!currentPath.value) return false
  const parts = currentPath.value.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length > 1
})

function navigateUp() {
  const sep   = currentPath.value.includes('\\') ? '\\' : '/'
  const parts = currentPath.value.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 1) return
  parts.pop()
  const joined = sep === '\\' ? parts.join('\\') : '/' + parts.join('/')
  navigateTo(/^[A-Za-z]:$/.test(joined) ? joined + '\\' : joined)
}
</script>
