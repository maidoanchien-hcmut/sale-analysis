<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const props = defineProps<{
  data: Record<string, number>
}>()

const riskLabels: Record<string, { label: string; color: string }> = {
  non_compliant: { label: 'Không tuân thủ training', color: '#ef4444' },
  unprofessional: { label: 'Thiếu chuyên nghiệp', color: '#8b5cf6' },
  missed_opportunity: { label: 'Bỏ lỡ cơ hội', color: '#3b82f6' },
}

const riskTypes = ['non_compliant', 'unprofessional', 'missed_opportunity']

const chartData = computed(() => ({
  labels: riskTypes.map(t => riskLabels[t]?.label || t),
  datasets: [{
    label: 'Risk Flags',
    data: riskTypes.map(t => props.data[t] || 0),
    backgroundColor: riskTypes.map(t => riskLabels[t]?.color || '#888'),
    borderWidth: 0,
    borderRadius: 4,
  }]
}))

const chartOptions = {
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      callbacks: {
        label: (context: any) => `${context.raw} flags`
      }
    }
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: {
        display: false
      }
    },
    y: {
      grid: {
        display: false
      }
    }
  }
}

const hasData = computed(() =>
  Object.values(props.data).reduce((a, b) => a + b, 0) > 0
)
</script>

<template>
  <div class="h-full">
    <Bar v-if="hasData" :data="chartData" :options="chartOptions" />
    <div v-else class="flex h-full items-center justify-center text-gray-400">
      Không có dữ liệu rủi ro
    </div>
  </div>
</template>
