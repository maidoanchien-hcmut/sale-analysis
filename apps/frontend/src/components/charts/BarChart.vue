<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import type { ChartDataPoint } from '@/types/warehouse';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const props = withDefaults(
  defineProps<{
    data: ChartDataPoint[];
    title?: string;
    horizontal?: boolean;
    color?: string;
    height?: number;
    showDataLabels?: boolean;
  }>(),
  {
    title: '',
    horizontal: false,
    color: '#3B82F6',
    height: 300,
    showDataLabels: false,
  }
);

const emit = defineEmits<{
  (e: 'bar-click', item: ChartDataPoint): void;
}>();

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: props.data.map((d) => d.label),
  datasets: [
    {
      data: props.data.map((d) => d.value),
      backgroundColor: props.color,
      borderRadius: 4,
    },
  ],
}));

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: props.horizontal ? 'y' : 'x',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const item = props.data[context.dataIndex];
          if (!item) return '';
          return `${item.value.toLocaleString()} (${item.percentage}%)`;
        },
      },
    },
  },
  scales: {
    x: {
      grid: {
        display: props.horizontal,
      },
      ticks: {
        maxRotation: props.horizontal ? 0 : 45,
      },
    },
    y: {
      grid: {
        display: !props.horizontal,
      },
      beginAtZero: true,
    },
  },
  onClick: (_event, elements) => {
    if (elements.length > 0) {
      const index = elements[0]?.index;
      if (index !== undefined && props.data[index]) {
        emit('bar-click', props.data[index]);
      }
    }
  },
}));

const total = computed(() => props.data.reduce((sum, d) => sum + d.value, 0));
</script>

<template>
  <div class="bar-chart-container">
    <div v-if="title" class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <span class="chart-total">Total: {{ total.toLocaleString() }}</span>
    </div>

    <div class="chart-wrapper" :style="{ height: `${height}px` }">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<style scoped>
.bar-chart-container {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.chart-total {
  font-size: 14px;
  color: #6b7280;
}

.chart-wrapper {
  position: relative;
}
</style>
