<template>
  <div>
    <!-- Row -->
    <div
      class="flex items-center gap-1.5 py-1.5 pr-3 transition-colors select-none"
      :class="isFiltered ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-800/40 cursor-default'"
      :style="{ paddingLeft: (depth * 16 + 12) + 'px' }"
    >
      <!-- Expand toggle (solo per cartelle) -->
      <button
        v-if="isDir"
        @click="isFiltered ? null : handleExpand()"
        class="w-4 h-4 shrink-0 flex items-center justify-center transition-colors"
        :class="isFiltered ? 'text-red-700/50 cursor-not-allowed' : 'text-gray-600 hover:text-gray-300'"
      >
        <ArrowPathIcon v-if="node.loading" class="w-3 h-3 animate-spin" />
        <ChevronRightIcon v-else-if="!node.expanded" class="w-3 h-3" />
        <ChevronDownIcon  v-else                      class="w-3 h-3" />
      </button>
      <span v-else class="w-4 h-4 shrink-0" />

      <!-- Checkbox -->
      <button
        @click="isFiltered ? null : handleToggle()"
        class="w-4 h-4 shrink-0 rounded flex items-center justify-center border transition-all"
        :class="checkboxClass"
        :disabled="isFiltered"
      >
        <CheckIcon  v-if="isChecked && !isPartial && !isFiltered" class="w-2.5 h-2.5" />
        <MinusIcon  v-else-if="isPartial && !isFiltered"          class="w-2.5 h-2.5" />
      </button>

      <!-- Icona + nome -->
      <DocumentTextIcon v-if="!isDir"             class="w-3.5 h-3.5 shrink-0 transition-colors" :class="iconClass" />
      <FolderOpenIcon   v-else-if="node.expanded" class="w-3.5 h-3.5 shrink-0 transition-colors" :class="iconClass" />
      <FolderIcon       v-else                    class="w-3.5 h-3.5 shrink-0 transition-colors" :class="iconClass" />
      <span class="text-xs font-mono truncate transition-colors" :class="nameClass">{{ node.name }}</span>

      <!-- Badge sorgente -->
      <span v-if="isSource && !isFiltered" class="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
        {{ isDir ? $t('sourceTree.badgeSource') : $t('sourceTree.badgeFile') }}
      </span>
      <!-- Badge filtrato -->
      <span v-if="isFiltered" class="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-400/70 bg-red-500/10 border border-red-700/30 px-1.5 py-0.5 rounded">
        {{ $t('sourceTree.badgeFiltered') }}
      </span>
    </div>

    <!-- Children (solo cartelle espanse, non filtrate) -->
    <template v-if="isDir && node.expanded && node.children && !isFiltered">
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
import { FolderIcon, FolderOpenIcon, DocumentTextIcon, ArrowPathIcon, CheckIcon, MinusIcon } from '@heroicons/vue/24/outline'
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/vue/24/solid'
import SessionSourceTreeNode from './SessionSourceTreeNode.vue'

const props = defineProps({
  node:  { type: Object, required: true },
  depth: { type: Number, default: 0 },
})

const { sources, excluded, isInsideSource, isInsideExcluded, isPartiallySelected, isFilteredByPattern, toggleNode, expandNode } = inject('sourceTree')

const isDir      = computed(() => (props.node.type ?? 'dir') === 'dir')
const isFiltered = computed(() => isFilteredByPattern(props.node.name))
const isSource   = computed(() => sources.has(props.node.path))
const isExcluded = computed(() => excluded.has(props.node.path) || isInsideExcluded(props.node.path))
const inside     = computed(() => isInsideSource(props.node.path))
const isPartial  = computed(() => isDir.value && !isExcluded.value && (isSource.value || inside.value) && isPartiallySelected(props.node.path))
const isChecked  = computed(() => isSource.value || (inside.value && !isExcluded.value))

const checkboxClass = computed(() => {
  if (isFiltered.value)  return 'bg-red-950/30 border-red-700/50 text-red-600 cursor-not-allowed'
  if (isPartial.value)   return 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
  if (isSource.value)    return 'bg-indigo-500 border-indigo-400 text-white'
  if (isExcluded.value)  return 'bg-gray-900 border-gray-700 text-gray-600'
  if (inside.value)      return 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
  return 'bg-gray-900 border-gray-700 text-gray-600'
})

const iconClass = computed(() => {
  if (isFiltered.value)  return isDir.value ? 'text-red-700/60' : 'text-red-700/60'
  if (isSource.value)    return isDir.value ? 'text-amber-300' : 'text-sky-400'
  if (isExcluded.value)  return isDir.value ? 'text-amber-400/30' : 'text-sky-400/30'
  if (inside.value)      return isDir.value ? 'text-amber-400/50' : 'text-sky-400/50'
  return isDir.value ? 'text-amber-400/80' : 'text-sky-400/70'
})

const nameClass = computed(() => {
  if (isFiltered.value)  return 'text-red-500/60 line-through'
  if (isExcluded.value)  return 'text-gray-500'
  if (isSource.value || inside.value) return 'text-gray-200'
  return isDir.value ? 'text-gray-500' : 'text-gray-400'
})

function handleToggle()  { toggleNode(props.node) }
function handleExpand()  { expandNode(props.node) }
</script>
