<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDashboardStore } from '@/stores/dashboard'
import Card from '@/components/ui/Card.vue'
import { AlertTriangle, UserX, Target, MessageSquare, ExternalLink } from 'lucide-vue-next'

const store = useDashboardStore()
const route = useRoute()

// Get initial filter from query params
const selectedType = ref<string>(route.query.type as string || 'all')

onMounted(() => {
  if (store.tickets.length === 0) {
    store.fetchData()
  }
  // Update filter from URL if present
  if (route.query.type) {
    selectedType.value = route.query.type as string
  }
})

const riskLabels: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  non_compliant: { label: 'Không tuân thủ training', color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertTriangle },
  unprofessional: { label: 'Thiếu chuyên nghiệp', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: UserX },
  missed_opportunity: { label: 'Bỏ lỡ cơ hội', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Target },
}

// Filter risk flags by type
const filteredRiskFlags = computed(() => {
  if (selectedType.value === 'all') {
    return store.riskFlags
  }
  return store.riskFlags.filter(rf => rf.risk_type === selectedType.value)
})

// Group risk flags by type for display
const riskFlagsByType = computed(() => {
  const groups: Record<string, typeof store.riskFlags> = {
    non_compliant: [],
    unprofessional: [],
    missed_opportunity: [],
  }

  for (const flag of store.riskFlags) {
    if (flag.risk_type in groups) {
      groups[flag.risk_type]!.push(flag)
    }
  }

  return groups
})

function setFilter(type: string) {
  selectedType.value = type
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-gray-900">Bằng chứng vi phạm</h2>
      <p class="text-gray-500">Xem chi tiết các tin nhắn vi phạm theo từng loại</p>
    </div>

    <!-- Loading State -->
    <div v-if="store.loading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
    </div>

    <template v-else>
      <!-- Filter Tabs -->
      <div class="flex flex-wrap gap-2">
        <button
          @click="setFilter('all')"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            selectedType === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          ]"
        >
          Tất cả ({{ store.riskFlags.length }})
        </button>
        <button
          v-for="(config, type) in riskLabels"
          :key="type"
          @click="setFilter(type)"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
            selectedType === type
              ? `${config.bgColor} ${config.color}`
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          ]"
        >
          <component :is="config.icon" class="h-4 w-4" />
          {{ config.label }} ({{ riskFlagsByType[type]?.length || 0 }})
        </button>
      </div>

      <!-- Evidence Cards -->
      <div class="space-y-4">
        <div
          v-for="flag in filteredRiskFlags"
          :key="flag.id"
          class="rounded-lg border bg-white p-4 shadow-sm"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <!-- Risk Type Badge -->
              <div class="flex items-center gap-2 mb-3">
                <span
                  :class="[
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                    riskLabels[flag.risk_type]?.bgColor || 'bg-gray-100',
                    riskLabels[flag.risk_type]?.color || 'text-gray-600'
                  ]"
                >
                  <component :is="riskLabels[flag.risk_type]?.icon || AlertTriangle" class="h-3.5 w-3.5" />
                  {{ riskLabels[flag.risk_type]?.label || flag.risk_type }}
                </span>
                <span v-if="(flag as any).customer_name" class="text-sm text-gray-500">
                  • Khách hàng: <strong>{{ (flag as any).customer_name }}</strong>
                </span>
              </div>

              <!-- Message Content -->
              <div class="rounded-lg bg-gray-50 p-4">
                <div class="flex items-start gap-3">
                  <MessageSquare class="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div class="flex-1">
                    <p class="text-gray-800 whitespace-pre-wrap">{{ (flag as any).message_content || 'Nội dung không có sẵn' }}</p>
                  </div>
                </div>
              </div>

              <!-- Metadata -->
              <div class="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span>ID: {{ flag.message_id.substring(0, 20) }}...</span>
                <span v-if="flag.ticket_id">Ticket #{{ flag.ticket_id }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredRiskFlags.length === 0" class="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <AlertTriangle class="mx-auto h-12 w-12 text-gray-400" />
          <h3 class="mt-4 text-lg font-medium text-gray-900">Không có bằng chứng</h3>
          <p class="mt-2 text-sm text-gray-500">
            {{ selectedType === 'all' ? 'Chưa có vi phạm nào được ghi nhận.' : `Không có vi phạm loại "${riskLabels[selectedType]?.label}" nào.` }}
          </p>
        </div>
      </div>

      <!-- Summary Stats -->
      <Card title="Thống kê theo loại" description="Tổng quan các loại vi phạm">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="(config, type) in riskLabels"
            :key="type"
            :class="[
              'rounded-lg p-4 cursor-pointer transition-all hover:shadow-md',
              config.bgColor,
              selectedType === type ? 'ring-2 ring-offset-2 ring-gray-400' : ''
            ]"
            @click="setFilter(type)"
          >
            <div class="flex items-center gap-3">
              <component :is="config.icon" :class="['h-8 w-8', config.color]" />
              <div>
                <div :class="['text-2xl font-bold', config.color]">
                  {{ riskFlagsByType[type]?.length || 0 }}
                </div>
                <div :class="['text-sm', config.color]">{{ config.label }}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </template>
  </div>
</template>
