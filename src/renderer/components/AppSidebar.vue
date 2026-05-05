<template>
  <aside class="w-60 flex flex-col bg-gray-900 border-r border-gray-800 shrink-0">

    <!-- Brand -->
    <div class="px-5 py-5 border-b border-gray-800">
      <div class="flex items-center gap-3">
        <img src="../assets/logo.png" class="w-8 h-8 rounded-md shadow-lg shadow-indigo-500/20" />
        <div>
          <p class="text-sm font-bold tracking-widest text-white uppercase">Vorn</p>
          <p class="text-[10px] text-gray-500 leading-none mt-0.5">v{{ state.appInfo?.version ?? '…' }}</p>
        </div>
      </div>
    </div>

    <!-- Nav -->
    <nav class="flex-1 px-3 py-4 space-y-0.5">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="navigate(item.id)"
        :class="[
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 group',
          currentView === item.id
            ? 'bg-indigo-500/15 text-indigo-400'
            : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'
        ]"
      >
        <component :is="item.icon" :class="[
          'w-4.5 h-4.5 shrink-0 transition-colors',
          currentView === item.id ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'
        ]" />
        <span class="flex-1">{{ item.label }}</span>
        <!-- badge task attivi per questa view -->
        <span
          v-if="item.id === 'sessions' && runningTasks.length"
          class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500 text-white leading-none animate-pulse"
        >{{ runningTasks.length }}</span>
      </button>
    </nav>

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-gray-800 space-y-1">
      <p class="text-[11px] text-gray-600 font-medium uppercase tracking-wider">Store</p>
      <p
        v-for="s in storeList"
        :key="s"
        class="text-[11px] text-gray-400 truncate font-mono"
        :title="s"
      >{{ s }}</p>
      <p v-if="!storeList.length" class="text-[11px] text-gray-600 italic">{{ $t('sidebar.noStore') }}</p>
    </div>

  </aside>
</template>

<script setup>
import {
  RectangleStackIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  ChartBarIcon,
} from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { state, goBack, navigateTo } from '../stores/vorn.js'

const { t } = useI18n()

const currentView   = computed(() => state.currentView)
const storeList     = computed(() => [...new Set(state.sessions.map(s => s.store))])
const runningTasks  = computed(() => Object.values(state.tasks).filter(t => t.status === 'running'))

const navItems = computed(() => [
  { id: 'sessions',  label: t('nav.sessions'),  icon: RectangleStackIcon },
  { id: 'store',     label: t('nav.store'),      icon: CircleStackIcon },
  { id: 'stats',     label: t('nav.stats'),      icon: ChartBarIcon },
  { id: 'settings',  label: t('nav.settings'),   icon: Cog6ToothIcon },
])

function navigate(id) {
  if (id === 'sessions') goBack()
  else navigateTo(id)
}
</script>
