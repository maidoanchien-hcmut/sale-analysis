<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  title: string
  description?: string
  class?: string
}>()
</script>

<template>
  <div :class="cn('rounded-xl border bg-white p-6 shadow-sm', $props.class)">
    <div class="mb-4">
      <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
      <p v-if="description" class="text-sm text-gray-500">{{ description }}</p>
    </div>
    <div class="h-full">
      <slot />
    </div>
  </div>
</template>
