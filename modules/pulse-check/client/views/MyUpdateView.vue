<script setup>
import { ref, watch, onMounted } from 'vue'
import { usePulseCheck } from '../composables/usePulseCheck'
import SentimentBadge from '../components/SentimentBadge.vue'
import BlockerCard from '../components/BlockerCard.vue'

const { currentPeriod, myUpdate, loading, saving, error, loadCurrentPeriod, loadMyUpdate, saveMyUpdate } = usePulseCheck()

const highlights = ref([])
const blockers = ref([])
const plans = ref([])
const sentiment = ref(null)
const tags = ref([])
const notes = ref('')
const saveSuccess = ref(false)

const newHighlight = ref('')
const newBlockerText = ref('')
const newBlockerSeverity = ref('medium')
const newPlan = ref('')
const newTag = ref('')

function populateFromUpdate(update) {
  if (!update) return
  highlights.value = (update.highlights || []).map(function(h) {
    return typeof h === 'string' ? { text: h } : { ...h }
  })
  blockers.value = (update.blockers || []).map(function(b) { return { ...b } })
  plans.value = (update.plans || []).map(function(p) {
    return typeof p === 'string' ? { text: p } : { ...p }
  })
  sentiment.value = update.sentiment
  tags.value = update.tags || []
  notes.value = update.notes || ''
}

watch(myUpdate, function(val) { populateFromUpdate(val) })

onMounted(async function() {
  await loadCurrentPeriod()
  if (currentPeriod.value) {
    await loadMyUpdate(currentPeriod.value.periodEnd)
  }
})

function addHighlight() {
  var text = newHighlight.value.trim()
  if (!text) return
  highlights.value.push({ text: text })
  newHighlight.value = ''
}

function removeHighlight(index) {
  highlights.value.splice(index, 1)
}

function addBlocker() {
  var text = newBlockerText.value.trim()
  if (!text) return
  blockers.value.push({ text: text, severity: newBlockerSeverity.value, resolved: false })
  newBlockerText.value = ''
  newBlockerSeverity.value = 'medium'
}

function removeBlocker(index) {
  blockers.value.splice(index, 1)
}

function toggleBlockerResolved(index) {
  blockers.value[index].resolved = !blockers.value[index].resolved
}

function addPlan() {
  var text = newPlan.value.trim()
  if (!text) return
  plans.value.push({ text: text })
  newPlan.value = ''
}

function removePlan(index) {
  plans.value.splice(index, 1)
}

function addTag() {
  var text = newTag.value.trim().toLowerCase()
  if (!text || tags.value.includes(text)) return
  tags.value.push(text)
  newTag.value = ''
}

function removeTag(index) {
  tags.value.splice(index, 1)
}

