<template>
  <span :class="cfg.classes" class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold">
    <span :class="cfg.dot" class="w-1.5 h-1.5 rounded-md" />
    {{ cfg.label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ status: String })

const cfg = computed(() => {
  switch (props.status) {
    case 'done':    return { label: 'Completata', classes: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' }
    case 'running': return { label: 'In corso',   classes: 'bg-sky-500/15 text-sky-400',         dot: 'bg-sky-400 animate-pulse' }
    case 'paused':  return { label: 'In pausa',   classes: 'bg-amber-500/15 text-amber-400',     dot: 'bg-amber-400' }
    case 'crashed': return { label: 'Interrotta', classes: 'bg-red-500/15 text-red-400',         dot: 'bg-red-400' }
    case 'aborted': return { label: 'Annullata',  classes: 'bg-orange-500/15 text-orange-400',   dot: 'bg-orange-400' }
    default:        return { label: props.status, classes: 'bg-gray-800 text-gray-400',          dot: 'bg-gray-500' }
  }
})
</script>
