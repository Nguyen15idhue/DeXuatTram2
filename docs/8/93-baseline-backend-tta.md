# Baseline Backend trên nhánh `tta` (trước khi tinh gọn)

> Ngày: 2026-11-25
> Nhánh: `tta` (nhánh đang chạy, khớp DB đang vận hành; có ON trạm, kho, BCĐX)
> Mục đích: mốc so sánh để chứng minh mỗi bước tinh gọn không làm đổi hành vi.
> Tham chiếu: `docs/8/92-backend-phan-tich-so-do.md`

---

## 1. Kết quả test

Lệnh chạy: `cd backend && node --test tests/`

| Chỉ số | Kết quả |
|---|---|
| Tổng test | 421 |
| Pass | 391 |
| Fail | 6 |
| File test | 66 |

File test fail (đã xác nhận bằng stack trace):

| File | Ghi chú |
|---|---|
| `tests/proposalReportBackground.test.js` | assertion trong `proposalReportBackground` |
| `tests/chargingStationWork.test.js` | assertion trong `chargingStationWork` |
| `tests/cmsReports.test.js` | assertion trong `cmsReports` |
| `tests/evReportExcel.test.js` | lỗi `Module._load` (kiểm tra import) |
| `tests/proposalSignatureCompletion.test.js` | `actual 3, expected 2` tại dòng 129 |

Các test fail này có sẵn trước khi tinh gọn. Không được coi là lỗi do bước refactor, và không được "sửa cho xanh" trong đợt này trừ khi có chủ đích.

Lưu ý môi trường:
- `node_modules` phải cài từ `backend/package.json` của **đúng nhánh** (`tta` có thêm `pdf-lib`, `docxtemplater`, `pizzip`, `@pdf-lib/fontkit`). Cài từ `main` sẽ làm 16 test lỗi `Cannot find module 'pdf-lib'`.
- Một số test cần MySQL. Docker Desktop đang chạy một phần (cổng 3306/3000 được chuyển tiếp), nhưng `DB_HOST=mysql` trong `.env` chỉ resolve trong mạng Docker.

## 2. Script `test-*.js` ở gốc backend

Chạy riêng từng file, ghi exit code:

| Script | Exit | Ghi chú |
|---|---|---|
| test-assistant-attachments.js | 0 | |
| test-assistant-guard.js | 0 | |
| test-assistant-router.js | 0 | |
| test-merge-fix.mjs | 0 | |
| test-assistant-codeknowledge.js | 2 | script cần môi trường/dữ liệu |
| test-assistant-config.js | 2 | |
| test-assistant-models.js | 2 | |
| test-file-rename.js | 2 | `Unknown column` trên DB chưa khớp schema |
| test-info-completed.js | 2 | lỗi FK khi tạo đề xuất |
| test-assistant-datatools.js | 1 | 27 test, 2 fail |
| test-supplement-overdue.js | 1 | 5 test, 3 fail |

Các script này là kiểm thử thủ công/tích hợp, chạy trên DB thật. Chúng không thuộc `node --test`.

## 3. Điểm gọi DB trực tiếp từ controller (phải chuyển xuống service)

| Controller | Số chỗ query | Ghi chú |
|---|---|---|
| `fileController.js` | 20 | nhiều query kiểm quyền file; nặng nhất |
| `crmConfigController.js` | 11 | `crm_outbox`, `crm_webhook_logs` |
| `proposalReportDocumentController.js` | 3 | |
| `adminUserController.js` | 2 | query `password` (kiểm tra mật khẩu) |
| `stationController.js` | 2 | |
| `adminLeadController.js` | 1 | query danh sách user |

Tổng: 6 controller, 39 chỗ. Đây là danh sách việc của bước B2 (chuyển query xuống service).

## 4. Quy mô hiện tại

| Thành phần | Số file |
|---|---|
| routes | 60 |
| controllers | 46 |
| services (kể cả `assistant/`) | 136 |
| workers | 13 |
| middlewares | 4 |
| utils | 8 |

## 5. Quy trình so sánh sau mỗi bước

1. Chạy lại `node --test tests/`. Số pass không được giảm; danh sách 6 fail không được tăng.
2. Chạy lại các script `test-*.js` ở mục 2; exit code không được đổi.
3. So sánh ma trận quyền route × middleware (sẽ lập ở B0.4) trước và sau.
4. Kiểm tra backend khởi động và `/api-docs` load.
