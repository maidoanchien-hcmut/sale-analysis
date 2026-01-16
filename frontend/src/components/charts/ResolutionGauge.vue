<script setup lang="ts">
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps<{
  resolved: number
  total: number
}>()

const rate = computed(() => {
  if (props.total === 0) return 0
  return Math.round((props.resolved / props.total) * 100)
})

const chartData = computed(() => ({
  labels: ['Resolved', 'Unresolved'],
  datasets: [
    {
      data: [props.resolved, props.total - props.resolved],
      backgroundColor: ['#22c55e', '#e5e7eb'],
      borderWidth: 0,
      cutout: '75%',
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const label = context.label || ''
          const value = context.raw || 0
          return `${label}: ${value} tickets`
        },
      },
    },
  },
}

const rateColor = computed(() => {
  if (rate.value >= 80) return 'text-green-500'
  if (rate.value >= 60) return 'text-yellow-500'
  return 'text-red-500'
})
</script>

<template>
  <div class="relative h-full w-full flex items-center justify-center">
    <Doughnut :data="chartData" :options="chartOptions" />
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span :class="['text-4xl font-bold', rateColor]">{{ rate }}%</span>
      <span class="text-sm text-gray-500">Resolution Rate</span>
    </div>
  </div>
</template>
