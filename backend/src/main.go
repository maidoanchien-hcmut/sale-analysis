package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const (
	Port       = ":8080"
	DbPath     = "./sql/chat.db"
	SchemaPath = "./sql/schema.sql"
	PythonCmd  = "python"

	ScriptSessionizer = "./script/sessionizer.py"
	ScriptAnalyzer    = "./script/session_analyzer.py"

	DirSample = "./json/sample"
)

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
		AvgResponseMin float64 `json:"avg_response_min"`
		MaxResponseMin float64 `json:"max_response_min"`
	} `json:"metrics"`
	Meta struct {
		StartTime    string `json:"start_time"`
		EndTime      string `json:"end_time"`
		MessageCount int    `json:"msg_count"`
	} `json:"meta"`
}

func main() {
	initDB()

	os.MkdirAll(DirSample, 0755)

	http.HandleFunc("/api/process", corsMiddleware(handleProcess))

	fmt.Printf("Server running at http://localhost%s\n", Port)
	log.Fatal(http.ListenAndServe(Port, nil))
}

func handleProcess(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, false, "Error reading uploaded file", nil)
		return
	}
	defer file.Close()

	timestamp := time.Now().Unix()
	filename := fmt.Sprintf("upload_%d.json", timestamp)
	inputPath := filepath.Join(DirSample, filename)

	dst, err := os.Create(inputPath)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, false, "Error creating file", err.Error())
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		jsonResponse(w, http.StatusInternalServerError, false, "Error writing file", err.Error())
		return
	}

	if !validateJSONFormat(inputPath) {
		jsonResponse(w, http.StatusBadRequest, false, "Invalid JSON format", nil)
		return
	}

	log.Printf("Running Sessionizer on %s...", inputPath)
	sessionizedPath, err := runPythonScript(ScriptSessionizer, inputPath)
	if err != nil {
		log.Printf("Sessionizer Error: %v", err)
		jsonResponse(w, http.StatusInternalServerError, false, "Sessionizer failed", err.Error())
		return
	}
	log.Printf("Sessionizer output: %s", sessionizedPath)

	log.Printf("Running Analyzer on %s...", sessionizedPath)
	analyzedPath, err := runPythonScript(ScriptAnalyzer, sessionizedPath)
	if err != nil {
		log.Printf("Analyzer Error: %v", err)
		jsonResponse(w, http.StatusInternalServerError, false, "Analyzer failed", err.Error())
		return
	}
	log.Printf("Analyzer output: %s", analyzedPath)

	// Read analyzed file to get session count and prepare response body
	analyzedData, err := os.ReadFile(analyzedPath)
	if err != nil {
		log.Printf("Error reading analyzed output: %v", err)
		jsonResponse(w, http.StatusInternalServerError, false, "Failed to read analyzer output", err.Error())
		return
	}

	var sessions []AnalyzedSession
	if err := json.Unmarshal(analyzedData, &sessions); err != nil {
		log.Printf("Error parsing analyzed JSON: %v", err)
		jsonResponse(w, http.StatusInternalServerError, false, "Invalid analyzed JSON format", err.Error())
		return
	}

	log.Printf("Importing to SQLite... (%d sessions)", len(sessions))
	if err := importToDB(analyzedPath); err != nil {
		log.Printf("Database import error: %v", err)
		jsonResponse(w, http.StatusInternalServerError, false, "Database import failed", err.Error())
		return
	}

	log.Printf("Import completed: %d sessions imported from %s", len(sessions), analyzedPath)

	// 6. Return Data (use already-read bytes)
	w.Header().Set("Content-Type", "application/json")
	w.Write(analyzedData)
}

func validateJSONFormat(filePath string) bool {
	file, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer file.Close()

	var data InputJSON
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&data); err != nil {
		return false
	}

	if len(data.Messages) == 0 {
		return false
	}

	firstMsg := data.Messages[0]
	if firstMsg.SenderName == "" || firstMsg.Timestamp == "" || firstMsg.Content == "" {
		return false
	}

	return true
}

func runPythonScript(scriptPath, inputPath string) (string, error) {
	cmd := exec.Command(PythonCmd, scriptPath, inputPath)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("script execution failed: %v | stderr: %s | stdout: %s", err, strings.TrimSpace(stderr.String()), strings.TrimSpace(stdout.String()))
	}

	outStr := strings.TrimSpace(stdout.String())
	if outStr != "" {
		lines := strings.Split(outStr, "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			line := strings.TrimSpace(lines[i])
			if line != "" {
				return line, nil
			}
		}
	}

	combined := strings.TrimSpace(stderr.String() + "\n" + stdout.String())
	lines := strings.Split(combined, "\n")
	for _, line := range lines {
		if strings.Contains(line, "Success: Saved") {
			parts := strings.Split(line, " to ")
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1]), nil
			}
		}
	}

	return "", errors.New("could not find output path in python script output")
}

func initDB() {
	db, err := sql.Open("sqlite3", DbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	schema, err := os.ReadFile(SchemaPath)
	if err != nil {
		log.Fatal("Could not read schema.sql:", err)
	}

	_, err = db.Exec(string(schema))
	if err != nil {
		log.Fatal("Database initialization failed:", err)
	}
	log.Println("Database initialized.")
}

func importToDB(jsonPath string) error {
	file, err := os.Open(jsonPath)
	if err != nil {
		return err
	}
	defer file.Close()

	var sessions []AnalyzedSession
	if err := json.NewDecoder(file).Decode(&sessions); err != nil {
		return err
	}

	db, err := sql.Open("sqlite3", DbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	for _, s := range sessions {
		cusID := getOrInsertDim(tx, "dim_customers", "customer_type", s.CustomerType)
		outID := getOrInsertDim(tx, "dim_outcomes", "outcome_code", s.Outcome)
		qualID := getOrInsertDim(tx, "dim_quality", "quality_code", s.RepQuality)
		riskID := getOrInsertDim(tx, "dim_risks", "risk_code", s.RiskFlag)

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
			s.Metrics.AvgResponseMin, s.Metrics.MaxResponseMin,
			s.OutcomeReason, s.RiskEvidence,
		)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func getOrInsertDim(tx *sql.Tx, table, col, val string) int64 {
	var id int64
	pkCol := "id"
	switch table {
	case "dim_customers":
		pkCol = "customer_id"
	case "dim_outcomes":
		pkCol = "outcome_id"
	case "dim_quality":
		pkCol = "quality_id"
	case "dim_risks":
		pkCol = "risk_id"
	}

	querySelect := fmt.Sprintf("SELECT %s FROM %s WHERE %s = ?", pkCol, table, col)
	err := tx.QueryRow(querySelect, val).Scan(&id)

	if err == sql.ErrNoRows {
		queryInsert := fmt.Sprintf("INSERT INTO %s (%s) VALUES (?)", table, col)
		res, err := tx.Exec(queryInsert, val)
		if err != nil {
			log.Printf("Error inserting dim %s: %v", table, err)
			return 0
		}
		id, _ = res.LastInsertId()
	}
	return id
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func jsonResponse(w http.ResponseWriter, code int, success bool, msg string, data interface{}) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": success,
		"message": msg,
		"data":    data,
	})
}
