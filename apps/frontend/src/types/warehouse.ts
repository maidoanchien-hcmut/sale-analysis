// ============================================================================
// Types matching the star schema
// ============================================================================

// Dimension types
export interface DimDate {
  dateKey: number
  fullDate: string
  year: number
  quarter: number
  month: number
  monthName: string
  week: number
  day: number
  dayOfWeek: number
  dayName: string
  isWeekend: boolean
  isWorkingDay: boolean
}

export interface DimCustomer {
  customerKey: string
  customerName: string
  platform: string
  firstContactDate: string
  lastContactDate: string
}

export interface DimStaff {
  staffKey: string
  staffName: string
  isActive: boolean
}

export interface DimLocation {
  locationKey: string
  locationType: 'HCM' | 'Provincial' | 'Unknown'
  locationDetail: string | null
  region: string | null
}

export interface DimCustomerType {
  typeKey: string // matches customerTypeKey in factTickets
  typeName: string
  typeDescription: string | null
  priority: number | null
}

export interface DimOutcome {
  outcomeKey: string
  outcomeName: string
  outcomeCategory: 'Success' | 'Pending' | 'Failed'
  isPositive: boolean
}

// Fact types
export interface FactTicket {
  ticketId: string
  customerKey: string
  staffKey: string | null
  locationKey: string
  customerTypeKey: string
  outcomeKey: string
  createdDateKey: number
  closedDateKey: number | null
  conversationId: string
  status: 'OPEN' | 'CLOSED'
  outcomeReason: string | null
  repQualitySummary: string | null
  ticketSummary: string | null
  autoReplyCount: number
  humanResponseCount: number
  firstResponseMinutes: number | null
  resolutionMinutes: number | null
  hasRisk: boolean
  isFirstContactResolution: boolean | null
  riskEvidence: string | null
  createdAt: string
  closedAt: string | null
  lastUpdated: string
}

export interface FactRiskIncident {
  incidentId: string
  ticketId: string
  staffKey: string | null
  createdDateKey: number
  conversationId: string
  evidence: string
  reviewStatus: 'Pending' | 'Reviewed' | 'Actioned' | 'Dismissed'
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
}

export interface FactDailySnapshot {
  snapshotId: string
  dateKey: number
  staffKey: string | null
  openTicketsCount: number
  newTicketsCount: number
  closedTicketsCount: number
  calculatedAt: string
}

// Aggregated data for charts
export interface ChartDataPoint {
  label: string
  value: number
  percentage?: number
}

export interface TimeSeriesPoint {
  date: string
  value: number
}

export interface CrossTabData {
  rows: string[]
  columns: string[]
  data: number[][]
}

// Filter options
export interface FilterOptions {
  dateRange: {
    start: string
    end: string
  }
  staffKeys: string[]
  locationKeys: string[]
  customerTypes: string[]
  outcomes: string[]
  status: ('OPEN' | 'CLOSED')[]
}

// Dashboard summary
export interface DashboardSummary {
  totalTickets: number
  openTickets: number
  closedTickets: number
  avgResolutionMinutes: number | null
  avgFirstResponseMinutes: number | null
  riskIncidentsCount: number
  fcrRate: number | null // First Contact Resolution Rate
  successRate: number | null
}
