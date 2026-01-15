<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import { storeToRefs } from 'pinia';
import KpiCard from '@/components/KpiCard.vue';
import FilterPanel from '@/components/FilterPanel.vue';
import PieChart from '@/components/charts/PieChart.vue';
import BarChart from '@/components/charts/BarChart.vue';
import LineChart from '@/components/charts/LineChart.vue';

const store = useDashboardStore();
const {
  isLoading,
  error,
  summary,
  outcomeDistribution,
  customerTypeDistribution,
  locationDistribution,
  staffDistribution,
  statusDistribution,
  repQualityDistribution,
  ticketsPerDay,
} = storeToRefs(store);

onMounted(async () => {
  await store.refresh();
});

// Format minutes to readable time
const formatTime = (minutes: number | null): string => {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

// Computed for KPI display
const avgResolutionDisplay = computed(() => formatTime(summary.value.avgResolutionMinutes));
const avgResponseDisplay = computed(() => formatTime(summary.value.avgFirstResponseMinutes));
</script>

<template>
  <div class="dashboard">
    <!-- Header -->
    <header class="dashboard-header">
      <div class="header-content">
        <h1 class="header-title">📊 O2 SKIN - Báo cáo BI</h1>
        <p class="header-subtitle">Phân tích hội thoại chăm sóc khách hàng</p>
      </div>
      <button class="refresh-btn" @click="store.refresh()" :disabled="isLoading">
        {{ isLoading ? '⏳ Đang tải...' : '🔄 Làm mới' }}
      </button>
    </header>

    <!-- Error Alert -->
    <div v-if="error" class="error-alert">
      ⚠️ {{ error }}
    </div>

    <!-- Filter Panel -->
    <FilterPanel />

    <!-- KPI Cards Row -->
    <section class="kpi-section">
      <KpiCard
        title="Tổng Tickets"
        :value="summary.totalTickets.toLocaleString()"
        icon="📋"
        color="blue"
        :subtitle="`${summary.openTickets} đang mở`"
      />
      <KpiCard
        title="Đã Đóng"
        :value="summary.closedTickets.toLocaleString()"
        icon="✅"
        color="green"
      />
      <KpiCard
        title="Tỷ lệ thành công"
        :value="summary.successRate !== null ? `${summary.successRate}%` : '—'"
        icon="🎯"
        color="purple"
        subtitle="Booked + Sold + Support"
      />
      <KpiCard
        title="FCR Rate"
        :value="summary.fcrRate !== null ? `${summary.fcrRate}%` : '—'"
        icon="⚡"
        color="amber"
        subtitle="First Contact Resolution"
      />
      <KpiCard
        title="Phản hồi TB"
        :value="avgResponseDisplay"
        icon="⏱️"
        color="blue"
        subtitle="Thời gian phản hồi đầu"
      />
      <KpiCard
        title="Giải quyết TB"
        :value="avgResolutionDisplay"
        icon="🔧"
        color="green"
        subtitle="Thời gian xử lý"
      />
      <KpiCard
        title="Cảnh báo rủi ro"
        :value="summary.riskIncidentsCount"
        icon="🚨"
        color="red"
        subtitle="Tickets có risk flag"
      />
    </section>

    <!-- Charts Section -->
    <section class="charts-section">
      <!-- Row 1: Time Series -->
      <div class="chart-row full-width">
        <LineChart
          :data="ticketsPerDay"
          title="📈 Xu hướng Tickets theo ngày"
          :height="280"
        />
      </div>

      <!-- Row 2: Distribution Charts -->
      <div class="chart-row two-cols">
        <PieChart
          :data="outcomeDistribution"
          title="🎯 Phân bố kết quả"
          :height="300"
        />
        <PieChart
          :data="customerTypeDistribution"
          title="👥 Loại khách hàng"
          :height="300"
        />
      </div>

      <!-- Row 3: More Distributions -->
      <div class="chart-row two-cols">
        <BarChart
          :data="staffDistribution"
          title="👨‍💼 Phân bố theo nhân viên"
          :height="280"
          horizontal
        />
        <PieChart
          :data="locationDistribution"
          title="📍 Phân bố địa điểm"
          :height="280"
        />
      </div>

      <!-- Row 4: Quality & Status -->
      <div class="chart-row two-cols">
        <BarChart
          :data="repQualityDistribution"
          title="⭐ Chất lượng tư vấn"
          :height="250"
          color="#8B5CF6"
        />
        <PieChart
          :data="statusDistribution"
          title="📊 Trạng thái Tickets"
          :height="250"
        />
      </div>
    </section>

    <!-- Loading Overlay -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Đang tải dữ liệu...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
  background: #f8fafc;
  min-height: 100vh;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-title {
  font-size: 28px;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}

.header-subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.refresh-btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.refresh-btn:hover:not(:disabled) {
  background: #2563eb;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-alert {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.kpi-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin: 24px 0;
}

.charts-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.chart-row {
  display: grid;
  gap: 24px;
}

.chart-row.full-width {
  grid-template-columns: 1fr;
}

.chart-row.two-cols {
  grid-template-columns: repeat(2, 1fr);
}

@media (max-width: 900px) {
  .chart-row.two-cols {
    grid-template-columns: 1fr;
  }
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-spinner {
  text-align: center;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-spinner p {
  color: #6b7280;
  font-size: 14px;
}
</style>
