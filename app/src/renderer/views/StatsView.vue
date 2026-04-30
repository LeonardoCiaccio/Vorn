<template>
  <div class="flex flex-col h-full overflow-auto">

    <!-- Header -->
    <div class="px-8 py-6 border-b border-gray-800 shrink-0">
      <h1 class="text-xl font-semibold text-white">Dashboard</h1>
      <p class="text-sm text-gray-500 mt-0.5">Panoramica generale — aggiornata {{ formatTs(now) }}</p>
    </div>

    <div class="px-8 py-6 space-y-6">

      <!-- KPI cards -->
      <div class="grid grid-cols-4 gap-4">
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

      <!-- Charts row -->
      <div class="grid grid-cols-3 gap-4">

        <!-- Activity bar chart -->
        <div class="col-span-2 bg-gray-900 border border-gray-800 rounded-md p-5">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-sm font-semibold text-gray-200">Attività backup</p>
              <p class="text-xs text-gray-500 mt-0.5">Run negli ultimi 14 giorni</p>
            </div>
            <div class="flex items-center gap-3 text-xs text-gray-500">
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-md bg-indigo-500 inline-block" />Run</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-md bg-emerald-500/60 inline-block" />File nuovi</span>
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
                  <p class="text-gray-400">{{ day.runs }} run · {{ day.files }} file</p>
                </div>
                <div
                  class="w-full rounded-t-md bg-emerald-500/25 transition-all"
                  :style="{ height: barHeight(day.files, maxFiles, 80) + 'px' }"
                />
                <div
                  class="w-full rounded-t-md absolute bottom-0 transition-all"
                  :class="day.runs > 0 ? 'bg-indigo-500' : 'bg-gray-800'"
                  :style="{ height: barHeight(day.runs, maxRuns, 80) + 'px' }"
                />
              </div>
              <p class="text-[9px] text-gray-600 mt-1">{{ day.shortLabel }}</p>
            </div>
          </div>
        </div>

        <!-- Donut chart -->
        <div class="bg-gray-900 border border-gray-800 rounded-md p-5">
          <p class="text-sm font-semibold text-gray-200 mb-1">File per sessione</p>
          <p class="text-xs text-gray-500 mb-5">Distribuzione ultima run</p>

          <div class="flex flex-col items-center">
            <svg width="120" height="120" viewBox="0 0 120 120" class="-rotate-90">
              <circle cx="60" cy="60" r="48" fill="none" stroke="#1f2937" stroke-width="14" />
              <circle
                v-for="(seg, i) in donutSegments"
                :key="i"
                cx="60" cy="60" r="48"
                fill="none"
                :stroke="seg.color"
                stroke-width="14"
                stroke-linecap="butt"
                :stroke-dasharray="`${seg.dash} ${circumference - seg.dash}`"
                :stroke-dashoffset="-seg.offset"
              />
            </svg>

            <div class="mt-4 w-full space-y-2">
              <div
                v-for="seg in donutSegments"
                :key="seg.label"
                class="flex items-center justify-between text-xs"
              >
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-md shrink-0" :style="{ background: seg.color }" />
                  <span class="text-gray-400 truncate max-w-22">{{ seg.label }}</span>
                </div>
                <span class="text-gray-300 font-mono font-medium">{{ seg.pct }}%</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Recent runs + health -->
      <div class="grid grid-cols-3 gap-4">

        <!-- Recent runs feed -->
        <div class="col-span-2 bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-800">
            <p class="text-sm font-semibold text-gray-200">Ultime run</p>
          </div>
          <div class="divide-y divide-gray-800/60">
            <div
              v-for="run in recentRuns"
              :key="run.ts + run.session"
              class="px-5 py-3 flex items-center gap-4 hover:bg-gray-800/40 transition-colors cursor-pointer"
            >
              <div class="w-8 h-8 rounded-md bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                <component :is="run.status === 'done' ? CheckCircleIcon : run.status === 'paused' ? PauseCircleIcon : ArrowPathIcon"
                  :class="['w-4 h-4', run.status === 'done' ? 'text-emerald-400' : run.status === 'paused' ? 'text-amber-400' : 'text-sky-400']"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-semibold text-gray-200">{{ run.session }}</p>
                  <StatusBadge :status="run.status" />
                </div>
                <p class="text-xs text-gray-500 mt-0.5 font-mono">{{ formatTs(run.ts) }}</p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-mono font-semibold text-gray-300">{{ (run.files_total ?? 0).toLocaleString('it-IT') }}</p>
                <p class="text-xs text-gray-600">file</p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-mono font-semibold text-emerald-400">+{{ run.files_new ?? 0 }}</p>
                <p class="text-xs text-gray-600">nuovi</p>
              </div>
            </div>
            <div v-if="recentRuns.length === 0" class="px-5 py-8 text-center text-gray-600 text-sm">
              Nessuna run ancora
            </div>
          </div>
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
              <p class="text-xs text-gray-500 mb-3">Efficienza deduplicazione</p>
              <div class="flex items-end gap-2 mb-2">
                <p class="text-2xl font-bold text-white">{{ dedupPct }}%</p>
                <p class="text-xs text-emerald-400 mb-1">file risparmiati</p>
              </div>
              <div class="w-full h-1.5 bg-gray-700 rounded-md overflow-hidden">
                <div
                  class="h-full bg-linear-to-r from-indigo-500 to-emerald-500 rounded-md transition-all"
                  :style="{ width: dedupPct + '%' }"
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  RectangleStackIcon,
  CircleStackIcon,
  DocumentDuplicateIcon,
  BoltIcon,
  CheckCircleIcon,
  PauseCircleIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  ClockIcon,
  ServerIcon,
} from '@heroicons/vue/24/outline'
import { state, formatTs, formatBytes } from '../stores/vorn.js'
import StatusBadge from '../components/StatusBadge.vue'

