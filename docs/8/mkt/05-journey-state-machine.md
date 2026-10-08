# 05. Journey State Machine Contract

> **Người viết:** ORCH · **Draft:** C0 · **SEALED tại:** C4 (sau khi Phase 5 review xong) · **Trạng thái:** `DRAFT`
> Đây là **A5** — logic nghiệp vụ khó, ORCH tự làm (bước 5.2/5.3). Worker chỉ đọc để render UI (8.1/8.2) và ghi event CRUD lead (4.3).

## 1. Lead stages (journey.current_stage)

```text
NEW
 → ASSIGNED          (khi có assignment)
 → CSKH              (khi có lần liên hệ CSKH đầu tiên)
 → QUALIFIED         (classification = Tiềm năng hoặc Quan tâm, có thể bỏ qua nếu routing ngay)
 → TVBH              (khi vào vòng tư vấn bán hàng)
 → PROPOSAL          (khi journey có ≥1 Proposal — bước 5.1/5.2)
 → STATION           (khi Proposal tạo Station — bước 5.3)
 → ON                (Station đạt ON theo 00-câu 13)
```

Terminal/nhánh:

```text
CSKH   → UNQUALIFIED   (classification = Không chất lượng)
TVBH   → LOST          (sales_outcome = FAILED và không còn hướng khác)
```

**Stage là đồng bộ (mirror) trên `leads.stage` — khi lệch, `business_journeys.current_stage` thắng** (nguồn sự thật).

## 2. Quy tắc đa Proposal (QUAN TRỌNG — test bắt buộc)

```text
Lead A
 ├─ Proposal A1 → REJECTED
 └─ Proposal A2 → APPROVED        ⇒ stage = PROPOSAL (tiếp tục), KHÔNG LOST

Chỉ LOST khi: sales_outcome = FAILED (nhánh TVBH) hoặc không còn Proposal
nào hiệu lực + không còn khả năng tạo mới (theo 00-câu 5).
```

Stage tính = **mức cao nhất còn hiệu lực** của tập Proposal thuộc journey (max over proposals, monotonic tăng, trừ khi 00 cho phép hạ).

## 3. Stage transitions khi Proposal/Station đổi status

| Sự kiện | Journey stage | Ghi log |
|---|---|---|
| Proposal created by GĐKV (5.1) | ≥ PROPOSAL | `proposal_created` |
| PENDING→REVIEWING | giữ | `proposal_status` (actor) |
| → APPROVED | giữ PROPOSAL | `proposal_status` |
| → REJECTED / CANCELLED | giữ nếu còn Proposal hiệu lực khác; nếu là Proposal duy nhất → theo nhánh | `proposal_status` + reason |
| → CONTRACT_SIGNED | giữ | `proposal_status` |
| convert-to-station / auto-create station (5.3) | ≥ STATION | `station_created` |
| Station status → `ACTIVE` (= ON theo 00-câu 13) | = ON | `station_on` |
| Webhook 1Office đổi status | y như trên, actor=`1Office` | `proposal_status` source=`webhook` |

**Transition có reason bắt buộc** (reject/cancel/resubmit) → log `reason` phải có.

## 4. Event registry (cho `journey_activity_logs.action` + FE 8.1)

| Action | Entity | Do ai ghi |
|---|---|---|
| `lead_created`, `lead_updated`, `lead_deleted` | lead | W-A 4.3 |
| `assigned`, `unassigned` | assignment | W-A 4.2/4.3 |
| `classification_changed`, `stage_changed` | lead/journey | 4.3 / journeyService |
| `proposal_created`, `proposal_status` | proposal | ORCH 5.1/5.2 |
| `station_created`, `station_status`, `station_on` | station | ORCH 5.3 |
| `automation`, `import`, `sync_ref` | misc | W-A 5.4/6.2 |

FE 8.1 render mọi action trong registry; action lạ → render generic (không crash).

## 5. Hook points (đường duy nhất)

```text
proposalLifecycle.transition()   → sau transition thành công  → journeyActivityService + stage recompute
stationService.updateStatus()    → sau commit                  → journeyActivityService + stage recompute
leadService create/update        → trong transaction           → journeyActivityService
```

Log KHÔNG được ghi khi business transaction fail (không log mồ côi).

## 6. Backward compatibility

- Proposal `journey_id IS NULL` → **bỏ qua mọi hook journey** (không lỗi, không log).
- Station không qua Proposal → không journey.
- `PUT /admin/proposals/:id` vẫn cấm đổi status (không đổi).

## 7. Version

| Version | Ngày | Thay đổi | SEALED |
|---|---|---|---|
| 0.2 | 2026-10-07 | áp dụng C0 decisions; draft | ⬜ tới C4 |
