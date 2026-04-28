<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiRequest } from '@shared/client/services/api'

var props = defineProps({
  modelValue: { type: String, default: '' }
})

var emit = defineEmits(['update:modelValue', 'select'])

var suggestions = ref([])
var showSuggestions = ref(false)

var filtered = computed(function() {
  var q = props.modelValue.toLowerCase().trim()
  if (!q) return suggestions.value.slice(0, 10)
  return suggestions.value.filter(function(s) {
    return s.tag.toLowerCase().includes(q)
  }).slice(0, 10)
})

async function loadTags() {
  try {
    var data = await apiRequest('/modules/pulse-check/tags')
    var pinned = (data.pinnedTags || []).map(function(t) { return { tag: t, pinned: true, count: 0 } })
    var recent = (data.recentTags || []).filter(function(r) {
      return !data.pinnedTags || data.pinnedTags.indexOf(r.tag) < 0
    })
    suggestions.value = pinned.concat(recent)
  } catch { /* ignore */ }
}

function handleSelect(tag) {
  emit('select', tag)
  emit('update:modelValue', '')
  showSuggestions.value = false
}

function handleFocus() {
  showSuggestions.value = true
}

function handleBlur() {
  setTimeout(function() { showSuggestions.value = false }, 200)
}

onMounted(loadTags)
</script>

<template>
  <div class="relative">
    <input
      :value="modelValue"
      type="text"
      placeholder="Search initiatives..."
      class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
      @input="$emit('update:modelValue', $event.target.value)"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown.enter.prevent="filtered.length > 0 && handleSelect(filtered[0].tag)"
    />
    <div
      v-if="showSuggestions && filtered.length > 0"
      class="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1"
    >
      <button
        v-for="s in filtered"
        :key="s.tag"
        class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"
        @mousedown.prevent="handleSelect(s.tag)"
      >
        <span class="text-gray-900 dark:text-gray-100">
          {{ s.tag }}
          <span v-if="s.pinned" class="text-[10px] text-primary-600 dark:text-primary-400 ml-1">pinned</span>
        </span>
        <span v-if="s.count" class="text-xs text-gray-400">{{ s.count }}</span>
      </button>
    </div>
  </div>
</template>
