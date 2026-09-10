# Đã làm được (đang chạy đúng, đã test)

## 1. Hệ dynamic (cốt lõi hệ thống)
- 13 field types + Form/View Builder (drag-drop), trường lưu `fixed` (cột DB) hoặc `json` (`custom_data`).
- Select/Multiselect 2 nguồn (manual, Data List) + cascading (`parent_field` + `relation_key`).
- Formula pre-compute (trong form) / post-compute (sau INSERT/UPDATE), 26 hàm custom (CONCAT/IF/LEN/LPAD/SEQ...), SEQ sinh mã tuần tự theo prefix (`proposal_sequences`).
- Mã nghiệp vụ chạy đúng: proposal `TDT_HCM_0001` (tạo + đổi theo tỉnh/mô hình khi sửa, đóng băng khi đã link), station `E.HCM0001`.
- Chuẩn hóa tên tỉnh fuzzy (`Hà Nội` khớp `Thành phố Hà Nội`) qua `applyDiaGioi` mỗi khi đổi tỉnh.
- Number formatting 4 kiểu + unit; file upload/download/viewer (ảnh/video/PDF/Word/Excel); Excel import/export (cột hardcode stations/proposals).

## 2. Tích hợp 1Office (Phase 0–10 + Phần 2–8 docs/5/28)
- Mapping 7 chiều `both` + `code` push-only (config 3); template HTML mô tả; upload file 5/batch.
- Queue (`api_queue_logs`) + worker (poll 2s, retry) + Audit Log UI (list/filter/stats/retry/cancel, phân quyền sales xem của mình).
- Push batch trung thực (tạo mới/cập nhật), Pull toàn cục + **reverse-sync** (phân trang, khớp mã/ID, skip chưa-link, đánh dấu link treo `error`).
- Link/Unlink theo dòng (khóa admin), upsert chống trùng mã (`contact_updated`), ID 1Office số + click qua link.
- Field `id_1office` + metadata + editor/preview/validate đều nhận biến mới.

## 3. Quản trị & phân quyền
- Roles SUPER_ADMIN/ADMIN/SALES/CTV, cây SALES→CTV, scope nhánh; JWT 12h + `token_version` (đổi pass revoke token cũ), 401 tự về login.
- Tìm kiếm table theo mã + trường fixed: proposals (mã đề xuất/tracking/SĐT chuẩn hóa/tên/địa chỉ/người tạo), stations (mã trạm/tên/địa chỉ), users (tên/email/SĐT/mã ngoài).
- Bulk action: tick chọn + xóa hàng loạt 3 trang (proposals/stations/users), bỏ qua dòng bảo vệ, toast trung thực.
- Trang cấu hình (fields/forms/views/data-lists/map-config/roles) + Swagger `/api-docs`.
- Excel theo role, guest submit/track (captcha + mask phone + rate limit).

## 4. Vận hành & test
- Docker Compose 3 services, hot reload; Playwright test host (`frontend/test-*.cjs`), kết quả lưu JSON.
- Toast/polling kết quả queue, chart audit log, responsive dropdown `...` + Escape.
