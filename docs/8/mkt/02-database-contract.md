# 02. Database Contract — MKT/Leads & Báo cáo Pipeline

> **Người viết:** ORCH · **Seal tại:** C0 · **Trạng thái:** `DRAFT`
> Mọi migration (bước 1.1–1.5, 2.1, 3.2–3.3) phải khớp file này. Đổi schema = sửa contract trước, rồi mới sửa SQL.

## 1. `business_journeys`

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | BIGINT/BIGINT UNSIGNED | PK AUTO_INCREMENT | theo convention hiện có |
| `journey_code` | CHAR(36) | UNIQUE NOT NULL | UUID, hiển thị/hiển thị API |
| `current_stage` | VARCHAR/ENUM | NOT NULL, default `LEAD` | enum: LEAD, CSKH, TVBH, PROPOSAL, STATION, ON (+ terminal theo 05) |
| `status` | VARCHAR | | ACTIVE/CLOSED theo 05 |
| `started_at` / `completed_at` | DATETIME NULL | | |
| `created_at` / `updated_at` | DATETIME | | convention mọi bảng |

Indexes: `journey_code` UNIQUE, `(current_stage, created_at)`.

## 2. `leads`

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | | PK | |
| `lead_code` | VARCHAR NULL | | nếu nghiệp vụ cần |
| `journey_id` | BIGINT | **UNIQUE NOT NULL FK → business_journeys.id** | 1-1 |
| `full_name` | VARCHAR | NOT NULL | |
| `phone` | VARCHAR(20) | index | chuẩn hóa số Việt Nam trước duplicate check |
| `email` | VARCHAR NULL | | |
| `address` | TEXT/VARCHAR NULL | | |
| `province` / `ward` | VARCHAR | | label từ datalist |
| `province_code` / `region` | VARCHAR NULL | | `ma_tinh`, `vung_mien` |
| `customer_type` | VARCHAR | NOT NULL | `Hộ KD`/`Công ty`/`Cá nhân` |
| `source` | VARCHAR | NOT NULL | `FB Lead`/`FB Mess`/`Youtube`/`Tiktok`/`Website`/`Hotline`/`Khác` + options bổ sung |
| `note` | TEXT NULL | | |
| `stage` | VARCHAR/ENUM | NOT NULL default `NEW` | mirror journey (kiểm tra 05) |
| `customer_classification` | VARCHAR | | `Tiềm năng`/`Quan tâm`/`Theo dõi thêm`/`Không chất lượng` |
| `sales_outcome` | VARCHAR NULL | | SUCCESS/FAILED |
| `assigned_user_id` | BIGINT NULL FK users | index | người hiện tại |
| `assigned_department` | VARCHAR NULL | | |
| `assigned_at` | DATETIME NULL | | |
| `created_by` | BIGINT FK users | | |
| `deleted_at` | DATETIME NULL | | soft delete |
| `created_at` / `updated_at` | DATETIME | | |

**Indexes (bước 1.2):** `(created_at)`, `(stage,created_at)`, `(customer_classification,created_at)`, `(source,created_at)`, `(province,created_at)`, `(assigned_user_id,created_at)`, `phone`, `(deleted_at, created_at)`.

Duplicate Lead được chặn ở service/validator theo số điện thoại hoặc email sau chuẩn hóa; không dùng UNIQUE cứng để vẫn hỗ trợ soft delete và dữ liệu lịch sử.

## 3. `lead_assignments`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | PK | |
| `lead_id` | FK leads, index | |
| `assignee_user_id` | FK users | |
| `assigned_department` | VARCHAR | |
| `assignment_type` | ENUM(`auto`,`manual`) | |
| `assigned_by` | FK users NULL | system khi auto |
| `reason` | VARCHAR NULL | |
| `started_at` / `ended_at` | DATETIME | record cũ = `ended_at NOT NULL` |
| `created_at` | DATETIME | |

## 4. `journey_activity_logs`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | PK | |
| `journey_id` | FK, index | |
| `entity_type` | VARCHAR | `lead`/`proposal`/`station`/`assignment`/`automation` |
| `entity_id` | BIGINT | |
| `action` | VARCHAR | theo event registry 05 |
| `stage_before`/`stage_after` | NULL | |
| `status_before`/`status_after` | NULL | |
| `changed_fields` | JSON NULL | |
| `actor_id`/`actor_role` | NULL | system/1Office cũng ghi |
| `source` | VARCHAR | `web`/`webhook`/`worker`/`import`/`api` |
| `reason` | TEXT NULL | |
| `ip` | VARCHAR NULL | |
| `created_at` | DATETIME | index `(journey_id, created_at)` |

**Indexes:** `(journey_id, created_at)`, `(entity_type, entity_id, created_at)`, `(action, created_at)`.

## 5. `journey_external_refs`

| Cột | Ghi chú |
|---|---|
| `journey_id` FK, `system` (`1office`), `ref_type` (`process`/`contact`), `external_id`, `external_code`, `last_synced_at` | unique `(system, ref_type, external_id)` |

## 6. Alter bảng có sẵn

| Bảng | Thay đổi | Quy tắc |
|---|---|---|
| `station_proposals` | + `journey_id` BIGINT NULL FK | dữ liệu cũ = NULL; index `(journey_id, created_at)`, `(journey_id, status)` |
| `station_proposals` | + `UNIQUE(station_id)` nullable | **CHỈ thêm sau khi scan không có duplicate** (14-12-2026 kiểm tra: 1 proposal linked) |
| `users` | role ENUM + `MKT` | bước 2.1 |

Proposal fields nhận từ Lead (field động `source_type=json`): `nguon_lead`, `doi_tuong_lead`, `ghi_chu_lead`.

## 7. Rollback

Mỗi migration ghi câu rollback (bỏ index/cột nullable) trong comment đầu file SQL. Không DROP bảng trong dự án này.

## 8. Version

| Version | Ngày | Thay đổi |
|---|---|---|
| 0.2 | 2026-10-07 | áp dụng C0 decisions; vẫn DRAFT |
