package pipeline

import (
	"encoding/json"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var (
	phoneRe = regexp.MustCompile(`(?:\+84|84|0)(?:[\s\.\-]?\d{1,3}){2,3}[\s\.\-]?\d{3,4}\b`)
	emailRe = regexp.MustCompile(`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`)
)

func anonymize(text string) string {
	text = phoneRe.ReplaceAllString(text, "[SDT]")
	text = emailRe.ReplaceAllString(text, "[EMAIL]")
	return text
}

type Message struct {
	SenderName string `json:"sender_name"`
	Timestamp  string `json:"timestamp"`
	Content    string `json:"content"`
}

type RawInput struct {
	Messages []Message `json:"messages"`
}

type Session struct {
	SessionID    string    `json:"session_id"`
	StartTime    string    `json:"start_time"`
	EndTime      string    `json:"end_time"`
	MessageCount int       `json:"message_count"`
	Messages     []Message `json:"messages"`
}

func Sessionize(filePath string, thresholdHours int) ([]Session, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var input RawInput
	dec := json.NewDecoder(f)
	if err := dec.Decode(&input); err != nil {
		return nil, err
	}
	if len(input.Messages) == 0 {
		return []Session{}, nil
	}

	sort.Slice(input.Messages, func(i, j int) bool {
		return input.Messages[i].Timestamp < input.Messages[j].Timestamp
	})

	sessions := [][]Message{}
	current := []Message{}
	var last time.Time
	for i, m := range input.Messages {
		m.Content = anonymize(m.Content)

		ts := m.Timestamp
		if ts == "" {
			continue
		}
		ts = strings.ReplaceAll(ts, "Z", "+00:00")
		cur, err := time.Parse(time.RFC3339Nano, ts)
		if err != nil {
			cur, err = time.Parse(time.RFC3339, ts)
			if err != nil {
				continue
			}
		}

		newSess := false
		if i > 0 {
			if !last.IsZero() && cur.Sub(last) > time.Duration(thresholdHours)*time.Hour {
				newSess = true
			}
		}

		if newSess && len(current) > 0 {
			sessions = append(sessions, current)
			current = []Message{}
		}

		current = append(current, m)
		last = cur
	}
	if len(current) > 0 {
		sessions = append(sessions, current)
	}

	if len(sessions) == 0 {
		return []Session{}, nil
	}

	out := make([]Session, 0, len(sessions))
	prefix := "sess_" + time.Now().UTC().Format("20060102T150405")
	for i, s := range sessions {
		out = append(out, Session{
			SessionID:    prefix + "_" + strconv.Itoa(i+1),
			StartTime:    s[0].Timestamp,
			EndTime:      s[len(s)-1].Timestamp,
			MessageCount: len(s),
			Messages:     s,
		})
	}
	return out, nil
}
