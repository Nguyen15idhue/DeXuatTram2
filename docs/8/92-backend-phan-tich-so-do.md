# Kế hoạch triển khai Backend — Tái cấu trúc theo module

> Cập nhật: 2026-11-25
> Phạm vi: **chỉ backend** (`backend/src`), do một người phụ trách.
> Ngoài phạm vi: `shared/` (model, phân quyền, dynamic-engine), `core/`, frontend, hạ tầng Redis/Socket.io/Queue. Các phần này do người khác phụ trách; tài liệu này chỉ nêu điểm giao tiếp.
> Quyết định kiến trúc: **không thêm lớp repository**. Service gọi DB qua `utils/db.js` như hiện tại.
> Tham chiếu: `docs/8/90-kien-truc-tai-cau-truc-phan-tich.md`, `docs/8/91-danh-sach-cong-viec-chi-tiet.md`

---

## 1. Kiến trúc đích (phần backend của tôi)

Chuỗi xử lý theo sơ đồ đã duyệt:

```
app.js → routes → middleware → controller → service → database (utils/db.js)
```

Cấu trúc module:

```
backend/src/modules/<module>/
├── <module>.routes.js       # URL + middleware phân quyền, không logic
├── <module>.controller.js   # đọc req, gọi service, trả response; không query DB
├── <module>.service.js      # nghiệp vụ + query DB qua utils/db.js
└── index.js                 # Facade: module khác chỉ import từ đây
```

Quy tắc:
- Controller **không** gọi `pool`/`db` trực tiếp. Mọi query nằm trong service.
- Module chỉ import module khác qua `index.js`.
- Worker/cron import service qua `index.js` của module.
- Giữ nguyên `utils/db.js`, `middlewares/auth.js` và các hàm phân quyền hiện có. Khi người phụ trách `shared/` và `core/` hoàn thành, chỉ đổi đường dẫn import.

## 2. Ranh giới với phần người khác

| Hạng mục | Người phụ trách | Tôi làm gì |
|---|---|---|
| `core/` (db, middleware, cron, ttlCache) | Người khác | Import từ đường dẫn hiện tại; đổi khi họ xong |
| `shared/models` (enum trạng thái, role, trường) | Người khác | Dùng enum hiện có trong `proposalLifecycle.js` cho đến khi có `shared/models` |
| `shared/permissions` (ma trận quyền) | Người khác | Giữ hàm phân quyền hiện có; không đổi quy tắc |
| `shared/dynamic-engine` (custom_data, validate) | Người khác | Không đụng; controller/service gọi hàm hiện có |
| Trải phẳng `custom_data` | Chưa phân công | Không làm trong đợt này |
| Frontend, Knex, Zod, Redis, Socket.io | Người khác / chưa chốt | Không làm |

Điều kiện để tôi bắt đầu từng module: test quyền baseline đã có (xem B0).

---

## 3. Hiện trạng cần xử lý (đã kiểm tra)

- 60 route, 46 controller, 126 service phẳng; 13 worker.
- Controller gọi DB trực tiếp (phải chuyển xuống service):
  - `controllers/adminLeadController.js` (dòng ~15)
  - `controllers/crmConfigController.js` (`crm_outbox`, `crm_webhook_logs`, nhiều query)
  - `controllers/adminUserController.js` (dòng ~378, query `users`)
  - `controllers/fileController.js` (import `pool`)
- Worker import service trực tiếp (ví dụ `workers/proposalLifecycleWorker.js`); khi di chuyển phải cập nhật.
- Xem thử BCĐX từ mẫu (`proposalReport`): `GET /admin/proposal-reports/:id/generation-options`, `POST .../generation-preview` — giữ nguyên hành vi (không lưu, không đổi trạng thái, token `input` không ghi vào đề xuất, token `formula` tính theo thứ tự phụ thuộc, lỗi vòng/chia 0 trả 400).
- Trình ký: người đề xuất lấy `nguoi_de_xuat`, fallback tên tài khoản `user_id`; quyền sở hữu vẫn theo `user_id`.

---

## 4. Thứ tự module

