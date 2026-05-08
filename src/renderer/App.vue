<template>
  <div class="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">

    <UpdateModal v-if="showUpdate" :info="state.updateInfo" @dismiss="showUpdate = false" />

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
import { onMounted, ref } from 'vue'
import AppTopBar          from './components/AppTopBar.vue'
import StoreSelectView    from './views/StoreSelectView.vue'
import SessionsView       from './views/SessionsView.vue'
import SessionDetailView  from './views/SessionDetailView.vue'
import StoreView          from './views/StoreView.vue'
import UpdateModal        from './components/UpdateModal.vue'
import { state, boot }    from './stores/vorn.js'

const showUpdate = ref(false)

onMounted(async () => {
  await boot()
  if (state.updateInfo?.hasUpdate) showUpdate.value = true
})
</script>
