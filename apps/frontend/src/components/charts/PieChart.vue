<script setup lang="ts">
import { computed } from 'vue';
import { Pie } from 'vue-chartjs';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import type { ChartDataPoint } from '@/types/warehouse';

ChartJS.register(ArcElement, Tooltip, Legend);

const props = withDefaults(
  defineProps<{
    data: ChartDataPoint[];
    title?: string;
    doughnut?: boolean;
    showLegend?: boolean;
    showPercentage?: boolean;
    height?: number;
  }>(),
  {
    title: '',
    doughnut: false,
    showLegend: true,
    showPercentage: true,
    height: 300,
  }
);

const emit = defineEmits<{
  (e: 'slice-click', item: ChartDataPoint): void;
}>();

const COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
];

const chartData = computed<ChartData<'pie'>>(() => ({
  labels: props.data.map((d) => d.label),
  datasets: [
    {
      data: props.data.map((d) => d.value),
      backgroundColor: COLORS.slice(0, props.data.length),
      borderColor: '#fff',
      borderWidth: 2,
    },
  ],
}));

const chartOptions = computed<ChartOptions<'pie'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: props.showLegend,
      position: 'right' as const,
      labels: {
        padding: 16,
        usePointStyle: true,
        font: {
          size: 12,
        },
      },
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const item = props.data[context.dataIndex];
          if (!item) return '';
          if (props.showPercentage) {
            return `${item.label}: ${item.value} (${item.percentage}%)`;
          }
          return `${item.label}: ${item.value}`;
        },
      },
    },
  },
  onClick: (_event, elements) => {
    if (elements.length > 0) {
      const index = elements[0]?.index;
      if (index !== undefined && props.data[index]) {
        emit('slice-click', props.data[index]);
      }
    }
  },
}));

const total = computed(() => props.data.reduce((sum, d) => sum + d.value, 0));
</script>

<template>
  <div class="pie-chart-container">
    <div v-if="title" class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <span class="chart-total">Total: {{ total.toLocaleString() }}</span>
    </div>

    <div class="chart-wrapper" :style="{ height: `${height}px` }">
      <Pie :data="chartData" :options="chartOptions" />
    </div>

    <!-- Data table for accessibility and detail view -->
    <div class="chart-table">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Count</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, index) in data"
            :key="item.label"
            @click="emit('slice-click', item)"
            class="clickable"
          >
            <td>
              <span
                class="color-dot"
                :style="{ backgroundColor: COLORS[index % COLORS.length] }"
              ></span>
              {{ item.label }}
            </td>
            <td>{{ item.value.toLocaleString() }}</td>
            <td>{{ item.percentage }}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pie-chart-container {
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

.chart-table {
  margin-top: 16px;
  max-height: 200px;
  overflow-y: auto;
}

.chart-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.chart-table th {
  text-align: left;
  padding: 8px;
  border-bottom: 2px solid #e5e7eb;
  color: #6b7280;
  font-weight: 500;
}

.chart-table td {
  padding: 8px;
  border-bottom: 1px solid #f3f4f6;
}

.chart-table tr.clickable {
  cursor: pointer;
  transition: background 0.15s;
}

.chart-table tr.clickable:hover {
  background: #f9fafb;
}

.color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
}

.chart-table td:nth-child(2),
.chart-table td:nth-child(3),
.chart-table th:nth-child(2),
.chart-table th:nth-child(3) {
  text-align: right;
}
</style>
