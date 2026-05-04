<template>
  <div class="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">

    <!-- Store non selezionato o disconnesso -->
    <StoreSelectView v-if="state.phase !== 'ready'" />

    <!-- App principale -->
    <template v-else>
      <AppTopBar />
      <main class="flex-1 overflow-hidden">
        <SessionDetailView v-if="state.currentView === 'detail'" />
        <StoreView         v-else-if="state.currentView === 'store'" />
        <SessionsView      v-else />
      </main>
    </template>

  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import AppTopBar        from './components/AppTopBar.vue'
import StoreSelectView  from './views/StoreSelectView.vue'
import SessionsView     from './views/SessionsView.vue'
import SessionDetailView from './views/SessionDetailView.vue'
import StoreView        from './views/StoreView.vue'
import { state, boot }  from './stores/vorn.js'

onMounted(() => boot())
</script>
