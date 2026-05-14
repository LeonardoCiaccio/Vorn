<template>
  <!-- Directory -->
  <div v-if="item.node.type === 'dir'" class="flex items-center h-6" :style="{ paddingLeft: indent + 'px' }">
    <input
      v-if="selectionMode"
      type="checkbox"
      :checked="isChecked"
      ref="cbRef"
      @change="toggle"
      @click.stop
      class="w-3 h-3 mr-1.5 shrink-0 accent-indigo-500 cursor-pointer"
    />
    <button
      @click="toggleDir(item.node.path)"
      class="flex items-center gap-1.5 flex-1 min-w-0 py-0.5 rounded hover:bg-gray-800/50 transition-colors text-left group"
    >
      <ChevronRightIcon
        class="w-3 h-3 text-gray-600 shrink-0 transition-transform duration-150"
        :class="isOpen ? 'rotate-90' : ''"
      />
      <FolderOpenIcon v-if="isOpen" class="w-3.5 h-3.5 text-amber-300 shrink-0" />
      <FolderIcon     v-else        class="w-3.5 h-3.5 text-amber-400/80 shrink-0 group-hover:text-amber-300 transition-colors" />
      <span class="text-gray-300 flex-1 truncate text-[12px]">{{ item.node.name }}</span>
      <span class="text-[10px] text-gray-600 font-mono mr-2 shrink-0">{{ fileCount }}</span>
    </button>
  </div>

  <!-- File -->
  <div
    v-else
    class="flex items-center gap-1.5 h-6 rounded hover:bg-gray-800/30 transition-colors"
    :style="{ paddingLeft: (indent + 16) + 'px' }"
    :title="item.node.hash_vorn"
  >
    <input
      v-if="selectionMode"
      type="checkbox"
      :checked="isChecked"
      @change="toggle"
      class="w-3 h-3 mr-0.5 shrink-0 accent-indigo-500 cursor-pointer"
    />
    <DocumentTextIcon class="w-3.5 h-3.5 text-sky-400/70 shrink-0" />
    <span class="text-gray-400 flex-1 truncate text-[12px]">{{ item.node.name }}</span>
    <span class="text-[10px] text-gray-600 font-mono mr-2 shrink-0">{{ formatBytes(item.node.bytes) }}</span>
  </div>
</template>

<script setup>
import { ref, computed, inject, watchEffect } from 'vue'
import { FolderIcon, FolderOpenIcon, DocumentTextIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'
import { formatBytes } from '../stores/vorn.js'

const props = defineProps({
  item: { type: Object, required: true },
})

const indent = computed(() => 8 + props.item.depth * 14)
const cbRef  = ref(null)

const openDirs      = inject('openDirs',      ref(new Set()))
const toggleDir     = inject('toggleDir',     () => {})
const selectedPaths = inject('selectedPaths', ref(new Set()))
const selectionMode = inject('selectionMode', ref(false))

const isOpen = computed(() => openDirs.value.has(props.item.node.path))

function getLeafPaths(node) {
  if (node.type === 'file') return [node.relPath]
  return node.children.flatMap(getLeafPaths)
}

const leafPaths = computed(() => getLeafPaths(props.item.node))

const isChecked = computed(() => {
  if (props.item.node.type === 'file') return selectedPaths.value.has(props.item.node.relPath)
  return leafPaths.value.length > 0 && leafPaths.value.every(p => selectedPaths.value.has(p))
})

const isIndeterminate = computed(() => {
  if (props.item.node.type === 'file') return false
  const n = leafPaths.value.filter(p => selectedPaths.value.has(p)).length
  return n > 0 && n < leafPaths.value.length
})

watchEffect(() => {
  if (cbRef.value) cbRef.value.indeterminate = isIndeterminate.value
})

function toggle() {
  const next = new Set(selectedPaths.value)
  if (props.item.node.type === 'file') {
    if (next.has(props.item.node.relPath)) next.delete(props.item.node.relPath)
    else                                   next.add(props.item.node.relPath)
  } else {
    const allSelected = leafPaths.value.every(p => next.has(p))
    if (allSelected) leafPaths.value.forEach(p => next.delete(p))
    else             leafPaths.value.forEach(p => next.add(p))
  }
  selectedPaths.value = next
}

function _count(n) {
  if (n.type === 'file') return 1
  return n.children.reduce((acc, c) => acc + _count(c), 0)
}
const fileCount = computed(() => _count(props.item.node))
</script>
