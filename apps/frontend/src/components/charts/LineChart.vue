<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

interface TimeSeriesDataPoint {
  date: string;
  value: number;
}

const props = withDefaults(
  defineProps<{
    data: TimeSeriesDataPoint[];
    title?: string;
    color?: string;
    height?: number;
    fill?: boolean;
    smooth?: boolean;
  }>(),
  {
    title: '',
    color: '#3B82F6',
    height: 300,
    fill: true,
    smooth: true,
  }
);

const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.data.map((d) => formatDate(d.date)),
  datasets: [
    {
      data: props.data.map((d) => d.value),
      borderColor: props.color,
      backgroundColor: props.fill ? `${props.color}20` : 'transparent',
      fill: props.fill,
      tension: props.smooth ? 0.4 : 0,
      pointRadius: 4,
      pointBackgroundColor: props.color,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
    },
  ],
}));

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        maxRotation: 45,
        maxTicksLimit: 10,
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: '#f3f4f6',
      },
    },
  },
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false,
  },
}));

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

const total = computed(() => props.data.reduce((sum, d) => sum + d.value, 0));
const avg = computed(() =>
  props.data.length > 0 ? Math.round(total.value / props.data.length) : 0
);
</script>

<template>
  <div class="line-chart-container">
    <div v-if="title" class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <div class="chart-stats">
        <span class="stat">Tổng: {{ total.toLocaleString() }}</span>
        <span class="stat">TB/ngày: {{ avg.toLocaleString() }}</span>
      </div>
    </div>

    <div class="chart-wrapper" :style="{ height: `${height}px` }">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<style scoped>
.line-chart-container {
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

.chart-stats {
  display: flex;
  gap: 16px;
}

.stat {
  font-size: 13px;
  color: #6b7280;
}

.chart-wrapper {
  position: relative;
}
</style>
