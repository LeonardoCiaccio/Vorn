<template>
  <div class="flex items-start justify-between gap-6">
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-gray-200">{{ label }}</p>
      <p v-if="sub" class="text-xs text-gray-500 mt-0.5 leading-relaxed">{{ sub }}</p>
    </div>
    <div class="shrink-0 self-end">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({ label: String, sub: String })
</script>
