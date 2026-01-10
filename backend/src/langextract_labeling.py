import json
from datetime import datetime
from unittest import result
import langextract as lx
import textwrap
import sys
import io
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()


SYSTEM_PROMPT = textwrap.dedent("""\
    Trích xuất thực thể có class là "SessionAnalysis".
    Mỗi phiên hội thoại bắt đầu bằng "SESSION ID: [ID]".

    Yêu cầu dán nhãn:
    1. customer_type:
       - new_cold: Khách mới, hỏi chung chung.
       - new_hot: Khách mới, muốn mua ngay.
       - returning_happy: Khách cũ, tích cực.
       - returning_complaint: Khách cũ, khiếu nại.
       - window_shopper: Chỉ tham khảo giá, chưa mua.
       - loyal: Khách trung thành.
       - reactivated: Khách quay lại sau thời gian dài.

    2. outcome:
       - won_standard: Chốt đơn thành công.
       - won_upsell: Bán chéo/nâng cao thành công.
       - lost_price: Rớt do giá.
       - lost_fit: Rớt do không phù hợp nhu cầu.
       - lost_competitor: Mất khách về tay đối thủ.
       - lost_trust: Mất do thiếu tin tưởng.
       - ghost_post_price: Im lặng sau khi báo giá.
       - ghost_info_harvest: Hỏi nhiều kỹ thuật nhưng không mua.

    3. rep_quality: responsive (nhanh), consultative (chuyên gia), transactional (trả bài), pushy_aggressive (ép khách), non_compliant (sai quy trình).
    4. behavior: proactive, skeptical, negotiating, comparing, urgent.
    5. risk_flags: none, policy_violation, escalation_risk, privacy_breach.

    Yêu cầu trích xuất đặc trưng (Feature Extraction):
    - Tính toán "response_lag_avg": Thời gian chờ trung bình của khách (ước lượng từ timestamp).
    - Đếm "conversation_turns": Tổng số tin nhắn.
    - Trích xuất "keywords_detected": Các từ khóa quan trọng (giảm giá, cam kết, tên đối thủ, dọa nạt...).
    """)


example_text_1 = textwrap.dedent("""\
    SESSION ID: session_raw_001
    [09:00:12] CUSTOMER: Chào shop, mình muốn lấy nhân mụn.
    [09:02:05] PAGE: Chào bạn, Linh là tư vấn viên O2 SKIN ạ. Mình xưng hô với bạn thế nào cho tiện ạ?
    [09:03:34] CUSTOMER: Tên An nhé. Mặt mình đang lên mụn viêm nhiều.
    [09:05:21] PAGE: Dạ An, mụn viêm cần xử lý nhẹ nhàng để tránh lây lan. Bạn gửi giúp Linh hình ảnh da hiện tại (camera thường) để bác sĩ xem qua mức độ viêm nhé.
    [09:08:45] CUSTOMER: [Hình ảnh đính kèm]
    [09:10:18] PAGE: Cảm ơn An. Với tình trạng này bạn nên ghé chi nhánh sớm để bác sĩ kê thuốc bôi gom còi mụn trước. Bạn tiện ghé chi nhánh nào ạ?
    """)

example_text_9 = textwrap.dedent("""\
    SESSION ID: session_raw_009
    [21:00:23] CUSTOMER: Cho mình xin quy trình peel da bên bạn. Dùng hoạt chất gì? Nồng độ bao nhiêu? Máy laser hiệu gì?
    [21:05:14] PAGE: Chào bạn, Thư - TVV O2 SKIN ạ. Bên mình dùng các hoạt chất chuẩn y khoa như Glycolic, Salicylic Acid tùy tình trạng da. Bạn đang gặp vấn đề gì về da ạ?
    [21:07:38] CUSTOMER: Mình hỏi để biết thôi. Máy Laser CO2 là dòng nào? Của hãng nào sản xuất?
    [21:10:02] PAGE: Dạ bên mình dùng máy Fractional CO2 nhập khẩu chính hãng. Nếu bạn quan tâm chi tiết kỹ thuật có thể ghé trực tiếp để bác sĩ giải đáp sâu hơn nha.
    [21:15:47] CUSTOMER: Ok.
    """)

examples = [
    lx.data.ExampleData(
        text=example_text_1,
        extractions=[
            lx.data.Extraction(
                extraction_class="SessionAnalysis",
                extraction_text="session_raw_001",
                attributes={
                    "customer_type": "new_hot",
                    "outcome": "won_standard",
                    "rep_quality": "consultative",
                    "behavior": "proactive",
                    "risk_flags": "none",
                    "quantitative_signals": {
                        "conversation_turns": 6,
                        "response_lag_avg": "2-3 minutes"
                    },
                    "qualitative_signals": {
                        "keywords": []
                    }
                }
            )
        ]
    ),
    lx.data.ExampleData(
        text=example_text_9,
        extractions=[
            lx.data.Extraction(
                extraction_class="SessionAnalysis",
                extraction_text="session_raw_009",
                attributes={
                    "customer_type": "window_shopper",
                    "outcome": "lost_info_harvest",
                    "rep_quality": "consultative",
                    "behavior": "proactive",
                    "risk_flags": "none",
                    "quantitative_signals": {
                        "conversation_turns": 5,
                        "response_lag_avg": "3-4 minutes"
                    },
                    "qualitative_signals": {
                        "keywords": []
                    }
                }
            )
        ]
    )
]


def load_and_format_data(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        return "Lỗi: Không tìm thấy file JSON."
    except json.JSONDecodeError:
        return "Lỗi: File không đúng định dạng JSON."

    full_transcript = ""

    for session in data:
        s_id = session.get('session_id', 'Unknown Session')
        full_transcript += f"\nSESSION ID: {s_id}\n"

        for msg in session['messages']:
            raw_time = msg.get('timestamp', '')

            if 'T' in raw_time:
                time_str = raw_time.split('T')[-1].replace('Z', '')[:8]
            else:
                time_str = raw_time

            sender = msg.get('sender', 'Unknown').upper()
            content = msg.get('content', '')

            full_transcript += f"[{time_str}] {sender}: {content}\n"

    return full_transcript


def main():
    formatted_text = load_and_format_data(
        'E:\\Code\\VueJS\\sale-analysis\\backend\\json\\mock_data.json')

    print(formatted_text)

    print("Extracting session analyses from formatted text...")
    try:
        result = lx.extract(
            text_or_documents=formatted_text,
            prompt_description=SYSTEM_PROMPT,
            examples=examples,
            model_id="gemini-2.0-flash",
            extraction_passes=1,
            max_char_buffer=4000
        )

        print(
            f"Found {len(result.extractions)} sessions.")

    except Exception as e:
        print(f"Error during extraction: {e}")

    print(f"Extracted {len(result.extractions)} entities:\n")
    for extraction in result.extractions:
        print(f"• {extraction.extraction_class}: '{extraction.extraction_text}'")
        if extraction.attributes:
            for key, value in extraction.attributes.items():
                print(f"  - {key}: {value}")


if __name__ == "__main__":
    main()
