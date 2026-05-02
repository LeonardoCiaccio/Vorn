<template>
  <div>
    <!-- Directory -->
    <div v-if="node.type === 'dir'" class="flex items-center" :style="{ paddingLeft: indent + 'px' }">
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
        @click="open = !open"
        class="flex items-center gap-1.5 flex-1 min-w-0 py-0.5 rounded hover:bg-gray-800/50 transition-colors text-left group"
      >
        <ChevronRightIcon
          class="w-3 h-3 text-gray-600 shrink-0 transition-transform duration-150"
          :class="open ? 'rotate-90' : ''"
        />
        <FolderOpenIcon v-if="open" class="w-3.5 h-3.5 text-amber-300 shrink-0" />
        <FolderIcon     v-else      class="w-3.5 h-3.5 text-amber-400/80 shrink-0 group-hover:text-amber-300 transition-colors" />
        <span class="text-gray-300 flex-1 truncate text-[12px]">{{ node.name }}</span>
        <span class="text-[10px] text-gray-600 font-mono mr-2 shrink-0">{{ fileCount }}</span>
      </button>
    </div>
    <div v-show="node.type === 'dir' && open">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.name + child.type"
        :node="child"
        :depth="depth + 1"
      />
    </div>

    <!-- File -->
    <div
      v-if="node.type === 'file'"
      :title="node.hash_vorn"
      class="flex items-center gap-1.5 py-0.5 rounded hover:bg-gray-800/30 transition-colors"
      :style="{ paddingLeft: (indent + 16) + 'px' }"
    >
      <input
        v-if="selectionMode"
        type="checkbox"
        :checked="isChecked"
        @change="toggle"
        class="w-3 h-3 mr-0.5 shrink-0 accent-indigo-500 cursor-pointer"
      />
      <DocumentTextIcon class="w-3.5 h-3.5 text-sky-400/70 shrink-0" />
      <span class="text-gray-400 flex-1 truncate text-[12px]">{{ node.name }}</span>
      <span class="text-[10px] text-gray-600 font-mono mr-2 shrink-0">{{ formatBytes(node.bytes) }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, watch, watchEffect } from 'vue'
import { FolderIcon, FolderOpenIcon, DocumentTextIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'
import { formatBytes } from '../stores/vorn.js'

const props = defineProps({
  node:  { type: Object, required: true },
  depth: { type: Number, default: 0 },
})

const open   = ref(props.depth < 2)
const indent = computed(() => 8 + props.depth * 14)
const cbRef  = ref(null)

const expandSignal   = inject('expandSignal',   ref(0))
const collapseSignal = inject('collapseSignal', ref(0))
const selectedPaths = inject('selectedPaths', ref(new Set()))
const selectionMode = inject('selectionMode', ref(false))

watch(expandSignal,   () => { if (props.node.type === 'dir') open.value = true  })
watch(collapseSignal, () => { if (props.node.type === 'dir') open.value = false })

function getLeafPaths(node) {
  if (node.type === 'file') return [node.relPath]
  return node.children.flatMap(getLeafPaths)
}

const leafPaths = computed(() => getLeafPaths(props.node))

const isChecked = computed(() => {
  if (props.node.type === 'file') return selectedPaths.value.has(props.node.relPath)
  return leafPaths.value.length > 0 && leafPaths.value.every(p => selectedPaths.value.has(p))
})

const isIndeterminate = computed(() => {
  if (props.node.type === 'file') return false
  const n = leafPaths.value.filter(p => selectedPaths.value.has(p)).length
  return n > 0 && n < leafPaths.value.length
})

// Indeterminate non è un attributo HTML — va settato via DOM
watchEffect(() => {
  if (cbRef.value) cbRef.value.indeterminate = isIndeterminate.value
})

function toggle() {
  const next = new Set(selectedPaths.value)
  if (props.node.type === 'file') {
    if (next.has(props.node.relPath)) next.delete(props.node.relPath)
    else                             next.add(props.node.relPath)
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
const fileCount = computed(() => _count(props.node))
</script>
