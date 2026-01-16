import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  api,
  type DashboardStats,
  type SentimentTrend,
  type StaffPerformance,
  type Ticket,
  type RiskFlag,
  type Staff,
} from '@/services/api'

export interface TagAnalytics {
  tag_id: string
  tag_name: string
  count: number
  avg_sentiment: number
}

export interface StaffRiskHeatmap {
  staff_id: string
  staff_name: string
  risks: Record<string, number>
}

export const useDashboardStore = defineStore('dashboard', () => {
  // State
  const tickets = ref<Ticket[]>([])
  const riskFlags = ref<RiskFlag[]>([])
  const staff = ref<Staff[]>([])
  const tagAnalytics = ref<TagAnalytics[]>([])
  const staffRiskHeatmap = ref<StaffRiskHeatmap[]>([])
  const staffAttitudeBreakdown = ref<Record<string, Record<string, number>>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedPeriod = ref<'day' | 'week' | 'month'>('week')

  // Computed stats
  const stats = computed<DashboardStats>(() => {
    const total = tickets.value.length
    const resolved = tickets.value.filter((t) => t.is_resolved).length
    const positive = tickets.value.filter((t) => t.sentiment === 'positive').length
    const neutral = tickets.value.filter((t) => t.sentiment === 'neutral').length
    const negative = tickets.value.filter((t) => t.sentiment === 'negative').length

    return {
      totalTickets: total,
      resolvedTickets: resolved,
      resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
      sentimentBreakdown: { positive, neutral, negative },
      riskFlagCount: riskFlags.value.length,
      staffCount: new Set(tickets.value.map((t) => t.staff_id).filter(Boolean)).size,
    }
  })

  // Sentiment trend computed from tickets
  const sentimentTrend = computed<SentimentTrend[]>(() => {
    const grouped = new Map<
      string,
      { positive: number; neutral: number; negative: number; total: number }
    >()

    for (const ticket of tickets.value) {
      const date = new Date(ticket.started_at)
      let periodKey: string

      if (selectedPeriod.value === 'day') {
        periodKey = date.toISOString().split('T')[0] ?? ''
      } else if (selectedPeriod.value === 'week') {
        // Get week start (Monday)
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1)
        const weekStart = new Date(date.setDate(diff))
        periodKey = weekStart.toISOString().split('T')[0] ?? ''
      } else {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      }

      if (!grouped.has(periodKey)) {
        grouped.set(periodKey, { positive: 0, neutral: 0, negative: 0, total: 0 })
      }

      const entry = grouped.get(periodKey)!
      entry[ticket.sentiment]++
      entry.total++
    }

    return Array.from(grouped.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period))
  })

  // Staff performance computed from tickets
  const staffPerformance = computed<StaffPerformance[]>(() => {
    const staffMap = new Map<
      string,
      {
        name: string
        tickets: Ticket[]
        riskFlags: number
      }
    >()

    for (const ticket of tickets.value) {
      if (!ticket.staff_id) continue

      if (!staffMap.has(ticket.staff_id)) {
        staffMap.set(ticket.staff_id, {
          name: ticket.staff_id,
          tickets: [],
          riskFlags: 0,
        })
      }
      staffMap.get(ticket.staff_id)!.tickets.push(ticket)
    }

    // Count risk flags per staff (via tickets)
    for (const flag of riskFlags.value) {
      if (!flag.ticket_id) continue
      const ticket = tickets.value.find((t) => t.id === flag.ticket_id)
      if (ticket?.staff_id && staffMap.has(ticket.staff_id)) {
        staffMap.get(ticket.staff_id)!.riskFlags++
      }
    }

    return Array.from(staffMap.entries())
      .map(([staffId, data]) => {
        const totalTickets = data.tickets.length
        const resolvedTickets = data.tickets.filter((t) => t.is_resolved).length

        // Calculate sentiment score: positive=1, neutral=0.5, negative=0
        const sentimentScore =
          data.tickets.reduce((sum, t) => {
            if (t.sentiment === 'positive') return sum + 1
            if (t.sentiment === 'neutral') return sum + 0.5
            return sum
          }, 0) / totalTickets

        const qualityBreakdown = {
          excellent: data.tickets.filter((t) => t.staff_quality === 'excellent').length,
          good: data.tickets.filter((t) => t.staff_quality === 'good').length,
          average: data.tickets.filter((t) => t.staff_quality === 'average').length,
          poor: data.tickets.filter((t) => t.staff_quality === 'poor').length,
        }

        return {
          staff_id: staffId,
          staff_name: data.name,
          total_tickets: totalTickets,
          resolved_tickets: resolvedTickets,
          resolution_rate: Math.round((resolvedTickets / totalTickets) * 100),
          avg_sentiment_score: Math.round(sentimentScore * 100),
          risk_flags: data.riskFlags,
          quality_breakdown: qualityBreakdown,
        }
      })
      .sort((a, b) => b.total_tickets - a.total_tickets)
  })

  // Risk flags by type
  const riskFlagsByType = computed(() => {
    const counts: Record<string, number> = {
      non_compliant: 0,
      incorrect_info: 0,
      unprofessional: 0,
      missed_opportunity: 0,
    }
    for (const flag of riskFlags.value) {
      if (flag.risk_type in counts) {
        counts[flag.risk_type] = (counts[flag.risk_type] ?? 0) + 1
      }
    }
    return counts
  })

  // Actions
  async function fetchData() {
    loading.value = true
    error.value = null

    try {
      const [ticketsData, riskFlagsData, staffData] = await Promise.all([
        api.getTickets(),
        api.getRiskFlags(),
        api.getStaff(),
      ])
      tickets.value = ticketsData
      riskFlags.value = riskFlagsData
      staff.value = staffData

      // Fetch additional dashboard data
      const [tagData, heatmapData, attitudeData] = await Promise.all([
        api.getTagAnalytics(),
        api.getStaffRiskHeatmap(),
        api.getStaffAttitudeBreakdown(),
      ])
      tagAnalytics.value = tagData
      staffRiskHeatmap.value = heatmapData
      staffAttitudeBreakdown.value = attitudeData
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch data'
      console.error('Dashboard fetch error:', e)
    } finally {
      loading.value = false
    }
  }

  function setPeriod(period: 'day' | 'week' | 'month') {
    selectedPeriod.value = period
  }

  return {
    // State
    tickets,
    riskFlags,
    staff,
    tagAnalytics,
    staffRiskHeatmap,
    staffAttitudeBreakdown,
    loading,
    error,
    selectedPeriod,
    // Computed
    stats,
    sentimentTrend,
    staffPerformance,
    riskFlagsByType,
    // Actions
    fetchData,
    setPeriod,
  }
})
