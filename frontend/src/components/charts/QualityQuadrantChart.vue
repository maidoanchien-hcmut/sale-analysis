<script setup lang="ts">
import { computed } from 'vue'
import { Scatter } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(LinearScale, PointElement, Tooltip, Legend)

interface StaffPoint {
  staff_id: string
  staff_name: string
  total_tickets: number
  resolution_rate: number
  avg_sentiment_score: number
}

const props = defineProps<{
  data: StaffPoint[]
}>()

const chartData = computed(() => {
  // Categorize staff into quadrants
  const avgVolume = props.data.reduce((sum, s) => sum + s.total_tickets, 0) / (props.data.length || 1)
  const avgQuality = 50 // Use 50% as midpoint

  const stars: { x: number; y: number; label: string }[] = []
  const workhorses: { x: number; y: number; label: string }[] = []
  const learners: { x: number; y: number; label: string }[] = []
  const needsAttention: { x: number; y: number; label: string }[] = []

  for (const staff of props.data) {
    const point = {
      x: staff.total_tickets,
      y: staff.resolution_rate,
      label: staff.staff_name
    }

    const highVolume = staff.total_tickets >= avgVolume
    const highQuality = staff.resolution_rate >= avgQuality

    if (highVolume && highQuality) stars.push(point)
    else if (highVolume && !highQuality) needsAttention.push(point)
    else if (!highVolume && highQuality) learners.push(point)
    else workhorses.push(point)
  }

  return {
    datasets: [
      {
        label: '⭐ Stars (High Vol, High Quality)',
        data: stars,
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        pointRadius: 10,
        pointHoverRadius: 12,
      },
      {
        label: '📈 Growing (Low Vol, High Quality)',
        data: learners,
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        pointRadius: 10,
        pointHoverRadius: 12,
      },
      {
        label: '⚠️ Needs Attention (High Vol, Low Quality)',
        data: needsAttention,
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        pointRadius: 10,
        pointHoverRadius: 12,
      },
      {
        label: '🔄 Developing (Low Vol, Low Quality)',
        data: workhorses,
        backgroundColor: 'rgba(156, 163, 175, 0.7)',
        pointRadius: 10,
        pointHoverRadius: 12,
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        usePointStyle: true,
        padding: 15
      }
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const point = context.raw as { x: number; y: number; label: string }
          return `${point.label}: ${point.x} tickets, ${point.y}% resolution`
        }
      }
    }
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Volume (Tickets Handled)'
      },
      beginAtZero: true
    },
    y: {
      title: {
        display: true,
        text: 'Quality (Resolution Rate %)'
      },
      min: 0,
      max: 100
    }
  }
}

const hasData = computed(() => props.data.length > 0)
</script>

<template>
  <div class="h-full">
    <Scatter v-if="hasData" :data="chartData" :options="chartOptions" />
    <div v-else class="flex h-full items-center justify-center text-gray-400">
      No staff performance data available
    </div>
  </div>
</template>
