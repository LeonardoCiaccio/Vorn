<template>
  <div>
    <!-- Directory -->
    <div v-if="node.type === 'dir'">
      <button
        @click="open = !open"
        class="w-full flex items-center gap-1.5 py-0.5 rounded hover:bg-gray-800/50 transition-colors text-left group"
        :style="{ paddingLeft: indent + 'px' }"
      >
        <ChevronRightIcon
          class="w-3 h-3 text-gray-600 shrink-0 transition-transform duration-150"
          :class="open ? 'rotate-90' : ''"
        />
        <FolderOpenIcon v-if="open" class="w-3.5 h-3.5 text-indigo-400/80 shrink-0" />
        <FolderIcon     v-else      class="w-3.5 h-3.5 text-gray-500 shrink-0 group-hover:text-indigo-400/60 transition-colors" />
        <span class="text-gray-300 flex-1 truncate text-[12px]">{{ node.name }}</span>
        <span class="text-[10px] text-gray-600 font-mono mr-2 shrink-0">{{ fileCount }}</span>
      </button>
      <div v-show="open">
        <FileTreeNode
          v-for="child in node.children"
          :key="child.name + child.type"
          :node="child"
          :depth="depth + 1"
        />
      </div>
    </div>

    <!-- File -->
    <div
      v-else
      class="flex items-center gap-1.5 py-0.5 rounded hover:bg-gray-800/30 transition-colors"
      :style="{ paddingLeft: (indent + 16) + 'px' }"
    >
      <DocumentIcon class="w-3.5 h-3.5 text-gray-600 shrink-0" />
      <span class="text-gray-400 flex-1 truncate text-[12px]">{{ node.name }}</span>
      <span class="text-[10px] text-gray-600 font-mono mr-2 shrink-0">{{ formatBytes(node.bytes) }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, watch } from 'vue'
import { FolderIcon, FolderOpenIcon, DocumentIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'
import { formatBytes } from '../stores/vorn.js'

const props = defineProps({
  node:  { type: Object, required: true },
  depth: { type: Number, default: 0 },
})

const open   = ref(props.depth < 2)
const indent = computed(() => 8 + props.depth * 14)

const expandSignal   = inject('expandSignal',   ref(0))
const collapseSignal = inject('collapseSignal', ref(0))

watch(expandSignal,   () => { if (props.node.type === 'dir') open.value = true  })
watch(collapseSignal, () => { if (props.node.type === 'dir') open.value = false })

function _count(n) {
  if (n.type === 'file') return 1
  return n.children.reduce((acc, c) => acc + _count(c), 0)
}
const fileCount = computed(() => _count(props.node))
</script>
