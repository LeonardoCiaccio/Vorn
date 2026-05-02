<template>
  <div class="flex flex-col h-full overflow-auto">

    <!-- Header -->
    <div class="px-8 py-6 border-b border-gray-800 shrink-0 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-white">Dashboard</h1>
        <p class="text-sm text-gray-500 mt-0.5">
          <span v-if="statsCalculatedAt">Statistiche calcolate il {{ formatTs(statsCalculatedAt) }}</span>
          <span v-else-if="computing">Calcolo in corso…</span>
          <span v-else>Nessuna statistica disponibile</span>
        </p>
      </div>
      <button
        @click="computeStats"
        :disabled="computing"
        class="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ArrowPathIcon :class="['w-3.5 h-3.5', computing && 'animate-spin']" />
        Ricalcola
      </button>
    </div>

    <div class="px-8 py-6 space-y-6">

      <!-- KPI cards -->
      <div class="grid grid-cols-5 gap-4">

        <!-- Card sessioni — in risalto -->
        <div class="bg-indigo-500/10 border border-indigo-500/30 rounded-md p-5 relative overflow-hidden">
          <p class="text-xs text-indigo-400 uppercase tracking-wider font-medium">Sessioni</p>
          <p class="text-3xl font-bold text-white mt-2">{{ state.sessions.length }}</p>
          <div class="absolute -bottom-4 -right-4 w-20 h-20 rounded-md opacity-20 blur-2xl bg-indigo-500" />
        </div>

        <div
          v-for="kpi in kpis"
          :key="kpi.label"
          class="bg-gray-900 border border-gray-800 rounded-md p-5 relative overflow-hidden"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-500 uppercase tracking-wider font-medium">{{ kpi.label }}</p>
              <p class="text-3xl font-bold text-white mt-2">{{ kpi.value }}</p>
              <p v-if="kpi.sub" class="text-xs mt-1" :class="kpi.trend === 'up' ? 'text-emerald-400' : 'text-gray-500'">
                {{ kpi.sub }}
              </p>
            </div>
            <div :class="['w-10 h-10 rounded-md flex items-center justify-center shrink-0', kpi.iconBg]">
              <component :is="kpi.icon" :class="['w-5 h-5', kpi.iconColor]" />
            </div>
          </div>
          <div :class="['absolute -bottom-4 -right-4 w-20 h-20 rounded-md opacity-10 blur-2xl', kpi.glow]" />
        </div>
      </div>

      <!-- Dati puri -->
      <div class="flex items-center gap-6 px-1 text-xs text-gray-500">
        <span>Dimensione totale: <span class="text-gray-300 font-mono">{{ formatBytes(sessionStats.bytes_total ?? 0) }}</span></span>
        <span class="text-gray-700">·</span>
        <span>Spazio risparmiato (dedup): <span class="text-emerald-400 font-mono">{{ formatBytes(sessionStats.bytes_saved ?? 0) }}</span></span>
        <span class="text-gray-700">·</span>
        <span>Record indicizzati: <span class="text-gray-300 font-mono">{{ (sessionStats.total_files ?? 0).toLocaleString('it-IT') }}</span></span>
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 gap-4">

        <!-- Activity bar chart -->
        <div class="bg-gray-900 border border-gray-800 rounded-md p-5">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-sm font-semibold text-gray-200">Attività backup</p>
              <p class="text-xs text-gray-500 mt-0.5">Run negli ultimi 14 giorni</p>
            </div>
            <div class="flex items-center gap-3 text-xs text-gray-500">
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-md bg-emerald-500 inline-block" />Nuovi</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-md bg-sky-500/70 inline-block" />Dedup</span>
            </div>
          </div>
          <div class="flex items-end gap-1.5 h-28">
            <div
              v-for="(day, i) in activityData"
              :key="i"
              class="flex-1 flex flex-col items-center gap-1 group"
            >
              <div class="w-full flex flex-col items-center gap-0.5 relative">
                <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-[10px] text-gray-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                  <p class="font-semibold">{{ day.label }}</p>
                  <p class="text-gray-400">{{ day.runs }} run · <span class="text-emerald-400">+{{ day.filesNew }}</span> nuovi · <span class="text-sky-400">{{ day.filesDedup }}</span> dedup</p>
                </div>
                <!-- barre affiancate: nuovi (verde) e dedup (sky) -->
                <div class="w-full flex items-end gap-px" :style="{ height: '80px' }">
                  <div
                    class="flex-1 rounded-t-sm bg-emerald-500 transition-all"
                    :style="{ height: barHeight(day.filesNew, maxFiles, 80) + 'px' }"
                  />
                  <div
                    class="flex-1 rounded-t-sm bg-sky-500/70 transition-all"
                    :style="{ height: barHeight(day.filesDedup, maxFiles, 80) + 'px' }"
                  />
                </div>
              </div>
              <p class="text-[9px] text-gray-600 mt-1">{{ day.shortLabel }}</p>
            </div>
          </div>
        </div>

      </div>

      <!-- Recent runs + health -->
      <div class="grid grid-cols-3 gap-8">

        <!-- Recent runs feed -->
        <div class="col-span-2 min-w-0 overflow-x-auto">
          <p class="text-sm font-semibold text-gray-200 mb-3">Ultime run</p>
          <div v-if="recentRuns.length === 0" class="text-sm text-gray-600">Nessuna run ancora</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left">
                <th class="pb-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sessione</th>
                <th class="pb-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data / Ora</th>
                <th class="pb-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stato</th>
                <th class="pb-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">File</th>
                <th class="pb-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Nuovi</th>
                <th class="pb-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Dedup</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="run in recentRuns"
                :key="run.ts + run.session"
                class="group border-t border-gray-800/60 hover:bg-gray-800/40 transition-colors"
              >
                <td class="py-3.5 px-4 text-gray-300 font-medium">{{ run.session }}</td>
                <td class="py-3.5 px-4 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTs(run.ts) }}</td>
                <td class="py-3.5 px-4"><StatusBadge :status="run.status" /></td>
                <td class="py-3.5 px-4 text-right font-mono font-medium text-gray-300">{{ (run.files_total ?? 0).toLocaleString('it-IT') }}</td>
                <td class="py-3.5 px-4 text-right font-mono text-emerald-400 font-medium">+{{ run.files_new ?? 0 }}</td>
                <td class="py-3.5 px-4 text-right font-mono text-gray-500">{{ (run.files_dedup ?? 0).toLocaleString('it-IT') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Health panel -->
        <div class="bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-800">
            <p class="text-sm font-semibold text-gray-200">Stato sistema</p>
          </div>
          <div class="px-5 py-4 space-y-3">
            <div
              v-for="check in healthChecks"
              :key="check.label"
              class="flex items-center gap-3"
            >
              <div :class="['w-7 h-7 rounded-md flex items-center justify-center shrink-0', check.bg]">
                <component :is="check.icon" :class="['w-3.5 h-3.5', check.color]" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-gray-300">{{ check.label }}</p>
                <p class="text-[10px] text-gray-600 mt-0.5">{{ check.detail }}</p>
              </div>
            </div>
          </div>

          <!-- Dedup efficiency -->
          <div class="px-5 pb-5">
            <div class="bg-gray-800/50 border border-gray-700/50 rounded-md p-4 mt-1">
              <p class="text-xs text-gray-500 mb-3">Dedup cross-sessione</p>
              <div class="flex items-end gap-2 mb-2">
                <p class="text-2xl font-bold text-white">{{ dedupPct }}%</p>
                <p class="text-xs text-emerald-400 mb-1">file deduplicati</p>
              </div>
              <div class="w-full h-1.5 bg-gray-700 rounded-md overflow-hidden">
                <div
                  class="h-full bg-linear-to-r from-indigo-500 to-emerald-500 rounded-md transition-all"
                  :style="{ width: dedupPct + '%' }"
                />
              </div>
              <p class="text-[10px] text-gray-600 mt-2">
                {{ sessionStats.deduped.toLocaleString('it-IT') }} dedup
                su {{ sessionStats.total_files.toLocaleString('it-IT') }} file totali
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  RectangleStackIcon,
  DocumentDuplicateIcon,
  BoltIcon,
  CircleStackIcon,
  ArrowPathIcon,
  ClockIcon,
  ServerIcon,
} from '@heroicons/vue/24/outline'
import { state, formatTs, formatBytes } from '../stores/vorn.js'
import StatusBadge from '../components/StatusBadge.vue'

const now = new Date().toISOString()

const computing = ref(false)

const sessionStats = computed(() =>
  state.statsCache?.data ?? { total_files: 0, originals: 0, deduped: 0, bytes_total: 0, bytes_saved: 0, daily: [] }
)
const statsCalculatedAt = computed(() => state.statsCache?.calculatedAt ?? null)

async function computeStats() {
  computing.value = true
  try {
    const data = await window.vorn.getSessionStats()
    state.statsCache = { data, calculatedAt: new Date().toISOString() }
  } finally {
    computing.value = false
  }
}

onMounted(() => {
  if (!state.statsCache) computeStats()
})

// ── KPI ──────────────────────────────────────────────────────────────────────
const kpis = computed(() => {
  const sessions = state.sessions
  const allRuns  = sessions.flatMap(s => s.runs)
  const { total_files, originals, deduped, bytes_total } = sessionStats.value

  return [
    {
      label: 'Run totali', value: allRuns.length,
      sub: null, trend: 'up',
      icon: BoltIcon, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', glow: 'bg-emerald-500',
    },
    {
      label: 'File totali', value: total_files.toLocaleString('it-IT'),
      sub: null, trend: 'neutral',
      icon: RectangleStackIcon, iconBg: 'bg-indigo-500/15', iconColor: 'text-indigo-400', glow: 'bg-indigo-500',
    },
    {
      label: 'Contenuti unici', value: originals.toLocaleString('it-IT'),
      sub: 'hash distinti', trend: 'neutral',
      icon: DocumentDuplicateIcon, iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', glow: 'bg-violet-500',
    },
    {
      label: 'Deduplicati', value: deduped.toLocaleString('it-IT'),
      sub: 'hash condivisi', trend: deduped > 0 ? 'up' : 'neutral',
      icon: CircleStackIcon, iconBg: 'bg-sky-500/15', iconColor: 'text-sky-400', glow: 'bg-sky-500',
    },
  ]
})

// ── Activity chart ────────────────────────────────────────────────────────────
const activityData = computed(() => {
  const daily = sessionStats.value.daily ?? []
  const byDay = Object.fromEntries(daily.map(d => [d.day, d]))
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const entry = byDay[key]
    days.push({
      label: d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
      shortLabel: i === 0 ? 'oggi' : d.toLocaleDateString('it-IT', { day: '2-digit' }),
      runs:       entry?.runs       ?? 0,
      filesNew:   entry?.originals  ?? 0,
      filesDedup: entry?.deduped    ?? 0,
    })
  }
  return days
})

