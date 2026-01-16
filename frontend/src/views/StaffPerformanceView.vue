<script setup lang="ts">
import { onMounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import Card from '@/components/ui/Card.vue'
import QualityQuadrantChart from '@/components/charts/QualityQuadrantChart.vue'
import AttitudeRadarChart from '@/components/charts/AttitudeRadarChart.vue'
import { Users, TrendingUp, AlertTriangle, Award } from 'lucide-vue-next'

const store = useDashboardStore()

onMounted(() => {
  if (store.tickets.length === 0) {
    store.fetchData()
  }
})

function getQualityColor(quality: string) {
  switch (quality) {
    case 'excellent': return 'bg-green-500'
    case 'good': return 'bg-blue-500'
    case 'average': return 'bg-yellow-500'
    case 'poor': return 'bg-red-500'
    default: return 'bg-gray-300'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-gray-900">Hiệu suất Nhân viên</h2>
      <p class="text-gray-500">Đánh giá chất lượng đội ngũ hỗ trợ ngoài tốc độ</p>
    </div>

    <!-- Loading State -->
    <div v-if="store.loading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
    </div>

    <template v-else>
      <!-- Charts Row -->
      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Quality Quadrant -->
        <Card title="Góc phần tư Chất lượng" description="Phân tích Khối lượng vs Chất lượng">
          <div class="h-80">
            <QualityQuadrantChart :data="store.staffPerformance" />
          </div>
        </Card>

        <!-- Attitude Radar -->
        <Card title="Phân bố Thái độ Nhân viên" description="Tháng này vs Tháng trước">
          <div class="h-80">
            <AttitudeRadarChart :data="store.staffAttitudeBreakdown" />
          </div>
        </Card>
      </div>

      <!-- Staff Table -->
      <Card title="Hiệu suất theo Nhân viên" description="Chỉ số chi tiết">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead>
              <tr class="text-left text-xs font-medium uppercase text-gray-500">
                <th class="px-4 py-3">Nhân viên</th>
                <th class="px-4 py-3">Ticket</th>
                <th class="px-4 py-3">Giải quyết</th>
                <th class="px-4 py-3">Mức hài lòng</th>
                <th class="px-4 py-3">Cờ rủi ro</th>
                <th class="px-4 py-3">Chất lượng</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="staff in store.staffPerformance" :key="staff.staff_id" class="hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Users class="h-4 w-4 text-blue-600" />
                    </div>
                    <span class="font-medium text-gray-900">{{ staff.staff_name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-600">{{ staff.total_tickets }}</td>
                <td class="px-4 py-3">
                  <span :class="[
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    staff.resolution_rate >= 80 ? 'bg-green-100 text-green-800' :
                    staff.resolution_rate >= 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  ]">
                    {{ staff.resolution_rate }}%
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-16 rounded-full bg-gray-200">
                      <div
                        class="h-2 rounded-full bg-blue-500"
                        :style="{ width: `${staff.avg_sentiment_score}%` }"
                      ></div>
                    </div>
                    <span class="text-xs text-gray-500">{{ staff.avg_sentiment_score }}%</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span :class="[
                    'inline-flex items-center gap-1',
                    staff.risk_flags > 0 ? 'text-red-600' : 'text-gray-400'
                  ]">
                    <AlertTriangle class="h-4 w-4" />
                    {{ staff.risk_flags }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex gap-1">
                    <div
                      v-for="(count, quality) in staff.quality_breakdown"
                      :key="quality"
                      :class="['h-4 rounded', getQualityColor(quality as string)]"
                      :style="{ width: `${Math.max((count / staff.total_tickets) * 60, count > 0 ? 8 : 0)}px` }"
                      :title="`${quality}: ${count}`"
                    ></div>
                  </div>
                </td>
              </tr>
              <tr v-if="store.staffPerformance.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-gray-400">
                  Không có dữ liệu nhân viên
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <!-- Quality Legend -->
      <div class="flex items-center justify-center gap-6 text-sm">
        <div class="flex items-center gap-2">
          <div class="h-3 w-3 rounded bg-green-500"></div>
          <span class="text-gray-600">Xuất sắc</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="h-3 w-3 rounded bg-blue-500"></div>
          <span class="text-gray-600">Tốt</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="h-3 w-3 rounded bg-yellow-500"></div>
          <span class="text-gray-600">Trung bình</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="h-3 w-3 rounded bg-red-500"></div>
          <span class="text-gray-600">Kém</span>
        </div>
      </div>
    </template>
  </div>
</template>
