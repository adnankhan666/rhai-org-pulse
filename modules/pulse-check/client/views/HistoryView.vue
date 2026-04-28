<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useAuth } from '@shared/client/composables/useAuth'
import SentimentBadge from '../components/SentimentBadge.vue'

var MODULE_API = '/modules/pulse-check'
var nav = inject('moduleNav')
var { user } = useAuth()

var personUid = ref(null)
var personName = ref('')
var historyData = ref(null)
var loading = ref(false)
var error = ref(null)

var sentimentTimeline = computed(function() {
  if (!historyData.value) return []
  return historyData.value.periods.map(function(p) {
    return {
      periodEnd: p.periodEnd,
      sentiment: p.sentiment,
      submitted: p.submitted,
      blockerCount: p.blockerCount,
      highlightCount: p.highlightCount
    }
  })
})

var shifts = computed(function() {
  if (!historyData.value) return []
  return historyData.value.shifts || []
})

async function loadHistory() {
  if (!personUid.value) return
  loading.value = true
  error.value = null
  try {
    historyData.value = await apiRequest(
      MODULE_API + '/person/' + encodeURIComponent(personUid.value) + '/history?periods=12'
    )
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(async function() {
  // Default to current user; allow override via params
  var params = nav.params.value || {}
  if (params.uid) {
    personUid.value = params.uid
    personName.value = params.name || params.uid
  } else if (user.value) {
    try {
      var registryResp = await apiRequest('/modules/team-tracker/registry/people?status=active')
      if (registryResp && registryResp.people) {
        for (var i = 0; i < registryResp.people.length; i++) {
          if (registryResp.people[i].email === user.value.email) {
            personUid.value = registryResp.people[i].uid
            personName.value = registryResp.people[i].name
            break
          }
        }
      }
    } catch { /* ignore */ }
  }
  if (personUid.value) await loadHistory()
})

function sentimentColor(s) {
  return {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  }[s] || 'bg-gray-300 dark:bg-gray-600'
}

function formatWeek(periodEnd) {
  var d = new Date(periodEnd + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">
        History{{ personName ? ': ' + personName : '' }}
      </h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Weekly sentiment and activity over the past 12 weeks
      </p>
    </div>

    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading history...
    </div>

    <template v-else-if="historyData">
      <!-- Sentiment Timeline -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Sentiment Timeline</h2>
        <div class="flex items-end gap-1">
          <div
            v-for="p in sentimentTimeline"
            :key="p.periodEnd"
            class="flex-1 flex flex-col items-center gap-1"
          >
            <div
              class="w-full rounded-t-sm transition-all"
              :class="p.submitted ? sentimentColor(p.sentiment) : 'bg-gray-200 dark:bg-gray-700'"
              :style="{ height: p.submitted ? '32px' : '8px' }"
              :title="p.periodEnd + (p.sentiment ? ' — ' + p.sentiment : ' — not submitted')"
            />
            <span class="text-[9px] text-gray-400 dark:text-gray-500 leading-none">
              {{ formatWeek(p.periodEnd) }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-4 mt-3 text-[10px] text-gray-500 dark:text-gray-400">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500" /> On Track</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-yellow-500" /> At Risk</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500" /> Blocked</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" /> Not submitted</span>
        </div>
      </div>

      <!-- Shifts -->
      <div v-if="shifts.length > 0" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Sentiment Shifts</h2>
        <div class="space-y-2">
          <div
            v-for="(s, idx) in shifts"
            :key="idx"
            class="flex items-center gap-2 text-sm"
          >
            <span class="text-xs text-gray-400 dark:text-gray-500 w-20">{{ formatWeek(s.periodEnd) }}</span>
            <span v-if="s.direction === 'down'" class="text-red-600 dark:text-red-400 font-medium">↓ Declined</span>
            <span v-else class="text-green-600 dark:text-green-400 font-medium">↑ Improved</span>
          </div>
        </div>
      </div>

      <!-- Weekly Detail -->
      <div>
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Week by Week</h2>
        <div class="space-y-2">
          <div
            v-for="p in [...sentimentTimeline].reverse()"
            :key="p.periodEnd"
            class="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
          >
            <span class="text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">{{ formatWeek(p.periodEnd) }}</span>
            <SentimentBadge v-if="p.submitted" :sentiment="p.sentiment" size="sm" />
            <span v-else class="text-xs text-gray-400 dark:text-gray-500 italic">Not submitted</span>
            <span v-if="p.highlightCount" class="text-xs text-gray-500 dark:text-gray-400">{{ p.highlightCount }} highlights</span>
            <span v-if="p.blockerCount" class="text-xs text-red-600 dark:text-red-400 font-medium">{{ p.blockerCount }} blocker{{ p.blockerCount !== 1 ? 's' : '' }}</span>
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="!loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      No history data available.
    </div>
  </div>
</template>