| Thứ tự | Module | Route/Controller/Service hiện có (ví dụ) | Lý do thứ tự |
|---|---|---|---|
| 1 | `warehouse` | `warehouse.js`, `warehouseController`, `supplierService`, `warehouseService`, `shippingCarriers`, `suppliers` | Ít phụ thuộc, có test sẵn (`test-warehouse-full.js`, `warehouseStock.test.js`) |
| 2 | `crm-leads` | `adminLeads.js`, `adminLeadController`, `leadService`, `leadAssignmentService`, `leadConsultationService`, `leadProposalService`, `journey*` | Có controller gọi DB trực tiếp cần sửa |
| 3 | `ai-assistant` | `assistant.js`, `adminAssistant.js`, `services/assistant/*`, `knowledgeService`, `codeKnowledgeService`, `assistantConfigService` | Ít liên kết nghiệp vụ; có test `test-assistant-*.js` |
| 4 | `integrations` | `crmConfig`, `crmPartner`, `proposalSheetSync`, `onStationSheetSync`, `services/crm*`, `integrations/crm/`, workers CRM/sheet | Worker phụ thuộc nhiều, làm sau khi có mẫu |
| 5 | `iam` | `auth.js`, `adminUsers.js`, `authController`, `adminUserController`, `authService`, `adminUserService` | Liên quan phân quyền; làm khi `shared/permissions` đã ổn |
| 6 | `stations` | `stations.js`, `mapUtils.js`, `tiles.js`, `geocode.js`, `stationService`, `mapService`, `geocodeService`, `proximityService` | Dùng chung map |
| 7 | `proposals` | `proposals.js`, `myProposals.js`, `adminProposals.js`, `proposalLifecycle`, `proposalGrading/Review/Design/Request/Activity` | Lõi nghiệp vụ, rủi ro cao |
| 8 | `proposal-reports` | `proposalReports.js`, `proposalReportController`, `proposalReportDocumentController`, `proposalReportService`, `documentService` | Có chức năng xem thử BCĐX mới; test trước khi tách |
| 9 | `proposal-signatures` | `proposalSignatures.js`, `signatures.js`, `proposalSignatureService`, `signedDocumentService`, `signatureSnapshotService` | Phụ thuộc module 8 |
| 10 | `proposal-approvals` | `proposalApprovals.js`, `proposalApprovalService` | Phụ thuộc module 8 |
| 11 | `on-station` | `chargingStations.js`, `chargingStationCare/Deployments/Shipping`, `chargingFinance`, `chargingStationService` và các service liên quan | Phụ thuộc proposals và warehouse |

Mỗi module chỉ được tách khi module trước đã xanh.

---

## 5. Các bước triển khai

### B0 — Chuẩn bị (1 ngày)
- [ ] B0.1 Backup MySQL: `mysqldump station_management > backups/pre-backend-refactor-YYYYMMDD.sql`
- [ ] B0.2 Tạo branch `refactor/backend-modules` từ `main`
- [ ] B0.3 Baseline test backend: chạy `node --test backend\tests\*.test.js` và các script `backend\test-*.js`; ghi kết quả vào `docs/8/baseline-backend.md`
- [ ] B0.4 Chụp ma trận quyền hiện tại: danh sách route × middleware (từ `routes/*.js`) → `docs/8/route-auth-matrix.md` làm mốc so sánh
- [ ] B0.5 Liệt kê `require(` giữa route/controller/service/worker → `docs/8/dep-backend.md`
- [ ] B0.6 Liệt kê controller gọi `pool`/`db` trực tiếp → danh sách việc B2
- [ ] B0.7 Xác nhận với người phụ trách `shared/` và `core/`: đường dẫn sẽ đổi khi nào, có giữ shim không

### B1 — Hạ tầng module (0.5 ngày, không đổi logic)
- [ ] B1.1 Tạo `backend/src/modules/` và thư mục rỗng theo thứ tự §4
- [ ] B1.2 Viết mẫu `_template/` gồm 4 file (routes, controller, service, index.js) có chú thích tối thiểu, dùng để sao chép
- [ ] B1.3 Mount routes của module qua `app.js` bằng một dòng cho mỗi module