async function handleSave() {
  if (!currentPeriod.value) return
  saveSuccess.value = false
  var ok = await saveMyUpdate(currentPeriod.value.periodEnd, {
    highlights: highlights.value,
    blockers: blockers.value,
    plans: plans.value,
    sentiment: sentiment.value,
    tags: tags.value,
    notes: notes.value
  })
  if (ok) {
    saveSuccess.value = true
    setTimeout(function() { saveSuccess.value = false }, 3000)
  }
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
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">My Weekly Update</h1>
        <p v-if="currentPeriod" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ formatPeriod(currentPeriod.periodStart, currentPeriod.periodEnd) }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="myUpdate?.status === 'submitted'" class="text-xs text-green-600 dark:text-green-400 font-medium">
          Submitted
        </span>
        <button
          class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          :disabled="saving || !sentiment"
          @click="handleSave"
        >
          {{ saving ? 'Saving...' : (myUpdate?.status === 'submitted' ? 'Update' : 'Submit') }}
        </button>
      </div>
    </div>

    <!-- Save success -->
    <div v-if="saveSuccess" class="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg p-3 text-green-700 dark:text-green-400 text-sm">
      Update saved successfully.
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading your update...
    </div>

    <template v-else-if="myUpdate">
      <!-- Auto-metrics -->
      <div v-if="myUpdate.autoMetrics" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Your Activity This Week</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {{ myUpdate.autoMetrics.jira?.resolvedCount ?? '—' }}
            </div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 uppercase tracking-wide">Jira Resolved</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {{ myUpdate.autoMetrics.jira?.storyPoints ?? '—' }}
            </div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 uppercase tracking-wide">Story Points</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {{ myUpdate.autoMetrics.github?.contributions ?? '—' }}
            </div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 uppercase tracking-wide">GitHub</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {{ myUpdate.autoMetrics.gitlab?.contributions ?? '—' }}
            </div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 uppercase tracking-wide">GitLab</div>
          </div>
        </div>
      </div>

      <!-- Sentiment Picker -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">How are things going? <span class="text-red-500">*</span></h2>
        <div class="flex gap-3">
          <button
            v-for="s in ['green', 'yellow', 'red']"
            :key="s"
            class="flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all"
            :class="{
              'border-green-500 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-2 ring-green-500/30': s === 'green' && sentiment === s,
              'border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 ring-2 ring-yellow-500/30': s === 'yellow' && sentiment === s,
              'border-red-500 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-2 ring-red-500/30': s === 'red' && sentiment === s,
              'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-600 dark:text-gray-400': sentiment !== s
            }"
            @click="sentiment = s"
          >
            <SentimentBadge :sentiment="s" />
          </button>
        </div>
      </div>

      <!-- Highlights -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Highlights</h2>
        <div class="space-y-2 mb-3">
          <div
            v-for="(h, idx) in highlights"
            :key="idx"
            class="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <span class="flex-1">{{ h.text }}</span>
            <button class="text-gray-400 hover:text-red-500" @click="removeHighlight(idx)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newHighlight"
            type="text"
            placeholder="What went well this week?"
            class="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            @keydown.enter="addHighlight"
          />
          <button class="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg" @click="addHighlight">Add</button>
        </div>
      </div>

      <!-- Blockers -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Blockers</h2>
        <div class="space-y-2 mb-3">
          <BlockerCard
            v-for="(b, idx) in blockers"
            :key="idx"
            :blocker="b"
            @toggle-resolved="toggleBlockerResolved(idx)"
            @remove="removeBlocker(idx)"
          />
        </div>
        <div class="flex gap-2">
          <input
            v-model="newBlockerText"
            type="text"
            placeholder="What's blocking you?"
            class="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            @keydown.enter="addBlocker"
          />
          <select
            v-model="newBlockerSeverity"
            class="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button class="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg" @click="addBlocker">Add</button>
        </div>
      </div>

      <!-- Plans -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Plans for Next Week</h2>
        <div class="space-y-2 mb-3">
          <div
            v-for="(p, idx) in plans"
            :key="idx"
            class="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <span class="flex-1">{{ p.text }}</span>
            <button class="text-gray-400 hover:text-red-500" @click="removePlan(idx)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newPlan"
            type="text"
            placeholder="What will you work on next week?"
            class="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            @keydown.enter="addPlan"
          />
          <button class="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg" @click="addPlan">Add</button>
        </div>
      </div>

      <!-- Tags -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Initiative Tags</h2>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">Tag initiatives you're working on for cross-team visibility</p>
        <div class="flex flex-wrap gap-2 mb-3">
          <span
            v-for="(t, idx) in tags"
            :key="t"
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-400"
          >
            {{ t }}
            <button class="hover:text-red-500" @click="removeTag(idx)">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </span>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newTag"
            type="text"
            placeholder="e.g. auth-migration, k8s-upgrade"
            class="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            @keydown.enter="addTag"
          />
          <button class="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg" @click="addTag">Add</button>
        </div>
      </div>

      <!-- Notes -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Notes</h2>
        <textarea
          v-model="notes"
          rows="3"
          placeholder="Anything else to share? (optional)"
          class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
        />
      </div>
    </template>
  </div>
</template>
