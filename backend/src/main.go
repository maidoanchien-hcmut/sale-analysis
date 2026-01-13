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
	Port = ":8080"
)

var (
	DbPath            string
	SchemaPath        string
	PythonCmd         string
	ScriptSessionizer string
	ScriptAnalyzer    string
	DirSample         string
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
	initConfig()
	initDB()

	os.MkdirAll(DirSample, 0755)

	http.HandleFunc("/api/process", corsMiddleware(handleProcess))
	http.HandleFunc("/api/dashboard", corsMiddleware(handleDashboard))

	fmt.Printf("Server running at http://localhost%s\n", Port)
	log.Fatal(http.ListenAndServe(Port, nil))
}

func initConfig() {
	if v := os.Getenv("PYTHON_CMD"); v != "" {
		PythonCmd = v
		log.Printf("Using PYTHON_CMD from env: %s", PythonCmd)
		return
	}

	searchPaths := []string{
		".",
		"..",
		"../..",
	}

	venvFound := false
	for _, root := range searchPaths {
		possiblePythons := []string{
			filepath.Join(root, ".venv", "Scripts", "python.exe"),
			filepath.Join(root, ".venv", "bin", "python3"),
			filepath.Join(root, ".venv", "bin", "python"),
		}

		for _, p := range possiblePythons {
			if _, err := os.Stat(p); err == nil {
				if absPath, err := filepath.Abs(p); err == nil {
					PythonCmd = absPath
				} else {
					PythonCmd = p
				}
				venvFound = true
				log.Printf("Found project root .venv: %s", PythonCmd)
				break
			}
		}
		if venvFound {
			break
		}
	}

	if !venvFound {
		log.Println("Project .venv not found. Falling back to system python...")
		for _, name := range []string{"python3", "python"} {
			if p, err := exec.LookPath(name); err == nil {
				PythonCmd = p
				break
			}
		}
	}

	if PythonCmd == "" {
		log.Fatal("Python executable not found. Please ensure .venv exists at project root or set PYTHON_CMD.")
	}

	scriptDir := "./script"
	if _, err := os.Stat(scriptDir); os.IsNotExist(err) {
		scriptDir = "../script"
	}

	ScriptSessionizer = filepath.Join(scriptDir, "sessionizer.py")
	ScriptAnalyzer = filepath.Join(scriptDir, "session_analyzer.py")

	if v := os.Getenv("DB_PATH"); v != "" {
		DbPath = v
	} else {
		if _, err := os.Stat("./sql"); err == nil {
			DbPath = "./sql/chat.db"
		} else {
			DbPath = "../sql/chat.db"
		}
	}

	if v := os.Getenv("SCHEMA_PATH"); v != "" {
		SchemaPath = v
	} else {
		if _, err := os.Stat("./sql/schema.sql"); err == nil {
			SchemaPath = "./sql/schema.sql"
		} else {
			SchemaPath = "../sql/schema.sql"
		}
	}

	if v := os.Getenv("SAMPLE_DIR"); v != "" {
		DirSample = v
	} else {
		if _, err := os.Stat("./json/sample"); err == nil {
			DirSample = "./json/sample"
		} else {
			DirSample = "../json/sample"
		}
	}

	log.Printf("Config: Python=%s, Scripts=%s", PythonCmd, scriptDir)
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

func handleDashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	db, err := sql.Open("sqlite3", DbPath)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, false, "Database open failed", err.Error())
		return
	}
	defer db.Close()

	// Totals
	totalSessions := queryCount(db, `SELECT COUNT(*) FROM fact_sessions`)

	// Breakdown: sessions by customer type
	custBreakdown := queryGroupedCounts(db, `
		SELECT c.customer_type, COUNT(*) as cnt
		FROM fact_sessions fs
		JOIN dim_customers c ON fs.customer_id = c.customer_id
		GROUP BY c.customer_type
		ORDER BY cnt DESC, c.customer_type ASC
	`)

	// Breakdown: sessions by outcomes
	outcomeBreakdown := queryGroupedCounts(db, `
		SELECT o.outcome_code, COUNT(*) as cnt
		FROM fact_sessions fs
		JOIN dim_outcomes o ON fs.outcome_id = o.outcome_id
		GROUP BY o.outcome_code
		ORDER BY cnt DESC, o.outcome_code ASC
	`)

	// Breakdown: sessions by quality
	qualityBreakdown := queryGroupedCounts(db, `
		SELECT q.quality_code, COUNT(*) as cnt
		FROM fact_sessions fs
		JOIN dim_quality q ON fs.quality_id = q.quality_id
		GROUP BY q.quality_code
		ORDER BY cnt DESC, q.quality_code ASC
	`)

	// Breakdown: sessions by risk
	riskBreakdown := queryGroupedCounts(db, `
		SELECT r.risk_code, COUNT(*) as cnt
		FROM fact_sessions fs
		JOIN dim_risks r ON fs.risk_id = r.risk_id
		GROUP BY r.risk_code
		ORDER BY cnt DESC, r.risk_code ASC
	`)

	resp := map[string]interface{}{
		"total_sessions":            totalSessions,
		"sessions_by_customer_type": custBreakdown,
		"sessions_by_outcome":       outcomeBreakdown,
		"sessions_by_quality":       qualityBreakdown,
		"sessions_by_risk":          riskBreakdown,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func queryCount(db *sql.DB, query string) int {
	var n int
	row := db.QueryRow(query)
	if err := row.Scan(&n); err != nil {
		return 0
	}
	return n
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
