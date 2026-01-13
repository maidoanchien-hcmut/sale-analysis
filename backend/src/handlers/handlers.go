package handlers

import (
	"bytes"
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
	"time"

	"sale-analysis-backend/src/config"
	"sale-analysis-backend/src/database"
	"sale-analysis-backend/src/models"
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

	var buf bytes.Buffer
	if _, err := io.Copy(&buf, file); err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Error buffering file", err.Error())
		return
	}
	contentBytes := buf.Bytes()
	fileHash := sha256.Sum256(contentBytes)
	hashHex := hex.EncodeToString(fileHash[:])

	db, err := sql.Open("sqlite3", config.DbPath)
	if err == nil {
		defer db.Close()
		var exists int
		_ = db.QueryRow("SELECT 1 FROM processed_uploads WHERE file_hash = ?", hashHex).Scan(&exists)
		if exists == 1 {
			utils.JSONResponse(w, http.StatusConflict, false, "Duplicate file detected (same content)", map[string]string{"hash": hashHex})
			return
		}
	} else {
		log.Printf("Warning: cannot open DB for duplicate check: %v", err)
	}

	timestamp := time.Now().Unix()
	origName := "upload.json"
	if header != nil && header.Filename != "" {
		origName = header.Filename
	}
	filename := fmt.Sprintf("upload_%d.json", timestamp)
	inputPath := filepath.Join(config.DirSample, filename)

	dst, err := os.Create(inputPath)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Error creating file", err.Error())
		return
	}
	defer dst.Close()

	if _, err := dst.Write(contentBytes); err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Error writing file", err.Error())
		return
	}

	if !utils.ValidateJSONFormat(inputPath) {
		utils.JSONResponse(w, http.StatusBadRequest, false, "Invalid JSON format", nil)
		return
	}

	if db != nil {
		_, err := db.Exec("INSERT OR IGNORE INTO processed_uploads (file_hash, file_name) VALUES (?, ?)", hashHex, origName)
		if err != nil {
			log.Printf("Warning: failed to record upload hash: %v", err)
		}
	}

	log.Printf("Running Sessionizer on %s...", inputPath)
	sessionizedPath, err := utils.RunPythonScript(config.ScriptSessionizer, inputPath)
	if err != nil {
		log.Printf("Sessionizer Error: %v", err)
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Sessionizer failed", err.Error())
		return
	}
	log.Printf("Sessionizer output: %s", sessionizedPath)

	log.Printf("Running Analyzer on %s...", sessionizedPath)
	analyzedPath, err := utils.RunPythonScript(config.ScriptAnalyzer, sessionizedPath)
	if err != nil {
		log.Printf("Analyzer Error: %v", err)
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Analyzer failed", err.Error())
		return
	}
	log.Printf("Analyzer output: %s", analyzedPath)

	analyzedData, err := os.ReadFile(analyzedPath)
	if err != nil {
		log.Printf("Error reading analyzed output: %v", err)
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Failed to read analyzer output", err.Error())
		return
	}

	var sessions []models.AnalyzedSession
	if err := json.Unmarshal(analyzedData, &sessions); err != nil {
		log.Printf("Error parsing analyzed JSON: %v", err)
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Invalid analyzed JSON format", err.Error())
		return
	}

	log.Printf("Importing to SQLite... (%d sessions)", len(sessions))
	if err := importToDB(analyzedPath); err != nil {
		log.Printf("Database import error: %v", err)
		utils.JSONResponse(w, http.StatusInternalServerError, false, "Database import failed", err.Error())
		return
	}

	log.Printf("Import completed: %d sessions imported from %s", len(sessions), analyzedPath)

	w.Header().Set("Content-Type", "application/json")
	w.Write(analyzedData)
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

	var sessions []models.AnalyzedSession
	if err := json.NewDecoder(file).Decode(&sessions); err != nil {
		return err
	}

	db, err := sql.Open("sqlite3", config.DbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	for _, s := range sessions {
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
		_, err = tx.Exec(query,
			s.SessionID, cusID, outID, qualID, riskID,
			s.Meta.StartTime, s.Meta.EndTime, s.Meta.MessageCount,
			s.Metrics.AvgResponseTimeMinutes, s.Metrics.MaxResponseTimeMinutes,
			s.OutcomeReason, s.RiskEvidence,
		)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func queryCount(db *sql.DB, query string) int {
	var count int
	err := db.QueryRow(query).Scan(&count)
	if err != nil {
		log.Printf("Error executing query: %v", err)
		return 0
	}
	return count
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
