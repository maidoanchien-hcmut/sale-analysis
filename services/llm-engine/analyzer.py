import sqlite3
import json
import logging
import datetime
import uuid
from typing import List
from vertexai.generative_models import GenerativeModel, GenerationConfig
from pydantic import BaseModel, Field
from enum import Enum

# ============================================================================
# ENUMS - Phân loại đơn giản
# ============================================================================

class CustomerTypeEnum(str, Enum):
    NEW = "New"                      # Khách mới, lần đầu liên hệ
    POTENTIAL = "Potential"          # Đang quan tâm, có thể mua
    RETURNING = "Returning"          # Khách cũ, đã từng mua/sử dụng
    SCHEDULED = "Scheduled"          # Đã có lịch hẹn
    STUDENT = "Student"              # Học sinh/sinh viên
    UNDERAGE = "Underage"            # Dưới 18 tuổi
    PARENT = "Parent"                # Phụ huynh mua cho con
    NO_INTENT = "No_Intent"          # Chỉ hỏi thăm, không có ý định mua
    SPAM = "Spam"                    # Tin nhắn rác
    UNKNOWN = "Unknown"

class TicketOutcomeEnum(str, Enum):
    BOOKED = "Booked"                # Đã đặt lịch hẹn
    SOLD = "Sold"                    # Đã mua/chốt đơn
    PENDING = "Pending"              # Đang chờ khách quyết định
    REFUSED = "Refused"              # Khách từ chối
    NO_RESPONSE = "No_Response"      # Khách không phản hồi
    SUPPORT_DONE = "Support_Done"    # Hỗ trợ xong (không cần bán)
    SPAM = "Spam"

class LocationTypeEnum(str, Enum):
    HCM = "HCM"
    PROVINCIAL = "Provincial"  # Ngoại tỉnh
    UNKNOWN = "Unknown"

# ============================================================================
# PYDANTIC MODELS - Output đơn giản
# ============================================================================

class CustomerInfo(BaseModel):
    customer_type: CustomerTypeEnum
    location_type: LocationTypeEnum
    location_detail: str = Field(description="Tên quận nếu HCM, tên tỉnh nếu ngoại tỉnh, hoặc 'Unknown'")

class TicketOutcome(BaseModel):
    outcome: TicketOutcomeEnum
    outcome_reason: str = Field(description="Trích dẫn NGUYÊN VĂN từ tin nhắn giải thích kết quả")

class RepQuality(BaseModel):
    staff_name: str = Field(description="Tên nhân viên từ chữ ký, hoặc 'Unknown'")
    quality_summary: str = Field(description="Mô tả ngắn gọn: 'tư vấn nhiệt tình', 'máy móc', 'chèn ép', 'chuyên nghiệp', 'thiếu kiên nhẫn', etc.")

class RiskFlag(BaseModel):
    has_risk: bool
    risk_evidence: str = Field(description="Trích dẫn NGUYÊN VĂN vi phạm. Dùng 'N/A' nếu không có")

class MessageInfo(BaseModel):
    message_index: int
    is_auto_reply: bool

class AnalysisResult(BaseModel):
    is_ticket_closed: bool
    ticket_summary: str = Field(description="Tóm tắt 1-2 câu")
    customer: CustomerInfo
    outcome: TicketOutcome
    rep_quality: RepQuality
    risk: RiskFlag
    messages: List[MessageInfo]  # Only for is_auto_reply detection

# ============================================================================
# CONSTANTS
# ============================================================================

BATCH_SIZE_THRESHOLD = 25

