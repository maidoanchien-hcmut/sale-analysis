import os
import json
import logging
from typing import List, Optional, Literal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
from google.oauth2 import service_account
from dotenv import load_dotenv
from pathlib import Path

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load shared root .env (monorepo)
REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

app = FastAPI()

SERVICE_ACCOUNT_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
LOCATION = os.getenv("GCP_LOCATION", "us-central1")
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-2.0-flash")

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


try:
    credentials, project_id = get_credentials_and_project()
    vertexai.init(project=project_id, location=LOCATION, credentials=credentials)
    model = GenerativeModel(MODEL_NAME)
    logger.info(f"✅ Vertex AI Initialized: {project_id} / {MODEL_NAME}")
except Exception as e:
    logger.error(f"❌ Failed to initialize Vertex AI: {e}")
    raise e

class Tag(BaseModel):
    id: str
    name: str

class IncrementalAnalysisRequest(BaseModel):
    transcript_delta: str
    previous_summary: str
    available_tags: List[Tag]
class AuditEvidence(BaseModel):
    category: str = Field(description="e.g., 'Risk', 'Competitor', 'Service'")
    quote: str = Field(description="Verbatim quote from the transcript proving the point.")

class AnalysisResult(BaseModel):
    # Maps to: conversations.contextSummary
    new_summary: str = Field(description="Updated summary combining previous context and new messages.")

    # Maps to: factChatAudit.sentimentLabel
    sentiment_label: Literal["Positive", "Negative", "Neutral"]

    # Maps to: factChatAudit.riskLevel
    risk_level: Literal["High", "Medium", "Safe"]

    # Maps to: factChatAudit.repQualityLabel
    rep_quality: Literal["Consultative", "Transactional", "Robot", "Pushy", "Negligent", "N/A"]

    # Maps to: factChatAudit.userIntent
    user_intent: str = Field(description="Short summary of what the user wants (e.g., 'Purchase Inquiry', 'Warranty Complaint').")

    # Maps to: factChatAudit.competitorsMentioned (JSON)
    competitors_mentioned: List[str] = Field(description="List of competitor names mentioned, if any.")

    # Maps to: factChatAudit.auditEvidenceJson (JSON)
    audit_evidence: List[AuditEvidence] = Field(description="Quotes supporting the analysis.")


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_incremental(data: IncrementalAnalysisRequest):
    tags_context = ", ".join([t.name for t in data.available_tags])
    user_prompt = f"""
    You are a CRM Quality Auditor. Analyze the update to this conversation.

    === PREVIOUS CONTEXT ===
    {data.previous_summary if data.previous_summary else "New conversation."}

    === NEW MESSAGES (Delta) ===
    {data.transcript_delta}

    === REFERENCE TAGS ===
    {tags_context}

    === TASKS ===
    1. **Summary**: Update the conversation summary to include the new events.
    2. **Sentiment**: Determine the CURRENT sentiment of the customer.
    3. **Risk**: Flag "High" if there is fraud, abuse, or severe negligence. "Safe" otherwise.
    4. **Rep Quality**: Evaluate how the staff is handling the *new* messages (Consultative vs Transactional vs Robot).
    5. **Intent**: What is the customer trying to achieve right now?
    6. **Competitors**: Extract names of any other businesses mentioned.
    7. **Evidence**: Extract quotes from the NEW MESSAGES to support your risk or quality assessment.

    Output strict JSON.
    """

    try:
        response = model.generate_content(
            contents=user_prompt,
            config=GenerationConfig(
                response_mime_type="application/json",
                response_schema=AnalysisResult.model_json_schema(),
                temperature=0.2,
            ),
        )

        result_json = json.loads(response.text)
        return result_json

    except Exception as e:
        logger.error(f"Vertex Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)