<template>
  <div>
    <!-- Row -->
    <div
      class="flex items-center gap-1.5 py-1.5 pr-3 hover:bg-gray-800/40 transition-colors cursor-default select-none"
      :style="{ paddingLeft: (depth * 16 + 12) + 'px' }"
    >
      <!-- Expand toggle (solo per cartelle) -->
      <button
        v-if="isDir"
        @click="handleExpand"
        class="w-4 h-4 shrink-0 flex items-center justify-center text-gray-600 hover:text-gray-300 transition-colors"
      >
        <ArrowPathIcon v-if="node.loading" class="w-3 h-3 animate-spin" />
        <ChevronRightIcon v-else-if="!node.expanded" class="w-3 h-3" />
        <ChevronDownIcon  v-else                      class="w-3 h-3" />
      </button>
      <span v-else class="w-4 h-4 shrink-0" />

      <!-- Checkbox -->
      <button
        @click="handleToggle"
        class="w-4 h-4 shrink-0 rounded flex items-center justify-center border transition-all"
        :class="checkboxClass"
      >
        <CheckIcon v-if="isChecked" class="w-2.5 h-2.5" />
        <XMarkIcon v-else-if="isExcluded" class="w-2.5 h-2.5" />
      </button>

      <!-- Icona + nome -->
      <DocumentTextIcon v-if="!isDir"          class="w-3.5 h-3.5 shrink-0 transition-colors" :class="iconClass" />
      <FolderOpenIcon   v-else-if="node.expanded" class="w-3.5 h-3.5 shrink-0 transition-colors" :class="iconClass" />
      <FolderIcon       v-else                  class="w-3.5 h-3.5 shrink-0 transition-colors" :class="iconClass" />
      <span class="text-xs font-mono truncate transition-colors" :class="nameClass">{{ node.name }}</span>

      <!-- Badge sorgente -->
      <span v-if="isSource" class="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
        {{ isDir ? $t('sourceTree.badgeSource') : $t('sourceTree.badgeFile') }}
      </span>
    </div>

    <!-- Children (solo cartelle espanse) -->
    <template v-if="isDir && node.expanded && node.children">
      <SessionSourceTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
      />
      <div v-if="node.children.length === 0" class="text-[10px] text-gray-600 italic py-1" :style="{ paddingLeft: ((depth + 1) * 16 + 28) + 'px' }">
        {{ $t('sourceTree.empty') }}
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'
import { FolderIcon, FolderOpenIcon, DocumentTextIcon, ArrowPathIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/vue/24/solid'
import SessionSourceTreeNode from './SessionSourceTreeNode.vue'

const props = defineProps({
  node:  { type: Object, required: true },
  depth: { type: Number, default: 0 },
})

const { sources, excluded, isInsideSource, toggleNode, expandNode } = inject('sourceTree')

const isDir      = computed(() => (props.node.type ?? 'dir') === 'dir')
const isSource   = computed(() => sources.has(props.node.path))
const isExcluded = computed(() => excluded.has(props.node.path))
const inside     = computed(() => isInsideSource(props.node.path))
const isChecked  = computed(() => isSource.value || (inside.value && !isExcluded.value))

const checkboxClass = computed(() => {
  if (isSource.value)   return 'bg-indigo-500 border-indigo-400 text-white'
  if (isExcluded.value) return 'bg-gray-900 border-red-600/60 text-red-400'
  if (inside.value)     return 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
  return 'bg-gray-900 border-gray-700 text-gray-600'
})

const iconClass = computed(() => {
  if (isSource.value)   return isDir.value ? 'text-amber-300' : 'text-sky-400'
  if (isExcluded.value) return 'text-red-500/60'
  if (inside.value)     return isDir.value ? 'text-amber-400/50' : 'text-sky-400/50'
  return isDir.value ? 'text-amber-400/80' : 'text-sky-400/70'
})

const nameClass = computed(() => {
  if (isExcluded.value) return 'text-red-400/60 line-through'
  if (isSource.value || inside.value) return 'text-gray-200'
  return isDir.value ? 'text-gray-500' : 'text-gray-400'
})

function handleToggle()  { toggleNode(props.node) }
function handleExpand()  { expandNode(props.node) }
</script>
