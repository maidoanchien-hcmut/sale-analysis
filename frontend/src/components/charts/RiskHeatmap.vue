<script setup lang="ts">
import { computed } from 'vue'

interface StaffRisk {
  staff_id: string
  staff_name: string
  risks: Record<string, number>
}

const props = defineProps<{
  data: StaffRisk[]
}>()

const riskTypes = ['non_compliant', 'unprofessional', 'missed_opportunity']
const riskLabels: Record<string, string> = {
  non_compliant: 'Vi phạm QĐ',
  unprofessional: 'Thiếu CN',
  missed_opportunity: 'Bỏ lỡ CH'
}

const maxValue = computed(() => {
  let max = 0
  for (const staff of props.data) {
    for (const type of riskTypes) {
      max = Math.max(max, staff.risks[type] || 0)
    }
  }
  return max || 1
})

function getIntensityColor(value: number): string {
  if (value === 0) return 'bg-gray-100'
  const intensity = value / maxValue.value
  if (intensity < 0.25) return 'bg-red-200'
  if (intensity < 0.5) return 'bg-red-300'
  if (intensity < 0.75) return 'bg-red-400'
  return 'bg-red-500'
}

function getTextColor(value: number): string {
  if (value === 0) return 'text-gray-400'
  const intensity = value / maxValue.value
  return intensity >= 0.5 ? 'text-white' : 'text-red-800'
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="min-w-full">
      <thead>
        <tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Staff</th>
          <th
            v-for="type in riskTypes"
            :key="type"
            class="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase"
          >
            {{ riskLabels[type] }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr v-for="staff in data" :key="staff.staff_id">
          <td class="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
            {{ staff.staff_name }}
          </td>
          <td
            v-for="type in riskTypes"
            :key="type"
            class="px-1 py-1"
          >
            <div
              :class="[
                'h-10 w-full rounded flex items-center justify-center text-sm font-semibold transition-colors',
                getIntensityColor(staff.risks[type] || 0),
                getTextColor(staff.risks[type] || 0)
              ]"
              :title="`${staff.staff_name}: ${staff.risks[type] || 0} ${riskLabels[type]} flags`"
            >
              {{ staff.risks[type] || 0 }}
            </div>
          </td>
        </tr>
        <tr v-if="data.length === 0">
          <td :colspan="riskTypes.length + 1" class="px-3 py-8 text-center text-gray-400">
            No risk data available
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
