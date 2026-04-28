<script setup>
import { ref, onMounted } from 'vue'
import { apiRequest } from '@shared/client/services/api'

var MODULE_API = '/modules/pulse-check'

var props = defineProps({
  periodEnd: { type: String, required: true },
  axis: { type: String, required: true },
  value: { type: String, required: true }
})

var emit = defineEmits(['saved'])

var summary = ref('')
var highlights = ref([])
var risks = ref([])
var saving = ref(false)
var saved = ref(false)
var newHighlight = ref('')
var newRisk = ref('')

onMounted(async function() {
  try {
    var data = await apiRequest(
      MODULE_API + '/commentary/' + props.periodEnd +
      '?axis=' + encodeURIComponent(props.axis) +
      '&value=' + encodeURIComponent(props.value)
    )
    if (data) {
      summary.value = data.summary || ''
      highlights.value = data.highlights || []
      risks.value = data.risks || []
    }
  } catch { /* no existing commentary */ }
})

function addHighlight() {
  var text = newHighlight.value.trim()
  if (!text) return
  highlights.value.push(text)
  newHighlight.value = ''
}

function addRisk() {
  var text = newRisk.value.trim()
  if (!text) return
  risks.value.push(text)
  newRisk.value = ''
}

async function save() {
  saving.value = true
  saved.value = false
  try {
    await apiRequest(MODULE_API + '/commentary/' + props.periodEnd, {
      method: 'PUT',
      body: {
        axis: props.axis,
        value: props.value,
        summary: summary.value,
        highlights: highlights.value,
        risks: risks.value
      }
    })
    saved.value = true
    emit('saved')
    setTimeout(function() { saved.value = false }, 3000)
  } catch { /* ignore */ }
  finally { saving.value = false }
}
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-primary-200 dark:border-primary-500/30 p-4">
    <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Your Summary (optional)</h3>
    <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
      When present, your summary replaces the auto-generated stats at the next level up.
    </p>

    <textarea
      v-model="summary"
      rows="3"
      placeholder="Your synthesis — what's the overall picture?"
      class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none mb-3"
    />

    <div class="grid grid-cols-2 gap-3 mb-3">
      <div>
        <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Highlights</div>
        <div class="space-y-1 mb-2">
          <div v-for="(h, idx) in highlights" :key="idx" class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
            <span class="flex-1">{{ h }}</span>
            <button class="text-gray-400 hover:text-red-500" @click="highlights.splice(idx, 1)">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div class="flex gap-1">
          <input v-model="newHighlight" type="text" placeholder="Add highlight" class="flex-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-gray-100" @keydown.enter="addHighlight" />
          <button class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded" @click="addHighlight">+</button>
        </div>
      </div>
      <div>
        <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Risks</div>
        <div class="space-y-1 mb-2">
          <div v-for="(r, idx) in risks" :key="idx" class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
            <span class="flex-1">{{ r }}</span>
            <button class="text-gray-400 hover:text-red-500" @click="risks.splice(idx, 1)">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div class="flex gap-1">
          <input v-model="newRisk" type="text" placeholder="Add risk" class="flex-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-gray-100" @keydown.enter="addRisk" />
          <button class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded" @click="addRisk">+</button>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <button
        class="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? 'Saving...' : 'Save Summary' }}
      </button>
      <span v-if="saved" class="text-xs text-green-600 dark:text-green-400">Saved</span>
    </div>
  </div>
</template>
