<script setup>
import { ref, onMounted } from 'vue'
import { apiRequest } from '@shared/client/services/api'

var MODULE_API = '/modules/pulse-check'

var config = ref(null)
var loading = ref(false)
var saving = ref(false)
var saved = ref(false)
var error = ref(null)
var newTag = ref('')

async function loadConfig() {
  loading.value = true
  try {
    config.value = await apiRequest(MODULE_API + '/config')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  saved.value = false
  error.value = null
  try {
    config.value = await apiRequest(MODULE_API + '/config', {
      method: 'POST',
      body: config.value
    })
    saved.value = true
    setTimeout(function() { saved.value = false }, 3000)
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function addPinnedTag() {
  var tag = newTag.value.trim().toLowerCase()
  if (!tag || !config.value) return
  if (!config.value.pinnedTags) config.value.pinnedTags = []
  if (config.value.pinnedTags.indexOf(tag) < 0) {
    config.value.pinnedTags.push(tag)
  }
  newTag.value = ''
}

function removePinnedTag(idx) {
  config.value.pinnedTags.splice(idx, 1)
}

onMounted(loadConfig)
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="text-center py-8 text-gray-500 dark:text-gray-400">Loading settings...</div>

    <template v-else-if="config">
      <!-- Cadence -->
      <div>
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Cadence</h3>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" v-model="config.cadence" value="weekly" class="text-primary-600" /> Weekly
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" v-model="config.cadence" value="biweekly" class="text-primary-600" /> Biweekly
          </label>
        </div>
      </div>

      <!-- Deadline & Reminder -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Deadline Day</label>
          <select v-model="config.deadlineDay" class="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
            <option v-for="d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']" :key="d" :value="d">{{ d.charAt(0).toUpperCase() + d.slice(1) }}</option>
          </select>
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Reminder Day</label>
          <select v-model="config.reminderDay" class="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
            <option v-for="d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']" :key="d" :value="d">{{ d.charAt(0).toUpperCase() + d.slice(1) }}</option>
          </select>
        </div>
      </div>

      <!-- Pinned Tags -->
      <div>
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Pinned Initiative Tags</h3>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">These appear at the top of the tag autocomplete for all users.</p>
        <div class="flex flex-wrap gap-2 mb-2">
          <span
            v-for="(t, idx) in config.pinnedTags"
            :key="t"
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-400"
          >
            {{ t }}
            <button class="hover:text-red-500" @click="removePinnedTag(idx)">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </span>
        </div>
        <div class="flex gap-2">
          <input v-model="newTag" type="text" placeholder="Add pinned tag" class="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100" @keydown.enter="addPinnedTag" />
          <button class="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg" @click="addPinnedTag">Add</button>
        </div>
      </div>

      <!-- Thresholds -->
      <div>
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Thresholds</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Blocker age for escalation (weeks)</label>
            <input type="number" v-model.number="config.thresholds.blockerAgeWeeksForEscalation" min="1" max="12" class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Low submission rate threshold (%)</label>
            <input type="number" v-model.number="config.thresholds.lowSubmissionRatePercent" min="0" max="100" class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100" />
          </div>
        </div>
      </div>

      <!-- Save -->
      <div class="flex items-center gap-3">
        <button
          class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          :disabled="saving"
          @click="saveConfig"
        >
          {{ saving ? 'Saving...' : 'Save Settings' }}
        </button>
        <span v-if="saved" class="text-xs text-green-600 dark:text-green-400">Settings saved.</span>
      </div>
    </template>
  </div>
</template>
