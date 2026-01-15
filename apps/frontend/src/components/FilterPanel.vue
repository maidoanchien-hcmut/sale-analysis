<script setup lang="ts">
import { ref, watch } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import { storeToRefs } from 'pinia';

const store = useDashboardStore();
const { staff, locations, customerTypes, outcomes, filters } = storeToRefs(store);

const isExpanded = ref(false);

// Local filter values
const dateStart = ref(filters.value.dateRange.start);
const dateEnd = ref(filters.value.dateRange.end);
const selectedStaff = ref<string[]>([...filters.value.staffKeys]);
const selectedLocations = ref<string[]>([...filters.value.locationKeys]);
const selectedCustomerTypes = ref<string[]>([...filters.value.customerTypes]);
const selectedOutcomes = ref<string[]>([...filters.value.outcomes]);
const selectedStatus = ref<('OPEN' | 'CLOSED')[]>([...filters.value.status]);

function applyFilters() {
  store.setDateRange(dateStart.value, dateEnd.value);
  store.setStaffFilter(selectedStaff.value);
  store.setLocationFilter(selectedLocations.value);
  store.setCustomerTypeFilter(selectedCustomerTypes.value);
  store.setOutcomeFilter(selectedOutcomes.value);
  store.setStatusFilter(selectedStatus.value);
  store.loadTickets();
}

function resetFilters() {
  store.clearFilters();
  dateStart.value = filters.value.dateRange.start;
  dateEnd.value = filters.value.dateRange.end;
  selectedStaff.value = [];
  selectedLocations.value = [];
  selectedCustomerTypes.value = [];
  selectedOutcomes.value = [];
  selectedStatus.value = [];
  store.loadTickets();
}

// Quick date presets
function setDatePreset(days: number) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  dateStart.value = start.toISOString().split('T')[0] ?? '';
  dateEnd.value = end.toISOString().split('T')[0] ?? '';
}

// Sync when store filters change externally
watch(
  () => filters.value,
  (newFilters) => {
    dateStart.value = newFilters.dateRange.start;
    dateEnd.value = newFilters.dateRange.end;
    selectedStaff.value = [...newFilters.staffKeys];
    selectedLocations.value = [...newFilters.locationKeys];
    selectedCustomerTypes.value = [...newFilters.customerTypes];
    selectedOutcomes.value = [...newFilters.outcomes];
    selectedStatus.value = [...newFilters.status];
  },
  { deep: true }
);

const activeFiltersCount = (): number => {
  let count = 0;
  if (selectedStaff.value.length > 0) count++;
  if (selectedLocations.value.length > 0) count++;
  if (selectedCustomerTypes.value.length > 0) count++;
  if (selectedOutcomes.value.length > 0) count++;
  if (selectedStatus.value.length > 0) count++;
  return count;
};
</script>

<template>
  <div class="filter-panel">
    <!-- Compact Header -->
    <div class="filter-header" @click="isExpanded = !isExpanded">
      <div class="filter-title">
        <span class="filter-icon">🔍</span>
        <span>Bộ lọc</span>
        <span v-if="activeFiltersCount() > 0" class="filter-badge">
          {{ activeFiltersCount() }}
        </span>
      </div>
      <button class="expand-btn">
        {{ isExpanded ? '▲' : '▼' }}
      </button>
    </div>

    <!-- Always visible: Date Range -->
    <div class="date-row">
      <div class="date-presets">
        <button class="preset-btn" @click="setDatePreset(7)">7 ngày</button>
        <button class="preset-btn" @click="setDatePreset(30)">30 ngày</button>
        <button class="preset-btn" @click="setDatePreset(90)">90 ngày</button>
      </div>
      <div class="date-inputs">
        <input type="date" v-model="dateStart" class="date-input" />
        <span class="date-separator">→</span>
        <input type="date" v-model="dateEnd" class="date-input" />
      </div>
    </div>

    <!-- Expandable Filters -->
    <div class="filter-body" v-show="isExpanded">
      <!-- Staff Filter -->
      <div class="filter-group">
        <label class="filter-label">Nhân viên</label>
        <div class="checkbox-group">
          <label
            v-for="s in staff"
            :key="s.staffKey"
            class="checkbox-item"
          >
            <input
              type="checkbox"
              :value="s.staffKey"
              v-model="selectedStaff"
            />
            {{ s.staffName }}
          </label>
        </div>
      </div>

      <!-- Location Filter -->
      <div class="filter-group">
        <label class="filter-label">Địa điểm</label>
        <div class="checkbox-group">
          <label
            v-for="loc in locations"
            :key="loc.locationKey"
            class="checkbox-item"
          >
            <input
              type="checkbox"
              :value="loc.locationKey"
              v-model="selectedLocations"
            />
            {{ loc.locationType }}
          </label>
        </div>
      </div>

      <!-- Customer Type Filter -->
      <div class="filter-group">
        <label class="filter-label">Loại khách hàng</label>
        <div class="checkbox-group">
          <label
            v-for="ct in customerTypes"
            :key="ct.typeKey"
            class="checkbox-item"
          >
            <input
              type="checkbox"
              :value="ct.typeKey"
              v-model="selectedCustomerTypes"
            />
            {{ ct.typeName }}
          </label>
        </div>
      </div>

      <!-- Outcome Filter -->
      <div class="filter-group">
        <label class="filter-label">Kết quả</label>
        <div class="checkbox-group">
          <label
            v-for="o in outcomes"
            :key="o.outcomeKey"
            class="checkbox-item"
          >
            <input
              type="checkbox"
              :value="o.outcomeKey"
              v-model="selectedOutcomes"
            />
            {{ o.outcomeKey }}
          </label>
        </div>
      </div>

      <!-- Status Filter -->
      <div class="filter-group">
        <label class="filter-label">Trạng thái</label>
        <div class="checkbox-group">
          <label class="checkbox-item">
            <input type="checkbox" value="OPEN" v-model="selectedStatus" />
            Đang mở
          </label>
          <label class="checkbox-item">
            <input type="checkbox" value="CLOSED" v-model="selectedStatus" />
            Đã đóng
          </label>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="filter-actions">
      <button class="btn btn-secondary" @click="resetFilters">
        Đặt lại
      </button>
      <button class="btn btn-primary" @click="applyFilters">
        Áp dụng
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-panel {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  margin-bottom: 12px;
}

.filter-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1f2937;
}

.filter-icon {
  font-size: 18px;
}

.filter-badge {
  background: #3b82f6;
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
}

.expand-btn {
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  font-size: 12px;
}

.date-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
}

.date-presets {
  display: flex;
  gap: 8px;
}

.preset-btn {
  padding: 6px 12px;
  font-size: 12px;
  background: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.preset-btn:hover {
  background: #e5e7eb;
}

.date-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-input {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
}

.date-separator {
  color: #9ca3af;
}

.filter-body {
  padding: 16px 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
}

.checkbox-item input {
  cursor: pointer;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}

.btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-secondary {
  background: #f3f4f6;
  border: none;
  color: #4b5563;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-primary {
  background: #3b82f6;
  border: none;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}
</style>
