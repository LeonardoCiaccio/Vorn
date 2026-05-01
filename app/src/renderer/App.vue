<template>
  <div class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
    <AppSidebar />
    <div class="flex-1 flex flex-col overflow-hidden">

      <!-- Banner store non configurato -->
      <div
        v-if="state.appInfo && state.activeStore === null"
        class="shrink-0 flex items-center gap-3 px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300"
      >
        <ExclamationTriangleIcon class="w-4 h-4 shrink-0 text-amber-400" />
        <span>Nessuno store disponibile. Configura uno store predefinito per iniziare a fare backup.</span>
        <button
          @click="goToSettings"
          class="ml-auto px-3 py-1 rounded-md border border-amber-500/30 hover:bg-amber-500/15 transition-colors font-medium"
        >
          Impostazioni →
        </button>
      </div>

      <main class="flex-1 overflow-hidden">
        <SessionDetailView v-if="state.currentView === 'detail'" />
        <StoreView       v-else-if="state.currentView === 'store'" />
        <StatsView       v-else-if="state.currentView === 'stats'" />
        <SettingsView    v-else-if="state.currentView === 'settings'" />
        <SessionsView    v-else />
      </main>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import AppSidebar from './components/AppSidebar.vue'
import SessionsView from './views/SessionsView.vue'
import SessionDetailView from './views/SessionDetailView.vue'
import StoreView from './views/StoreView.vue'
import StatsView from './views/StatsView.vue'
import SettingsView from './views/SettingsView.vue'
import { state, init, navigateTo } from './stores/vorn.js'

onMounted(() => init())

function goToSettings() { navigateTo('settings') }
</script>
