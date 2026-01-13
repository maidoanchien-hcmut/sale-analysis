package handlers

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"sale-analysis-backend/src/config"
	"sale-analysis-backend/src/database"
	"sale-analysis-backend/src/models"
	"sale-analysis-backend/src/pipeline"
	"sale-analysis-backend/src/utils"
)

func HandleProcess(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, false, "Error reading uploaded file", nil)
		return
	}
	defer file.Close()

	// Save upload streaming while hashing
	timestamp := time.Now().Unix()
	origName := "upload.json"
	if header != nil && header.Filename != "" {
		origName = header.Filename
	}
	filename := fmt.Sprintf("upload_%d.json", timestamp)
	inputPath := filepath.Join(config.DirUpload, filename)

	dst, err := os.Create(inputPath)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Error creating file", err.Error())
		return
	}
	// Ensure input file is cleaned up after use
	defer func() { _ = os.Remove(inputPath) }()
	defer dst.Close()

	hasher := sha256.New()
	tee := io.TeeReader(file, hasher)
	if _, err := io.Copy(dst, tee); err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Error saving file", err.Error())
		return
	}
	hashHex := hex.EncodeToString(hasher.Sum(nil))

	// Duplicate check
	db, err := sql.Open("sqlite3", config.DbPath)
	if err == nil {
		defer db.Close()
		var exists int
		_ = db.QueryRow("SELECT 1 FROM processed_uploads WHERE file_hash = ?", hashHex).Scan(&exists)
		if exists == 1 {
			_ = os.Remove(inputPath)
			utils.JSONResponse(w, http.StatusConflict, false, "Duplicate file detected (same content)", map[string]string{"hash": hashHex})
			return
		}
	} else {
		log.Printf("Warning: cannot open DB for duplicate check: %v", err)
	}

	if !utils.ValidateJSONFormat(inputPath) {
		utils.JSONResponse(w, http.StatusBadRequest, false, "Invalid JSON format", nil)
		return
	}

	// NOTE: Do not record processed_uploads yet. We only record after successful DB import.

	// Sessionize in Go
	sessions, err := pipeline.Sessionize(inputPath, 24)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Sessionize failed", err.Error())
		return
	}
	log.Printf("Sessionized: %d sessions", len(sessions))

	// Analyze via Python per session with a small worker pool
	script := config.ScriptAnalyzer
	anOutName := fmt.Sprintf("%s_analyzed.json", filename)
	anOutPath := filepath.Join("./json/analyzed")
	if _, err := os.Stat(anOutPath); os.IsNotExist(err) {
		anOutPath = filepath.Join("../json/analyzed")
	}
	if err := os.MkdirAll(anOutPath, 0755); err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Failed to prepare output dir", err.Error())
		return
	}
	finalPath := filepath.Join(anOutPath, anOutName)

	outFile, err := os.Create(finalPath)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Failed to create analyzed file", err.Error())
		return
	}
	// Ensure analyzed file is cleaned up after completing the request
	defer func() { _ = os.Remove(finalPath) }()
	defer outFile.Close()

	// Stream JSON array
	outFile.Write([]byte("[\n"))

	type job struct {
		Index  int
		Sess   pipeline.Session
		Result []byte
		Err    error
	}

	jobs := make(chan job)
	results := make(chan job)
	var wg sync.WaitGroup
	workers := 1 // process sequentially to avoid API rate limits and match previous reliable behavior

	worker := func() {
		defer wg.Done()
		for j := range jobs {
			payload, _ := json.Marshal(j.Sess)
			var res []byte
			var err error
			for attempt := 0; attempt < 3; attempt++ {
				res, err = utils.CallPythonAnalyze(script, payload)
				if err == nil {
					break
				}
				// backoff: 1s, 3s, 7s
				delay := []time.Duration{time.Second, 3 * time.Second, 7 * time.Second}
				if attempt < len(delay) {
					time.Sleep(delay[attempt])
				}
			}
			j.Err = err
			j.Result = res
			results <- j
		}
	}

	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go worker()
	}

	go func() {
		for i, s := range sessions {
			jobs <- job{Index: i, Sess: s}
		}
		close(jobs)
	}()

	received := 0
	first := true
	for received < len(sessions) {
		j := <-results
		received++
		if j.Err != nil {
			// Fail fast: do not drop or synthesize; stop and return error
			log.Printf("Analyze failed for session %d: %v", j.Index, j.Err)
			outFile.Close()
			_ = os.Remove(finalPath)
			utils.JSONResponse(w, http.StatusInternalServerError, false, fmt.Sprintf("Analyzer failed at session %d", j.Index), j.Err.Error())
			return
		}
		if !first {
			outFile.Write([]byte(",\n"))
		}
		outFile.Write(j.Result)
		first = false
	}
	wg.Wait()
	outFile.Write([]byte("\n]\n"))

	// Import analyzed JSON
	if err := importToDB(finalPath); err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Database import failed", err.Error())
		return
	}

	// Now mark this hash as successfully processed so duplicates are blocked next time
	func() {
		if db != nil {
			if _, e := db.Exec("INSERT OR IGNORE INTO processed_uploads (file_hash, file_name) VALUES (?, ?)", hashHex, origName); e != nil {
				log.Printf("Warning: failed to record upload hash after import: %v", e)
			}
			return
		}
		// Fallback: open a new connection
		db2, e := sql.Open("sqlite3", config.DbPath)
		if e != nil {
			log.Printf("Warning: cannot open DB to record upload hash: %v", e)
			return
		}
		defer db2.Close()
		if _, e = db2.Exec("INSERT OR IGNORE INTO processed_uploads (file_hash, file_name) VALUES (?, ?)", hashHex, origName); e != nil {
			log.Printf("Warning: failed to record upload hash after import: %v", e)
		}
	}()

	// Return analyzed JSON
	data, err := os.ReadFile(finalPath)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Failed to read analyzed output", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func HandleDashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	db, err := sql.Open("sqlite3", config.DbPath)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Database open failed", err.Error())
		return
	}
	defer db.Close()

	totalSessions := database.QueryCount(db, `SELECT COUNT(*) FROM fact_sessions`)

	custBreakdown := database.QueryGroupedCounts(db, `
		SELECT c.customer_type, COUNT(*) as cnt
		FROM fact_sessions fs
		JOIN dim_customers c ON fs.customer_id = c.customer_id
		GROUP BY c.customer_type
		ORDER BY cnt DESC, c.customer_type ASC
	`)

	outcomeBreakdown := database.QueryGroupedCounts(db, `
		SELECT o.outcome_code, COUNT(*) as cnt
		FROM fact_sessions fs
		JOIN dim_outcomes o ON fs.outcome_id = o.outcome_id
		GROUP BY o.outcome_code
		ORDER BY cnt DESC, o.outcome_code ASC
	`)

	qualityBreakdown := database.QueryGroupedCounts(db, `
		SELECT q.quality_code, COUNT(*) as cnt
		FROM fact_sessions fs
		JOIN dim_quality q ON fs.quality_id = q.quality_id
		GROUP BY q.quality_code
		ORDER BY cnt DESC, q.quality_code ASC
	`)

	riskBreakdown := database.QueryGroupedCounts(db, `
		SELECT r.risk_code, COUNT(*) as cnt
		FROM fact_sessions fs
		JOIN dim_risks r ON fs.risk_id = r.risk_id
		GROUP BY r.risk_code
		ORDER BY cnt DESC, r.risk_code ASC
	`)

	avgResponseByOutcome := database.QueryGroupedAverages(db, `
		SELECT o.outcome_code, AVG(fs.avg_response_min)
		FROM fact_sessions fs
		JOIN dim_outcomes o ON fs.outcome_id = o.outcome_id
		WHERE fs.avg_response_min > 0
		GROUP BY o.outcome_code
		ORDER BY o.outcome_code ASC
	`)

	resp := map[string]interface{}{
		"total_sessions":            totalSessions,
		"sessions_by_customer_type": custBreakdown,
		"sessions_by_outcome":       outcomeBreakdown,
		"sessions_by_quality":       qualityBreakdown,
		"sessions_by_risk":          riskBreakdown,
		"avg_response_by_outcome":   avgResponseByOutcome,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func importToDB(jsonPath string) error {
	file, err := os.Open(jsonPath)
	if err != nil {
		return err
	}
	defer file.Close()

	db, err := sql.Open("sqlite3", config.DbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	dec := json.NewDecoder(file)
	// Expect a JSON array
	t, err := dec.Token()
	if err != nil {
		tx.Rollback()
		return err
	}
	if delim, ok := t.(json.Delim); !ok || delim != '[' {
		tx.Rollback()
		return fmt.Errorf("expected JSON array in analyzed output")
	}

	for dec.More() {
		var s models.AnalyzedSession
		if err := dec.Decode(&s); err != nil {
			tx.Rollback()
			return err
		}

		cusID := database.GetOrInsertDim(tx, "dim_customers", "customer_type", s.CustomerType)
		outID := database.GetOrInsertDim(tx, "dim_outcomes", "outcome_code", s.Outcome)
		qualID := database.GetOrInsertDim(tx, "dim_quality", "quality_code", s.RepQuality)
		riskID := database.GetOrInsertDim(tx, "dim_risks", "risk_code", s.RiskFlag)

		query := `
			INSERT INTO fact_sessions
			(session_id_original, customer_id, outcome_id, quality_id, risk_id,
			 start_time, end_time, message_count, avg_response_min, max_response_min,
			 outcome_reason_text, risk_evidence_text)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(session_id_original) DO UPDATE SET
			outcome_id=excluded.outcome_id, outcome_reason_text=excluded.outcome_reason_text;
		`
		if _, err = tx.Exec(query,
			s.SessionID, cusID, outID, qualID, riskID,
			s.Meta.StartTime, s.Meta.EndTime, s.Meta.MessageCount,
			s.Metrics.AvgResponseTimeMinutes, s.Metrics.MaxResponseTimeMinutes,
			s.OutcomeReason, s.RiskEvidence,
		); err != nil {
			tx.Rollback()
			return err
		}
	}

	// Consume closing ']'
	_, err = dec.Token()
	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

func queryGroupedCounts(db *sql.DB, query string) map[string]int {
	rows, err := db.Query(query)
	if err != nil {
		return map[string]int{}
	}
	defer rows.Close()

	res := make(map[string]int)
	for rows.Next() {
		var key string
		var count int
		if err := rows.Scan(&key, &count); err == nil {
			if key == "" {
				key = "(empty)"
			}
			res[key] = count
		}
	}
	return res
}

func queryGroupedAverages(db *sql.DB, query string) map[string]float64 {
	rows, err := db.Query(query)
	if err != nil {
		return map[string]float64{}
	}
	defer rows.Close()

	res := make(map[string]float64)
	for rows.Next() {
		var key string
		var avg float64
		if err := rows.Scan(&key, &avg); err == nil {
			if key == "" {
				key = "(empty)"
			}
			res[key] = avg
		}
	}
	return res
}