### B2 — Module 1–5: warehouse → crm-leads → ai-assistant → integrations → iam
Với mỗi module, lặp lại các bước:
- [ ] Di chuyển logic controller → `<module>.controller.js` (không đổi chữ ký HTTP)
- [ ] Di chuyển service và query liên quan → `<module>.service.js`
- [ ] Chuyển query từ controller sang service (nếu có)
- [ ] Viết `routes.js` giữ nguyên middleware từng route (copy từ B0.4)
- [ ] Viết `index.js` export các hàm worker/module khác cần
- [ ] Để lại shim ở đường dẫn cũ (`module.exports = require('../modules/<m>')`) để worker chưa sửa vẫn chạy
- [ ] Cập nhật import của worker sang `index.js`
- [ ] Test: API của module, ma trận quyền (so với B0.4), worker chạy 1 chu kỳ
- [ ] PR riêng cho module, review trước khi merge

### B3 — Module 6–11: stations → proposals → proposal-reports → proposal-signatures → proposal-approvals → on-station
Bổ sung cho mỗi module:
- [ ] Giữ nguyên `proposalLifecycle.js` (ma trận chuyển trạng thái); chỉ đổi vị trí file
- [ ] Test chuyển trạng thái: hợp lệ, không hợp lệ (400 + log denied), `CANCELLED` từ mọi trạng thái chưa kết thúc
- [ ] `proposal-reports`: test `generation-options`, `generation-preview` (token input/formula/chưa cấu hình/vòng tham chiếu)
- [ ] `proposal-signatures`: so sánh file DOCX/PDF đầu ra trước và sau trên mẫu cố định
- [ ] `proposals`: test `PUT /admin/proposals/:id` không cho đổi `status`; `myProposal` chặn sửa theo `OWNER_EDITABLE_STATUSES`
- [ ] `on-station`: test luật giao trụ (`fulfillment`, `shipping`) và hủy/khôi phục ON trạm

### B4 — Dọn dẹp và tài liệu (1 ngày)
- [ ] B4.1 Xóa shim khi người phụ trách `shared/` đã chuyển xong đường dẫn và không còn import cũ (grep xác nhận)
- [ ] B4.2 Xóa thư mục rỗng cũ (`controllers/`, `services/` phần đã chuyển)
- [ ] B4.3 Cập nhật Swagger JSDoc trong `routes` mới
- [ ] B4.4 Cập nhật `AGENTS.md` mục 6 (Backend structure) và mục 2 (Architecture)
- [ ] B4.5 Chạy lại toàn bộ test backend, tag `backend-v2-structure`

---

## 6. Rủi ro và cách kiểm soát

| Rủi ro | Mức | Kiểm soát |
|---|---|---|
| Quyền bị đổi khi chuyển route | Rất cao | So sánh `route-auth-matrix.md` trước/sau mỗi module; PR không merge nếu khác |
| Worker/cron lỗi sau khi đổi đường dẫn | Cao | Shim ở đường dẫn cũ; test 1 chu kỳ worker |
| Ma trận trạng thái đề xuất sai | Cao | Không đổi nội dung `proposalLifecycle.js`; test chuyển trạng thái |
| Output DOCX/PDF/Excel đổi | Cao | So sánh file trên mẫu cố định |
| Chức năng xem thử BCĐX mất | Trung bình | Test trước khi tách `proposal-reports` |
| Shared/core đổi đường dẫn đồng thời | Trung bình | Thống nhất lịch với người phụ trách; chỉ đổi import, không đổi logic |

---

## 7. Điều kiện hoàn thành (DoD backend cho từng module)

- [ ] Backend start không lỗi; `/api-docs` load
- [ ] Ma trận quyền route × role không đổi so với B0.4
- [ ] Test API của module pass
- [ ] Controller của module không có `require('../utils/db')` hoặc `pool.query`
- [ ] Worker liên quan chạy một chu kỳ không lỗi
- [ ] Không có import vòng giữa module
- [ ] PR riêng, có mô tả module đã tách và danh sách shim còn lại

## 8. Ước lượng (phần backend của tôi)

| Giai đoạn | Ngày-dev |
|---|---|
| B0 Chuẩn bị | 1 |
| B1 Hạ tầng module | 0.5 |
| B2 Module 1–5 | 6–8 |
| B3 Module 6–11 | 8–10 |
| B4 Dọn dẹp | 1 |
| **Tổng** | **16–20.5** |

Ước lượng không gồm thời gian chờ `shared/` và `core/`. Nếu hai phần này chưa xong trước B2, cần thêm 1–2 ngày để xử lý import.
