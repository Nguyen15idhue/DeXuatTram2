# Review toàn mã nguồn — README

**Ngày:** 10/09/2026
**Phạm vi:** toàn bộ `backend/src`, `frontend/src`, `database/*.sql`, `docker/`
**Nguyên tắc (theo yêu cầu):** chỉ liệt kê chức năng **đã có trong code nhưng thiếu/sai/hỏng**.
KHÔNG liệt kê tính năng tương lai, KHÔNG wishlist.

## Phương pháp
- 4 luồng review song song toàn codebase (backend API, frontend UI, database/dynamic-system, auth/bảo mật), chỉ đọc code.
- Các mục Critical/High đã **đọc code trực tiếp verify lại** (ghi `đã verify`).
- Mức độ:
  - **P0 Critical** — lộ dữ liệu, mất dữ liệu, sập chức năng chính, chiếm quyền. Làm trước.
  - **P1 High** — chức năng sai, phân quyền sai, hỏng trường hợp thường gặp.
  - **P2 Medium/Low** — lỗi nhỏ, dead code, lệch docs, cosmetic.

## Cấu trúc thư mục này
| File | Nội dung |
|------|----------|
| `01-da-lam-duoc.md` | Những gì hệ thống đã làm được (đang chạy đúng) |
| `02-chua-lam-duoc-P0-critical.md` | 9 lỗi P0 + cách khắc phục |
| `03-chua-lam-duoc-P1-high.md` | Lỗi P1 theo nhóm + cách khắc phục |
| `04-chua-lam-duoc-P2-medium-low.md` | Lỗi P2/P3, dead code, lệch docs |

## Lưu ý — cố tình làm khác rule (KHÔNG phải lỗi)
- `/admin/audit-log` cho SALES xem log của mình: **yêu cầu trực tiếp của user** (Phần 1, docs/5/28), dù AGENTS.md rule 4 ghi trang giám sát chỉ SUPER_ADMIN.
- `tracking_code`/`ma_de_xuat` recompute khi sửa: **yêu cầu trực tiếp của user**.
- `tdt_tong_cong` (`formula_config NULL`): user yêu cầu **bỏ qua**.

## Thống kê
- P0: 9 mục · P1: ~18 mục · P2: ~20 mục · Dead code/lệch docs: ~12 mục