SYSTEM_PROMPT = """Bạn là chuyên viên QA phân tích hội thoại chăm sóc khách hàng của O2 SKIN (dịch vụ da liễu).

NHIỆM VỤ: Phân loại và trích xuất thông tin - KHÔNG chấm điểm số.

## PHÂN LOẠI KHÁCH HÀNG:
- **New**: Khách mới, lần đầu liên hệ
- **Potential**: Đang hỏi về dịch vụ, có vẻ quan tâm
- **Returning**: Khách cũ, nhắc đến lần trước
- **Scheduled**: Đã có lịch hẹn hoặc đang đặt lịch
- **Student**: HSSV (học sinh sinh viên)
- **Underage**: Dưới 18 tuổi, cần phụ huynh
- **Parent**: Phụ huynh hỏi/đặt cho con
- **No_Intent**: Chỉ hỏi thăm, không có ý định
- **Spam**: Tin nhắn rác

## KẾT QUẢ TICKET:
- **Booked**: Đã chốt lịch hẹn thành công
- **Sold**: Đã mua sản phẩm/dịch vụ
- **Pending**: Khách nói "để xem", "suy nghĩ thêm"
- **Refused**: Khách từ chối rõ ràng
- **No_Response**: Khách không trả lời
- **Support_Done**: Hỗ trợ/giải đáp xong

## PHÁT HIỆN TIN NHẮN TỰ ĐỘNG:
Tất cả tin từ shop có cùng sender_id. Phân biệt:
- **Tự động**: "Cảm ơn bạn đã liên hệ...", "Shop đang ngoài giờ...", chào mừng chung
- **Nhân viên thật**: Trả lời cụ thể, cá nhân hóa, giải quyết vấn đề

## ĐÁNH GIÁ NHÂN VIÊN (theo framework O2 SKIN):
Nhân viên được training theo các nguyên tắc:
1. Định danh đúng: "{Tên} – tư vấn viên O2 SKIN", không dùng "Ad/Admin/Shop"
2. Xưng hô: mặc định "mình – bạn", mirror theo khách
3. Phản hồi nhanh TRONG GIỜ LÀM VIỆC: lead mới ≤5 phút, trong chat ≤2 phút
4. Trả lời đúng intent trước, rồi mới hỏi thêm
5. Tối đa 2 câu hỏi/lượt, có câu thấu cảm
6. Cho value trước khi xin thông tin nhạy cảm (ảnh/SĐT)
7. Không hứa chắc kết quả điều trị
8. Tin nhắn ngắn 1-3 dòng

LƯU Ý TỐC ĐỘ: Chỉ đánh giá chậm/nhanh trong giờ làm việc thông dụng

## CỜ ĐỎ (CHỈ FLAG KHI CÓ BẰNG CHỨNG RÕ RÀNG):
- Ngôn ngữ thô lỗ, thiếu tôn trọng
- Hứa chắc kết quả/đảm bảo khỏi
- Thông tin sai về giá/dịch vụ
- Phản hồi quá chậm TRONG GIỜ LÀM VIỆC (>10 phút)
- Ép khách, gây áp lực quá mức

Trích dẫn NGUYÊN VĂN làm bằng chứng.

## ĐỊA ĐIỂM:
- HCM: ghi rõ Quận nào (Q1, Bình Thạnh, Gò Vấp, Thủ Đức...)
- Ngoại tỉnh: ghi tên tỉnh
- Không rõ: Unknown"""

def run_analysis_loop(model: GenerativeModel, db_path: str):
    """Main entry point called by main.py."""
    logger = logging.getLogger("Analyzer")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        candidates = conn.execute(f"""
            SELECT id, page_id, customer_name, message_count_total, last_analyzed_message_count,
                   active_ticket_summary, active_ticket_id
            FROM conversations
            WHERE (message_count_total - last_analyzed_message_count) >= {BATCH_SIZE_THRESHOLD}
        """).fetchall()

        if not candidates:
            logger.info("No conversations need analysis.")
            return

        logger.info(f"Analyzing {len(candidates)} conversations...")

        for conv in candidates:
            try:
                _process_single(conn, model, conv)
            except Exception as e:
                logger.error(f"Failed to process {conv['id']}: {e}")
                continue
    finally:
        conn.close()


