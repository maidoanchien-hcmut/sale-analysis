from google import genai
from google.genai import Client, types
import json
import time
from datetime import datetime
import os
import argparse
from pydantic import BaseModel, Field
from typing import Literal, Optional
from dotenv import load_dotenv

load_dotenv()

MODEL_NAME = "gemini-2.0-flash"


class SessionAnalysis(BaseModel):
    session_id: str

    customer_type: Literal[
        "new_cold", "new_hot",
        "returning_happy", "returning_complaint",
        "window_shopper", "price_hunter"
    ] = Field(description="Phân loại khách hàng đầu vào")

    outcome: Literal[
        "won_standard", "won_upsell", "won_downsell",
        "lost_price", "lost_fit", "lost_competitor", "lost_service",
        "lost_stock", "lost_logistics", "lost_payment",
        "ghost_early", "ghost_post_price", "ghost_checkout",
        "spam_junk", "support_inquiry",
        "stalled"
    ] = Field(description="Kết quả cuối cùng của phiên")

    outcome_reason: Optional[str] = Field(
        description="Lý do cụ thể khiến khách từ chối, im lặng hoặc stall. Ví dụ: 'Chê phí ship 30k quá cao', 'Im lặng sau khi nghe báo giá 500k'. Bỏ trống nếu là Won.",
        default=None
    )

    customer_status_update: Literal["has_purchased", "has_complained", "no_change"] = Field(
        description="Đánh dấu nếu phiên này khách đã mua hàng hoặc khiếu nại để cập nhật hồ sơ."
    )

    rep_quality: Literal[
        "consultative", "transactional",
        "robot_script", "pushy", "negligent"
    ] = Field(description="Đánh giá chất lượng tư vấn")

    risk_flag: Literal[
        "fraud_off_platform", "toxic_language",
        "over_promise", "non_compliant", "none"
    ] = Field(description="Cờ báo rủi ro vận hành")

    risk_evidence: Optional[str] = Field(
        description="Trích dẫn nguyên văn câu nói vi phạm của Sale hoặc mô tả hành vi sai quy trình. Ví dụ: 'Sale không chào khách', 'Sale nói cam kết trị hết 100%'.",
        default=None
    )


SYSTEM_PROMPT = """
Sale chat analyzing. Nhiệm vụ: Phân tích phiên hội thoại giữa sale và khách hàng với context.

Quy tắc phân tích:
1. Phân loại khách hàng đầu vào (customer_type) dựa trên hành vi và thái độ trong chat.
2. Xác định kết quả cuối cùng của phiên (outcome) và lý do cụ thể (outcome_reason) nếu có.
3. Cập nhật trạng thái khách hàng (customer_status_update) nếu có mua hàng hoặc khiếu nại.
4. Đánh giá chất lượng tư vấn của sale (rep_quality).
5. Đánh dấu cờ rủi ro vận hành (risk_flag) và cung cấp bằng chứng (risk_evidence) nếu có.

<EXAMPLE>
INPUT:
Customer: "Thảo ơi, chiều mai 4h mình ghé chi nhánh Thủ Đức được không?
Page: "Chào Minh, Thảo check lịch bác sĩ chi nhánh Thủ Đức chiều mai 4h còn trống ạ. Thảo chốt lịch khám và tư vấn mụn cho Minh khung giờ này nhé?"
Customer: "Ok chốt nhé. Cần mang gì không?"
Page: "Dạ Minh nhớ mang thẻ HSSV (hoặc hình chụp) và CCCD/VNeID để được áp dụng ưu đãi giảm giá nha. Nếu Minh đang dùng sản phẩm gì ở nhà thì chụp lại vỏ chai mang theo để bác sĩ xem thành phần luôn ạ."
Customer: "Ok cảm ơn Thảo."

->OUTPUT:
{
    "session_id": "sess_2",
    "customer_type": "new_hot",
    "outcome": "won_standard",
    "outcome_reason": null,
    "customer_status_update": "no_change",
    "rep_quality": "consultative",
    "risk_flag": "none",
    "risk_evidence": null,
    "customer_context": {
      "is_customer": true,
      "purchase_count": 1,
      "has_complained": false
    },
},

"""


