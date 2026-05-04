<template>
  <header class="shrink-0 relative flex items-center px-4 h-13 bg-gray-900 border-b border-gray-800">

    <!-- Brand -->
    <div class="flex items-baseline gap-1.5 mr-4">
      <span class="text-xs font-bold tracking-widest text-white uppercase">Vorn</span>
      <span class="text-[10px] text-gray-600">v{{ state.appInfo?.version ?? '…' }}</span>
    </div>

    <!-- Destra: nav + tema -->
    <div class="ml-auto flex items-center gap-1">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="navigate(item.id)"
        :title="item.label"
        :class="[
          'p-2 rounded-md transition-all duration-150',
          currentView === item.id
            ? 'bg-indigo-500/15 text-indigo-400'
            : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
        ]"
      >
        <component :is="item.icon" class="w-4.5 h-4.5" />
      </button>
      <div class="w-px h-4 bg-gray-800 mx-1" />
      <button
        @click="settingsOpen = true"
        class="p-2 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        title="Impostazioni"
      >
        <Cog6ToothIcon class="w-4.5 h-4.5" />
      </button>
      <button
        @click="toggleTheme"
        class="p-2 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        :title="isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro'"
      >
        <SunIcon  v-if="isDark"  class="w-4.5 h-4.5" />
        <MoonIcon v-else         class="w-4.5 h-4.5" />
      </button>
    </div>

  </header>

  <SettingsModal v-if="settingsOpen" @close="settingsOpen = false" />

</template>

<script setup>
import { computed, ref } from 'vue'
import {
  RectangleStackIcon,
  CircleStackIcon,
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
} from '@heroicons/vue/24/outline'
import { state, goBack, navigateTo } from '../stores/vorn.js'
import SettingsModal from './SettingsModal.vue'

const currentView = computed(() => state.currentView)

const navItems = [
  { id: 'sessions', label: 'Sessioni', icon: RectangleStackIcon },
  { id: 'store',    label: 'Store',    icon: CircleStackIcon },
]

function navigate(id) {
  if (id === 'sessions') goBack()
  else navigateTo(id)
}

const settingsOpen = ref(false)

// Tema
const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = !isDark.value
  const theme = isDark.value ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark',  isDark.value)
  document.documentElement.classList.toggle('light', !isDark.value)
  localStorage.setItem('vorn-theme', theme)
  window.vorn.saveSettings({ theme })
}

</script>