def _process_single(conn: sqlite3.Connection, model: GenerativeModel, conv: sqlite3.Row):
    """Process a single conversation"""
    logger = logging.getLogger("Analyzer")
    conv_id = conv['id']
    offset = conv['last_analyzed_message_count']

    msgs = conn.execute("""
        SELECT id, content, is_from_shop, inserted_at, sender_name
        FROM messages WHERE conversation_id = ?
        ORDER BY inserted_at ASC LIMIT 100 OFFSET ?
    """, (conv_id, offset)).fetchall()

    if not msgs:
        return

    # Build transcript
    transcript_lines = []
    for idx, m in enumerate(msgs):
        sender = "SHOP" if m['is_from_shop'] else "KHÁCH"
        transcript_lines.append(f"[{idx}] [{m['inserted_at']}] {sender}: {m['content']}")

    prompt = f"""Phân tích hội thoại chăm sóc khách hàng này.

Tên khách: {conv['customer_name'] or 'Không rõ'}
Tóm tắt trước đó: {conv['active_ticket_summary'] or 'Hội thoại mới'}

TIN NHẮN:
{chr(10).join(transcript_lines)}

Trích xuất: loại khách, địa điểm, kết quả ticket, đánh giá nhân viên, và cờ đỏ (nếu có) kèm trích dẫn nguyên văn."""

    try:
        response = model.generate_content(
            prompt,
            generation_config=GenerationConfig(
                response_mime_type="application/json",
                response_schema=AnalysisResult.model_json_schema()
            )
        )
        data = AnalysisResult.model_validate_json(response.text)
        _save_results(conn, conv, data, msgs, conv['message_count_total'])
        logger.info(f"✓ {conv['customer_name']} - {data.customer.customer_type.value}, {data.outcome.outcome.value}, Risk: {data.risk.has_risk}")

    except Exception as e:
        logger.error(f"Failed to analyze {conv_id}: {e}")
        raise


