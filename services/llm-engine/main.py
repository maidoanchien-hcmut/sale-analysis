import os
import json
import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pathlib import Path

# Google Libraries
import vertexai
from vertexai.generative_models import GenerativeModel
from google.oauth2 import service_account
from dotenv import load_dotenv

# Import the logic function, NOT the class
from analyzer import run_analysis_loop

# --- 1. Setup & Config (Your Original Code) ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Monorepo Root Resolution
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

# Database path resolution
# Prefer PYTHON_SQLITE_DB_PATH for python service (relative to repo root), then SQLITE_DB_PATH
# - If the env path is relative, treat it as relative to repo root
# - Fallback to the historical default in this repo
_sqlite_env = os.getenv("PYTHON_SQLITE_DB_PATH")
if _sqlite_env:
    env_path = Path(_sqlite_env)
    DB_PATH = env_path if env_path.is_absolute() else (ROOT / env_path)
else:
    DB_PATH = ROOT / "apps" / "backend" / "db" / "production.db"

app = FastAPI()

SERVICE_ACCOUNT_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
LOCATION = os.getenv("GCP_LOCATION", "us-central1")
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-2.0-flash")

# --- 2. Initialization Logic ---
def get_credentials_and_project():
    if not SERVICE_ACCOUNT_PATH or not os.path.exists(SERVICE_ACCOUNT_PATH):
        raise FileNotFoundError(f"CRITICAL: Service account file not found at: {SERVICE_ACCOUNT_PATH}")
    try:
        creds = service_account.Credentials.from_service_account_file(SERVICE_ACCOUNT_PATH)
        with open(SERVICE_ACCOUNT_PATH, 'r') as f:
            data = json.load(f)
            proj_id = data.get("project_id")
        return creds, proj_id
    except Exception as e:
        raise RuntimeError(f"Error loading service account: {e}")

# Global Model Instance
model = None

@app.on_event("startup")
async def startup_event():
    """Initialize Vertex AI once on startup."""
    global model
    try:
        credentials, project_id = get_credentials_and_project()
        vertexai.init(project=project_id, location=LOCATION, credentials=credentials)

        model = GenerativeModel(
            MODEL_NAME,
            system_instruction="""You are a QA Data Analyst for a Vietnamese E-commerce company that sells both products and services.
Your task is to analyze customer service conversations and extract detailed metrics for BOD (Board of Directors) reporting.

CRITICAL REQUIREMENTS:

1. AUTO-REPLY DETECTION: All shop messages have the same sender_id. Distinguish automated replies (greetings, away messages, keyword-triggered) from human staff responses. Look for patterns like "Cảm ơn bạn đã liên hệ...", "Shop đang ngoài giờ làm việc...".

2. STAFF IDENTIFICATION: Look for staff signatures like "- NV Lan", "NVKD: Minh". All shop messages come from the company account, so signatures are the only way to identify individual staff.

3. LOCATION: Extract specific HCM district (Quận 1, Bình Thạnh, Gò Vấp, Thủ Đức, Huyện Củ Chi, etc.) or mark as "Ngoại tỉnh" for outside HCM.

4. EXACT QUOTES: For outcome reasons, risk evidence, and quality assessments - provide EXACT verbatim quotes from the conversation.

5. RISK FLAGS: Flag rude language, policy violations, misinformation, unprofessional behavior with exact evidence quotes.

6. CUSTOMER TYPES: Identify Underage, Parent of Underage, Student, Working Class based on conversation context.

Output strict JSON matching the provided schema."""
        )
        logger.info(f"Vertex AI Initialized: {project_id} / {MODEL_NAME}")
        logger.info(f"Database Path Target: {DB_PATH}")
    except Exception as e:
        logger.error(f"Failed to initialize Vertex AI: {e}")
        # Depending on strictness, you might want to raise e here to crash if init fails

# --- 3. Endpoints ---

@app.get("/")
async def root():
    return {"status": "LLM Engine Service is running"}

@app.post("/trigger-analysis")
async def trigger_analysis_endpoint(background_tasks: BackgroundTasks):
    """
    Endpoint called by Cron/Scheduler.
    Passes the GLOBAL model and DB_PATH to the analyzer function.
    """
    if not model:
        raise HTTPException(status_code=503, detail="Vertex AI Model not initialized")

    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"Database not found at {DB_PATH}")

    # Pass the heavy objects (model) and config (db_path) to the worker function
    background_tasks.add_task(run_analysis_loop, model, str(DB_PATH))

    return {"message": "Analysis started in background"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)