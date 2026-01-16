<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import Card from '@/components/ui/Card.vue'
import StatCard from '@/components/ui/StatCard.vue'
import TabGroup from '@/components/ui/TabGroup.vue'
import SentimentTrendChart from '@/components/charts/SentimentTrendChart.vue'
import ResolutionGauge from '@/components/charts/ResolutionGauge.vue'
import {
  Smile,
  Meh,
  Frown,
  CheckCircle,
  XCircle,
  TrendingUp
} from 'lucide-vue-next'

const store = useDashboardStore()

const periodTabs = [
  { id: 'day', label: 'Theo ngày' },
  { id: 'week', label: 'Theo tuần' },
  { id: 'month', label: 'Theo tháng' },
]

const selectedPeriod = ref<'day' | 'week' | 'month'>('week')

function onPeriodChange(period: string) {
  selectedPeriod.value = period as 'day' | 'week' | 'month'
  store.setPeriod(selectedPeriod.value)
}

onMounted(() => {
  store.fetchData()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-2xl font-bold text-gray-900">Khách hàng</h2>
      <p class="text-gray-500">Theo dõi sự hài lòng và giải quyết vấn đề của khách hàng</p>
    </div>

    <!-- Loading State -->
    <div v-if="store.loading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      <span class="ml-3 text-gray-500">Đang tải dữ liệu...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="store.error" class="rounded-lg border border-red-200 bg-red-50 p-4">
      <p class="text-red-800">{{ store.error }}</p>
      <button
        @click="store.fetchData()"
        class="mt-2 text-sm text-red-600 hover:text-red-800 underline"
      >
        Thử lại
      </button>
    </div>

    <!-- Dashboard Content -->
    <template v-else>
      <!-- KPI Cards -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng số Ticket"
          :value="store.stats.totalTickets"
          description="Hội thoại đã phân tích"
          :icon="TrendingUp"
        />
        <StatCard
          title="Tích cực"
          :value="`${store.stats.totalTickets > 0 ? Math.round((store.stats.sentimentBreakdown.positive / store.stats.totalTickets) * 100) : 0}%`"
          :description="`${store.stats.sentimentBreakdown.positive} ticket`"
          :icon="Smile"
          class="border-l-4 border-l-green-500"
        />
        <StatCard
          title="Trung tính"
          :value="`${store.stats.totalTickets > 0 ? Math.round((store.stats.sentimentBreakdown.neutral / store.stats.totalTickets) * 100) : 0}%`"
          :description="`${store.stats.sentimentBreakdown.neutral} ticket`"
          :icon="Meh"
          class="border-l-4 border-l-yellow-500"
        />
        <StatCard
          title="Tiêu cực"
          :value="`${store.stats.totalTickets > 0 ? Math.round((store.stats.sentimentBreakdown.negative / store.stats.totalTickets) * 100) : 0}%`"
          :description="`${store.stats.sentimentBreakdown.negative} ticket`"
          :icon="Frown"
          class="border-l-4 border-l-red-500"
        />
      </div>

      <!-- Charts Row -->
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Sentiment Trend Chart -->
        <Card
          title="Xu hướng hài lòng theo Thời gian"
          description="Theo dõi sự thay đổi mức độ hài lòng"
          class="lg:col-span-2"
        >
          <div class="mb-4">
            <TabGroup
              :tabs="periodTabs"
              :model-value="selectedPeriod"
              @update:model-value="onPeriodChange"
            />
          </div>
          <div class="h-72">
            <SentimentTrendChart
              v-if="store.sentimentTrend.length > 0"
              :data="store.sentimentTrend"
              :period="selectedPeriod"
            />
            <div v-else class="flex h-full items-center justify-center text-gray-400">
              Không có dữ liệu
            </div>
          </div>
        </Card>

        <!-- Resolution Rate Gauge -->
        <Card
          title="Tỷ lệ Giải quyết"
          description="Vấn đề được giải quyết thành công"
        >
          <div class="h-72">
            <ResolutionGauge
              :resolved="store.stats.resolvedTickets"
              :total="store.stats.totalTickets"
            />
          </div>
          <div class="mt-4 flex justify-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <CheckCircle class="h-4 w-4 text-green-500" />
              <span>{{ store.stats.resolvedTickets }} Đã giải quyết</span>
            </div>
            <div class="flex items-center gap-2">
              <XCircle class="h-4 w-4 text-gray-400" />
              <span>{{ store.stats.totalTickets - store.stats.resolvedTickets }} Chưa giải quyết</span>
            </div>
          </div>
        </Card>
      </div>
    </template>
  </div>
</template>
