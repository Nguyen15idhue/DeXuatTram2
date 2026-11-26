# Tiến độ tinh gọn backend (nhánh tta)

> Tham chiếu: `docs/8/92-backend-phan-tich-so-do.md`, mốc `docs/8/93-baseline-backend-tta.md`, ma trận route `docs/8/94-route-auth-matrix-tta.md`

## Kết quả hiện tại

| Chỉ số | Baseline | Hiện tại |
|---|---|---|
| Test pass / fail (tổng 421) | 391 / 6 | 391 / 6 (cùng 6 file fail cũ) |
| Controller còn gọi DB trực tiếp | 6 file, 39 query | 0 |
| Service còn import controller | 3 chỗ | 0 |
| Route | 430 | 430 (không đổi file route) |
| App khởi động | OK | OK |
| `/api-docs` | OK | OK |

## Đã làm

### Bước 1: Chuyển query ra khỏi controller

1. **crmConfigController** → `services/crm/crmAdminLogService.js` (11 query, SQL giữ nguyên).
2. **adminLeadController** → `leadAccessService.listActiveUsers()`.
3. **stationController** → `stationService.getLatestLinkedProposal()`.
4. **proposalReportDocumentController** → `proposalReportDocumentService.getProposalOwnerId()`, `getDocumentCurrentFlag()`.
5. **adminUserController** → `adminUserService.getPasswordRow()`.
6. **fileController** → chuyển logic kiểm quyền (`canAccessFile`, `containsFileId`, `parseUserCustomData`, `verifyMagic`) sang `services/fileAccessService.js`, cộng 2 query xóa file (`findReportLinks`, `findOnLinks`).

### Bước 2: Gom module theo subfolder (không thêm repository)

Gom các file vào subfolder theo domain, giữ nguyên cấu trúc thư mục gốc (`routes/`, `controllers/`, `services/`, `workers/`, `middlewares/`, `integrations/`):

| Thư mục | Subfolder | Số file |
|---|---|---|
| `routes/` | `admin/`, `chargingStation/`, `crm/`, `proposal/` | 25 file |
| `controllers/` | `admin/`, `chargingStation/`, `crm/`, `proposal/` | 23 file |
| `services/` | `admin/`, `assistant/`, `crm/` | 15 file |
| `workers/` | `crm/` | 3 file |
| `middlewares/` | `crm/` | 1 file |
| `integrations/` | `crm/` | 2 file |

- Cập nhật toàn bộ `require` trong code và test (66 chỗ).
- App khởi động OK, 421 test / 391 pass / 6 fail (baseline).

## Lỗi đã bắt được trong quá trình làm

- Khi chuyển `verifyMagic`, quên `require('fs')`. Hàm nằm trong `try/catch` nên lỗi bị nuốt, trả `false` âm thầm; test `proposalChairmanFiles` đã bắt được. Đã sửa.
- Thêm `tests/fileControllerUpload.test.js` (1 test) phủ luồng upload mà bộ test cũ chưa phủ.

## Chưa làm

- Gom các module còn lại: `on-station`, `warehouse`, `stations`, `iam`, `help`, `reports`, `ev-reports`, `charging-station`.
- Route/controller chưa gom theo module (bước B2–B3 trong doc 92).
- Các script `test-*.js` ở gốc backend chưa chạy lại (cần DB thật).

## Quy tắc mỗi bước

1. Chuyển SQL nguyên văn sang service, không đổi điều kiện.
2. Controller chỉ parse request và map kết quả sang response.
3. `node --test tests/`: pass không được giảm, 6 fail cũ không được tăng.
4. Chuẩn hóa CRLF cho file sửa.
