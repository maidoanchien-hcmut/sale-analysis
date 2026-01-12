
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dim_customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_type TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS dim_outcomes (
    outcome_id INTEGER PRIMARY KEY AUTOINCREMENT,
    outcome_code TEXT,
    outcome_reason TEXT
);

CREATE TABLE IF NOT EXISTS dim_quality (
    quality_id INTEGER PRIMARY KEY AUTOINCREMENT,
    quality_code TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS dim_risks (
    risk_id INTEGER PRIMARY KEY AUTOINCREMENT,
    risk_code TEXT UNIQUE
);


CREATE TABLE IF NOT EXISTS fact_sessions (
    session_key INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id_original TEXT UNIQUE,

    customer_id INTEGER,
    outcome_id INTEGER,
    quality_id INTEGER,
    risk_id INTEGER,

    start_time DATETIME,
    end_time DATETIME,
    message_count INTEGER,
    avg_response_min REAL,
    max_response_min REAL,

    outcome_reason_text TEXT,
    risk_evidence_text TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(customer_id) REFERENCES dim_customers(customer_id),
    FOREIGN KEY(outcome_id) REFERENCES dim_outcomes(outcome_id),
    FOREIGN KEY(quality_id) REFERENCES dim_quality(quality_id),
    FOREIGN KEY(risk_id) REFERENCES dim_risks(risk_id)
);

INSERT OR IGNORE INTO dim_risks (risk_code) VALUES ('none');