<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { Component } from 'vue'

defineProps<{
  title: string
  value: string | number
  description?: string
  icon?: Component
  trend?: {
    value: number
    positive: boolean
  }
  class?: string
}>()
</script>

<template>
  <div :class="cn('rounded-xl border bg-white p-6 shadow-sm', $props.class)">
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium text-gray-500">{{ title }}</p>
      <component
        v-if="icon"
        :is="icon"
        class="h-5 w-5 text-gray-400"
      />
    </div>
    <div class="mt-2 flex items-baseline gap-2">
      <p class="text-3xl font-bold text-gray-900">{{ value }}</p>
      <span
        v-if="trend"
        :class="[
          'text-sm font-medium',
          trend.positive ? 'text-green-500' : 'text-red-500'
        ]"
      >
        {{ trend.positive ? '+' : '' }}{{ trend.value }}%
      </span>
    </div>
    <p v-if="description" class="mt-1 text-sm text-gray-500">
      {{ description }}
    </p>
  </div>
</template>
