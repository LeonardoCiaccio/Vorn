<template>
  <div class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
    <AppSidebar />
    <main class="flex-1 overflow-hidden">
      <SessionDetailView v-if="state.currentView === 'detail'" />
      <StoreView       v-else-if="state.currentView === 'store'" />
      <StatsView       v-else-if="state.currentView === 'stats'" />
      <SettingsView    v-else-if="state.currentView === 'settings'" />
      <SessionsView    v-else />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import SessionsView from './views/SessionsView.vue'
import SessionDetailView from './views/SessionDetailView.vue'
import StoreView from './views/StoreView.vue'
import StatsView from './views/StatsView.vue'
import SettingsView from './views/SettingsView.vue'
import { state, init } from './stores/vorn.js'

onMounted(() => init())
</script>
