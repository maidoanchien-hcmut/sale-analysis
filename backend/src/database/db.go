package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"sale-analysis-backend/src/config"

	_ "github.com/mattn/go-sqlite3"
)

func Init() {
	db, err := sql.Open("sqlite3", config.DbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	schema, err := os.ReadFile(config.SchemaPath)
	if err != nil {
		log.Fatal("Could not read schema.sql:", err)
	}

	_, err = db.Exec(string(schema))
	if err != nil {
		log.Fatal("Database initialization failed:", err)
	}
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS processed_uploads (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			file_hash TEXT UNIQUE,
			file_name TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	log.Println("Database initialized.")
}

func GetOrInsertDim(tx *sql.Tx, table, col, val string) int64 {
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

func QueryCount(db *sql.DB, query string) int {
	var n int
	row := db.QueryRow(query)
	if err := row.Scan(&n); err != nil {
		return 0
	}
	return n
}

func QueryGroupedCounts(db *sql.DB, query string) map[string]int {
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

func QueryGroupedAverages(db *sql.DB, query string) map[string]float64 {
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