def analyze_single_session():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_file', nargs='?',
                        help="Path to sessionized JSON")
    parser.add_argument('--output', help="Path to save analyzed JSON")
    args = parser.parse_args()

    input_path = args.input_file
    output_path = args.output

    api_key = os.getenv("GOOGLE_API_KEY", "your_api_key_here")

    if api_key == "your_api_key_here":
        print("PLEASE SET YOUR GOOGLE_API_KEY IN THE .env FILE OR ENVIRONMENT VARIABLES.")

    client = Client(api_key=api_key)

    if not os.path.exists(input_path):
        print(f"Input file not found: {input_path}")
        return

    with open(input_path, 'r', encoding='utf-8') as f:
        try:
            sessions = json.load(f)
        except json.JSONDecodeError:
            print("Invalid JSON format in input file.")
            return

    customer_state = {
        "is_customer": False,
        "purchase_count": 0,
        "has_complained": False
    }

    results = []

    print(f"Loaded {len(sessions)} sessions for analysis.")

    for i, session in enumerate(sessions):
        sid = session.get('session_id', f'sess_{i}')
        print(f"[{i+1}/{len(sessions)}] Analyzing {sid}...", end="")

        metrics = calculate_session_metrics(session)

        msgs = session.get('messages', [])
        initiator = msgs[0]['sender_name'] if msgs else "unknown"

        chat_content = "\n".join(
            [f"[{m.get('sender_name')}]: {m.get('content')}" for m in msgs])

        user_prompt = f"""
        CONTEXT KHÁCH HÀNG (Lũy kế):
        - Đã mua hàng: {"CÓ" if customer_state['is_customer'] else "KHÔNG"} ({customer_state['purchase_count']} đơn)
        - Đã khiếu nại: {"CÓ" if customer_state['has_complained'] else "KHÔNG"}

        PHIÊN HIỆN TẠI:
        - Session ID: {sid}
        - Initiator: {initiator}
        - Chat Log:
        {chat_content}
        """

        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=SessionAnalysis,
                    temperature=0.2,
                )
            )

            if response.parsed:
                audit_data = response.parsed.model_dump()

                if "won_" in audit_data['outcome']:
                    customer_state['is_customer'] = True
                    customer_state['purchase_count'] += 1

                if audit_data['customer_status_update'] == "has_purchased":
                    customer_state['is_customer'] = True
                    customer_state['purchase_count'] += 1

                if "complaint" in audit_data['customer_type'] or "lost_service" in audit_data['outcome']:
                    customer_state['has_complained'] = True

                audit_data['customer_context'] = customer_state.copy()

                combined_data = {
                    **audit_data,
                    "metrics": metrics,
                    "meta": {
                        "start_time": session['start_time'],
                        "end_time": session['end_time'],
                        "msg_count": session['message_count']
                    }
                }

                results.append(combined_data)
                print("\tDone")
            else:
                print("Failed to parse response.")
        except Exception as e:
            print(f"Error during analysis: {e}")
            if "429" in str(e):
                print("Rate limited. Waiting...")
                time.sleep(10)
        time.sleep(1)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nAnalysis completed! Saved to: {output_path}")


def calculate_session_metrics(session):
    messages = session.get('messages', [])
    if not messages:
        return {"avg_response_min": 0, "max_response_min": 0, "count": 0}

    lags = []
    last_customer_time = None

    for msg in messages:
        ts_str = msg['timestamp'].replace('Z', '+00:00')
        try:
            current_time = datetime.fromisoformat(ts_str)
        except ValueError:
            continue

        sender = msg.get('sender_name', 'unknown')

        if sender == 'customer':
            last_customer_time = current_time
        elif sender == 'page' and last_customer_time is not None:
            lag_seconds = (current_time - last_customer_time).total_seconds()
            if lag_seconds >= 0:
                lags.append(lag_seconds)
            last_customer_time = None

    if lags:
        avg_min = round(sum(lags) / len(lags) / 60, 2)
        max_min = round(max(lags) / 60, 2)
    else:
        avg_min = 0
        max_min = 0

    return {
        "avg_response_time_minutes": avg_min,
        "max_response_time_minutes": max_min,
        "response_count": len(lags)
    }


if __name__ == "__main__":
    analyze_single_session()
