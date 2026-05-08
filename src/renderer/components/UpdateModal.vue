<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div class="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-md shadow-2xl">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-gray-800 flex items-center gap-3">
          <div class="w-8 h-8 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <ArrowDownTrayIcon class="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <p class="text-sm font-semibold text-white">Aggiornamento disponibile</p>
            <p class="text-xs text-gray-500 mt-0.5">v{{ info.current }} → v{{ info.latest }}</p>
          </div>
        </div>

        <!-- Body -->
        <div class="px-6 py-5">
          <p class="text-sm text-gray-400 leading-relaxed">
            È disponibile una nuova versione di Vorn
            (<span class="text-white font-mono">v{{ info.latest }}</span>).
            Vuoi aprire la pagina di download?
          </p>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button
            @click="$emit('dismiss')"
            class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors rounded-md hover:bg-gray-800"
          >
            Più tardi
          </button>
          <button
            @click="download"
            class="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors flex items-center gap-1.5"
          >
            <ArrowDownTrayIcon class="w-3.5 h-3.5" />
            Scarica
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ArrowDownTrayIcon } from '@heroicons/vue/24/outline'

const props = defineProps({ info: { type: Object, required: true } })
const emit  = defineEmits(['dismiss'])

function download() {
  window.vorn.openExternal(props.info.url)
  emit('dismiss')
}
</script>
