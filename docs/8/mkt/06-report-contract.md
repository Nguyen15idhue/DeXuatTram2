# 06. Report Contract — MKT/Leads & Báo cáo Pipeline

> **Người viết:** ORCH · **Draft:** C0 · **SEALED tại:** C5 · **Trạng thái:** `DRAFT`
> Đây là **A6** — metric registry + aggregation. `reportService.js` (bước 9.1, ORCH) chỉ được trả các metric trong registry; FE (9.3, W-B) chỉ render widget ánh xạ với metric id.

## 1. Nguyên tắc

- **1 API** `GET /api/admin/reports/pipeline` trả toàn bộ dataset (không FE gọi nhiều endpoint).
- Metric name = **whitelist**; PUT config nhận metric lạ → 400 (không arbitrary config, không SQL từ client). SUPER_ADMIN được chỉnh metric và layout trong whitelist.
- Không Redis — cache in-process TTL 30–60s (key = filter hash + role scope) nếu cần.
- Mọi số liệu scope theo 04 §4 (SALES/MKT chỉ thấy phần của mình).

## 2. Filter params (áp dụng mọi metric)

```text
date_from, date_to (default: ngày đầu đến ngày cuối tháng hiện tại)
region, department, source, stage, assigned_user_id, province
```

## 3. Response keys (dataset registry)

| Key | Loại | Nội dung |
|---|---|---|
| `funnel` | array | `[{stage: LEAD, CSKH, TVBH, PROPOSAL, STATION, ON, count}]` — 6 mốc |
| `leads_by_stage` | array | count theo `journey.current_stage` |
| `leads_by_classification` | array | Tiềm năng/Quan tâm/Theo dõi thêm/Không chất lượng |
| `leads_by_source` | array | |
| `leads_by_province` | array | top N + còn lại |
| `leads_by_region` | array | |
| `leads_by_department` | array | theo `assigned_department` |
| `leads_by_owner` | array | theo `assigned_user_id` → tên |
| `proposals_by_status` | array | 8 status |
| `conversions` | object | `{lead_to_proposal, proposal_to_station, station_to_on}` (%) + absolute |
| `avg_duration_days` | object | `{lead_to_proposal, proposal_to_on}` |
| `over_time` | array | `[{date, leads, proposals, stations}]` theo day/month |
| `stale_pipeline` | array | journey quá hạn theo stage (config ngưỡng) |
| `unassigned_leads` | array | `assigned_user_id IS NULL` |
| `proposals_without_lead` | array | `journey_id IS NULL` (theo 00-câu 21) |
| `stations_without_proposal` | array | |
| `unlinked_entities` | object | `{proposals_without_lead, stations_without_proposal}` — nhóm riêng trong funnel |
| `sync_errors` | array | journey lỗi automation/sync |
| `meta` | object | `{generated_at, filters, scope, totals}` |

**Mọi key đều bắt buộc có trong response** (rỗng `[]` nếu không có data) — FE 9.3 không cần optional chaining kiểu mới.

## 4. Funnel semantics

```text
LEAD       = mọi journey có lead
CSKH       = stage ≥ CSKH (theo monotonic rule ở 05)
TVBH       = ...
PROPOSAL   = journey có ≥1 proposal
STATION    = journey có ≥1 station linked
ON         = stage = ON
```

Conversion % = step sau / step trước; division by zero → `null` (không `NaN`/`Infinity`).

## 5. Report config (9.2)

```json
{ "widgets": [ { "id": "funnel", "order": 1, "size": "large", "chartType": "bar", "title": "..." } ] }
```

- `id` ∈ registry §3 · `chartType` ∈ `bar|line|pie|table|kpi` · layout chỉ SUPER sửa.
- Tab 1 của trang = **để trống** (yêu cầu người dùng); tab 2 "Báo cáo chi tiết" render widgets.

## 6. Export

Chỉ export Excel, theo pattern `excelService` hiện tại; không làm PDF hoặc scheduled email trong phase này.

## 7. Test fixture (bước 9.1)

Tạo bộ data cố định (3-5 leads ở các stage, 2 proposals, 1 station) → số `funnel`/`conversions` tính tay trong SQL → assert bằng nhau. Ghi kết quả vào file 70 bước 9.1.

## 8. Version

| Version | Ngày | Thay đổi | SEALED |
|---|---|---|---|
| 0.2 | 2026-10-07 | áp dụng C0 decisions; draft | ⬜ tới C5 |
