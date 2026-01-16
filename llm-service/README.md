# LLM Service

Python FastAPI service for analyzing customer service conversations using Google Vertex AI (Gemini).

## Features

-   Analyzes conversation messages for sentiment, staff quality, and risk flags
-   Detects auto-replies
-   Identifies risk types: non_compliant, incorrect_info, unprofessional, missed_opportunity

## Setup

```bash
uv sync
```

## Run

```bash
uv run python main.py
```

## API Endpoints

-   `POST /analyze` - Analyze a conversation
-   `GET /health` - Health check
