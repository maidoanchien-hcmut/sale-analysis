<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '@/stores/dashboard'
import Card from '@/components/ui/Card.vue'
import StatCard from '@/components/ui/StatCard.vue'
import RiskDistributionChart from '@/components/charts/RiskDistributionChart.vue'
import RiskHeatmap from '@/components/charts/RiskHeatmap.vue'
import { AlertTriangle, UserX, Target, ExternalLink } from 'lucide-vue-next'

const store = useDashboardStore()
const router = useRouter()

onMounted(() => {
  if (store.tickets.length === 0) {
    store.fetchData()
  }
})

const riskLabels: Record<string, { label: string; color: string; icon: any }> = {
  non_compliant: { label: 'Không tuân thủ training', color: '#ef4444', icon: AlertTriangle },
  unprofessional: { label: 'Thiếu chuyên nghiệp', color: '#8b5cf6', icon: UserX },
  missed_opportunity: { label: 'Bỏ lỡ cơ hội', color: '#3b82f6', icon: Target },
}

const totalRiskFlags = computed(() =>
  Object.values(store.riskFlagsByType).reduce((a, b) => a + b, 0)
)

function goToEvidence(type: string) {
  router.push({ path: '/evidence', query: { type } })
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-gray-900">Rủi ro & Trách nhiệm</h2>
      <p class="text-gray-500">Xác định rủi ro pháp lý, vấn đề tuân thủ và thất thoát doanh thu</p>
    </div>

    <!-- Loading State -->
    <div v-if="store.loading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
    </div>

    <template v-else>
      <!-- Risk Flag Cards - Clickable to Evidence -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="(config, type) in riskLabels"
          :key="type"
          @click="goToEvidence(type)"
          class="cursor-pointer rounded-lg border bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] border-l-4"
          :style="{ borderLeftColor: config.color }"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-500">{{ config.label }}</p>
              <p class="text-2xl font-bold text-gray-900">{{ store.riskFlagsByType[type] ?? 0 }}</p>
            </div>
            <div class="flex items-center gap-2">
              <component :is="config.icon" class="h-8 w-8 text-gray-400" />
              <ExternalLink class="h-4 w-4 text-gray-300" />
            </div>
          </div>
          <p class="mt-2 text-xs text-blue-600 hover:underline">Xem bằng chứng →</p>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Risk Distribution (Horizontal Bar) -->
        <Card title="Phân bố rủi ro theo loại" description="Công ty dễ bị tổn thương ở đâu?">
          <div class="h-72">
            <RiskDistributionChart :data="store.riskFlagsByType" />
          </div>
        </Card>

        <!-- Risk Summary -->
        <Card title="Phân tích tác động rủi ro" description="Thông tin cho Ban Giám đốc">
          <div class="space-y-4">
            <div class="rounded-lg bg-gray-50 p-4">
              <div class="text-3xl font-bold text-gray-900">{{ totalRiskFlags }}</div>
              <div class="text-sm text-gray-500">Tổng số cờ rủi ro</div>
            </div>

            <div class="space-y-3">
              <div
                v-for="(config, type) in riskLabels"
                :key="type"
                class="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-1 -m-1"
                @click="goToEvidence(type)"
              >
                <div class="flex items-center gap-2">
                  <div class="h-3 w-3 rounded-full" :style="{ backgroundColor: config.color }"></div>
                  <span class="text-sm text-gray-600">{{ config.label }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ store.riskFlagsByType[type] ?? 0 }}</span>
                  <span class="text-xs text-gray-400">
                    ({{ totalRiskFlags > 0 ? Math.round(((store.riskFlagsByType[type] ?? 0) / totalRiskFlags) * 100) : 0 }}%)
                  </span>
                  <ExternalLink class="h-3 w-3 text-blue-500" />
                </div>
              </div>
            </div>

            <!-- Risk Insights -->
            <div class="border-t pt-4 space-y-2">
              <div class="text-sm font-medium text-gray-700">Nhận định chính:</div>
              <ul class="text-sm text-gray-600 space-y-1">
                <li v-if="(store.riskFlagsByType.missed_opportunity ?? 0) > 0" class="flex items-start gap-2">
                  <span class="text-blue-500">💰</span>
                  <span><strong>{{ store.riskFlagsByType.missed_opportunity }}</strong> cơ hội bị bỏ lỡ = thất thoát doanh thu tiềm năng</span>
                </li>
                <li v-if="(store.riskFlagsByType.non_compliant ?? 0) > 0" class="flex items-start gap-2">
                  <span class="text-red-500">⚠️</span>
                  <span><strong>{{ store.riskFlagsByType.non_compliant }}</strong> vi phạm tuân thủ = rủi ro pháp lý</span>
                </li>
                <li v-if="(store.riskFlagsByType.incorrect_info ?? 0) > 0" class="flex items-start gap-2">
                  <span class="text-yellow-500">📋</span>
                  <span><strong>{{ store.riskFlagsByType.incorrect_info }}</strong> thông tin sai = xói mòn niềm tin</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <!-- Staff Risk Heatmap -->
      <Card title="Bản đồ nhiệt rủi ro theo nhân viên" description="Xác định rủi ro là hệ thống hay cá biệt">
        <RiskHeatmap :data="store.staffRiskHeatmap" />
      </Card>
    </template>
  </div>
</template>
