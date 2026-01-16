<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import Card from '@/components/ui/Card.vue'
import TagBubbleChart from '@/components/charts/TagBubbleChart.vue'
import { Tag, TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'

const store = useDashboardStore()

onMounted(() => {
  if (store.tickets.length === 0) {
    store.fetchData()
  }
})

// Sort tags by count for the table
const sortedTags = computed(() =>
  [...store.tagAnalytics].sort((a, b) => b.count - a.count)
)

function getSentimentLabel(sentiment: number) {
  if (sentiment >= 0.65) return { text: 'Tích cực', color: 'text-green-600', bg: 'bg-green-100' }
  if (sentiment >= 0.45) return { text: 'Trung lập', color: 'text-yellow-600', bg: 'bg-yellow-100' }
  return { text: 'Tiêu cực', color: 'text-red-600', bg: 'bg-red-100' }
}

function getSentimentIcon(sentiment: number) {
  if (sentiment >= 0.65) return TrendingUp
  if (sentiment >= 0.45) return Minus
  return TrendingDown
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-gray-900">Phân tích Nguyên nhân gốc</h2>
      <p class="text-gray-500">Hiểu những gì khách hàng đang nói về</p>
    </div>

    <!-- Loading State -->
    <div v-if="store.loading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
    </div>

    <template v-else>
      <!-- Tag Bubble Chart -->
      <Card title="Độ hài lòng của khách hàng theo tag" description="Kích thước bong bóng = số lượng hội thoại, màu sắc = mức hài lòng">
        <div class="h-96">
          <TagBubbleChart :data="store.tagAnalytics" />
        </div>
      </Card>

      <!-- Tags Table -->
      <Card title="Phân tích Tag" description="Liên kết vấn đề sản phẩm với dịch vụ">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead>
              <tr class="text-left text-xs font-medium uppercase text-gray-500">
                <th class="px-4 py-3">Tag</th>
                <th class="px-4 py-3">Hội thoại</th>
                <th class="px-4 py-3">Mức hài lòng</th>
                <th class="px-4 py-3">Nhận định</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="tag in sortedTags" :key="tag.tag_id" class="hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="rounded-full bg-blue-100 p-1.5">
                      <Tag class="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <span class="font-medium text-gray-900">{{ tag.tag_name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="text-gray-900 font-medium">{{ tag.count }}</span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <span :class="[
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                      getSentimentLabel(tag.avg_sentiment).bg,
                      getSentimentLabel(tag.avg_sentiment).color
                    ]">
                      <component :is="getSentimentIcon(tag.avg_sentiment)" class="h-3 w-3" />
                      {{ getSentimentLabel(tag.avg_sentiment).text }}
                    </span>
                    <span class="text-xs text-gray-500">{{ Math.round(tag.avg_sentiment * 100) }}%</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">
                  <span v-if="tag.count >= 10 && tag.avg_sentiment < 0.45" class="text-red-600">
                    ⚠️ Khối lượng cao + cảm xúc tiêu cực - cần chú ý
                  </span>
                  <span v-else-if="tag.count >= 10 && tag.avg_sentiment >= 0.65" class="text-green-600">
                    ✅ Khối lượng cao + cảm xúc tích cực - đang tốt
                  </span>
                  <span v-else-if="tag.avg_sentiment < 0.45">
                    📉 Cảm xúc thấp - cần xem xét
                  </span>
                  <span v-else>
                    —
                  </span>
                </td>
              </tr>
              <tr v-if="sortedTags.length === 0">
                <td colspan="4" class="px-4 py-8 text-center text-gray-400">
                  Không có dữ liệu tag
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <!-- BOD Insights -->
      <Card title="Thông tin cho BOD" description="Điểm nổi bật cho lãnh đạo">
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <!-- Problem Areas -->
          <div class="rounded-lg bg-red-50 p-4">
            <h4 class="font-medium text-red-800">🔴 Vùng có vấn đề</h4>
            <div class="mt-3 space-y-1">
              <div
                v-for="tag in sortedTags.filter(t => t.count >= 5 && t.avg_sentiment < 0.45).slice(0, 3)"
                :key="tag.tag_id"
                class="text-sm font-medium text-red-800"
              >
                • {{ tag.tag_name }} ({{ tag.count }} hội thoại)
              </div>
              <div v-if="sortedTags.filter(t => t.count >= 5 && t.avg_sentiment < 0.45).length === 0" class="text-sm text-red-600">
                Không phát hiện vấn đề lớn
              </div>
            </div>
          </div>

          <!-- Success Areas -->
          <div class="rounded-lg bg-green-50 p-4">
            <h4 class="font-medium text-green-800">🟢 Vùng thành công</h4>
            <div class="mt-3 space-y-1">
              <div
                v-for="tag in sortedTags.filter(t => t.count >= 5 && t.avg_sentiment >= 0.65).slice(0, 3)"
                :key="tag.tag_id"
                class="text-sm font-medium text-green-800"
              >
                • {{ tag.tag_name }} ({{ Math.round(tag.avg_sentiment * 100) }}% tích cực)
              </div>
              <div v-if="sortedTags.filter(t => t.count >= 5 && t.avg_sentiment >= 0.65).length === 0" class="text-sm text-green-600">
                Chưa có điểm nổi bật
              </div>
            </div>
          </div>

          <!-- Watch List -->
          <div class="rounded-lg bg-yellow-50 p-4">
            <h4 class="font-medium text-yellow-800">🟡 Cần theo dõi</h4>
            <div class="mt-3 space-y-1">
              <div
                v-for="tag in sortedTags.filter(t => t.count >= 10 && t.avg_sentiment >= 0.45 && t.avg_sentiment < 0.65).slice(0, 3)"
                :key="tag.tag_id"
                class="text-sm font-medium text-yellow-800"
              >
                • {{ tag.tag_name }} ({{ tag.count }} hội thoại)
              </div>
              <div v-if="sortedTags.filter(t => t.count >= 10 && t.avg_sentiment >= 0.45 && t.avg_sentiment < 0.65).length === 0" class="text-sm text-yellow-600">
                Không có mục cần theo dõi
              </div>
            </div>
          </div>
        </div>
      </Card>
    </template>
  </div>
</template>
