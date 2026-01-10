# CHIẾN LƯỢC PHÂN TÍCH DỮ LIỆU HỘI THOẠI SALES & CSKH (TỔNG QUÁT)

**Mục tiêu:** Chuyển đổi dữ liệu hội thoại phi cấu trúc (chat logs) thành các chỉ số quản trị định lượng, giúp BOD đánh giá hiệu suất đội ngũ, thấu hiểu hành vi khách hàng và tối ưu quy trình kinh doanh.

---

## 1. MA TRẬN NHÃN ĐA CHIỀU (MULTIDIMENSIONAL TAXONOMY)

Mỗi cuộc hội thoại sẽ được hệ thống AI gắn đồng thời nhiều nhãn (tags) thuộc các nhóm khác nhau để vẽ nên bức tranh toàn cảnh.

### A. Phân loại Khách hàng (`customer_type`)

_Mục đích: Xác định chất lượng đầu vào của Lead (Lead Quality)._

-   **`new_cold` (Khách lạnh):** Khách hàng mới, tiếp cận thụ động, chưa xác định rõ nhu cầu, chỉ hỏi thông tin chung chung.
-   **`new_hot` (Khách nóng):** Khách hàng mới nhưng có nhu cầu cấp thiết, đi thẳng vào vấn đề mua hàng/chốt đơn.
-   **`returning_happy` (Khách cũ tích cực):** Khách hàng đã từng mua, quay lại với thái độ ủng hộ, tin tưởng.
-   **`returning_complaint` (Khách cũ tiêu cực):** Khách hàng cũ quay lại nhưng để khiếu nại, phàn nàn về sản phẩm/dịch vụ trước đó.
-   **`window_shopper` (Khách vãng lai):** Nhóm khách chỉ có nhu cầu tham khảo, "đi dạo", so sánh giá, chưa có ý định mua thực sự tại thời điểm hiện tại.
-   **`loyal` (Khách trung thành):** Khách hàng mua lặp lại nhiều lần, có xu hướng bảo vệ thương hiệu.
-   **`reactivated` (Khách hâm nóng):** Khách hàng đã ngừng tương tác trong thời gian dài (ngủ đông) nay quay lại tương tác.

### B. Trạng thái Kết thúc (`outcome`)

_Mục đích: Phân tích sâu nguyên nhân gốc rễ (Root Cause) của việc Thành công hay Thất bại._

-   **`won_standard`:** Chốt đơn thành công theo đúng nhu cầu ban đầu.
-   **`won_upsell`:** Thành công rực rỡ - Bán được gói cao cấp hơn hoặc bán kèm sản phẩm phụ (Cross-sell) so với nhu cầu gốc.
-   **`lost_price` (Rớt do giá):** Khách hàng từ chối rõ ràng vì ngân sách không đủ hoặc cho rằng giá không tương xứng giá trị.
-   **`lost_fit` (Rớt do không phù hợp):** Sản phẩm/Dịch vụ không đáp ứng được tính năng hoặc nhu cầu đặc thù mà khách tìm kiếm.
-   **`lost_competitor` (Mất về tay đối thủ):** Khách hàng quyết định chọn bên khác (thường có nhắc tên đối thủ hoặc so sánh trực tiếp).
-   **`lost_trust` (Mất do thiếu niềm tin):** Khách hàng nghi ngờ về uy tín, nguồn gốc, cam kết bảo hành và dừng lại vì cảm giác không an toàn.
-   **`ghost_post_price` (Sốc giá):** Khách hàng im lặng tuyệt đối ngay sau tin nhắn báo giá của nhân viên.
-   **`ghost_info_harvest` (Dò thông tin):** Khách hỏi rất chi tiết về quy trình, kỹ thuật, chính sách... nhưng lảng tránh các câu hỏi về nhu cầu mua sắm. (Dấu hiệu của đối thủ nghiên cứu thị trường).

### C. Chất lượng Tư vấn viên (`rep_quality`)

_Mục đích: Đánh giá kỹ năng mềm và thái độ phục vụ của nhân viên._

-   **`responsive` (Nhanh nhạy):** Phản hồi tốc độ cao, bám sát mạch hội thoại, không để khách chờ lâu.
-   **`consultative` (Cố vấn):** Tư vấn có chiều sâu, đóng vai trò chuyên gia đưa ra giải pháp thay vì chỉ bán hàng (Solution Selling).
-   **`transactional` (Giao dịch):** Tư vấn hời hợt, hỏi gì đáp nấy, thiếu sự kết nối cá nhân (như trả bài).
-   **`pushy_aggressive` (Ép khách):** Tạo áp lực chốt đơn quá lớn khiến khách khó chịu, sử dụng ngôn từ mang tính thúc ép thô thiển.
-   **`non_compliant` (Sai quy trình):** Bỏ qua các bước bắt buộc (ví dụ: không chào hỏi, không xác nhận thông tin, tư vấn sai chính sách).

### D. Hành vi Khách hàng (`behavior`)

_Mục đích: Hiểu tâm lý khách hàng để điều chỉnh kịch bản sales._

-   **`proactive`:** Chủ động cung cấp thông tin, hợp tác để giải quyết vấn đề.
-   **`skeptical`:** Đa nghi, liên tục đặt câu hỏi kiểm chứng (challenge) về chất lượng/uy tín.
-   **`negotiating`:** Tập trung vào đàm phán, mặc cả, đòi hỏi quà tặng/khuyến mãi thêm.
-   **`comparing`:** Đang trong quá trình cân nhắc giữa nhiều lựa chọn, liên tục so sánh tính năng/giá cả.
-   **`urgent`:** Thể hiện sự gấp gáp, muốn được giải quyết ngay lập tức.

### E. Cờ Báo Rủi ro (`risk_flags`)

