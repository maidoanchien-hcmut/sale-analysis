# CHIẾN LƯỢC PHÂN TÍCH DỮ LIỆU HỘI THOẠI SALES & CSKH (AI-DRIVEN ANALYTICS)

**Mục tiêu:** Chuyển đổi dữ liệu hội thoại phi cấu trúc (chat logs) thành các chỉ số quản trị định lượng, giúp Ban Giám Đốc (BOD) đánh giá hiệu suất đội ngũ, tối ưu vận hành và gia tăng doanh thu.

---

## 1. MA TRẬN PHÂN LOẠI ĐA CHIỀU (DETAILED TAXONOMY)

Hệ thống AI sẽ gắn các nhãn sau cho mỗi phiên hội thoại:

### 1.1. Phân loại Khách hàng (`customer_type`)

-   `new_cold`: Khách lạ, hỏi bâng quơ, chưa có nhu cầu rõ ràng.
-   `new_hot`: Khách lạ, vào đề mua ngay (High intent).
-   `returning_happy`: Khách cũ quay lại mua tiếp.
-   `returning_complaint`: Khách cũ quay lại để khiếu nại/bảo hành.
-   `window_shopper`: Khách "đi dạo", hỏi rất kỹ nhưng kết thúc lửng lơ "để tham khảo".
-   `price_hunter`: Khách chỉ quan tâm giá rẻ nhất, cực kỳ nhạy cảm về giá.

### 1.2. Trạng thái Kết thúc (`outcome`)

-   `won_standard`: Chốt đơn đúng giá niêm yết.
-   `won_upsell`: Chốt đơn + Bán thêm (Cross-sell/Upsell).
-   `won_downsell`: Chốt đơn nhưng phải giảm giá/lái sang sản phẩm rẻ hơn để giữ khách.

-   `lost_price`: Khách từ chối rõ ràng vì giá cao/mặc cả không thành.
-   `lost_fit`: Sản phẩm không đáp ứng nhu cầu (size, màu, tính năng).
-   `lost_competitor`: Khách báo đã mua bên khác/so sánh thua đối thủ.
-   `lost_service`: Khách bỏ đi vì thái độ Sale tồi hoặc phản hồi quá chậm.
-   `lost_stock`: Fail do hết hàng/hết size (Lỗi Kho/Nhập hàng).
-   `lost_logistics`: Fail do phí ship cao/không ship được/thời gian ship lâu (Lỗi Vận chuyển).
-   `lost_payment`: Fail do lỗi thanh toán/thủ tục chuyển khoản phức tạp.

-   `ghost_early`: Im lặng ngay từ đầu (Lead rác).
-   `ghost_post_price`: Im lặng sau khi báo giá (Sốc giá/Đang so sánh ngầm).
-   `ghost_checkout`: **(Critical)** Đã xin số tài khoản/Link thanh toán nhưng im lặng không chuyển (Rủi ro niềm tin hoặc thao tác khó).

-   `spam_junk`: Tin rác, lừa đảo.
-   `support_inquiry`: Hỏi giờ làm việc, địa chỉ (không mua bán).

### 1.3. Chất lượng Tư vấn viên (`rep_quality`)

-   `consultative`: Tư vấn giải pháp, khơi gợi nhu cầu (Tốt).
-   `transactional`: Hỏi đâu đáp đó, thụ động (Trung bình).
-   `robot_script`: Lạm dụng văn mẫu, copy-paste vô cảm.
-   `pushy`: Thúc ép khách thô thiển, gây phản cảm.
-   `negligent`: Bỏ sót câu hỏi, rep thiếu thông tin.

### 1.4. Cờ Báo Rủi ro (`risk_flags`)

-   `fraud_off_platform`: Sale rủ khách giao dịch riêng (Zalo cá nhân/TK cá nhân).
-   `toxic_language`: Dùng từ ngữ thô tục, cãi nhau với khách.
-   `over_promise`: Cam kết sai sự thật về sản phẩm.
-   `none`: An toàn.

---

## 2. CÁC CHỈ SỐ KPI CHIẾN LƯỢC (METRICS FOR BOD)

### 2.1. Phân tích Dòng tiền thất thoát (Revenue Leakage)

-   **Operational Leakage:** Tổng giá trị các đơn `lost_stock` + `lost_logistics`. (Tiền mất do hệ thống, không phải do Sale).
-   **Pricing Resistance:** Tỷ lệ (`lost_price` + `ghost_post_price`) / Tổng session báo giá. (Đo độ chấp nhận của thị trường với mức giá hiện tại).

### 2.2. Phân tích Hiệu suất Sale (Performance & Training)

-   **Quality Score:** Tỷ lệ `consultative` trên tổng hội thoại.
-   **Fraud Alert:** Danh sách các hội thoại có cờ `fraud_off_platform`.
-   **Average Response Lag:** Thời gian phản hồi trung bình trong mỗi session
-   **Pushiness Index:** Tỷ lệ `pushy` trên tổng hội thoại.

### 2.3. Phân tích Thị trường & Sản phẩm (Market Intelligence)

-   **Negotiation Frequency:** Tỷ lệ xuất hiện mặc cả trong `lost_price`
-   **Feature Gaps:** Tổng hợp lý do `lost_fit` (Khách cần gì mà ta chưa có?).
-   **Competitor Watch:** Số lượng đối thủ được nhắc đến trong `lost_competitor`.
