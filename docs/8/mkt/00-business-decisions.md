# 00. Business Decisions — MKT/Leads & Báo cáo Pipeline

> **Người điền:** HUMAN (ORCH điều phối) · **Seal tại:** C0 · **Trạng thái:** `DRAFT`
> Nguồn câu hỏi: `docs/8/68.MKTLeads_BaoCaoPipeline_kehoach.md` §29 (30 câu).
> Quyết định ở đây là **nguồn sự thật duy nhất** — code theo file này, không theo suy đoán.

| # | Câu hỏi | Quyết định | Người quyết | Ngày |
|---|---|---|---|---|
| 1 | MKT CRUD toàn bộ Lead hay chỉ Lead tạo? | MKT chỉ CRUD Lead do chính MKT tạo. | HUMAN | 2026-10-07 |
| 2 | MKT có được tạo Proposal trực tiếp? | Không. MKT chuyển Lead cho GĐKV; chỉ GĐKV được tạo Proposal từ Lead. | HUMAN | 2026-10-07 |
| 3 | Proposal `user_id` khi MKT tạo = MKT/SALES/GĐKV? | MKT không tạo Proposal. Khi Lead được giao cho GĐKV, GĐKV là người tạo và chủ Proposal. | HUMAN | 2026-10-07 |
| 4 | GĐTT xem Lead detail phòng ban hay chỉ aggregate? | GĐTT được xem chi tiết Lead trong phạm vi phòng ban. | HUMAN | 2026-10-07 |
| 5 | SALES có thấy Lead chưa phân công trong phòng ban? | Không. Lead chưa phân phòng ban không hiển thị cho SALES. Sau khi phân phòng ban, GĐTT thấy; khi giao cho GĐKV thì GĐKV mới thấy. | HUMAN | 2026-10-07 |
| 6 | Mapping chính xác vùng miền → phòng ban? | Bắc → Trung tâm KD miền Bắc; Trung → Trung tâm KD miền Trung; Nam → Trung tâm KD miền Nam. Lưu qua Data List, không hard-code. | HUMAN | 2026-10-07 |
| 7 | Dùng tên TTTN Bắc/Trung/Nam hiện tại? | Không đổi tên; dùng tên hiện tại: Trung tâm KD miền Bắc, Trung tâm KD miền Trung, Trung tâm KD miền Nam. | HUMAN | 2026-10-07 |
| 8 | `Đối tượng` = Hộ KD/Công ty/Cá nhân? | Select gồm Hộ KD, Công ty, Cá nhân; cho phép bổ sung sau. | HUMAN | 2026-10-07 |
| 9 | Options `Nguồn` Lead gồm gì? | FB Lead, FB Mess, Youtube, Tiktok, Website, Hotline, Khác; cho phép bổ sung sau. | HUMAN | 2026-10-07 |
| 10 | `Phân loại khách hàng` = 4 giá trị đã nêu? | Tiềm năng, Quan tâm, Theo dõi thêm, Không chất lượng. | HUMAN | 2026-10-07 |
| 11 | Options `Tình trạng liên hệ` CSKH? | Nghe máy liên hệ thành công; Nghe máy đang bận hẹn gọi lại; Không nghe máy/Từ chối nghe máy; Máy bận; Không liên lạc được (Tắt máy/Ngoài vùng); Sai số điện thoại. | HUMAN | 2026-10-07 |
| 12 | Options `Tình trạng TVBH`? | Bộ nháp: Chưa tư vấn, Đang tư vấn, Đã gửi báo giá, Đang đàm phán, Hẹn lại, Thành công, Không thành công; cho phép sửa options sau. | HUMAN | 2026-10-07 |
| 13 | `ACTIVE` của Station có = ON trạm? | Có. `ACTIVE = ON`. Không thêm trạng thái ON riêng. | HUMAN | 2026-10-07 |
| 14 | Nếu không — trạng thái/event ON lấy từ đâu? | Không áp dụng vì câu 13 đã xác định `ACTIVE = ON`. | HUMAN | 2026-10-07 |
| 15 | Lead có cần lat/lng không? | Không. Lead không lưu latitude/longitude. | HUMAN | 2026-10-07 |
| 16 | Tạo Proposal từ Lead có bắt buộc chọn tọa độ bản đồ? | Có. Bắt buộc có tọa độ; được dán link Google Maps để tự điền hoặc nhập thủ công latitude/longitude. | HUMAN | 2026-10-07 |
| 17 | Lead `source` map Proposal field nào? | Map vào field riêng `nguon_lead`. | HUMAN | 2026-10-07 |
| 18 | Lead `customer_type` map Proposal field nào? | Map vào field riêng `doi_tuong_lead`. | HUMAN | 2026-10-07 |
| 19 | Ghi chú Lead map `description` Proposal? | Không map vào `description`; map vào field riêng `ghi_chu_lead`. | HUMAN | 2026-10-07 |
| 20 | Tự động backfill Lead cho Proposal/Station cũ? | Không backfill. Chỉ liên kết cho dữ liệu mới tạo từ Lead. | HUMAN | 2026-10-07 |
| 21 | Funnel có hiển thị Proposal/Station chưa gắn Lead? | Có, hiển thị thành nhóm riêng Unlinked/Chưa gắn Lead. | HUMAN | 2026-10-07 |
| 22 | Delete Lead = hard hay soft? | Mặc định soft delete; chỉ SUPER_ADMIN được hard delete sau đó. | HUMAN | 2026-10-07 |
| 23 | CSKH/TVBH history cần báo cáo theo từng lần liên hệ? | Có. Mỗi lần liên hệ là một activity để báo cáo. | HUMAN | 2026-10-07 |
| 24 | Hay chỉ hiển thị form/timeline? | Hiển thị lịch sử theo cùng kiểu mục Xem log của Proposal và Station. | HUMAN | 2026-10-07 |
| 25 | Dashboard có export Excel/PDF? | Chỉ export Excel. | HUMAN | 2026-10-07 |
| 26 | SUPER_ADMIN chỉnh được layout + metric hay chỉ layout? | SUPER_ADMIN được chỉnh cả layout và metric. | HUMAN | 2026-10-07 |
| 27 | Report filter mặc định theo thời gian nào? | Tháng hiện tại. | HUMAN | 2026-10-07 |
| 28 | Có scheduled report/email không? | Chưa làm trong phase này. | HUMAN | 2026-10-07 |
| 29 | Journey code hiển thị cho user ngoài hệ thống? | Không. Journey code chỉ dùng nội bộ; bên ngoài dùng tracking code nếu cần. | HUMAN | 2026-10-07 |
| 30 | Đồng bộ Journey ID sang 1Office không? | Chưa đồng bộ hiện tại. Thiết kế mở để sau này mapping thủ công và đồng bộ. | HUMAN | 2026-10-07 |

## Quyết định kỹ thuật đã mặc định (không cần hỏi lại — sửa tại đây nếu khác)

| Chủ đề | Quyết định | Nguồn |
|---|---|---|
| Common ID | `business_journeys.journey_code` (hiển thị/API) + `journey_id` (FK nội bộ) — **không** dùng `work_automation_runs.process_id` | 68 §9 |
| Station link | Đi qua `station_proposals.station_id` — không thêm `journey_id` vào `stations` | 68 §9 |
| Proposal cũ | `journey_id = NULL`, không auto-ghép | 68 §10 |
| Duplicate Lead | Chặn tạo Lead nếu trùng số điện thoại hoặc email. Cần chuẩn hóa số điện thoại trước khi kiểm tra. | HUMAN · 2026-10-07 |
| Chart library | `recharts` | 68 §15 |
| Caching | TTL in-process 30-60s, **không Redis** | 68 §21 |
| Mapping vùng→phòng ban | Data List `MKT Lead Routing`, **không hard-code** | 68 §12 |
