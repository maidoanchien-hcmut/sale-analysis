"""
LLM Service for Customer Service QA Analysis
Uses Google Vertex AI (Gemini) to analyze customer service conversations
Simplified version: sentiment detection, risk flag identification, ticket creation
"""

import os
import json
import sqlite3
import re
import signal
import sys
from datetime import datetime
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig

# Load environment variables from parent .env file
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Initialize Vertex AI
GOOGLE_APPLICATION_CREDENTIALS = os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS", "sa.json")
GOOGLE_CLOUD_REGION = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-2.5-flash")

# Set credentials path
sa_path = Path(__file__).parent.parent / GOOGLE_APPLICATION_CREDENTIALS
if sa_path.exists():
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(sa_path)

# Database path
DB_PATH = Path(__file__).parent.parent / "backend" / "customer_service_qa.db"

app = FastAPI(title="Customer Service QA LLM Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class AnalyzeResponse(BaseModel):
    success: bool
    analyzed_count: int
    tickets_created: int
    risk_flags_created: int
    errors: list[str]


# LLM Response models
class TicketAnalysis(BaseModel):
    start_message_id: str
    start_time: str
    end_message_id: str = ""
    end_time: str = ""
    sentiment: str = "neutral"  # positive, neutral, negative
    outcome: str = ""
    # enthusiastic, professional, mechanical, pushy, rude
    staff_attitude: str = "professional"
    staff_quality: str = "average"  # excellent, good, average, poor
    is_resolved: bool = False


class RiskFlag(BaseModel):
    message_id: str = ""
    type: str = ""  # non_compliant, unprofessional, missed_opportunity


class LLMAnalysisResult(BaseModel):
    tickets: list[TicketAnalysis] = []
    auto_reply_message_ids: list[str] = []
    risk_flags: list[RiskFlag] = []
    staff_name: Optional[str] = None


# Analysis prompt with training framework rules
ANALYSIS_PROMPT = """Bạn là chuyên gia QA phân tích chất lượng dịch vụ khách hàng cho phòng khám da liễu O2 SKIN.

**QUY ĐỊNH NỘI BỘ (Nguyên tắc vàng):**
1. Định danh & xưng hô: CẤM dùng "Ad/Admin/Shop/Page". Phải mở đầu "{{Tên}} – tư vấn viên O2 SKIN".
2. SLA phản hồi: Lead mới ≤5 phút; trong hội thoại ≤2 phút/tin.
3. Đúng intent trước: Khách hỏi giờ/địa chỉ/giá → trả lời thẳng trước.
4. Giới hạn câu hỏi: Tối đa 2 câu hỏi/lượt.
5. Value exchange: Trước khi xin ảnh/SĐT/CCCD, cho khách giá trị trước.
6. Xin ảnh 2 tầng: KHÔNG xin đủ "3 góc" ngay.
7. Không "hứa chắc": CẤM đảm bảo khỏi/không rủi ro.
8. Độ dài tin nhắn: Ưu tiên 1-3 dòng/tin.

---

**Thông tin khách hàng:**
- Tên: {customer_name}
- Tags: {customer_tags}

**Tin nhắn (theo thứ tự thời gian):**
{messages}

---

**YÊU CẦU PHÂN TÍCH:**

1. **Phân chia Tickets**: Mỗi ticket là một chủ đề/vấn đề riêng. Ghi nhận message ID và thời gian đầu/cuối.

2. **Cho mỗi ticket, phân tích:**
   - sentiment: "positive" / "neutral" / "negative"
   - outcome: Tóm tắt ngắn gọn (tối đa 50 ký tự)
   - staff_attitude: "enthusiastic" / "professional" / "mechanical" / "pushy" / "rude"
   - staff_quality: "excellent" / "good" / "average" / "poor"
   - is_resolved: true / false

3. **Auto-reply Detection**: Liệt kê message_id của các tin nhắn tự động (chatbot/auto-reply), không phải từ nhân viên thật. Đặc điểm:
   - Phản hồi ngay lập tức (trong vài giây)
   - Nội dung chào hỏi chung chung, template
   - Yêu cầu để lại thông tin
   - Thông báo ngoài giờ làm việc

4. **Risk Flags** - Đánh dấu tin nhắn có vấn đề:

   | Type | Mô tả |
   |------|-------|
   | non_compliant | Vi phạm bất kỳ quy định nội bộ nào (8 điều trên) |
   | unprofessional | Thái độ không chuyên nghiệp (cộc lốc, tranh cãi) |
   | missed_opportunity | Bỏ lỡ cơ hội chốt hẹn khi khách quan tâm |

   Mỗi risk flag chỉ cần:
   - message_id: ID tin nhắn vi phạm
   - type: loại risk

5. **Nhân viên phụ trách**: Xác định từ tags (thường "H.xxx" hoặc "Sale xxx") hoặc từ lời chào

**Output format (JSON):**
```json
{{
  "tickets": [
    {{
      "start_message_id": "msg_1",
      "start_time": "2024-01-15T10:00:00",
      "end_message_id": "msg_5",
      "end_time": "2024-01-15T10:30:00",
      "sentiment": "positive",
      "outcome": "Đặt hẹn lấy mụn thành công",
      "staff_attitude": "professional",
      "staff_quality": "good",
      "is_resolved": true
    }}
  ],
  "auto_reply_message_ids": ["msg_1"],
  "risk_flags": [
    {{
      "message_id": "msg_3",
      "type": "non_compliant"
    }}
  ],
  "staff_name": "H. Anh"
}}
```

**LƯU Ý QUAN TRỌNG**:
- Sử dụng ĐÚNG message ID ngắn (msg_1, msg_2, ...) như trong danh sách tin nhắn.
- outcome phải NGẮN GỌN (tối đa 50 ký tự).
- Chỉ trả về JSON hợp lệ, không có text khác."""


def get_db_connection():
    """Get SQLite database connection with busy timeout"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA busy_timeout = 5000")  # Wait up to 5s if locked
    return conn


def get_conversation_data(conversation_id: str) -> Optional[dict]:
    """Get conversation and unanalyzed messages from database"""
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # Get conversation
        cursor.execute("SELECT * FROM conversations WHERE id = ?",
                       (conversation_id,))
        conv_row = cursor.fetchone()
        if not conv_row:
            return None
        conversation = dict(conv_row)

        # Get all messages for this conversation
        cursor.execute(
            """SELECT m.* FROM messages m
            WHERE m.conversation_id = ?
            ORDER BY m.inserted_at ASC""",
            (conversation_id,),
        )
        all_messages = [dict(row) for row in cursor.fetchall()]

        # Get all analyzed message IDs (messages that are start or end of any ticket)
        cursor.execute(
            """SELECT start_message_id FROM tickets WHERE conversation_id = ?
            UNION
            SELECT end_message_id FROM tickets WHERE conversation_id = ?""",
            (conversation_id, conversation_id),
        )
        analyzed_msg_ids = set(row[0] for row in cursor.fetchall())

        # Get message ranges covered by tickets (all messages between start and end)
        cursor.execute(
            """SELECT start_message_id, end_message_id FROM tickets
            WHERE conversation_id = ?""",
            (conversation_id,),
        )
        ticket_ranges = cursor.fetchall()

        # Build set of covered message indices
        covered_indices = set()
        msg_id_to_idx = {msg["id"]: idx for idx,
                         msg in enumerate(all_messages)}

        for start_id, end_id in ticket_ranges:
            start_idx = msg_id_to_idx.get(start_id)
            end_idx = msg_id_to_idx.get(end_id)
            if start_idx is not None and end_idx is not None:
                for idx in range(start_idx, end_idx + 1):
                    covered_indices.add(idx)

        # Filter to only unanalyzed messages
        messages = [msg for idx, msg in enumerate(
            all_messages) if idx not in covered_indices]

        # Get tags
        cursor.execute(
            """SELECT t.* FROM tags t
            JOIN conversation_tags ct ON t.id = ct.tag_id
            WHERE ct.conversation_id = ?""",
            (conversation_id,),
        )
        tags = [dict(row) for row in cursor.fetchall()]

        # Get customer if exists
        customer = None
        if conversation.get("customer_id"):
            cursor.execute("SELECT * FROM customers WHERE id = ?",
                           (conversation["customer_id"],))
            cust_row = cursor.fetchone()
            if cust_row:
                customer = dict(cust_row)

        return {
            "conversation": conversation,
            "messages": messages,
            "tags": tags,
            "customer": customer,
        }
    finally:
        conn.close()


def format_messages_for_prompt(messages: list[dict]) -> tuple[str, dict]:
    """Format messages for LLM prompt with short IDs

    Returns:
        tuple: (formatted_text, id_mapping) where id_mapping maps short_id -> real_id
    """
    formatted = []
    id_mapping = {}  # short_id -> real_id

    for i, msg in enumerate(messages):
        short_id = f"msg_{i+1}"  # Use 1-based index for readability
        real_id = msg.get("id", short_id)
        id_mapping[short_id] = real_id

        content = msg.get("content", "")
        time = msg.get("inserted_at", "")[:19]
        is_auto = "[AUTO]" if msg.get("is_auto_reply") else ""
        formatted.append(f"[{short_id}] [{time}] {is_auto} {content}")

    return "\n".join(formatted), id_mapping


def analyze_conversation_with_llm(data: dict) -> dict:
    """Analyze conversation using Vertex AI Gemini"""
    conversation = data["conversation"]
    messages = data["messages"]
    tags = data.get("tags", [])
    customer = data.get("customer") or {}

    tag_texts = [t.get("name", "") for t in tags]

    # Format prompt with short IDs to prevent truncation
    formatted_messages, id_mapping = format_messages_for_prompt(messages)

    prompt = ANALYSIS_PROMPT.format(
        customer_name=customer.get("name") or conversation.get(
            "customer_name", "Unknown"),
        customer_tags=", ".join(tag_texts) if tag_texts else "None",
        messages=formatted_messages,
    )

    # Initialize Vertex AI model
    project_id = None
    sa_path = Path(__file__).parent.parent / GOOGLE_APPLICATION_CREDENTIALS
    if sa_path.exists():
        with open(sa_path) as f:
            sa_data = json.load(f)
            project_id = sa_data.get("project_id")

    if project_id:
        vertexai.init(project=project_id, location=GOOGLE_CLOUD_REGION)

    model = GenerativeModel(MODEL_NAME)

    # Generate response
    generation_config = GenerationConfig(
        temperature=0.2,
        max_output_tokens=8192,
        response_mime_type="application/json",
    )

    response = model.generate_content(
        prompt, generation_config=generation_config)

    # Parse JSON response using Pydantic for validation
    try:
        # Try to parse directly
        result_data = json.loads(response.text)
    except json.JSONDecodeError as e:
        # Try to extract JSON from response
        json_match = re.search(r"\{[\s\S]*\}", response.text)
        if json_match:
            try:
                result_data = json.loads(json_match.group())
            except json.JSONDecodeError:
                # Response is truncated - return empty result
                print(f"   ⚠️ JSON truncated, returning empty result")
                result_data = {"tickets": [],
                               "auto_reply_message_ids": [], "risk_flags": []}
        else:
            # No valid JSON found - return empty result
            print(f"   ⚠️ No valid JSON found, returning empty result")
            result_data = {"tickets": [],
                           "auto_reply_message_ids": [], "risk_flags": []}

    # Validate with Pydantic
    validated_result = LLMAnalysisResult.model_validate(result_data)

    # Convert back to dict
    result = validated_result.model_dump()

    # Map short IDs back to real IDs
    for ticket in result.get("tickets", []):
        if ticket.get("start_message_id") in id_mapping:
            ticket["start_message_id"] = id_mapping[ticket["start_message_id"]]
        if ticket.get("end_message_id") in id_mapping:
            ticket["end_message_id"] = id_mapping[ticket["end_message_id"]]

    result["auto_reply_message_ids"] = [
        id_mapping.get(mid, mid) for mid in result.get("auto_reply_message_ids", [])
    ]

    for flag in result.get("risk_flags", []):
        if flag.get("message_id") in id_mapping:
            flag["message_id"] = id_mapping[flag["message_id"]]

    result["conversation_id"] = conversation["id"]
    return result


def save_analysis_result(result: dict, messages: list[dict]):
    """Save analysis result to database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        now = datetime.now().isoformat()
        conversation_id = result["conversation_id"]
        tickets_created = 0
        risk_flags_created = 0

        # Get or create staff record
        staff_id = None
        staff_name = result.get("staff_name")
        if staff_name:
            cursor.execute(
                "SELECT id FROM staff WHERE name = ?", (staff_name,))
            row = cursor.fetchone()
            if row:
                staff_id = row[0]
            else:
                staff_id = f"staff_{staff_name.lower().replace(' ', '_').replace('.', '')}"
                # Use INSERT OR IGNORE to avoid duplicate key errors
                cursor.execute(
                    "INSERT OR IGNORE INTO staff (id, name) VALUES (?, ?)",
                    (staff_id, staff_name),
                )

        # Create tickets
        ticket_id = None
        for ticket in result.get("tickets", []):
            # Skip tickets without required fields
            if not ticket.get("start_message_id") or not ticket.get("start_time"):
                continue

            cursor.execute(
                """INSERT INTO tickets (
                    conversation_id, staff_id, start_message_id, started_at,
                    end_message_id, ended_at, sentiment, outcome,
                    staff_attitude, staff_quality, is_resolved, analyzed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    conversation_id,
                    staff_id,
                    ticket.get("start_message_id"),
                    ticket.get("start_time"),
                    ticket.get("end_message_id") or ticket.get(
                        "start_message_id"),
                    ticket.get("end_time") or ticket.get("start_time"),
                    ticket.get("sentiment", "neutral"),
                    ticket.get("outcome", ""),
                    ticket.get("staff_attitude", "professional"),
                    ticket.get("staff_quality", "average"),
                    1 if ticket.get("is_resolved") else 0,
                    now,
                ),
            )
            ticket_id = cursor.lastrowid
            tickets_created += 1

        # Mark auto-reply messages
        for message_id in result.get("auto_reply_message_ids", []):
            cursor.execute(
                "UPDATE messages SET is_auto_reply = 1 WHERE id = ?",
                (message_id,),
            )

        # Create risk flags and update messages
        for flag in result.get("risk_flags", []):
            message_id = flag.get("message_id")
            risk_type = flag.get("type")

            if not message_id or not risk_type:
                continue

            # Update message to mark it has risk flag
            cursor.execute(
                "UPDATE messages SET has_risk_flag = 1 WHERE id = ?",
                (message_id,),
            )

            # Create risk flag record (link to ticket if available)
            cursor.execute(
                "INSERT INTO risk_flags (message_id, ticket_id, risk_type) VALUES (?, ?, ?)",
                (message_id, ticket_id, risk_type),
            )
            risk_flags_created += 1

        conn.commit()
        return tickets_created, risk_flags_created
    finally:
        conn.close()


@app.get("/")
def root():
    return {"service": "Customer Service QA LLM", "status": "running"}


@app.get("/health")
def health():
    """Health check endpoint"""
    db_exists = DB_PATH.exists()
    return {
        "status": "healthy" if db_exists else "unhealthy",
        "database": str(DB_PATH),
        "database_exists": db_exists,
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze():
    """Analyze all conversations with unanalyzed messages"""
    analyzed_count = 0
    tickets_created = 0
    risk_flags_created = 0
    errors = []

    # Get conversations with unanalyzed messages
    # A conversation has unanalyzed messages if it has messages not covered by any ticket's message range
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Get all conversations that have messages
        cursor.execute(
            """SELECT DISTINCT c.id
            FROM conversations c
            JOIN messages m ON m.conversation_id = c.id
            ORDER BY c.updated_at DESC"""
        )
        all_conversation_ids = [row[0] for row in cursor.fetchall()]

        # Filter to only those with unanalyzed messages
        conversation_ids = []
        for conv_id in all_conversation_ids:
            # Get message count
            cursor.execute(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?",
                (conv_id,)
            )
            msg_count = cursor.fetchone()[0]

            # Get covered message count by checking ticket ranges
            cursor.execute(
                """SELECT m.id FROM messages m
                WHERE m.conversation_id = ?
                ORDER BY m.inserted_at ASC""",
                (conv_id,)
            )
            msg_ids = [row[0] for row in cursor.fetchall()]
            msg_id_to_idx = {mid: idx for idx, mid in enumerate(msg_ids)}

            cursor.execute(
                """SELECT start_message_id, end_message_id FROM tickets
                WHERE conversation_id = ?""",
                (conv_id,)
            )
            covered = set()
            for start_id, end_id in cursor.fetchall():
                start_idx = msg_id_to_idx.get(start_id)
                end_idx = msg_id_to_idx.get(end_id)
                if start_idx is not None and end_idx is not None:
                    for idx in range(start_idx, end_idx + 1):
                        covered.add(idx)

            if len(covered) < msg_count:
                conversation_ids.append(conv_id)
    finally:
        conn.close()

    if not conversation_ids:
        return AnalyzeResponse(
            success=True,
            analyzed_count=0,
            tickets_created=0,
            risk_flags_created=0,
            errors=["No conversations with unanalyzed messages found"]
        )

    print(f"\n🔍 Found {len(conversation_ids)} conversations to analyze")

    # Create analysis run record
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute(
        """INSERT INTO llm_analysis_runs (started_at, status)
        VALUES (?, 'running')""",
        (now,),
    )
    run_id = cursor.lastrowid
    conn.commit()
    conn.close()

    for i, conv_id in enumerate(conversation_ids):
        try:
            print(f"📝 [{i+1}/{len(conversation_ids)}] Analyzing {conv_id}...")

            # Get conversation data
            data = get_conversation_data(conv_id)
            if not data:
                errors.append(f"Conversation {conv_id} not found")
                continue

            if not data["messages"]:
                # Skip silently - no unanalyzed messages
                print(f"   ⏭️ Skipping - no unanalyzed messages")
                continue

            print(f"   📨 {len(data['messages'])} messages to analyze")

            # Analyze with LLM
            result = analyze_conversation_with_llm(data)

            # Save results
            t_created, r_created = save_analysis_result(
                result, data["messages"])
            tickets_created += t_created
            risk_flags_created += r_created
            analyzed_count += 1

            print(
                f"   ✅ Created {t_created} ticket(s), {r_created} risk flag(s)")

        except Exception as e:
            print(f"   ❌ Error: {str(e)}")
            errors.append(f"Error analyzing {conv_id}: {str(e)}")

    # Update analysis run record
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """UPDATE llm_analysis_runs SET
            completed_at = ?,
            status = ?,
            conversations_analyzed = ?,
            tickets_created = ?,
            error_message = ?
        WHERE id = ?""",
        (
            datetime.now().isoformat(),
            "completed" if not errors else "completed_with_errors",
            analyzed_count,
            tickets_created,
            "; ".join(errors) if errors else None,
            run_id,
        ),
    )
    conn.commit()
    conn.close()

    print(f"\n✅ Analysis complete!")
    print(f"   Conversations analyzed: {analyzed_count}")
    print(f"   Tickets created: {tickets_created}")
    print(f"   Risk flags created: {risk_flags_created}")
    if errors:
        print(f"   Errors: {len(errors)}")

    return AnalyzeResponse(
        success=True,
        analyzed_count=analyzed_count,
        tickets_created=tickets_created,
        risk_flags_created=risk_flags_created,
        errors=errors,
    )


@app.get("/conversation/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get conversation data for testing"""
    data = get_conversation_data(conversation_id)
    if not data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return data


@app.get("/runs")
async def get_runs():
    """Get analysis run history"""
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM llm_analysis_runs ORDER BY started_at DESC LIMIT 50")
    runs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"runs": runs}


@app.get("/unanalyzed")
async def get_unanalyzed():
    """Get list of conversations with unanalyzed messages"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Get all conversations with message counts
        cursor.execute(
            """SELECT c.id, c.customer_name,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as total_messages,
                (SELECT MAX(m.inserted_at) FROM messages m WHERE m.conversation_id = c.id) as latest_message
            FROM conversations c
            WHERE EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
            ORDER BY latest_message DESC"""
        )
        all_convs = cursor.fetchall()

        conversations = []
        for conv_id, customer_name, total_messages, latest_message in all_convs:
            # Get message IDs in order
            cursor.execute(
                "SELECT id FROM messages WHERE conversation_id = ? ORDER BY inserted_at ASC",
                (conv_id,)
            )
            msg_ids = [row[0] for row in cursor.fetchall()]
            msg_id_to_idx = {mid: idx for idx, mid in enumerate(msg_ids)}

            # Get covered message indices from tickets
            cursor.execute(
                "SELECT start_message_id, end_message_id FROM tickets WHERE conversation_id = ?",
                (conv_id,)
            )
            covered = set()
            for start_id, end_id in cursor.fetchall():
                start_idx = msg_id_to_idx.get(start_id)
                end_idx = msg_id_to_idx.get(end_id)
                if start_idx is not None and end_idx is not None:
                    for idx in range(start_idx, end_idx + 1):
                        covered.add(idx)

            unanalyzed_count = total_messages - len(covered)
            if unanalyzed_count > 0:
                conversations.append({
                    "id": conv_id,
                    "customer_name": customer_name,
                    "total_messages": total_messages,
                    "unanalyzed_messages": unanalyzed_count,
                    "latest_message": latest_message
                })

        return {"conversations": conversations, "count": len(conversations)}
    finally:
        conn.close()


if __name__ == "__main__":
    import uvicorn

    # Handle Ctrl+C gracefully on Windows
    def signal_handler(sig, frame):
        print("\n🛑 Shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    uvicorn.run(app, host="0.0.0.0", port=8000)
