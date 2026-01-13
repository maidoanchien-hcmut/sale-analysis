package models

type InputJSON struct {
	Messages []struct {
		SenderName string `json:"sender_name"`
		Timestamp  string `json:"timestamp"`
		Content    string `json:"content"`
	} `json:"messages"`
}

type AnalyzedSession struct {
	SessionID     string `json:"session_id"`
	CustomerType  string `json:"customer_type"`
	Outcome       string `json:"outcome"`
	OutcomeReason string `json:"outcome_reason"`
	RepQuality    string `json:"rep_quality"`
	RiskFlag      string `json:"risk_flag"`
	RiskEvidence  string `json:"risk_evidence"`
	Metrics       struct {
		AvgResponseTimeMinutes float64 `json:"avg_response_time_minutes"`
		MaxResponseTimeMinutes float64 `json:"max_response_time_minutes"`
	} `json:"metrics"`
	Meta struct {
		StartTime    string `json:"start_time"`
		EndTime      string `json:"end_time"`
		MessageCount int    `json:"msg_count"`
	} `json:"meta"`
}
