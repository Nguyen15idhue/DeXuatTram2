# Tích hợp API 1Office - Station Management System

> **Cập nhật:** 11/09/2026
> **Phạm vi:** toàn bộ tính năng tích hợp 1Office (liên hệ + nhân sự) hiện có.

## Tổng quan

Hệ thống tích hợp 1Office theo **2 loại API** gắn với cùng một nền tảng (`system_key = '1office'`):

| Loại API | `api_type` | Mục đích |
|---|---|---|
| Liên hệ | `contact` | Push/pull/link đề xuất ↔ contact 1Office |
| Nhân sự | `personnel` | Pull danh sách hồ sơ nhân sự về DB (nguồn dropdown + quy đổi người) |

Mỗi loại có **token riêng** (1Office cấp token theo từng "object").

---

## 1. Cấu hình API (`api_configs`)

Các cột liên quan:

| Cột | Ý nghĩa |
|---|---|
| `system_key` | Nền tảng (`1office`) — dùng chung cho cả 2 loại |
| `api_type` | `contact` \| `personnel` |
| `base_url` | `https://egr.1office.vn` |
| `auth_config` | Token: liên hệ `{ token }`, nhân sự `{ admin_token }` |
| `sync_enabled` | Bật đồng bộ tự động (chỉ personnel) |
| `sync_cron` | Cron expression 5 trường (chạy theo giờ VN) |
| `last_sync_at/status/message` | Kết quả đồng bộ gần nhất |

**Quản lý tại:** `/admin/api-configs` — form có "Nền tảng API" + "Loại API"; card nhân sự chỉ hiện **Sync nhân sự** + **Test**.

### Endpoint 1Office sử dụng

| Chức năng | Endpoint | Token |
|---|---|---|
| Liên hệ gets/item/insert/update/delete | `/api/customer/contact/*` | contact token |
| Danh sách tài khoản người dùng | `/api/admin/user/gets` | admin/user token |
| Danh sách hồ sơ nhân sự | `/api/personnel/profile/gets` | personnel token |
| Pull ID thô theo người | `field_raws=user_ids,manager_user_ids` | — |

Quy tắc chung: `Content-Type: application/x-www-form-urlencoded`, auth bằng `access_token` query param, rate-limit ~1.5s/request + retry.

---

## 2. Ba loại ID nhân sự 1Office

| Tên | Field | Trong UI 1Office |
|---|---|---|
| ID liên hệ | `ID` (user account) | dùng cho contact / `field_raws` |
| ID hồ sơ nhân sự | `personnel_id` | **"ID Hồ sơ nhân sự"** |
| Mã nhân sự | `code` | **"Mã NS"** |

- `user_ids`/`manager_user_ids` nhận **code (Mã NS)** hoặc **tên**, KHÔNG nhận ID số.
- `user_external_map.external_id` lưu **`personnel_id`**.
- Push: `personnel_id` → `code` (ưu tiên) hoặc `fullname`.
- Pull: `ID` (field_raws) → `personnel_id` → người nội bộ.

---

## 3. Đồng bộ nhân sự (personnel)

### Bảng `external_users`
Lưu hồ sơ nhân sự 1Office cục bộ (nguồn dropdown + quy đổi):

| Cột | Nguồn (1Office) |
|---|---|
| `external_id` | `ID` (ID hồ sơ nhân sự / personnel_id) |
| `contact_id` | `raw_user_id` (ID tài khoản 1Office — rỗng nếu chưa có) |
| `code` | `code` (Mã NS) |
| `fullname` | `name` |
| `username` | `user_id` |
| `department_id` | `department_num_id` |
| `department_name` | `department_id` (tên phòng ban) |
| `status` | `job_status` |
| `is_active` | `STOP_WORKING` hoặc không còn → 0 |
| `raw_data` | JSON gốc |

- Bỏ qua **dòng header** (`code='STT'`, `name='Họ tên'`).
- Unique `(system, external_id)`; người mất → `is_active=0`.

### Đồng bộ
- **Ấn tay:** `POST /api/admin/api-configs/:id/sync-personnel` (nút "Đồng bộ ngay").
- **Tự động:** cron (`sync_enabled`, `sync_cron`). Worker tick 20s + `cronMatcher` (`workers/personnelSyncWorker.js`), chống chồng bằng `GET_LOCK`, chạy theo `TZ=Asia/Ho_Chi_Minh`.

---

## 4. Mapping người dùng (`user_external_map`)

- Key `(user_id, system)` → `external_id` = **personnel_id**.
- **Giao diện:** `/admin/users` → "Liên kết hệ thống" → dropdown **"Mã NS - Tên"** (thay vì nhập ID).
- Người **chưa có tài khoản 1Office** bị **khóa** (disabled) + nhãn cảnh báo.
- API: `GET/PUT/DELETE /api/admin/users/:id/external`; danh sách: `GET /api/admin/external-users` (chỉ trả `is_active=1`).

