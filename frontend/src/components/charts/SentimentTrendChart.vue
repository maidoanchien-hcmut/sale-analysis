<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import type { SentimentTrend } from '@/services/api'
import { format, parseISO } from 'date-fns'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps<{
  data: SentimentTrend[]
  period: 'day' | 'week' | 'month'
}>()

const chartData = computed(() => {
  const labels = props.data.map(d => {
    try {
      if (props.period === 'month') {
        const [year, month] = d.period.split('-')
        return `${month}/${year}`
      }
      const date = parseISO(d.period)
      return format(date, props.period === 'day' ? 'dd/MM' : 'dd/MM')
    } catch {
      return d.period
    }
  })

  return {
    labels,
    datasets: [
      {
        label: 'Positive',
        data: props.data.map(d => d.total > 0 ? Math.round((d.positive / d.total) * 100) : 0),
        backgroundColor: '#22c55e',
        borderRadius: 4,
      },
      {
        label: 'Neutral',
        data: props.data.map(d => d.total > 0 ? Math.round((d.neutral / d.total) * 100) : 0),
        backgroundColor: '#f59e0b',
        borderRadius: 4,
      },
      {
        label: 'Negative',
        data: props.data.map(d => d.total > 0 ? Math.round((d.negative / d.total) * 100) : 0),
        backgroundColor: '#ef4444',
        borderRadius: 4,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
    tooltip: {
      callbacks: {
        label: (context: any) => `${context.dataset.label}: ${context.raw}%`,
      },
    },
  },
  scales: {
    x: {
      stacked: true,
      grid: {
        display: false,
      },
    },
    y: {
      stacked: true,
      max: 100,
      ticks: {
        callback: (value: any) => `${value}%`,
      },
    },
  },
}
</script>

<template>
  <div class="h-full w-full">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>
