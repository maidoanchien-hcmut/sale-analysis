const API_BASE = 'http://localhost:3000'

export interface Ticket {
  id: number
  conversation_id: string
  staff_id: string | null
  start_message_id: string
  started_at: string
  end_message_id: string
  ended_at: string
  sentiment: 'positive' | 'neutral' | 'negative'
  outcome: string
  staff_attitude: string
  staff_quality: string
  is_resolved: boolean
  analyzed_at: string
}

export interface RiskFlag {
  id: number
  message_id: string
  ticket_id: number | null
  risk_type: 'non_compliant' | 'incorrect_info' | 'unprofessional' | 'missed_opportunity'
}

export interface Staff {
  id: string
  name: string
}

export interface Tag {
  id: string
  name: string
  category: string | null
}

export interface ConversationTag {
  conversation_id: string
  tag_id: string
}

export interface Conversation {
  id: string
  customer_id: string | null
  customer_name: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  content: string
  sender_id: string
  inserted_at: string
  is_auto_reply: boolean
  has_risk_flag: boolean
}

export interface DashboardStats {
  totalTickets: number
  resolvedTickets: number
  resolutionRate: number
  sentimentBreakdown: {
    positive: number
    neutral: number
    negative: number
  }
  riskFlagCount: number
  staffCount: number
}

export interface SentimentTrend {
  period: string
  positive: number
  neutral: number
  negative: number
  total: number
}

export interface StaffPerformance {
  staff_id: string
  staff_name: string
  total_tickets: number
  resolved_tickets: number
  resolution_rate: number
  avg_sentiment_score: number
  risk_flags: number
  quality_breakdown: {
    excellent: number
    good: number
    average: number
    poor: number
  }
}

class ApiService {
  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`)
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }
    return response.json()
  }

  async getTickets(): Promise<Ticket[]> {
    const response = await this.fetch<{ success: boolean; tickets: Ticket[]; total: number }>(
      '/api/tickets',
    )
    return response.tickets
  }

  async getRiskFlags(): Promise<RiskFlag[]> {
    return this.fetch<RiskFlag[]>('/api/risk-flags')
  }

  async getStaff(): Promise<Staff[]> {
    const response = await this.fetch<{ success: boolean; staff: Staff[] }>('/api/staff')
    return response.staff
  }

  async getConversations(): Promise<Conversation[]> {
    const response = await this.fetch<{ success: boolean; conversations: Conversation[] }>(
      '/api/conversations',
    )
    return response.conversations
  }

  async getDashboardStats(): Promise<DashboardStats> {
    return this.fetch<DashboardStats>('/api/dashboard/stats')
  }

  async getSentimentTrend(period: 'day' | 'week' | 'month' = 'week'): Promise<SentimentTrend[]> {
    return this.fetch<SentimentTrend[]>(`/api/dashboard/sentiment-trend?period=${period}`)
  }

  async getStaffPerformance(): Promise<StaffPerformance[]> {
    return this.fetch<StaffPerformance[]>('/api/dashboard/staff-performance')
  }

  async getRiskFlagsByType(): Promise<Record<string, number>> {
    return this.fetch<Record<string, number>>('/api/dashboard/risk-flags-by-type')
  }

  async getTags(): Promise<Tag[]> {
    const response = await this.fetch<{ success: boolean; tags: Tag[] }>('/api/tags')
    return response.tags
  }

  async getTagAnalytics(): Promise<
    { tag_id: string; tag_name: string; count: number; avg_sentiment: number }[]
  > {
    return this.fetch<{ tag_id: string; tag_name: string; count: number; avg_sentiment: number }[]>(
      '/api/dashboard/tag-analytics',
    )
  }

  async getStaffRiskHeatmap(): Promise<
    { staff_id: string; staff_name: string; risks: Record<string, number> }[]
  > {
    return this.fetch<{ staff_id: string; staff_name: string; risks: Record<string, number> }[]>(
      '/api/dashboard/staff-risk-heatmap',
    )
  }

  async getStaffAttitudeBreakdown(): Promise<Record<string, Record<string, number>>> {
    return this.fetch<Record<string, Record<string, number>>>(
      '/api/dashboard/staff-attitude-breakdown',
    )
  }
}

export const api = new ApiService()