---

## 5. Trường type `user` + giao việc theo role

- Field type `user` lưu `{ id }` (users.id), hiển thị chip tên.
- `source_config.auto_user`:
  | Mode | Giá trị |
  |---|---|
  | `current_user` | người đăng nhập |
  | `parent_sales` | sales quản lý (`parent_id`) |
  | `owner_or_manager` | CTV → sales quản lý; còn lại → chính người tạo |
- Field auto: **tự điền + khóa readonly**.
- Trường **`nguoi_phu_trach`** (id 161) dùng mode `owner_or_manager`, map → `user_ids`.
- BE: `dynamicUtils.applyAutoUserFields`; FE: `DynamicForm.resolveAutoUserId`.

### Mapping push/pull người
| Source | Target 1Office | Chiều |
|---|---|---|
| `nguoi_phu_trach` | `user_ids` | push |
| `nguoi_giao_phu_trach` | `manager_user_ids` | push |

- **Push** (`fieldMapper.transformUserPush`): đọc `external_users` (cache 30s) → `code`/tên → gửi. Không gọi API lúc push.
- **Pull** (`transformUserPull`): `ID` → `contact_id` của `external_users` → `personnel_id` → `user_external_map` → `{ id }`.

---

## 6. Cảnh báo & giới hạn

- `user_ids` **chỉ nhận người có tài khoản 1Office**. Người chưa có tài khoản → 1Office bỏ qua nhưng vẫn trả HTTP 200.
- App phát hiện và gắn **`warnings`** vào kết quả push → FE hiện toast cảnh báo; dropdown khóa người `contact_id` rỗng.
- Thiếu token (hoặc sai object) → bỏ qua field, không gửi sai.

---

## 7. Sync liên hệ (contact)

- **Push:** `POST /api/admin/1office/push` (`apiConfigId`, `proposalIds`) → tạo queue job; worker gửi `contact/insert|update` (kèm `desc` render từ template, file đính kèm).
- **Pull:** `POST /api/admin/1office/pull` → lấy contacts (có `field_raws` cho field người) → cập nhật proposal đã liên kết.
- **Link:** `POST /api/admin/1office/link` — liên kết proposal ↔ contact có sẵn.
- **Field mapping:** kéo–thả tại `/admin/api-configs` → FieldMappingPanel; preview `POST /api/admin/field-mappings/preview`.
- **Desc template:** HTML theo section ở TemplateEditor.
- **Queue log:** `api_queue_logs` (status/retry/response).

---

## 8. API nội bộ liên quan

| Method | Endpoint | Việc |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/admin/api-configs` | CRUD config |
| POST | `/api/admin/api-configs/:id/test` | Test kết nối (chọn token/endpoint theo `api_type`) |
| POST | `/api/admin/api-configs/:id/sync-personnel` | Đồng bộ nhân sự (ấn tay) |
| GET | `/api/admin/api-configs/:id/1office-users` | Danh sách tài khoản 1Office |
| GET | `/api/admin/external-users` | Danh sách nhân sự cục bộ (dropdown) |
| GET/PUT/DELETE | `/api/admin/users/:id/external` | Mapping user ↔ ngoài |
| POST | `/api/admin/1office/push\|pull\|link` | Sync liên hệ |

---

## 9. Bảng DB liên quan

| Bảng | Vai trò |
|---|---|
| `api_configs` | Cấu hình API (2 loại) + lịch sync |
| `api_field_mappings` | Mapping nguồn→đích (contact), unique theo `target_field` |
| `external_users` | Hồ sơ nhân sự 1Office (pull) |
| `user_external_map` | Map user nội bộ ↔ `personnel_id` |
| `api_queue_logs` | Log/job push/pull |

Migration: `database/45..48`.

---

## 10. Cấu hình cần thiết (3 chỗ)

1. `/admin/api-configs` — tạo 2 config (`contact` + `personnel`) với token tương ứng; bật cron nếu muốn.
2. `/admin/api-configs` → Mapping — gắn field người (`nguoi_phu_trach` → `user_ids`, `nguoi_giao_phu_trach` → `manager_user_ids`).
3. `/admin/users` → "Liên kết hệ thống" — gán từng user nội bộ với nhân sự 1Office.

---

## 11. Lưu ý vận hành

- Token 1Office gắn theo object: liên hệ / admin-user / personnel — không dùng lẫn.
- Bắt buộc `TZ=Asia/Ho_Chi_Minh` cho backend + mysql (cron và thời gian đúng +07).
- Người nhận giao việc phải **có tài khoản 1Office** và **đã gán ở Liên kết hệ thống**.
- Nếu thiếu `admin_token`/personnel token → field người bị bỏ qua (đồng bộ nhân sự sẽ lỗi rõ ràng).
