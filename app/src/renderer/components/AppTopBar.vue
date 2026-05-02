<template>
  <header class="shrink-0 relative flex items-center px-4 h-11 bg-gray-900 border-b border-gray-800">

    <!-- Brand -->
    <div class="flex items-baseline gap-1.5 mr-4">
      <span class="text-xs font-bold tracking-widest text-white uppercase">Vorn</span>
      <span class="text-[10px] text-gray-600">v{{ state.appInfo?.version ?? '…' }}</span>
    </div>

    <!-- Nav — centrata in assoluto -->
    <nav class="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="navigate(item.id)"
        :class="[
          'relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
          currentView === item.id
            ? 'bg-indigo-500/15 text-indigo-400'
            : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'
        ]"
      >
        <component :is="item.icon" class="w-3.5 h-3.5 shrink-0" />
        {{ item.label }}
        <span
          v-if="item.id === 'sessions' && runningTasks.length"
          class="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded-full bg-indigo-500 text-white animate-pulse"
        >{{ runningTasks.length }}</span>
      </button>
    </nav>



  </header>
</template>

<script setup>
import { computed } from 'vue'
import {
  RectangleStackIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  ChartBarIcon,
} from '@heroicons/vue/24/outline'
import { state, goBack, navigateTo } from '../stores/vorn.js'
import { t } from '../stores/i18n.js'

const currentView  = computed(() => state.currentView)
const runningTasks = computed(() => Object.values(state.tasks).filter(t => t.status === 'running'))

const navItems = computed(() => [
  { id: 'sessions', label: t.value.nav.sessions, icon: RectangleStackIcon },
  { id: 'store',    label: t.value.nav.store,    icon: CircleStackIcon },
  { id: 'stats',    label: t.value.nav.stats,    icon: ChartBarIcon },
  { id: 'settings', label: t.value.nav.settings, icon: Cog6ToothIcon },
])

function navigate(id) {
  if (id === 'sessions') goBack()
  else navigateTo(id)
}
</script>
