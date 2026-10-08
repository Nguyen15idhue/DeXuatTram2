# 03. API Contract — MKT/Leads & Báo cáo Pipeline

> **Người viết:** ORCH · **Seal tại:** C0 · **Trạng thái:** `DRAFT`
> Response chuẩn: `{ success, data, message, pagination? }`. Mọi endpoint mới phải có `@swagger` JSDoc (AGENTS.md §9).
> W-A code đúng signature này; FE (7.x) mock theo contract trước khi backend thật sẵn (C4).

## 1. Leads CRUD (bước 4.1 — W-A)

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/api/admin/leads` | lead-scope (04) | query: `page, limit, search, stage, source, province, region, department, assigned_user_id, date_from, date_to`; **server-side pagination**; trả `pagination {page,limit,total}` |
| POST | `/api/admin/leads` | MKT/ADMIN/SUPER (04) | tạo journey + lead trong 1 transaction; auto routing theo Data List khi phù hợp (4.2); trả `warnings[]` nếu thiếu routing rule |
| GET | `/api/admin/leads/:id` | lead-scope | kèm `journey {id, code, stage}` |
| PUT | `/api/admin/leads/:id` | lead-scope + quyền sửa (04) | **không cho sửa `journey_id`**; ghi log `lead_updated` |
| DELETE | `/api/admin/leads/:id` | theo 04 | soft delete (`deleted_at`); không xóa vật lý |
| DELETE | `/api/admin/leads/:id/permanent` | **SUPER_ADMIN only** | hard delete sau soft delete; ghi audit log; không cho nếu còn liên kết cần giữ |
| POST | `/api/admin/leads/bulk-delete` | như DELETE | body `{ids: []}`; transaction; trả `{succeeded: [], failed: [{id, reason}]}` |

## 2. Assignment (bước 4.2 — W-A)

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| POST | `/api/admin/leads/:id/assign` | MKT/ADMIN/SUPER; SALES theo 04 | body `{assignee_user_id, reason?}`; validate: user ACTIVE + SALES + `isGdkv()` + department khớp routing (00-câu 5); đóng assignment cũ, tạo mới, ghi log `assigned` |
| GET | `/api/admin/leads/:id/assignments` | lead-scope | lịch sử full |

## 3. Journey (bước 4.3 — W-A; 5.x — ORCH)

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/api/admin/leads/:id/journey` | lead-scope | trả `{journey, timeline[], proposals[]}` — **nền cho FE 8.1**; timeline sort `created_at DESC` |
| GET | `/api/admin/journeys/:journeyId/timeline` | lead-scope (nhẹ) | phân trang `page/limit` |
| POST | `/api/admin/leads/:id/create-proposal` | chỉ SALES có `chuc_vu = GĐKV` | body bắt buộc có `google_maps_url` hoặc cặp `latitude`/`longitude`; server chuẩn hóa link/tọa độ, copy `nguon_lead`, `doi_tuong_lead`, `ghi_chu_lead`; idempotency/check trùng; trả `{proposal_id, journey_id}` |

## 4. Reports (bước 9.1 — ORCH / 9.2 — W-A)

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/api/admin/reports/pipeline` | report-viewer (04) | query: `date_from, date_to, region, department, source, stage, assigned_user_id, province`; trả **1 object** với mọi key dataset theo contract 06 §3; metric name phải thuộc registry |
| GET | `/api/admin/reports/config` | report-viewer | |
| PUT | `/api/admin/reports/config` | **requireSuperAdmin** | body gồm widget layout + metric config thuộc whitelist — **không nhận SQL/metric lạ → 400** |
| GET | `/api/admin/reports/pipeline/export` | report-viewer | query filter như pipeline; chỉ export Excel |

## 5. Excel (bước 6.1–6.2 — W-A)

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/api/admin/excel/template?entity=leads` | lead-scope | reuse route hiện có, chỉ mở allowlist entity |
| GET | `/api/admin/excel/export/leads` | lead-scope | scope-aware export |
| POST | `/api/admin/excel/import/preview?entity=leads` | lead-creator | detection view theo pattern hiện có |
| POST | `/api/admin/excel/import/confirm` | lead-creator | all-or-nothing; REQUIRED_HEADERS: `full_name`, `phone` |

## 6. Error codes

| Code | Dùng khi |
|---|---|
| 400 | payload sai validators (phone, required) |
| 403 | ngoài scope / role không có quyền (sai chủ = 403, không 404) |
| 404 | record không tồn tại thật (đã qua scope) |
| 409 | duplicate (bulk/link/idempotency) |
| 422 | nghiệp vụ chặn (ví dụ tạo Proposal khi chưa SUCCESS, thiếu lat/lng) |
| 500 | lỗi hệ thống (không lộ message nội bộ) |

## 7. FE service functions (cho `api.js`, W-B)

```text
getLeads(params), createLead(data), getLead(id), updateLead(id, data),
deleteLead(id), bulkDeleteLeads(ids),
assignLead(id, data), getLeadAssignments(id),
getLeadJourney(id), createProposalFromLead(id, data),
getPipelineReport(params), getReportConfig(), saveReportConfig(data)
```

## 8. Version

| Version | Ngày | Thay đổi |
|---|---|---|
| 0.2 | 2026-10-07 | áp dụng C0 decisions; vẫn DRAFT |
