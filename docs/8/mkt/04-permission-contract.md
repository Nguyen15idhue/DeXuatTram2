# 04. Permission Contract — MKT/Leads & Báo cáo Pipeline

> **Người viết:** ORCH · **Seal tại:** C0 · **Trạng thái:** `DRAFT`
> Đây là **A3 (permission model) + A4 (lead scope)** — 2 mục ORCH bắt buộc theo đánh giá. Mọi middleware (2.2) và scope query (2.3) code đúng bảng này.

## 1. Role additions

| Role | Trạng thái | Vai trò dự án |
|---|---|---|
| `SUPER_ADMIN` | có sẵn | everything + report config |
| `ADMIN` | có sẵn | everything leads/reports, trừ report config + cấu hình SUPER_ONLY |
| `MKT` | **MỚI** | CRUD Lead do mình tạo + assign Lead của mình + report view; **không** tạo Proposal từ Lead và không vào Users/Stations/Proposals admin/config |
| `SALES` | có sẵn | lead scope được giao (xem dưới) + report scope |
| `CTV` | có sẵn | **không** truy cập `/admin/leads` |
| `NPP` | có sẵn | như CTV — không lead access |

> ⚠️ MKT **không** tham gia cây `users.parent_id`; **không** mở rộng `requireUserManager` — thêm middleware riêng: `requireLeadManager`, `requireReportViewer`, `requireReportConfigurator`.

## 2. Lead permission matrix (bước 2.2/2.3)

| Thao tác | SUPER | ADMIN | MKT | SALES | CTV | NPP |
|---|---|---|---|---|---|---|
| List leads | all | all | `created_by = self` | GĐTT: department đã phân; GĐKV: assigned trực tiếp | ❌ 403 | ❌ 403 |
| View lead detail | all | all | Lead mình tạo | theo scope trên | ❌ | ❌ |
| Create lead | ✔ | ✔ | ✔ | theo 00-câu 1 | ❌ | ❌ |
| Edit lead | all | all | Lead mình tạo | scope, không mở Lead chưa phân | ❌ | ❌ |
| Delete/bulk | all | all | soft delete Lead mình tạo | ❌ | ❌ | ❌ |
| Hard delete | ✔ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Assign | all | all | Lead mình tạo | ❌ | ❌ | ❌ |
| Tạo Proposal từ Lead | chỉ GĐKV | ❌ từ Lead | ❌ | chỉ GĐKV | ❌ | ❌ |
| Export | scope | all | Lead mình tạo | scope | ❌ | ❌ |
| Import | ✔ | ✔ | Lead tạo bởi MKT | theo scope được cấp | ❌ | ❌ |
| Report view | ✔ | ✔ | ✔ | scope (§4) | ❌ | ❌ |
| Report config | ✔ | ❌ 403 | ❌ | ❌ | ❌ | ❌ |
| Users/Stations/Proposals admin hiện tại | nguyên trạng | nguyên trạng | ❌ (mặc định) | nguyên trạng | ❌ | ❌ |

## 3. SALES lead scope (§3 — "cực dễ sai", fixture test bước 2.3)

```text
GĐTT sees:
  ✓ leads đã phân vào assigned_department = department của GĐTT
GĐKV sees:
  ✓ leads WHERE assigned_user_id = GĐKV hiện tại
SALES khác:
  ✗ leads chưa phân phòng ban
  ✗ leads phân cho phòng ban/người khác
MKT sees:
  ✓ leads WHERE created_by = MKT hiện tại
```

**Implementation notes:**
- Scope = WHERE clause trong `leadService`, **không** filter FE.
- `GET /admin/leads` trả ngoài scope → 403 (sai chủ 403, không 404).
- Export dùng đúng WHERE của list (không export "all" khi list "scope").

## 4. Report scope

| Role | Số liệu |
|---|---|
| SUPER/ADMIN | toàn bộ |
| MKT | Lead do mình tạo |
| GĐTT | Lead đã phân vào phòng ban của mình + proposal/station tương ứng |
| GĐKV | Lead giao trực tiếp cho mình + proposal/station tương ứng |
| CTV/NPP | 403 |

## 5. Frontend rules

- `AuthContext.canAccessPanel` + `RoleRoute`: thêm capability `leads`, `reports`.
- Sidebar: MKT thấy `Quản lý Leads`, `Báo cáo`; không thấy mục `SUPER_ONLY`.
- Nút Sửa/Xóa/Assign ẩn theo matrix **và** backend vẫn chặn (FE ≠ security).

## 6. Test matrix (dùng ở C1 + 10.2)

Mọi dòng trong §2 phải có ít nhất 1 test API thật (token role đó) trước khi C1 pass.

## 7. Version

| Version | Ngày | Thay đổi |
|---|---|---|
| 0.2 | 2026-10-07 | áp dụng C0 decisions; vẫn DRAFT |