def _save_results(conn: sqlite3.Connection, conv: sqlite3.Row, data: AnalysisResult, msgs: list, new_count: int):
    """Save analysis results to database with proper star schema dimensions"""
    cursor = conn.cursor()
    now_ts = datetime.datetime.now().isoformat()
    today = datetime.date.today()
    date_key = int(today.strftime('%Y%m%d'))  # YYYYMMDD format
    ticket_id = conv['active_ticket_id'] or f"tkt_{uuid.uuid4().hex[:12]}"

    # === DIMENSION: dimDate (ensure today exists) ===
    cursor.execute("""
        INSERT OR IGNORE INTO dim_date (date_key, full_date, year, quarter, month, month_name, week, day, day_of_week, day_name, is_weekend, is_working_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        date_key,
        today.isoformat(),
        today.year,
        (today.month - 1) // 3 + 1,  # Quarter 1-4
        today.month,
        today.strftime('%B'),  # Month name
        today.isocalendar()[1],  # Week of year
        today.day,
        today.weekday(),  # 0=Monday in Python, but we store as-is
        today.strftime('%A'),  # Day name
        today.weekday() >= 5,  # is_weekend (Sat/Sun)
        today.weekday() < 5,  # is_working_day (simplified)
    ))

    # === DIMENSION: dimCustomer ===
    customer_key = conv['id']  # conversation_id as customer key
    cursor.execute("""
        INSERT INTO dim_customer (customer_key, customer_name, platform, first_contact_date, last_contact_date)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(customer_key) DO UPDATE SET
            customer_name=excluded.customer_name,
            last_contact_date=excluded.last_contact_date
    """, (customer_key, conv['customer_name'], 'Pancake', now_ts, now_ts))

    # === DIMENSION: dimStaff ===
    staff_name = data.rep_quality.staff_name
    staff_key = None
    if staff_name and staff_name != "Unknown":
        staff_key = f"staff_{staff_name.lower().replace(' ', '_')}"
        cursor.execute("""
            INSERT INTO dim_staff (staff_key, staff_name, is_active) VALUES (?, ?, ?)
            ON CONFLICT(staff_key) DO UPDATE SET staff_name=excluded.staff_name
        """, (staff_key, staff_name, True))

    # === DIMENSION: dimLocation ===
    location_type = data.customer.location_type.value
    location_detail = data.customer.location_detail
    location_key = f"{location_type}_{location_detail.replace(' ', '_')}" if location_detail != "Unknown" else "Unknown"
    cursor.execute("""
        INSERT OR IGNORE INTO dim_location (location_key, location_type, location_detail)
        VALUES (?, ?, ?)
    """, (location_key, location_type, location_detail if location_detail != "Unknown" else None))

    # === DIMENSION: dimCustomerType ===
    customer_type_key = data.customer.customer_type.value
    cursor.execute("""
        INSERT OR IGNORE INTO dim_customer_type (type_key, type_name)
        VALUES (?, ?)
    """, (customer_type_key, customer_type_key))

    # === DIMENSION: dimOutcome ===
    outcome_key = data.outcome.outcome.value
    outcome_category = "Success" if outcome_key in ("Booked", "Sold", "Support_Done") else "Pending" if outcome_key == "Pending" else "Failed"
    is_positive = outcome_key in ("Booked", "Sold", "Support_Done")
    cursor.execute("""
        INSERT OR IGNORE INTO dim_outcome (outcome_key, outcome_name, outcome_category, is_positive)
        VALUES (?, ?, ?, ?)
    """, (outcome_key, outcome_key, outcome_category, is_positive))

    # === FACT: factTickets ===
    closed_date_key = date_key if data.is_ticket_closed else None
    cursor.execute("""
        INSERT INTO fact_tickets (
            ticket_id, customer_key, staff_key, location_key, customer_type_key, outcome_key,
            created_date_key, closed_date_key, conversation_id, status,
            outcome_reason, rep_quality_summary, ticket_summary,
            has_risk, risk_evidence,
            created_at, closed_at, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticket_id) DO UPDATE SET
            staff_key=excluded.staff_key,
            outcome_key=excluded.outcome_key,
            closed_date_key=excluded.closed_date_key,
            status=excluded.status,
            outcome_reason=excluded.outcome_reason,
            rep_quality_summary=excluded.rep_quality_summary,
            ticket_summary=excluded.ticket_summary,
            has_risk=excluded.has_risk,
            risk_evidence=excluded.risk_evidence,
            closed_at=CASE WHEN excluded.status='CLOSED' THEN excluded.last_updated ELSE closed_at END,
            last_updated=excluded.last_updated
    """, (
        ticket_id, customer_key, staff_key, location_key, customer_type_key, outcome_key,
        date_key, closed_date_key, conv['id'],
        "CLOSED" if data.is_ticket_closed else "OPEN",
        data.outcome.outcome_reason,
        data.rep_quality.quality_summary,
        data.ticket_summary,
        data.risk.has_risk,
        data.risk.risk_evidence if data.risk.has_risk else None,
        now_ts,
        now_ts if data.is_ticket_closed else None,
        now_ts
    ))

    # === FACT: factRiskIncidents ===
    if data.risk.has_risk:
        cursor.execute("""
            INSERT INTO fact_risk_incidents (
                incident_id, ticket_id, staff_key, created_date_key,
                conversation_id, evidence, review_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            f"risk_{uuid.uuid4().hex[:12]}",
            ticket_id, staff_key, date_key,
            conv['id'], data.risk.risk_evidence,
            "Pending", now_ts
        ))

    # Update message auto-reply flags
    for mc in data.messages:
        if mc.message_index < len(msgs):
            cursor.execute("""
                UPDATE messages SET is_auto_reply=? WHERE id=?
            """, (mc.is_auto_reply, msgs[mc.message_index]['id']))

    # Update conversation state
    next_ticket = None if data.is_ticket_closed else ticket_id
    cursor.execute("""
        UPDATE conversations SET
            last_analyzed_message_count=?, active_ticket_summary=?,
            active_ticket_id=?, last_analyzed_at=?
        WHERE id=?
    """, (new_count, data.ticket_summary, next_ticket, now_ts, conv['id']))

    conn.commit()