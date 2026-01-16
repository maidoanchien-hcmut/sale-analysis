<script setup lang="ts">
import { computed } from 'vue'
import { Radar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const props = defineProps<{
  data: Record<string, Record<string, number>>
}>()

const attitudeLabels: Record<string, string> = {
  enthusiastic: 'Enthusiastic',
  professional: 'Professional',
  mechanical: 'Mechanical',
  pushy: 'Pushy',
  rude: 'Rude'
}

const attitudes = ['enthusiastic', 'professional', 'mechanical', 'pushy', 'rude']

const chartData = computed(() => ({
  labels: attitudes.map(a => attitudeLabels[a]),
  datasets: [
    {
      label: 'This Month',
      data: attitudes.map(a => props.data.thisMonth?.[a] || 0),
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
      borderColor: 'rgb(59, 130, 246)',
      borderWidth: 2,
      pointBackgroundColor: 'rgb(59, 130, 246)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgb(59, 130, 246)'
    },
    {
      label: 'Last Month',
      data: attitudes.map(a => props.data.lastMonth?.[a] || 0),
      backgroundColor: 'rgba(156, 163, 175, 0.2)',
      borderColor: 'rgb(156, 163, 175)',
      borderWidth: 2,
      pointBackgroundColor: 'rgb(156, 163, 175)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgb(156, 163, 175)'
    }
  ]
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
    }
  },
  scales: {
    r: {
      beginAtZero: true,
      ticks: {
        stepSize: 1
      }
    }
  }
}

const hasData = computed(() => {
  const thisMonth = Object.values(props.data.thisMonth || {}).reduce((a, b) => a + b, 0)
  const lastMonth = Object.values(props.data.lastMonth || {}).reduce((a, b) => a + b, 0)
  return thisMonth > 0 || lastMonth > 0
})
</script>

<template>
  <div class="h-full">
    <Radar v-if="hasData" :data="chartData" :options="chartOptions" />
    <div v-else class="flex h-full items-center justify-center text-gray-400">
      No attitude data available
    </div>
  </div>
</template>
