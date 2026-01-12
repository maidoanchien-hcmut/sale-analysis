
CREATE TABLE dim_date (
    date_key INT PRIMARY KEY,
    full_date DATE,
    day_of_week TEXT,
    day_name TEXT,
    day_of_month INT,
    month INT,
    quarter INT,
    year INT,
    is_weekend BOOLEAN
);

CREATE TABLE dim_time (
    time_key INT PRIMARY KEY,
    hour_24 INT,
    time_of_day TEXT
);

CREATE TABLE dim_customer_segments (
    segment_key SERIAL PRIMARY KEY,
    customer_type_code TEXT,
    customer_group TEXT,
    description TEXT
);

CREATE TABLE dim_outcomes (
    outcome_key SERIAL PRIMARY KEY,
    outcome_code TEXT,
    outcome_group TEXT,
    is_revenue_generating BOOLEAN
);

CREATE TABLE dim_quality (
    quality_key SERIAL PRIMARY KEY,
    quality_code TEXT,
    sentiment_score INT DEFAULT 0
);

CREATE TABLE dim_risks (
    risk_key SERIAL PRIMARY KEY,
    risk_code TEXT,
    risk_level TEXT
);

CREATE TABLE fact_sessions (
    session_key SERIAL PRIMARY KEY,
    session_id_original TEXT UNIQUE,

    date_key INT REFERENCES dim_date(date_key),
    time_key INT REFERENCES dim_time(time_key),
    segment_key INT REFERENCES dim_customer_segments(segment_key),
    outcome_key INT REFERENCES dim_outcomes(outcome_key),
    quality_key INT REFERENCES dim_quality(quality_key),
    risk_key INT REFERENCES dim_risks(risk_key),

    duration_seconds INT,
    message_count INT,
    avg_response_lag_min DECIMAL(10,2),
    max_response_lag_min DECIMAL(10,2),

    is_won INT DEFAULT 0,
    is_ghost INT DEFAULT 0,
    has_risk INT DEFAULT 0,

    outcome_reason TEXT,
    risk_evidence TEXT,
    conversation_summary TEXT
);