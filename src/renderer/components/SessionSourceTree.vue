<template>
  <div class="border border-gray-700 rounded-md overflow-hidden h-full flex flex-col">

    <!-- Root selector -->
    <div class="shrink-0">
      <div class="px-3 py-2 border-b flex items-center gap-2 bg-gray-800/40" :class="rootError ? 'border-red-700/50' : 'border-gray-700'">
        <FolderIcon class="w-3.5 h-3.5 text-gray-500 shrink-0" />
        <span class="flex-1 text-[11px] font-mono text-gray-400 truncate" :title="rootPath">{{ rootPath }}</span>
        <button
          @click="pickRoot"
          :title="$t('sourceTree.changeRoot')"
          class="p-1 rounded text-gray-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
        >
          <FolderOpenIcon class="w-3.5 h-3.5" />
        </button>
      </div>
      <div v-if="rootError" class="px-3 py-1.5 bg-red-950/40 border-b border-red-700/40 flex items-center gap-1.5">
        <ExclamationCircleIcon class="w-3 h-3 text-red-400 shrink-0" />
        <p class="text-[11px] text-red-400">{{ rootError }}</p>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div v-if="loadingRoot" class="flex items-center justify-center py-8">
        <ArrowPathIcon class="w-4 h-4 animate-spin text-gray-600" />
      </div>
      <SessionSourceTreeNode
        v-for="node in visibleNodes"
        :key="node.path"
        :node="node"
        :depth="0"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, provide, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowPathIcon, FolderIcon, FolderOpenIcon, ExclamationCircleIcon } from '@heroicons/vue/24/outline'
import SessionSourceTreeNode from './SessionSourceTreeNode.vue'
import { state } from '../stores/vorn.js'

const { t } = useI18n()

const props = defineProps({
  initialRoot: { type: String, default: '' },
  preSelected: { type: Array,  default: () => [] },
})

const emit = defineEmits(['update:sources', 'update:excludePaths'])

// ── State ─────────────────────────────────────────────────────────────────────

const sources  = reactive(new Set())
const excluded = reactive(new Set())
const rootNodes  = ref([])
const rootPath    = ref('')
const rootError   = ref('')
const loadingRoot = ref(false)

const visibleNodes = computed(() =>
  rootNodes.value.filter(n => n.path !== state.activeStore)
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInsideSource(path) {
  for (const s of sources) {
    if (path !== s && (path.startsWith(s + '\\') || path.startsWith(s + '/'))) return true
  }
  return false
}

function clearExcludedUnder(root) {
  for (const p of [...excluded]) {
    if (p.startsWith(root + '\\') || p.startsWith(root + '/')) excluded.delete(p)
  }
}

function makeNode(d) {
  const isFile = (d.type ?? 'dir') === 'file'
  return reactive({ name: d.name, path: d.path, type: d.type ?? 'dir', children: isFile ? [] : null, loading: false, expanded: false })
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function toggleNode(node) {
  const inside = isInsideSource(node.path)
  if (inside) {
    if (excluded.has(node.path)) excluded.delete(node.path)
    else                         excluded.add(node.path)
  } else {
    if (sources.has(node.path)) {
      sources.delete(node.path)
      clearExcludedUnder(node.path)
    } else {
      sources.add(node.path)
    }
  }
  emitChange()
}

// ── Expand ────────────────────────────────────────────────────────────────────

async function expandNode(node) {
  if (node.expanded) { node.expanded = false; return }
  node.expanded = true
  if (node.children !== null) return
  node.loading  = true
  try {
    const dirs    = await window.vorn.listDir(node.path)
    node.children = dirs.filter(d => d.path !== state.activeStore).map(makeNode)
  } catch { node.children = [] }
  node.loading  = false
}

// ── Load root ─────────────────────────────────────────────────────────────────

async function loadRoot(dir, preSelectPaths = []) {
  if (!dir) return
  rootPath.value    = dir
  loadingRoot.value = true
  sources.clear()
  excluded.clear()
  for (const p of preSelectPaths) sources.add(p)
  emitChange()
  try {
    const dirs      = await window.vorn.listDir(dir)
    rootNodes.value = dirs.map(makeNode)
  } catch { rootNodes.value = [] }
  loadingRoot.value = false
}

async function pickRoot() {
  const picked = await window.vorn.pickFolder(rootPath.value)
  if (!picked) return
  if (picked === state.activeStore) {
    rootError.value = t('sourceTree.storeError')
    return
  }
  rootError.value = ''
  loadRoot(picked)
}

watch(() => props.initialRoot, (r) => { if (r) loadRoot(r, props.preSelected) }, { immediate: true })
watch(() => state.appInfo?.homedir, (h) => { if (h && !rootPath.value) loadRoot(h) }, { immediate: true })

// ── Emit ──────────────────────────────────────────────────────────────────────

function emitChange() {
  emit('update:sources',      [...sources])
  emit('update:excludePaths', [...excluded])
}

// ── Provide to nodes ──────────────────────────────────────────────────────────

provide('sourceTree', { sources, excluded, isInsideSource, toggleNode, expandNode })
</script>
