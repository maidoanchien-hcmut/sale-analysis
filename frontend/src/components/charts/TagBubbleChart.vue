<script setup lang="ts">
import { computed } from 'vue'
import { Bubble } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(LinearScale, PointElement, Tooltip, Legend)

interface TagData {
  tag_id: string
  tag_name: string
  count: number
  avg_sentiment: number
}

const props = defineProps<{
  data: TagData[]
}>()

// Sentiment to color
function getSentimentColor(sentiment: number): string {
  // 0 = negative (red), 0.5 = neutral (yellow), 1 = positive (green)
  if (sentiment >= 0.65) return 'rgba(34, 197, 94, 0.7)' // green
  if (sentiment >= 0.45) return 'rgba(234, 179, 8, 0.7)' // yellow
  return 'rgba(239, 68, 68, 0.7)' // red
}

const chartData = computed(() => {
  const maxCount = Math.max(...props.data.map(t => t.count), 1)

  return {
    datasets: [{
      label: 'Tags',
      data: props.data.map((tag, index) => ({
        x: index + 1,
        y: Math.round(tag.avg_sentiment * 100),
        r: Math.max(8, (tag.count / maxCount) * 40), // Scale radius 8-40
        tag_name: tag.tag_name,
        count: tag.count
      })),
      backgroundColor: props.data.map(tag => getSentimentColor(tag.avg_sentiment)),
      borderColor: props.data.map(tag => getSentimentColor(tag.avg_sentiment).replace('0.7', '1')),
      borderWidth: 2,
    }]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const point = context.raw as { tag_name: string; count: number; y: number }
          return [
            `Tag: ${point.tag_name}`,
            `Conversations: ${point.count}`,
            `Sentiment: ${point.y}%`
          ]
        }
      }
    }
  },
  scales: {
    x: {
      display: false,
      min: 0,
      max: props.data.length + 2
    },
    y: {
      title: {
        display: true,
        text: 'Average Sentiment (%)'
      },
      min: 0,
      max: 100,
      ticks: {
        callback: (value: string | number) => `${value}%`
      }
    }
  }
}

const hasData = computed(() => props.data.length > 0)

// Legend items
const legendItems = computed(() => [
  { color: 'bg-green-500', label: 'Positive (≥65%)' },
  { color: 'bg-yellow-500', label: 'Neutral (45-65%)' },
  { color: 'bg-red-500', label: 'Negative (<45%)' }
])
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 min-h-0">
      <Bubble v-if="hasData" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-gray-400">
        No tag data available
      </div>
    </div>
    <!-- Custom Legend -->
    <div class="flex items-center justify-center gap-6 pt-4 text-xs">
      <div v-for="item in legendItems" :key="item.label" class="flex items-center gap-1.5">
        <div :class="['h-3 w-3 rounded-full', item.color]"></div>
        <span class="text-gray-600">{{ item.label }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <div class="h-2 w-2 rounded-full bg-gray-400"></div>
        <span class="text-gray-400">→</span>
        <div class="h-4 w-4 rounded-full bg-gray-400"></div>
        <span class="text-gray-600">Size = Volume</span>
      </div>
    </div>
  </div>
</template>
