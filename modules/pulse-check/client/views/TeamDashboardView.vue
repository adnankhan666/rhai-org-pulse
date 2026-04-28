<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useRoster } from '@shared/client/composables/useRoster'
import { useTeamAggregation } from '../composables/usePulseCheck'
import { apiRequest } from '@shared/client/services/api'
import SentimentBadge from '../components/SentimentBadge.vue'
import BlockerCard from '../components/BlockerCard.vue'

const { teams, loadRoster } = useRoster()
const { aggregation, loading, error, loadAggregation } = useTeamAggregation()

const selectedTeam = ref(null)
const currentPeriod = ref(null)

const teamOptions = computed(function() {
  return teams.value.map(function(t) {
    var label = t.displayName || t.key.split('::').pop()
    return { key: t.key, label: label }
  }).sort(function(a, b) { return a.label.localeCompare(b.label) })
})

const submissionRate = computed(function() {
  if (!aggregation.value || !aggregation.value.total) return 0
  return Math.round((aggregation.value.submitted / aggregation.value.total) * 100)
})

async function loadPeriodAndData() {
  try {
    currentPeriod.value = await apiRequest('/modules/pulse-check/periods/current')
  } catch { /* ignore */ }

  if (currentPeriod.value && selectedTeam.value) {
    var teamName = selectedTeam.value.split('::').pop()
    await loadAggregation(currentPeriod.value.periodEnd, 'team', teamName)
  }
}

watch(selectedTeam, function() {
  if (currentPeriod.value && selectedTeam.value) {
    var teamName = selectedTeam.value.split('::').pop()
    loadAggregation(currentPeriod.value.periodEnd, 'team', teamName)
  }
})

onMounted(async function() {
  await loadRoster()
  await loadPeriodAndData()
  if (!selectedTeam.value && teamOptions.value.length > 0) {
    selectedTeam.value = teamOptions.value[0].key
  }
})

function formatPeriod(start, end) {
  if (!start || !end) return ''
  var s = new Date(start + 'T00:00:00Z')
  var e = new Date(end + 'T00:00:00Z')
  var opts = { month: 'short', day: 'numeric' }
  return s.toLocaleDateString('en-US', opts) + ' – ' + e.toLocaleDateString('en-US', opts)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Team Dashboard</h1>
        <p v-if="currentPeriod" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ formatPeriod(currentPeriod.periodStart, currentPeriod.periodEnd) }}
        </p>
      </div>
      <select
        v-model="selectedTeam"
        class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary-500 min-w-[200px]"
      >
        <option v-for="t in teamOptions" :key="t.key" :value="t.key">{{ t.label }}</option>
      </select>
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading team updates...
    </div>

    <template v-else-if="aggregation">
      <!-- Summary Stats -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ aggregation.submitted }}/{{ aggregation.total }}</div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 uppercase tracking-wide">Submitted</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-green-50 dark:bg-green-500/10">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ aggregation.sentiment.green }}</div>
            <div class="text-[10px] text-green-600 dark:text-green-400 mt-0.5 uppercase tracking-wide">On Track</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-500/10">
            <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{{ aggregation.sentiment.yellow }}</div>
            <div class="text-[10px] text-yellow-600 dark:text-yellow-400 mt-0.5 uppercase tracking-wide">At Risk</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-red-50 dark:bg-red-500/10">
            <div class="text-2xl font-bold text-red-600 dark:text-red-400">{{ aggregation.sentiment.red }}</div>
            <div class="text-[10px] text-red-600 dark:text-red-400 mt-0.5 uppercase tracking-wide">Blocked</div>
          </div>
          <div class="text-center p-3 rounded-lg" :class="submissionRate < 60 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-gray-50 dark:bg-gray-900/50'">
            <div class="text-2xl font-bold" :class="submissionRate < 60 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">{{ submissionRate }}%</div>
            <div class="text-[10px] mt-0.5 uppercase tracking-wide" :class="submissionRate < 60 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'">Response Rate</div>
          </div>
        </div>
      </div>

      <!-- Missing submissions -->
      <div v-if="aggregation.missing.length > 0" class="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-2">Missing Submissions</h3>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="m in aggregation.missing"
            :key="m.uid"
            class="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-200 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-300"
          >{{ m.name }}</span>
        </div>
      </div>

      <!-- Unresolved Blockers -->
      <div v-if="aggregation.unresolvedBlockers.length > 0">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Unresolved Blockers ({{ aggregation.unresolvedBlockers.length }})
        </h2>
        <div class="space-y-2">
          <BlockerCard
            v-for="(b, idx) in aggregation.unresolvedBlockers"
            :key="idx"
            :blocker="b"
            :person-name="b.person"
            :readonly="true"
          />
        </div>
      </div>

      <!-- Individual Updates -->
      <div>
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Individual Updates</h2>
        <div class="space-y-3">
          <div
            v-for="u in aggregation.updates"
            :key="u.uid"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ u.personName }}</h3>
                <SentimentBadge :sentiment="u.sentiment" size="sm" />
              </div>
              <div v-if="u.tags && u.tags.length > 0" class="flex gap-1">
                <span
                  v-for="t in u.tags"
                  :key="t"
                  class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-400"
                >{{ t }}</span>
              </div>
            </div>

            <!-- Highlights -->
            <div v-if="u.highlights && u.highlights.length > 0" class="mb-2">
              <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Highlights</div>
              <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                <li v-for="(h, idx) in u.highlights" :key="idx">{{ h.text || h }}</li>
              </ul>
            </div>

            <!-- Blockers -->
            <div v-if="u.blockers && u.blockers.length > 0" class="mb-2">
              <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Blockers</div>
              <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                <li v-for="(b, idx) in u.blockers" :key="idx" :class="{ 'line-through opacity-60': b.resolved }">
                  <span class="text-[10px] font-semibold uppercase mr-1" :class="{
                    'text-red-600 dark:text-red-400': b.severity === 'high',
                    'text-yellow-600 dark:text-yellow-400': b.severity === 'medium',
                    'text-gray-500': b.severity === 'low'
                  }">[{{ b.severity || 'medium' }}]</span>
                  {{ b.text }}
                </li>
              </ul>
            </div>

            <!-- Plans -->
            <div v-if="u.plans && u.plans.length > 0">
              <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Next Week</div>
              <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                <li v-for="(p, idx) in u.plans" :key="idx">{{ p.text || p }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="aggregation.updates.length === 0 && aggregation.missing.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
        No updates yet for this team and period.
      </div>
    </template>
  </div>
</template>
