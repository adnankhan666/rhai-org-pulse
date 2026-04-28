<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiRequest } from '@shared/client/services/api'

var MODULE_API = '/modules/pulse-check'

var currentPeriod = ref(null)
var heatmap = ref(null)
var loading = ref(false)
var error = ref(null)

var sortedOrgs = computed(function() {
  if (!heatmap.value) return []
  return heatmap.value.orgs.slice().sort(function(a, b) {
    var healthOrder = { red: 0, yellow: 1, green: 2 }
    return (healthOrder[a.health] || 2) - (healthOrder[b.health] || 2)
  })
})

async function loadHeatmap() {
  loading.value = true
  error.value = null
  try {
    currentPeriod.value = await apiRequest(MODULE_API + '/periods/current')
    heatmap.value = await apiRequest(MODULE_API + '/heatmap/' + currentPeriod.value.periodEnd)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(loadHeatmap)

function healthStyles(health) {
  return {
    green: 'border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/5',
    yellow: 'border-yellow-300 dark:border-yellow-500/40 bg-yellow-50 dark:bg-yellow-500/5',
    red: 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/5',
  }[health] || 'border-gray-200 dark:border-gray-700'
}

function healthDot(health) {
  return { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' }[health] || 'bg-gray-400'
}

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
    <div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Org Heatmap</h1>
      <p v-if="currentPeriod" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {{ formatPeriod(currentPeriod.periodStart, currentPeriod.periodEnd) }}
        <span v-if="heatmap && heatmap.vp" class="ml-2">&middot; VP: {{ heatmap.vp.name }}</span>
      </p>
    </div>

    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading heatmap...
    </div>

    <template v-else-if="heatmap">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="org in sortedOrgs"
          :key="org.orgRoot"
          class="rounded-lg border-2 p-4 cursor-pointer hover:shadow-md transition-shadow"
          :class="healthStyles(org.health)"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full" :class="healthDot(org.health)" />
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ org.displayName }}</h3>
            </div>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ org.total }} people</span>
          </div>

          <div class="grid grid-cols-3 gap-2 mb-3">
            <div class="text-center">
              <div class="text-lg font-bold text-green-600 dark:text-green-400">{{ org.sentiment.green }}</div>
              <div class="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Green</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-bold text-yellow-600 dark:text-yellow-400">{{ org.sentiment.yellow }}</div>
              <div class="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Yellow</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-bold text-red-600 dark:text-red-400">{{ org.sentiment.red }}</div>
              <div class="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Red</div>
            </div>
          </div>

          <!-- Submission bar -->
          <div class="mb-2">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="text-gray-500 dark:text-gray-400">Submission</span>
              <span class="font-medium" :class="org.submissionRate < 60 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'">
                {{ org.submissionRate }}%
              </span>
            </div>
            <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="org.submissionRate >= 80 ? 'bg-green-500' : org.submissionRate >= 60 ? 'bg-yellow-500' : 'bg-red-500'"
                :style="{ width: org.submissionRate + '%' }"
              />
            </div>
          </div>

          <div v-if="org.blockerCount > 0" class="text-xs text-red-600 dark:text-red-400 font-medium">
            {{ org.blockerCount }} unresolved blocker{{ org.blockerCount !== 1 ? 's' : '' }}
          </div>

          <!-- Commentary preview -->
          <div v-if="org.commentary" class="mt-2 p-2 bg-white/50 dark:bg-gray-900/30 rounded text-xs text-gray-600 dark:text-gray-400 italic">
            "{{ org.commentary.summary.slice(0, 120) }}{{ org.commentary.summary.length > 120 ? '...' : '' }}"
            <span class="text-gray-400 dark:text-gray-500 ml-1">— {{ org.commentary.authorName }}</span>
          </div>
        </div>
      </div>

      <div v-if="sortedOrgs.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
        No org data available. Ensure roster sync is configured with org roots.
      </div>
    </template>
  </div>
</template>
