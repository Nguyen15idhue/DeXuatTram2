# 01. Architecture Contract — MKT/Leads & Báo cáo Pipeline

> **Người viết:** ORCH · **Seal tại:** C0 · **Trạng thái:** `DRAFT`
> Nguồn: kế hoạch 68 §7–§10, §17–§19. W-A/W-B đọc file này để hiểu ranh giới module — không cần đọc codebase.

## 1. Entity diagram

```text
business_journeys 1 ── 1 leads
business_journeys 1 ── N station_proposals (journey_id NULLABLE)
station_proposals 1 ── 0..1 stations (station_id, unique nullable)
journey_external_refs N ── 1 business_journeys
journey_activity_logs N ── 1 business_journeys
lead_assignments N ── 1 leads
```

## 2. ID contract

| ID | Vai trò | Quy tắc |
|---|---|---|
| `journey_code` | ID chung hiển thị / API / log | CHAR(36) UNIQUE, sinh khi tạo journey |
| `journey_id` | FK nội bộ | chỉ backend, không xuất FE trừ khi cần |
| `leads.id`, `station_proposals.id`, `stations.id` | GIỮ NGUYÊN | không đổi, không re-key |
| `work_automation_runs.process_id` | external 1Office | chỉ lưu trong `journey_external_refs`, **không bao giờ** là FK chính |

## 3. Module boundaries (1 file = 1 owner — xem 69 §A.4)

| Module | Owner sprint | Responsibility |
|---|---|---|
| `journeyService.js` | ORCH (S5) | stage computation, multi-Proposal rule |
| `journeyActivityService.js` | W-A (S3) | ghi/đọc `journey_activity_logs` |
| `proposalLifecycle.js` | ORCH (S5) | transition duy nhất + hook journey |
| `stationService.js` / `stationActivityService.js` | ORCH (S5) | station events → journey |
| `leadService.js` / `leadAssignmentService.js` | W-A (S3) | CRUD, scope, routing |
| `reportService.js` | ORCH (S6) | aggregate API |
| `excelService.js` | W-A (S4) | template/export/import leads |
| `frontend/**` | W-B | UI |

## 4. Read paths

```text
Lead list      → leads (scope filter) → journey stage (join hoặc cache)
Journey tree   → leads → station_proposals WHERE journey_id → stations WHERE id IN (station_id)
Timeline       → journey_activity_logs UNION (adapter nếu cần legacy 2 bảng)
Report         → aggregate trực tiếp từ leads/proposals/stations/journey stage (1 API)
```

## 5. C0 business rules mapped to architecture

- MKT chỉ CRUD Lead do chính mình tạo (`created_by = current_user.id`); MKT không tạo Proposal từ Lead.
- Lead chưa phân phòng ban không nằm trong scope SALES. GĐTT thấy Lead đã phân cho phòng ban của mình; GĐKV thấy Lead được giao trực tiếp cho mình.
- Bắc/Trung/Nam route lần lượt tới Trung tâm KD miền Bắc/Trung/miền Nam qua Data List, không hard-code trong service.
- Lead không lưu tọa độ. Tạo Proposal từ Lead bắt buộc có `google_maps_url` hoặc cặp `latitude`/`longitude`.
- Proposal nhận dữ liệu Lead qua các field riêng `nguon_lead`, `doi_tuong_lead`, `ghi_chu_lead`.
- Funnel có nhóm riêng cho Proposal/Station chưa gắn Lead; không backfill dữ liệu cũ.
- Journey code chỉ dùng nội bộ; chưa đồng bộ Journey ID sang 1Office.

## 6. Out of scope (không làm trong dự án này)

- Redis / message queue mới
- Merge Lead vào Proposal/Station (2 entity độc lập)
- Đổi format API cũ
- Public API cho Lead (chỉ `/admin/*` + scope)

## 7. Version

| Version | Ngày | Thay đổi |
|---|---|---|
| 0.2 | 2026-10-07 | áp dụng C0 decisions; vẫn DRAFT |
