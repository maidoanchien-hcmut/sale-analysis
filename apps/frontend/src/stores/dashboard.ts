import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  DimStaff,
  DimLocation,
  DimCustomerType,
  DimOutcome,
  FactTicket,
  FilterOptions,
  ChartDataPoint,
} from '@/types/warehouse'
import * as api from '@/api/warehouse'

export const useDashboardStore = defineStore('dashboard', () => {
  // ============================================================================
  // State
  // ============================================================================

  // Dimensions (for filters)
  const staff = ref<DimStaff[]>([])
  const locations = ref<DimLocation[]>([])
  const customerTypes = ref<DimCustomerType[]>([])
  const outcomes = ref<DimOutcome[]>([])

  // Facts
  const tickets = ref<FactTicket[]>([])

  // Loading states
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Helper to get date string
  const getDateString = (date: Date): string => {
    return date.toISOString().split('T')[0] ?? ''
  }

  // Filters
  const filters = ref<FilterOptions>({
    dateRange: {
      start: getDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      end: getDateString(new Date()),
    },
    staffKeys: [],
    locationKeys: [],
    customerTypes: [],
    outcomes: [],
    status: [],
  })

  // ============================================================================
  // Computed - Aggregations for charts (client-side)
  // ============================================================================

  const filteredTickets = computed(() => {
    let result = tickets.value

    // Filter by date range
    if (filters.value.dateRange.start && filters.value.dateRange.end) {
      const startKey = parseInt(filters.value.dateRange.start.replace(/-/g, ''))
      const endKey = parseInt(filters.value.dateRange.end.replace(/-/g, ''))
      result = result.filter((t) => t.createdDateKey >= startKey && t.createdDateKey <= endKey)
    }

    // Filter by staff
    if (filters.value.staffKeys.length > 0) {
      result = result.filter((t) => t.staffKey && filters.value.staffKeys.includes(t.staffKey))
    }

    // Filter by location
    if (filters.value.locationKeys.length > 0) {
      result = result.filter((t) => filters.value.locationKeys.includes(t.locationKey))
    }

    // Filter by customer type
    if (filters.value.customerTypes.length > 0) {
      result = result.filter((t) => filters.value.customerTypes.includes(t.customerTypeKey))
    }

    // Filter by outcome
    if (filters.value.outcomes.length > 0) {
      result = result.filter((t) => filters.value.outcomes.includes(t.outcomeKey))
    }

    // Filter by status
    if (filters.value.status.length > 0) {
      result = result.filter((t) => filters.value.status.includes(t.status))
    }

    return result
  })

  // Summary stats
  const summary = computed(() => {
    const data = filteredTickets.value
    const closed = data.filter((t) => t.status === 'CLOSED')
    const withRisk = data.filter((t) => t.hasRisk)
    const fcr = closed.filter((t) => t.isFirstContactResolution)
    const positive = closed.filter((t) => ['Booked', 'Sold', 'Support_Done'].includes(t.outcomeKey))

    const resolutionTimes = closed
      .filter((t) => t.resolutionMinutes !== null)
      .map((t) => t.resolutionMinutes!)

    const responseTimes = data
      .filter((t) => t.firstResponseMinutes !== null)
      .map((t) => t.firstResponseMinutes!)

    return {
      totalTickets: data.length,
      openTickets: data.filter((t) => t.status === 'OPEN').length,
      closedTickets: closed.length,
      avgResolutionMinutes:
        resolutionTimes.length > 0
          ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
          : null,
      avgFirstResponseMinutes:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : null,
      riskIncidentsCount: withRisk.length,
      fcrRate: closed.length > 0 ? Math.round((fcr.length / closed.length) * 100) : null,
      successRate: closed.length > 0 ? Math.round((positive.length / closed.length) * 100) : null,
    }
  })

  // Distribution by outcome
  const outcomeDistribution = computed((): ChartDataPoint[] => {
    const counts: Record<string, number> = {}
    filteredTickets.value.forEach((t) => {
      counts[t.outcomeKey] = (counts[t.outcomeKey] || 0) + 1
    })
    const total = filteredTickets.value.length
    return Object.entries(counts)
      .map(([label, value]) => ({
        label,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
  })

  // Distribution by customer type
  const customerTypeDistribution = computed((): ChartDataPoint[] => {
    const counts: Record<string, number> = {}
    filteredTickets.value.forEach((t) => {
      counts[t.customerTypeKey] = (counts[t.customerTypeKey] || 0) + 1
    })
    const total = filteredTickets.value.length
    return Object.entries(counts)
      .map(([label, value]) => ({
        label,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
  })

  // Distribution by location
  const locationDistribution = computed((): ChartDataPoint[] => {
    const counts: Record<string, number> = {}
    filteredTickets.value.forEach((t) => {
      const loc = locations.value.find((l) => l.locationKey === t.locationKey)
      const label = loc?.locationType || t.locationKey
      counts[label] = (counts[label] || 0) + 1
    })
    const total = filteredTickets.value.length
    return Object.entries(counts)
      .map(([label, value]) => ({
        label,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
  })

  // Distribution by staff
  const staffDistribution = computed((): ChartDataPoint[] => {
    const counts: Record<string, number> = {}
    filteredTickets.value.forEach((t) => {
      const s = staff.value.find((s) => s.staffKey === t.staffKey)
      const label = s?.staffName || t.staffKey || 'Unknown'
      counts[label] = (counts[label] || 0) + 1
    })
    const total = filteredTickets.value.length
    return Object.entries(counts)
      .map(([label, value]) => ({
        label,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
  })

  // Status distribution
  const statusDistribution = computed((): ChartDataPoint[] => {
    const counts: Record<string, number> = {}
    filteredTickets.value.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1
    })
    const total = filteredTickets.value.length
    return Object.entries(counts)
      .map(([label, value]) => ({
        label,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
  })

  // Rep quality distribution
  const repQualityDistribution = computed((): ChartDataPoint[] => {
    const counts: Record<string, number> = {}
    filteredTickets.value.forEach((t) => {
      const label = t.repQualitySummary || 'Unknown'
      counts[label] = (counts[label] || 0) + 1
    })
    const total = filteredTickets.value.length
    return Object.entries(counts)
      .map(([label, value]) => ({
        label,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
  })

  // Time series - tickets per day
  const ticketsPerDay = computed(() => {
    const counts: Record<string, number> = {}
    filteredTickets.value.forEach((t) => {
      const dateStr = String(t.createdDateKey)
      const formatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      counts[formatted] = (counts[formatted] || 0) + 1
    })
    return Object.entries(counts)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })

  // ============================================================================
  // Actions
  // ============================================================================

  async function loadDimensions() {
    try {
      const [staffData, locData, ctData, outcomeData] = await Promise.all([
        api.getStaff(),
        api.getLocations(),
        api.getCustomerTypes(),
        api.getOutcomes(),
      ])
      staff.value = staffData
      locations.value = locData
      customerTypes.value = ctData
      outcomes.value = outcomeData
    } catch (e) {
      console.warn('Could not load dimensions from API, using local data', e)
    }
  }

  async function loadTickets() {
    isLoading.value = true
    error.value = null
    try {
      tickets.value = await api.getTickets(filters.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load tickets'
      console.error('Failed to load tickets:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function refresh() {
    await Promise.all([loadDimensions(), loadTickets()])
  }

  function setDateRange(start: string, end: string) {
    filters.value.dateRange = { start, end }
  }

  function setStaffFilter(keys: string[]) {
    filters.value.staffKeys = keys
  }

  function setLocationFilter(keys: string[]) {
    filters.value.locationKeys = keys
  }

  function setCustomerTypeFilter(types: string[]) {
    filters.value.customerTypes = types
  }

  function setOutcomeFilter(outcomes: string[]) {
    filters.value.outcomes = outcomes
  }

  function setStatusFilter(status: ('OPEN' | 'CLOSED')[]) {
    filters.value.status = status
  }

  function clearFilters() {
    filters.value = {
      dateRange: {
        start: getDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        end: getDateString(new Date()),
      },
      staffKeys: [],
      locationKeys: [],
      customerTypes: [],
      outcomes: [],
      status: [],
    }
  }

  return {
    // State
    staff,
    locations,
    customerTypes,
    outcomes,
    tickets,
    filters,
    isLoading,
    error,

    // Computed
    filteredTickets,
    summary,
    outcomeDistribution,
    customerTypeDistribution,
    locationDistribution,
    staffDistribution,
    statusDistribution,
    repQualityDistribution,
    ticketsPerDay,

    // Actions
    loadDimensions,
    loadTickets,
    refresh,
    setDateRange,
    setStaffFilter,
    setLocationFilter,
    setCustomerTypeFilter,
    setOutcomeFilter,
    setStatusFilter,
    clearFilters,
  }
})
