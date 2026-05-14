<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between px-2 mb-1">
      <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{{ $t('fileTree.title') }}</p>
      <div class="flex items-center gap-0.5">
        <button
          v-if="tree.length"
          @click="toggleSelectionMode"
          :title="selectionMode ? $t('fileTree.exitSelection') : $t('fileTree.selectForRestore')"
          :class="[
            'p-1 rounded transition-colors',
            selectionMode
              ? 'text-indigo-400 bg-indigo-500/15 hover:bg-indigo-500/25'
              : 'text-gray-600 hover:text-gray-300 hover:bg-gray-800'
          ]"
        >
          <CheckCircleIcon class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="tree.length"
          @click="toggleAll"
          :title="allExpanded ? $t('fileTree.collapseAll') : $t('fileTree.expandAll')"
          class="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <ArrowsPointingInIcon v-if="allExpanded" class="w-3.5 h-3.5" />
          <ArrowsPointingOutIcon v-else             class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="!files" class="flex items-center gap-1.5 text-xs text-gray-600 py-4 justify-center">
      <ArrowPathIcon class="w-3.5 h-3.5 animate-spin" />
      {{ $t('fileTree.loading') }}
    </div>

    <!-- Empty -->
    <div v-else-if="tree.length === 0" class="text-xs text-gray-600 italic py-4 text-center">
      {{ $t('fileTree.noFiles') }}
    </div>

    <!-- Virtual tree -->
    <RecycleScroller
      v-else
      class="select-none overflow-auto"
      style="max-height: 70vh"
      :items="flatItems"
      :item-size="24"
      key-field="key"
      v-slot="{ item }"
    >
      <FileTreeRow :item="item" />
    </RecycleScroller>
  </div>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import { ArrowPathIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, CheckCircleIcon } from '@heroicons/vue/24/outline'
import FileTreeRow from './FileTreeRow.vue'

const props = defineProps({
  files: { type: Object, default: null },
})

const emit = defineEmits(['update:selected', 'update:selectionMode'])

// Stato open/close centralizzato (necessario per il flat virtual list)
const openDirs = ref(new Set())
provide('openDirs', openDirs)
provide('toggleDir', (path) => {
  const next = new Set(openDirs.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  openDirs.value = next
})

const allExpanded = ref(false)

function collectDirPaths(nodes, result = new Set()) {
  for (const n of nodes) {
    if (n.type === 'dir') { result.add(n.path); collectDirPaths(n.children, result) }
  }
  return result
}

function toggleAll() {
  allExpanded.value = !allExpanded.value
  openDirs.value = allExpanded.value ? collectDirPaths(tree.value) : new Set()
}

// Modalità selezione
const selectionMode = ref(false)
provide('selectionMode', selectionMode)

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) selectedPaths.value = new Set()
  emit('update:selectionMode', selectionMode.value)
}

// Selezione file
const selectedPaths = ref(new Set())
provide('selectedPaths', selectedPaths)

watch(() => props.files, () => {
  selectedPaths.value = new Set()
  selectionMode.value = false
  openDirs.value      = new Set()
  allExpanded.value   = false
  emit('update:selectionMode', false)
})

watch(selectedPaths, (s) => emit('update:selected', [...s]))

function buildTree(files) {
  const dirMap = new Map()
  const root   = []

  for (const [relPath, meta] of Object.entries(files)) {
    const parts    = relPath.replace(/\\/g, '/').split('/')
    let siblings   = root
    let currentKey = ''

    for (let i = 0; i < parts.length - 1; i++) {
      currentKey = currentKey ? `${currentKey}/${parts[i]}` : parts[i]
      if (!dirMap.has(currentKey)) {
        const dir = { name: parts[i], type: 'dir', path: currentKey, children: [] }
        dirMap.set(currentKey, dir)
        siblings.push(dir)
      }
      siblings = dirMap.get(currentKey).children
    }

    const hash = typeof meta === 'string' ? meta : meta.hash_vorn
    siblings.push({
      name:      parts[parts.length - 1],
      type:      'file',
      relPath,
      bytes:     typeof meta === 'string' ? 0 : (meta.bytes ?? 0),
      hash_vorn: hash,
    })
  }

  function sort(nodes) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    for (const n of nodes) if (n.type === 'dir') sort(n.children)
  }
  sort(root)
  return root
}

const tree = computed(() => props.files ? buildTree(props.files) : [])

// Appiattisce i soli nodi visibili (directory aperte) per il virtual scroller
function flattenVisible(nodes, depth) {
  const result = []
  for (const node of nodes) {
    const key = node.type === 'dir' ? `d:${node.path}` : `f:${node.relPath}`
    result.push({ key, node, depth })
    if (node.type === 'dir' && openDirs.value.has(node.path)) {
      const children = flattenVisible(node.children, depth + 1)
      for (const c of children) result.push(c)
    }
  }
  return result
}

const flatItems = computed(() => flattenVisible(tree.value, 0))
</script>
