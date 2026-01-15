import type {
  DimStaff,
  DimLocation,
  DimCustomerType,
  DimOutcome,
  FactTicket,
  FactRiskIncident,
  FactDailySnapshot,
  DashboardSummary,
  ChartDataPoint,
  TimeSeriesPoint,
  FilterOptions,
} from '@/types/warehouse'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// ============================================================================
// Generic fetch helper
// ============================================================================

async function fetchJson<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`)
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

// ============================================================================
// Dimension APIs
// ============================================================================

export async function getStaff(): Promise<DimStaff[]> {
  return fetchJson('/api/dimensions/staff')
}

export async function getLocations(): Promise<DimLocation[]> {
  return fetchJson('/api/dimensions/locations')
}

export async function getCustomerTypes(): Promise<DimCustomerType[]> {
  return fetchJson('/api/dimensions/customer-types')
}

export async function getOutcomes(): Promise<DimOutcome[]> {
  return fetchJson('/api/dimensions/outcomes')
}

// ============================================================================
// Fact APIs
// ============================================================================

export async function getTickets(filters?: Partial<FilterOptions>): Promise<FactTicket[]> {
  const params = new URLSearchParams()
  if (filters?.dateRange) {
    params.set('startDate', filters.dateRange.start)
    params.set('endDate', filters.dateRange.end)
  }
  if (filters?.staffKeys?.length) {
    params.set('staffKey', filters.staffKeys[0] ?? '')
  }
  if (filters?.status?.length) {
    params.set('status', filters.status[0] ?? '')
  }
  const query = params.toString()
  return fetchJson(`/api/tickets${query ? `?${query}` : ''}`)
}

export async function getRiskIncidents(): Promise<FactRiskIncident[]> {
  return fetchJson('/api/risk-incidents')
}

export async function getDailySnapshots(
  startDate?: string,
  endDate?: string,
): Promise<FactDailySnapshot[]> {
  const params = new URLSearchParams()
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const query = params.toString()
  return fetchJson(`/api/daily-snapshots${query ? `?${query}` : ''}`)
}

// ============================================================================
// Aggregation APIs
// ============================================================================

export async function getDashboardSummary(
  filters?: Partial<FilterOptions>,
): Promise<DashboardSummary> {
  const params = new URLSearchParams()
  if (filters?.dateRange) {
    params.set('startDate', filters.dateRange.start)
    params.set('endDate', filters.dateRange.end)
  }
  const query = params.toString()
  return fetchJson(`/api/analytics/summary${query ? `?${query}` : ''}`)
}

export async function getDistribution(
  dimension: 'outcome' | 'customerType' | 'location' | 'staff' | 'status',
  filters?: Partial<FilterOptions>,
): Promise<ChartDataPoint[]> {
  const params = new URLSearchParams()
  params.set('dimension', dimension)
  if (filters?.dateRange) {
    params.set('startDate', filters.dateRange.start)
    params.set('endDate', filters.dateRange.end)
  }
  return fetchJson(`/api/analytics/distribution?${params.toString()}`)
}

export async function getTimeSeries(
  metric: 'tickets' | 'resolutionTime' | 'responseTime' | 'risk',
  granularity: 'day' | 'week' | 'month',
  filters?: Partial<FilterOptions>,
): Promise<TimeSeriesPoint[]> {
  const params = new URLSearchParams()
  params.set('metric', metric)
  params.set('granularity', granularity)
  if (filters?.dateRange) {
    params.set('startDate', filters.dateRange.start)
    params.set('endDate', filters.dateRange.end)
  }
  return fetchJson(`/api/analytics/timeseries?${params.toString()}`)
}

// ============================================================================
// Control APIs
// ============================================================================

export async function triggerScrape(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/control/scrape`, { method: 'POST' })
  return response.json()
}

export async function triggerAnalysis(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/control/analyze`, { method: 'POST' })
  return response.json()
}
