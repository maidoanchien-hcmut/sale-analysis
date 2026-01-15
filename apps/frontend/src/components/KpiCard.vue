<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    value: string | number | null;
    subtitle?: string;
    icon?: string;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    color?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  }>(),
  {
    subtitle: '',
    icon: '',
    trend: 'neutral',
    trendValue: '',
    color: 'blue',
  }
);

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600 border-blue-200',
  green: 'bg-green-50 text-green-600 border-green-200',
  amber: 'bg-amber-50 text-amber-600 border-amber-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  purple: 'bg-purple-50 text-purple-600 border-purple-200',
};

const iconBgClasses = {
  blue: 'bg-blue-100',
  green: 'bg-green-100',
  amber: 'bg-amber-100',
  red: 'bg-red-100',
  purple: 'bg-purple-100',
};
</script>

<template>
  <div class="kpi-card" :class="colorClasses[color]">
    <div class="kpi-header">
      <div v-if="icon" class="kpi-icon" :class="iconBgClasses[color]">
        {{ icon }}
      </div>
      <span class="kpi-title">{{ title }}</span>
    </div>

    <div class="kpi-value">
      {{ value ?? '—' }}
    </div>

    <div class="kpi-footer" v-if="subtitle || trendValue">
      <span class="kpi-subtitle">{{ subtitle }}</span>
      <span
        v-if="trendValue"
        class="kpi-trend"
        :class="{
          'trend-up': trend === 'up',
          'trend-down': trend === 'down',
        }"
      >
        <span v-if="trend === 'up'">↑</span>
        <span v-else-if="trend === 'down'">↓</span>
        {{ trendValue }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.kpi-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: transform 0.15s, box-shadow 0.15s;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.kpi-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.kpi-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.kpi-title {
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kpi-value {
  font-size: 32px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
}

.kpi-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}

.kpi-subtitle {
  font-size: 12px;
  color: #9ca3af;
}

.kpi-trend {
  font-size: 13px;
  font-weight: 500;
}

.trend-up {
  color: #10b981;
}

.trend-down {
  color: #ef4444;
}

/* Color variants */
.bg-blue-50 {
  background-color: #eff6ff;
}
.text-blue-600 {
  color: #2563eb;
}
.border-blue-200 {
  border-color: #bfdbfe;
}
.bg-blue-100 {
  background-color: #dbeafe;
}

.bg-green-50 {
  background-color: #f0fdf4;
}
.text-green-600 {
  color: #16a34a;
}
.border-green-200 {
  border-color: #bbf7d0;
}
.bg-green-100 {
  background-color: #dcfce7;
}

.bg-amber-50 {
  background-color: #fffbeb;
}
.text-amber-600 {
  color: #d97706;
}
.border-amber-200 {
  border-color: #fde68a;
}
.bg-amber-100 {
  background-color: #fef3c7;
}

.bg-red-50 {
  background-color: #fef2f2;
}
.text-red-600 {
  color: #dc2626;
}
.border-red-200 {
  border-color: #fecaca;
}
.bg-red-100 {
  background-color: #fee2e2;
}

.bg-purple-50 {
  background-color: #faf5ff;
}
.text-purple-600 {
  color: #9333ea;
}
.border-purple-200 {
  border-color: #e9d5ff;
}
.bg-purple-100 {
  background-color: #f3e8ff;
}
</style>
