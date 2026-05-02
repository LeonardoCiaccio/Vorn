<template>
  <div class="border border-gray-700 rounded-md overflow-hidden h-full flex flex-col">
    <div class="flex-1 overflow-y-auto">
      <div v-if="loadingRoot" class="flex items-center justify-center py-8">
        <ArrowPathIcon class="w-4 h-4 animate-spin text-gray-600" />
      </div>
      <SessionSourceTreeNode
        v-for="node in rootNodes"
        :key="node.path"
        :node="node"
        :depth="0"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, provide, watch } from 'vue'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import SessionSourceTreeNode from './SessionSourceTreeNode.vue'
import { state } from '../stores/vorn.js'

const emit = defineEmits(['update:sources', 'update:excludePaths'])

// ── State ─────────────────────────────────────────────────────────────────────

const sources  = reactive(new Set())   // paths checked as source
const excluded = reactive(new Set())   // paths explicitly unchecked inside a source
const rootNodes  = ref([])
const loadingRoot = ref(false)

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
    node.children = dirs.map(makeNode)
  } catch { node.children = [] }
  node.loading  = false
}

// ── Load root ─────────────────────────────────────────────────────────────────

async function loadRoot(homedir) {
  loadingRoot.value = true
  try {
    const dirs    = await window.vorn.listDir(homedir)
    rootNodes.value = dirs.map(makeNode)
  } catch { rootNodes.value = [] }
  loadingRoot.value = false
}

watch(() => state.appInfo?.homedir, (h) => { if (h) loadRoot(h) }, { immediate: true })

// ── Emit ──────────────────────────────────────────────────────────────────────

function emitChange() {
  emit('update:sources',      [...sources])
  emit('update:excludePaths', [...excluded])
}

// ── Provide to nodes ──────────────────────────────────────────────────────────

provide('sourceTree', { sources, excluded, isInsideSource, toggleNode, expandNode })
</script>
