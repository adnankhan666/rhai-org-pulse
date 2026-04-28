<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import SentimentBadge from '../components/SentimentBadge.vue'
import BlockerCard from '../components/BlockerCard.vue'
import TagInput from '../components/TagInput.vue'

var MODULE_API = '/modules/pulse-check'

var currentPeriod = ref(null)
var selectedTag = ref('')
var tagSearch = ref('')
var allTags = ref([])
var data = ref(null)
var loading = ref(false)
var error = ref(null)

var pinnedTags = computed(function() {
  return allTags.value.filter(function(t) { return t.pinned })
})

var recentTags = computed(function() {
  return allTags.value.filter(function(t) { return !t.pinned }).slice(0, 8)
})

async function loadTags() {
  try {
    var resp = await apiRequest(MODULE_API + '/tags')
    var pinned = (resp.pinnedTags || []).map(function(t) { return { tag: t, pinned: true, count: 0 } })
    var recent = (resp.recentTags || []).filter(function(r) {
      return !resp.pinnedTags || resp.pinnedTags.indexOf(r.tag) < 0
    })
    allTags.value = pinned.concat(recent)
  } catch { /* ignore */ }
}

async function loadInitiativeData() {
  if (!selectedTag.value || !currentPeriod.value) return
  loading.value = true
  error.value = null
  try {
    data.value = await apiRequest(
      MODULE_API + '/aggregate/' + currentPeriod.value.periodEnd +
      '?axis=tag&value=' + encodeURIComponent(selectedTag.value)
    )
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function selectTag(tag) {
  selectedTag.value = tag
  tagSearch.value = ''
}

watch(selectedTag, loadInitiativeData)

onMounted(async function() {
  try {
    currentPeriod.value = await apiRequest(MODULE_API + '/periods/current')
  } catch { /* ignore */ }
  await loadTags()
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
    <div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Initiative Board</h1>
      <p v-if="currentPeriod" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Cross-team status by initiative tag &middot;
        {{ formatPeriod(currentPeriod.periodStart, currentPeriod.periodEnd) }}
      </p>
    </div>

    <!-- Tag selector -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Select Initiative</h2>

      <TagInput v-model="tagSearch" @select="selectTag" />

      <!-- Quick select pills -->
      <div v-if="allTags.length > 0" class="flex flex-wrap gap-2 mt-3">
        <button
          v-for="t in pinnedTags.concat(recentTags)"
          :key="t.tag"
          class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
          :class="selectedTag === t.tag
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
          @click="selectTag(t.tag)"
        >
          {{ t.tag }}
          <span v-if="t.pinned" class="ml-0.5 opacity-60">*</span>
          <span v-if="t.count" class="ml-1 opacity-50">{{ t.count }}</span>
        </button>
      </div>

      <div v-if="allTags.length === 0" class="text-sm text-gray-400 dark:text-gray-500 mt-3">
        No initiative tags found yet. Engineers can add tags when submitting their weekly update.
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading initiative data...
    </div>

    <!-- No tag selected -->
    <div v-if="!selectedTag && !loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Select an initiative tag above to see cross-team updates.
    </div>

    <!-- Results -->
    <template v-if="data && !loading">
      <!-- Summary -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
            <span class="px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-400 text-xs font-medium mr-2">{{ selectedTag }}</span>
            {{ data.submitted }} update{{ data.submitted !== 1 ? 's' : '' }} from {{ data.total }} people
          </h2>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center p-2 rounded-lg bg-green-50 dark:bg-green-500/10">
            <div class="text-lg font-bold text-green-600 dark:text-green-400">{{ data.sentiment.green }}</div>
            <div class="text-[10px] text-green-600 dark:text-green-400 uppercase">On Track</div>
          </div>
          <div class="text-center p-2 rounded-lg bg-yellow-50 dark:bg-yellow-500/10">
            <div class="text-lg font-bold text-yellow-600 dark:text-yellow-400">{{ data.sentiment.yellow }}</div>
            <div class="text-[10px] text-yellow-600 dark:text-yellow-400 uppercase">At Risk</div>
          </div>
          <div class="text-center p-2 rounded-lg bg-red-50 dark:bg-red-500/10">
            <div class="text-lg font-bold text-red-600 dark:text-red-400">{{ data.sentiment.red }}</div>
            <div class="text-[10px] text-red-600 dark:text-red-400 uppercase">Blocked</div>
          </div>
        </div>
      </div>

      <!-- Cross-team blockers -->
      <div v-if="data.unresolvedBlockers && data.unresolvedBlockers.length > 0">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Cross-Team Blockers ({{ data.unresolvedBlockers.length }})
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

      <!-- Grouped by team -->
      <div v-if="data.groups && data.groups.length > 0">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">By Team</h2>
        <div class="space-y-3">
          <div
            v-for="g in data.groups"
            :key="g.team"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ g.team }}</h3>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ g.submitted }}/{{ g.total }} submitted</span>
            </div>
            <div class="flex gap-3 text-xs">
              <span v-if="g.sentiment.green" class="text-green-600 dark:text-green-400 font-medium">{{ g.sentiment.green }} on track</span>
              <span v-if="g.sentiment.yellow" class="text-yellow-600 dark:text-yellow-400 font-medium">{{ g.sentiment.yellow }} at risk</span>
              <span v-if="g.sentiment.red" class="text-red-600 dark:text-red-400 font-medium">{{ g.sentiment.red }} blocked</span>
            </div>
            <div v-if="g.missing.length > 0" class="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Missing: {{ g.missing.map(function(m) { return m.name }).join(', ') }}
            </div>
          </div>
        </div>
      </div>

      <!-- Full updates if available -->
      <div v-if="data.updates && data.updates.length > 0">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Individual Updates</h2>
        <div class="space-y-3">
          <div
            v-for="u in data.updates"
            :key="u.uid"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div class="flex items-center gap-2 mb-2">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ u.personName }}</h3>
              <SentimentBadge :sentiment="u.sentiment" size="sm" />
            </div>
            <div v-if="u.highlights && u.highlights.length > 0" class="mb-1">
              <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                <li v-for="(h, idx) in u.highlights" :key="idx">{{ h.text || h }}</li>
              </ul>
            </div>
            <div v-if="u.blockers && u.blockers.filter(function(b) { return !b.resolved }).length > 0" class="mt-1">
              <ul class="list-disc list-inside text-sm text-red-600 dark:text-red-400 space-y-0.5">
                <li v-for="(b, idx) in u.blockers.filter(function(b) { return !b.resolved })" :key="idx">
                  [{{ b.severity || 'medium' }}] {{ b.text }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