const maxFiles = computed(() => Math.max(...activityData.value.flatMap(d => [d.filesNew, d.filesDedup]), 1))

function barHeight(val, max, maxPx) {
  return Math.max(val > 0 ? 4 : 0, Math.round((val / max) * maxPx))
}


// ── Recent runs ───────────────────────────────────────────────────────────────
const recentRuns = computed(() =>
  state.sessions
    .flatMap(s => s.runs.map(r => ({ ...r, session: s.name })))
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 6)
)

// ── Health ────────────────────────────────────────────────────────────────────
const healthChecks = computed(() => {
  const sessions = state.sessions
  const allRuns  = sessions.flatMap(s => s.runs)
  const lastRun  = allRuns.sort((a, b) => b.ts.localeCompare(a.ts))[0]
  return [
    {
      label: 'Sessioni configurate',
      detail: `${sessions.length} sessioni · ${allRuns.length} run`,
      icon: RectangleStackIcon, bg: 'bg-indigo-500/15', color: 'text-indigo-400'
    },
    {
      label: 'Ultima run',
      detail: lastRun ? formatTs(lastRun.ts) : 'Nessuna run',
      icon: ClockIcon, bg: 'bg-gray-800', color: 'text-gray-400'
    },
    {
      label: 'Piattaforma',
      detail: state.appInfo?.platform ?? '—',
      icon: ServerIcon, bg: 'bg-gray-800', color: 'text-gray-400'
    },
  ]
})

const dedupPct = computed(() => {
  const { total_files, deduped } = sessionStats.value
  if (!total_files) return 0
  return Math.round((deduped / total_files) * 100)
})
</script>
