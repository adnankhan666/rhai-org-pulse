<script setup>
defineProps({
  sentiment: { type: String, default: null },
  size: { type: String, default: 'md' }
})

var config = {
  green: { label: 'On Track', bg: 'bg-green-100 dark:bg-green-500/15', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  yellow: { label: 'At Risk', bg: 'bg-yellow-100 dark:bg-yellow-500/15', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  red: { label: 'Blocked', bg: 'bg-red-100 dark:bg-red-500/15', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
}
</script>

<template>
  <span
    v-if="sentiment && config[sentiment]"
    class="inline-flex items-center gap-1.5 rounded-full font-medium"
    :class="[
      config[sentiment].bg,
      config[sentiment].text,
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
    ]"
  >
    <span class="w-2 h-2 rounded-full" :class="config[sentiment].dot" />
    {{ config[sentiment].label }}
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-full font-medium text-gray-400 dark:text-gray-500"
    :class="size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'"
  >
    Not set
  </span>
</template>