const now = new Date().toISOString()

// ── KPI ──────────────────────────────────────────────────────────────────────
const kpis = computed(() => {
  const sessions = state.sessions
  const allRuns  = sessions.flatMap(s => s.runs)
  const totalFiles = sessions.reduce((a, s) => a + (s.runs[0]?.files_total ?? s.runs[0]?.files_count ?? 0), 0)
  const totalNew   = sessions.reduce((a, s) => a + (s.runs[0]?.files_new  ?? 0), 0)
  const storeSize  = state.storeEntries.reduce((a, e) => a + e.bytes, 0)

  return [
    {
      label: 'Sessioni attive', value: sessions.filter(s => s.runs.length).length,
      sub: `${sessions.length} totali`, trend: 'neutral',
      icon: RectangleStackIcon, iconBg: 'bg-indigo-500/15', iconColor: 'text-indigo-400', glow: 'bg-indigo-500',
    },
    {
      label: 'File indicizzati', value: totalFiles.toLocaleString('it-IT'),
      sub: `+${totalNew} nell'ultima run`, trend: 'up',
      icon: DocumentDuplicateIcon, iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', glow: 'bg-violet-500',
    },
    {
      label: 'Dimensione store', value: state.storeLoaded ? formatBytes(storeSize) : '…',
      sub: state.storeLoaded ? `${state.storeEntries.length} file .vorn` : 'da caricare', trend: 'neutral',
      icon: CircleStackIcon, iconBg: 'bg-sky-500/15', iconColor: 'text-sky-400', glow: 'bg-sky-500',
    },
    {
      label: 'Run totali', value: allRuns.length,
      sub: allRuns.filter(r => r.status === 'done').length + ' completate', trend: 'up',
      icon: BoltIcon, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', glow: 'bg-emerald-500',
    },
  ]
})

// ── Activity chart ────────────────────────────────────────────────────────────
const activityData = computed(() => {
  const days = []
  const allRuns = state.sessions.flatMap(s => s.runs.map(r => ({ ...r })))
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const dayRuns = allRuns.filter(r => r.ts.startsWith(key))
    days.push({
      label: d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
      shortLabel: i === 0 ? 'oggi' : d.toLocaleDateString('it-IT', { day: '2-digit' }),
      runs: dayRuns.length,
      files: dayRuns.reduce((a, r) => a + (r.files_new ?? 0), 0),
    })
  }
  return days
})

const maxRuns  = computed(() => Math.max(...activityData.value.map(d => d.runs), 1))
const maxFiles = computed(() => Math.max(...activityData.value.map(d => d.files), 1))

function barHeight(val, max, maxPx) {
  return Math.max(val > 0 ? 4 : 0, Math.round((val / max) * maxPx))
}

// ── Donut chart ───────────────────────────────────────────────────────────────
const circumference = 2 * Math.PI * 48
const donutColors   = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981']

const donutSegments = computed(() => {
  const sessions = state.sessions.filter(s => s.runs.length > 0)
  const total = sessions.reduce((a, s) => a + (s.runs[0].files_total ?? s.runs[0].files_count ?? 0), 0)
  let offset = 0
  return sessions.map((s, i) => {
    const count = s.runs[0].files_total ?? s.runs[0].files_count ?? 0
    const pct  = total > 0 ? count / total : 0
    const dash = pct * circumference
    const seg  = { label: s.name, pct: Math.round(pct * 100), color: donutColors[i % donutColors.length], dash, offset }
    offset += dash
    return seg
  })
})

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
  const withRuns = sessions.filter(s => s.runs.length)
  const lastRun  = sessions.flatMap(s => s.runs).sort((a, b) => b.ts.localeCompare(a.ts))[0]
  return [
    {
      label: 'Sessioni configurate',
      detail: `${sessions.length} sessioni, ${withRuns.length} con run`,
      icon: RectangleStackIcon, bg: 'bg-indigo-500/15', color: 'text-indigo-400'
    },
    {
      label: 'Integrità file',
      detail: 'Non verificata',
      icon: ShieldCheckIcon, bg: 'bg-amber-500/15', color: 'text-amber-400'
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
  const allRuns = state.sessions.flatMap(s => s.runs)
  const total = allRuns.reduce((a, r) => a + (r.files_total ?? 0), 0)
  const dedup = allRuns.reduce((a, r) => a + (r.files_dedup ?? 0), 0)
  return total > 0 ? Math.round(dedup / total * 100) : 0
})
</script>
