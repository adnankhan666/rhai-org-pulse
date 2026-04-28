<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '@shared/client/composables/useAuth'
import { apiRequest } from '@shared/client/services/api'
import SentimentBadge from '../components/SentimentBadge.vue'
import BlockerCard from '../components/BlockerCard.vue'

var MODULE_API = '/modules/pulse-check'

var { user } = useAuth()

var currentPeriod = ref(null)
var data = ref(null)
var loading = ref(false)
var error = ref(null)
var detailLevel = ref('summary')
var showCollapsed = ref(false)

var hasReports = computed(function() {
  return data.value && data.value.total > 0
})

var submissionRate = computed(function() {
  if (!data.value || !data.value.total) return 0
  return Math.round((data.value.submitted / data.value.total) * 100)
})

var expandedItems = computed(function() {
  if (!data.value) return []
  if (detailLevel.value === 'full') return data.value.ranked || []
  return data.value.expanded || []
})

var collapsedCount = computed(function() {
  if (!data.value) return 0
  if (detailLevel.value === 'full') return 0
  return data.value.collapsedCount || 0
})

async function loadData() {
  loading.value = true
  error.value = null
  try {
    currentPeriod.value = await apiRequest(MODULE_API + '/periods/current')

    if (!user.value) {
      error.value = 'Unable to determine your identity.'
      return
    }

    // Find our registry UID — use email to match
    var registryResp = await apiRequest('/modules/team-tracker/registry/people?status=active')
    var myPerson = null
    if (registryResp && registryResp.people) {
      for (var i = 0; i < registryResp.people.length; i++) {
        if (registryResp.people[i].email === user.value.email) {
          myPerson = registryResp.people[i]
          break
        }
      }
    }

    if (!myPerson) {
      error.value = 'Could not find your registry entry.'
      return
    }

    data.value = await apiRequest(
      MODULE_API + '/aggregate/' + currentPeriod.value.periodEnd +
      '?axis=management&value=' + encodeURIComponent(myPerson.uid) +
      '&detail=' + detailLevel.value
    )
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function toggleDetail() {
  detailLevel.value = detailLevel.value === 'full' ? 'summary' : 'full'
  loadData()
}

onMounted(function() { loadData() })

function formatPeriod(start, end) {
  if (!start || !end) return ''
  var s = new Date(start + 'T00:00:00Z')
  var e = new Date(end + 'T00:00:00Z')
  var opts = { month: 'short', day: 'numeric' }
  return s.toLocaleDateString('en-US', opts) + ' – ' + e.toLocaleDateString('en-US', opts)
}

function scoreLabel(score) {
  if (score >= 10) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">My Reports</h1>
        <p v-if="currentPeriod" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ formatPeriod(currentPeriod.periodStart, currentPeriod.periodEnd) }}
        </p>
      </div>
      <button
        v-if="data"
        class="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="toggleDetail"
      >
        {{ detailLevel === 'full' ? 'Compress View' : 'Show All Detail' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading reports...
    </div>

    <!-- No reports -->
    <div v-else-if="data && !hasReports" class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">You don't have any direct reports in the registry.</p>
      <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">This view shows updates from people whose managerUid points to you.</p>
    </div>

    <template v-else-if="data">
      <!-- Summary Stats -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ data.submitted }}/{{ data.total }}</div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 uppercase tracking-wide">Submitted</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-green-50 dark:bg-green-500/10">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ data.sentiment.green }}</div>
            <div class="text-[10px] text-green-600 dark:text-green-400 mt-0.5 uppercase tracking-wide">On Track</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-500/10">
            <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{{ data.sentiment.yellow }}</div>
            <div class="text-[10px] text-yellow-600 dark:text-yellow-400 mt-0.5 uppercase tracking-wide">At Risk</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-red-50 dark:bg-red-500/10">
            <div class="text-2xl font-bold text-red-600 dark:text-red-400">{{ data.sentiment.red }}</div>
            <div class="text-[10px] text-red-600 dark:text-red-400 mt-0.5 uppercase tracking-wide">Blocked</div>
          </div>
          <div class="text-center p-3 rounded-lg" :class="submissionRate < 60 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-gray-50 dark:bg-gray-900/50'">
            <div class="text-2xl font-bold" :class="submissionRate < 60 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">{{ submissionRate }}%</div>
            <div class="text-[10px] mt-0.5 uppercase tracking-wide" :class="submissionRate < 60 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'">Response Rate</div>
          </div>
        </div>
      </div>

      <!-- Unresolved Blockers (always shown) -->
      <div v-if="data.unresolvedBlockers && data.unresolvedBlockers.length > 0">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Unresolved Blockers ({{ data.unresolvedBlockers.length }})
        </h2>
        <div class="space-y-2">
          <BlockerCard
            v-for="(b, idx) in data.unresolvedBlockers"
            :key="idx"
            :blocker="b"
            :person-name="b.person"
            :readonly="true"
          />
        </div>
      </div>

      <!-- Missing submissions (always shown) -->
      <div v-if="data.missing && data.missing.length > 0" class="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-2">Missing Submissions</h3>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="m in data.missing"
            :key="m.uid"
            class="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-200 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-300"
          >{{ m.name }}</span>
        </div>
      </div>

      <!-- Expanded items (scored and ranked) -->
      <div v-if="expandedItems.length > 0">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          {{ detailLevel === 'full' ? 'All Reports' : 'Needs Attention' }}
        </h2>
        <div class="space-y-3">
          <div
            v-for="item in expandedItems"
            :key="item.uid"
            class="bg-white dark:bg-gray-800 rounded-lg border p-4"
            :class="{
              'border-red-200 dark:border-red-500/30': scoreLabel(item.score) === 'high',
              'border-yellow-200 dark:border-yellow-500/30': scoreLabel(item.score) === 'medium',
              'border-gray-200 dark:border-gray-700': scoreLabel(item.score) === 'low'
            }"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ item.name }}</h3>
                <SentimentBadge v-if="item.update" :sentiment="item.update.sentiment" size="sm" />
                <span v-else class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">
                  Not submitted
                </span>
              </div>
              <span
                v-if="item.score > 0"
                class="text-[10px] font-medium px-2 py-0.5 rounded-full"
                :class="{
                  'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400': scoreLabel(item.score) === 'high',
                  'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400': scoreLabel(item.score) === 'medium',
                  'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400': scoreLabel(item.score) === 'low'
                }"
              >signal: {{ item.score }}</span>
            </div>

            <template v-if="item.update">
              <div v-if="item.update.highlights && item.update.highlights.length > 0" class="mb-2">
                <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Highlights</div>
                <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                  <li v-for="(h, idx) in item.update.highlights" :key="idx">{{ h.text || h }}</li>
                </ul>
              </div>
              <div v-if="item.update.blockers && item.update.blockers.length > 0" class="mb-2">
                <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Blockers</div>
                <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                  <li v-for="(b, idx) in item.update.blockers" :key="idx" :class="{ 'line-through opacity-60': b.resolved }">
                    <span class="text-[10px] font-semibold uppercase mr-1" :class="{
                      'text-red-600 dark:text-red-400': b.severity === 'high',
                      'text-yellow-600 dark:text-yellow-400': b.severity === 'medium',
                      'text-gray-500': b.severity === 'low'
                    }">[{{ b.severity || 'medium' }}]</span>
                    {{ b.text }}
                  </li>
                </ul>
              </div>
              <div v-if="item.update.plans && item.update.plans.length > 0">
                <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Next Week</div>
                <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                  <li v-for="(p, idx) in item.update.plans" :key="idx">{{ p.text || p }}</li>
                </ul>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Collapsed on-track count -->
      <div
        v-if="collapsedCount > 0 && !showCollapsed"
        class="bg-green-50 dark:bg-green-500/5 border border-green-200 dark:border-green-500/20 rounded-lg p-4 text-center cursor-pointer hover:bg-green-100 dark:hover:bg-green-500/10 transition-colors"
        @click="showCollapsed = true; detailLevel = 'full'; loadData()"
      >
        <span class="text-sm font-medium text-green-700 dark:text-green-400">
          {{ collapsedCount }} on track — click to expand
        </span>
      </div>
    </template>
  </div>
</template>
