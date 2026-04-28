<script setup>
defineProps({
  blocker: { type: Object, required: true },
  personName: { type: String, default: null },
  readonly: { type: Boolean, default: false }
})

defineEmits(['toggle-resolved', 'remove'])

var severityStyles = {
  high: 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/5',
  medium: 'border-yellow-300 dark:border-yellow-500/40 bg-yellow-50 dark:bg-yellow-500/5',
  low: 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800',
}
</script>

<template>
  <div
    class="rounded-lg border p-3 text-sm"
    :class="[
      severityStyles[blocker.severity || 'medium'],
      blocker.resolved ? 'opacity-60' : ''
    ]"
  >
    <div class="flex items-start gap-2">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span
            class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
            :class="{
              'bg-red-200 dark:bg-red-500/20 text-red-700 dark:text-red-400': blocker.severity === 'high',
              'bg-yellow-200 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400': blocker.severity === 'medium' || !blocker.severity,
              'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400': blocker.severity === 'low'
            }"
          >{{ blocker.severity || 'medium' }}</span>
          <span v-if="blocker.resolved" class="text-[10px] text-green-600 dark:text-green-400 font-medium">Resolved</span>
          <span v-if="personName" class="text-[10px] text-gray-500 dark:text-gray-400">{{ personName }}</span>
        </div>
        <p class="text-gray-900 dark:text-gray-100" :class="{ 'line-through': blocker.resolved }">
          {{ blocker.text }}
        </p>
      </div>
      <div v-if="!readonly" class="flex items-center gap-1 flex-shrink-0">
        <button
          class="p-1 text-gray-400 hover:text-green-600 dark:hover:text-green-400"
          :title="blocker.resolved ? 'Mark unresolved' : 'Mark resolved'"
          @click="$emit('toggle-resolved')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
        </button>
        <button
          class="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          title="Remove"
          @click="$emit('remove')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>
