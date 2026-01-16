<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = defineProps<{
  tabs: { id: string; label: string }[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="flex space-x-1 rounded-lg bg-gray-100 p-1">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      @click="emit('update:modelValue', tab.id)"
      :class="cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        modelValue === tab.id
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'
      )"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
