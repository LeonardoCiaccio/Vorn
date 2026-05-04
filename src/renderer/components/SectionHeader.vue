<template>
  <div>
    <h2 class="text-base font-semibold text-white">{{ title }}</h2>
    <p v-if="sub" class="text-xs text-gray-500 mt-0.5">{{ sub }}</p>
    <div class="mt-3 h-px bg-gray-800" />
  </div>
</template>

<script setup>
defineProps({ title: String, sub: String })
</script>