_Mục đích: Quản trị rủi ro pháp lý và thương hiệu._

-   **`none`:** An toàn.
-   **`policy_violation` (Vi phạm chính sách):** Nhân viên cam kết sai sự thật (Over-promise), tư vấn sai điều khoản bảo hành/đổi trả.
-   **`escalation_risk` (Rủi ro leo thang):** Khách hàng đe dọa khiếu nại lên cấp trên, bóc phốt lên mạng xã hội, hoặc dùng ngôn từ xúc phạm.
-   **`privacy_breach` (Lộ thông tin):** Có dấu hiệu chia sẻ thông tin nhạy cảm (SĐT khách khác, dữ liệu nội bộ) trái phép.

---

## 2. HỆ THỐNG KPI & CÔNG THỨC CHI TIẾT (METRICS)

### Nhóm Chỉ số Hiệu suất & Cơ hội (Performance & Opportunity)

1.  **Missed Opportunity Rate (Tỷ lệ Bỏ lỡ Cơ hội):**
    -   _Công thức:_ `(Số hội thoại có Intent Mua nhưng không lấy được SĐT/Thông tin liên hệ) / (Tổng số hội thoại có Intent Mua)`.
    -   _Ý nghĩa:_ Đo lường sự lãng phí tài nguyên Marketing. Sale tiếp khách tốt nhưng không chốt được bước tiếp theo (Next Step).
2.  **Conversion Efficiency (Hiệu quả Chuyển đổi thực):**
    -   _Công thức:_ `(Số đơn Won) / (Tổng số Lead loại trừ nhóm Spam/Info Harvest)`.
    -   _Ý nghĩa:_ Loại bỏ các Lead rác để đánh giá năng lực chốt sales thực tế của nhân viên.
3.  **Objection Handling Success Rate (Tỷ lệ Xử lý Từ chối):**
    -   _Công thức:_ `(Số lần chốt Won sau khi khách đã Say No/Chê đắt) / (Tổng số lần khách Say No)`.
    -   _Ý nghĩa:_ Phân biệt nhân viên Sales xuất sắc (biết lật ngược tình thế) với nhân viên trung bình.

### Nhóm Chỉ số Trải nghiệm & Vận hành (CX & Operations)

4.  **Resolution Time (Thời gian Giải quyết):**
    -   _Định nghĩa:_ Thời gian từ tin nhắn đầu tiên đến khi kết thúc phiên hội thoại (Won/Lost/Resolved).
    -   _Ý nghĩa:_ Thời gian càng ngắn (đối với các vấn đề đơn giản) chứng tỏ quy trình càng tinh gọn.
5.  **Ghost Rate Analysis (Phân tích Tỷ lệ "Bơ"):**
    -   _Phân loại:_ Ghost sau báo giá vs. Ghost sau khi tư vấn.
    -   _Ý nghĩa:_ Nếu Ghost sau báo giá cao -> Vấn đề ở Giá cả hoặc Giá trị cảm nhận (Value Proposition) chưa đủ. Nếu Ghost sau tư vấn -> Vấn đề ở kỹ năng thuyết phục.
6.  **Sentiment Delta (Chỉ số Dịch chuyển Cảm xúc):**
    -   _Công thức:_ `Điểm cảm xúc Cuối hội thoại - Điểm cảm xúc Đầu hội thoại`.
    -   _Ý nghĩa:_ Quan trọng hơn điểm CSAT tĩnh. Nếu khách vào giận dữ (-1) mà ra về bình thường (0), Delta là +1 (Nhân viên làm tốt việc xoa dịu).

---

## 3. TRÍCH XUẤT ĐẶC TRƯNG (FEATURE EXTRACTION)

Để AI hoạt động hiệu quả, cần trích xuất các tín hiệu (signals) cụ thể từ văn bản:

### Các Tín hiệu Định lượng (Quantitative Signals)

-   **Response Lag:** Khoảng thời gian chờ giữa câu hỏi của khách và câu trả lời của Sale.
-   **Conversation Turns:** Tổng số lượt qua lại. (Quá ít = Hời hợt; Quá nhiều = Lan man/Không chốt được).
-   **Pricing Tokens:** Nhận diện các con số liên quan đến tiền tệ.

### Các Tín hiệu Định tính (Qualitative Signals)

-   **Negotiation Keywords:** "bớt", "giảm giá", "chiết khấu", "ưu đãi", "tặng kèm".
-   **Competitor Mentions:** Tên các thương hiệu đối thủ (Cần xây dựng danh sách từ khóa đối thủ).
-   **Risk Keywords:** "lừa đảo", "làm ăn kiểu gì", "quản lý", "báo cáo", "kiện".
-   **Commitment Keywords:** "cam kết", "chắc chắn", "bảo đảm 100%", "yên tâm". (AI sẽ quét xem các từ này có được dùng đúng ngữ cảnh cho phép không).

---

## 4. QUY TRÌNH & GIÁ TRỊ CHIẾN LƯỢC (PIPELINE & VALUE)

### Quy trình Xử lý Dữ liệu (Pipeline)

1.  **Data Ingestion:** Thu thập log chat.
2.  **Anonymization (Ẩn danh hóa):** Tự động che SĐT, Email, Tên riêng để bảo mật dữ liệu khách hàng trước khi đưa vào phân tích.
3.  **Contextual Analysis (Phân tích Ngữ cảnh):** AI đọc toàn bộ chuỗi hội thoại (Session) thay vì từng câu lẻ tẻ để hiểu mạch chuyện.
4.  **Tagging & Scoring:** Gán nhãn theo Ma trận mục 1 và chấm điểm KPI theo mục 2.
5.  **Visualization:** Hiển thị lên Dashboard quản trị.
