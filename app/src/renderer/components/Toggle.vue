<template>
  <button
    @click="$emit('update:modelValue', !modelValue)"
    :class="[
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-md border-2 border-transparent transition-colors duration-200',
      modelValue ? 'bg-indigo-600' : 'bg-gray-700'
    ]"
    role="switch"
    :aria-checked="modelValue"
  >
    <span
      :class="[
        'pointer-events-none inline-block h-4 w-4 rounded-md bg-white shadow transform transition-transform duration-200',
        modelValue ? 'translate-x-4' : 'translate-x-0'
      ]"
    />
  </button>
</template>

<script setup>
defineProps({ modelValue: Boolean })
defineEmits(['update:modelValue'])
</script>
