<template>
  <div>
    <!-- Header: label + expand/collapse controls -->
    <div class="flex items-center justify-between px-2 mb-1">
      <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">File nel run</p>
      <button
        v-if="tree.length"
        @click="toggleAll"
        :title="allExpanded ? 'Comprimi tutto' : 'Espandi tutto'"
        class="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
      >
        <ArrowsPointingInIcon v-if="allExpanded" class="w-3.5 h-3.5" />
        <ArrowsPointingOutIcon v-else             class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Loading -->
    <div v-if="!files" class="flex items-center gap-1.5 text-xs text-gray-600 py-4 justify-center">
      <ArrowPathIcon class="w-3.5 h-3.5 animate-spin" />
      Caricamento…
    </div>

    <!-- Empty -->
    <div v-else-if="tree.length === 0" class="text-xs text-gray-600 italic py-4 text-center">
      Nessun file in questa run
    </div>

    <!-- Tree -->
    <div v-else class="select-none py-1">
      <FileTreeNode
        v-for="node in tree"
        :key="node.name + node.type"
        :node="node"
        :depth="0"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, provide, ref } from 'vue'
import { ArrowPathIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/vue/24/outline'
import FileTreeNode from './FileTreeNode.vue'

const props = defineProps({
  files: { type: Object, default: null },
})

// Segnali per expand/collapse globale — FileTreeNode li inietta e li osserva
const expandSignal   = ref(0)
const collapseSignal = ref(0)
const allExpanded    = ref(true)
provide('expandSignal',   expandSignal)
provide('collapseSignal', collapseSignal)

function toggleAll() {
  allExpanded.value = !allExpanded.value
  if (allExpanded.value) expandSignal.value++
  else                   collapseSignal.value++
}

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

    siblings.push({
      name:      parts[parts.length - 1],
      type:      'file',
      relPath,
      bytes:     meta.bytes ?? 0,
      hash_vorn: meta.hash_vorn,
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
</script>
