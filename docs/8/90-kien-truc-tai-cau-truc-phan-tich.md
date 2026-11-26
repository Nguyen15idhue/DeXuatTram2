# Phân tích & So sánh Kiến trúc: Hiện trạng vs Đề xuất Tái cấu trúc

> **Dự án**: TMT-EGREEN (DeXuatTram2)
> **Ngày phân tích**: 2026-11-23
> **Mục đích**: Tài liệu phân tích kỹ lưỡng để chuẩn bị phân công & triển khai tái cấu trúc trong vài ngày tới. Bao gồm: hiện trạng, kiến trúc đề xuất, so sánh, khoảng cách (gap), rủi ro, lộ trình và ước lượng công sức.

---

## 1. Tóm tắt điều hành (Executive Summary)

Hệ thống TMT-EGREEN hiện đang chạy ổn định trên kiến trúc **Technical Layering** (gom theo loại file: `routes/`, `controllers/`, `services/`, `components/`, `utils/`). Quy mô: ~271 file backend, ~300 file frontend, 257 migration SQL, 60 route backend, 46 controller, 126 service, ~53 page frontend.

Kiến trúc đề xuất (từ nghiên cứu Gemini + Feature-Sliced Design + Modular Monolith) chuyển sang **Module hóa theo nghiệp vụ** (Feature-Driven). Mục tiêu: tách biệt các phân hệ (proposals, on-station, warehouse, crm-leads, ai-assistant) để sửa một phần không làm hỏng phần khác, dễ mở rộng và bảo trì.

**Kết luận chính**:
- ✅ **Nên tái cấu trúc**, nhưng theo lộ trình **cuốn chiếu 3 bước**, không đập đi xây lại cùng lúc.
- ⚠️ **Không nên thêm ORM** (Prisma/Sequelize). Giữ `mysql2` qua `utils/db.js`. Lý do: không dùng TypeScript, truy vấn đệ quy cây nhân sự 2 tầng và báo cáo phức tạp.
- **Quyết định cập nhật (2026-11-25)**: không thêm lớp repository. Service gọi DB trực tiếp. Phạm vi backend cá nhân xem `docs/8/92-backend-phan-tich-so-do.md`; `shared/` và `core/` do người khác phụ trách.
- ✅ **Nên thêm TanStack Query + Axios** ở frontend (giảm 50–70% request, cache danh mục dùng chung).
- ✅ **Nên thêm WebSocket (Socket.io) + Redis** khi nâng cấp VPS 16GB (thông báo realtime phê duyệt, đồng bộ bản đồ).
- ⚠️ **Rủi ro lớn nhất**: phá vỡ 257 migration SQL và ~100 E2E test nếu không giữ backward-compat. Cần giữ nguyên DB schema, chỉ tái cấu trúc code.

---

## 2. Hiện trạng kiến trúc (As-Is)

### 2.1. Backend (`backend/src/`)

```
backend/src/
├── config/          (swagger.js)
├── constants/
├── controllers/     (46 file, phẳng)
├── integrations/    (crm/)
├── middlewares/     (auth.js, rateLimits.js, validators.js, crmWebhookAuth.js)
├── routes/          (60 file, phẳng)
├── services/        (126 file phẳng + assistant/ subdir)
├── utils/           (cronMatcher.js, db.js, dynamicFilter.js, ...)
└── workers/         (13 file)
```

**Đặc điểm**:
- Router gọi thẳng Controller (không có lớp Service trung gian rõ ràng ở một số module; một số controller gọi service trực tiếp).
- Service gọi Repository/DB trực tiếp qua `utils/db.js` (mysql2 pool) — không có lớp Repository riêng.
- Logic nghiệp vụ (State Machine 22 trạng thái, công thức tài chính, phân quyền đệ quy) rải rác trong service + controller + middleware.
- `custom_data` JSON được parse thủ công ở nhiều nơi (dynamicUtils, validators, excelService).
- Giao tiếp liên module: gọi hàm trực tiếp (ví dụ `proposals` gọi `on-station` tạo bản ghi) → phụ thuộc cứng.

**Vấn đề chính**:
1. **Coupling cao**: sửa `proposalService` dễ làm hỏng `onStationService` vì gọi hàm chéo.
2. **File phình to**: `services/` có 126 file phẳng, khó tìm kiếm.
3. **Không có Facade**: bên ngoài chọc thẳng vào bất kỳ service nào.
4. **Validation trùng lặp**: `dynamicUtils.validateField` vs `validators.validateDynamicFields` (P2 trong docs/7).
5. **Không có Event Bus**: không thể hook thêm hành động (notify, sync Sheet) mà không sửa code gọi.

### 2.2. Frontend (`frontend/src/`)

```
frontend/src/
├── components/      (admin/, common/, dynamic/, help/, layout/, map/, report/, ui/)
├── contexts/        (AuthContext, ProposalStatusContext)
├── help/            (guideData*.js)
├── hooks/           (13 file phẳng)
├── layouts/         (❌ không tồn tại — layout nằm trong components/layout/)
├── pages/           (✅ đã URL-mirrored: admin/proposals/danh-gia-layout/[id]/...)
├── services/        (api.js, helpApi.js — phẳng)
└── utils/           (50+ file phẳng, không có subdir)
```

**Đặc điểm**:
- `pages/` đã được tái cấu trúc theo URL-mirrored (khá tốt).
- `components/` vẫn gom theo loại (admin/, common/, dynamic/, map/, report/, ui/) — chứa component dùng chung lẫn component chỉ dùng cho 1 page.
- `utils/` phẳng 50+ file, không phân nhóm theo domain.
- `services/` chỉ có `api.js` (fetch thuần) + `helpApi.js` — chưa có Axios instance riêng, chưa có TanStack Query.
- `hooks/` phẳng 13 file.
- `contexts/` chỉ 2 context (Auth, ProposalStatus) — không có QueryClientProvider.

**Vấn đề chính**:
1. **Coupling UI**: `components/admin/` chứa lẫn component của Leads, Proposals, Stations, Users → sửa 1 component dễ ảnh hưởng page khác.
2. **Code chết**: không rõ component nào chỉ dùng cho 1 page.
3. **Fetch + useEffect thủ công**: race condition, memory leak, không có cache, request trùng lặp.
4. **Không có Colocation**: component phụ trợ của một Page nằm ở `components/admin/` thay vì cạnh Page đó.

### 2.3. Database

- MySQL 8, 257 migration SQL, schema tracking qua `schema_migrations`.
- Nhiều bảng có cột `custom_data` JSON (form động, field động).
- 4 thực thể chính: `station_proposals`, `stations`, `charging_stations`, `leads` + `business_journeys`.
- State Machine 22 trạng thái lưu trong ENUM + `proposalLifecycle.js`.

### 2.4. Dependencies hiện tại

| Layer | Đang dùng | Chưa có (đề xuất) |
|-------|-----------|-------------------|
| Backend DB | mysql2 ^3.6.0 | knex (Query Builder) |
| Backend validation | (thủ công) | joi / zod |
| Backend realtime | — | socket.io, ioredis |
| Backend queue | — | bull / agenda (hoặc Redis Queue) |
| Frontend HTTP | fetch thuần (api.js) | axios |
| Frontend server-state | useEffect + useState | @tanstack/react-query |
| Frontend table | (thủ công) | @tanstack/react-table |
| Frontend form | (thủ công) | react-hook-form (tùy chọn) |

---

## 3. Kiến trúc đề xuất (To-Be)

### 3.1. Backend — Modular Monolith

```
backend/src/
├── core/          (database, middlewares, events, utils)
├── shared/        (dynamic-engine, document-generator, excel-engine, storage)
├── modules/       (iam, proposals, stations, on-station, warehouse, crm-leads, ai-assistant, integrations)
├── jobs/          (cronjobs)
└── app.js
```

Mỗi module có 5 file: `routes`, `controller`, `service`, `repository`, `index.js` (Facade).

### 3.2. Frontend — Feature-Sliced Design + Colocation

```
frontend/src/
├── app/           (router, providers)
├── pages/         (URL-mirrored, đã có)
├── features/      (proposal-workflow, map-explorer, dynamic-builder, ...)
├── entities/      (user, station, proposal — hooks + UI cơ bản)
├── shared/        (api, ui, dynamic-renderer, hooks, utils)
└── (Components/ chỉ giữ component dùng từ 2+ page)
```

Component chỉ dùng cho 1 page → đặt trong `pages/.../components/` (Colocation).

### 3.3. Database

- Trải phẳng các trường cốt lõi từ `custom_data` JSON thành cột vật lý (để index/filter/báo cáo).
- Giữ cột `extra_attributes` JSON cho dữ liệu động phát sinh.
- Migration theo module: `<số>_<module>_<mô tả>.sql`.

### 3.4. Giao tiếp liên module

- Event Bus (Pub/Sub) thay vì gọi hàm chéo.
- Ví dụ: `proposals` phát `PROPOSAL_APPROVED` → `on-station`, `integrations`, `Socket.io` tự lắng nghe.

---

## 4. So sánh chi tiết (Gap Analysis)

### 4.1. Backend

| Tiêu chí | Hiện trạng | Đề xuất | Khoảng cách | Ưu tiên |
|----------|-----------|---------|-------------|---------|
| Cấu trúc thư mục | Technical Layering (routes/, controllers/, services/) | Modular Monolith (modules/) | 🔴 Lớn | Cao |
| Lớp Repository | Không có (service gọi DB trực tiếp) | Có (repository.js) | 🟠 Trung bình | Cao |
| Lớp Controller | Có (46 file) | Giữ, chuẩn hóa | 🟡 Nhỏ | Trung bình |
| State Machine | Rải rác trong service + controller | Gom vào 1 file config | 🟠 Trung bình | Cao |
| Validation | 2 hàm trùng (dynamicUtils vs validators) | 1 lớp duy nhất (Joi/Zod) | 🟠 Trung bình | Trung bình |
| Event Bus | Không có | Pub/Sub nội bộ | 🔴 Lớn | Cao |
| Giao tiếp liên module | Gọi hàm trực tiếp | Event-driven | 🔴 Lớn | Cao |
| Facade (index.js) | Không có | Có | 🟡 Nhỏ | Thấp |
| Query tool | mysql2 raw | Knex.js Query Builder | 🟠 Trung bình | Trung bình |
| ORM | Không dùng | **Không dùng** (giữ nguyên) | ✅ Đồng ý | — |

### 4.2. Frontend

| Tiêu chí | Hiện trạng | Đề xuất | Khoảng cách | Ưu tiên |
|----------|-----------|---------|-------------|---------|
| Pages | ✅ Đã URL-mirrored | Giữ nguyên | ✅ Đạt | — |
| Components | Gom theo loại (admin/, common/, ...) | Colocation + shared/ | 🟠 Trung bình | Cao |
| Utils | 50+ file phẳng | Nhóm theo domain | 🟡 Nhỏ | Thấp |
| Hooks | 13 file phẳng | Nhóm theo domain | 🟡 Nhỏ | Thấp |
| HTTP client | fetch thuần (api.js) | Axios instance | 🟠 Trung bình | Trung bình |
| Server-state | useEffect + useState | TanStack Query | 🔴 Lớn | Cao |
| Table | Thủ công | TanStack Table | 🟠 Trung bình | Trung bình |
| Colocation | Không có | Có (pages/.../components/) | 🟠 Trung bình | Cao |
| Realtime | Polling 30s | WebSocket | 🟠 Trung bình | Thấp (sau VPS upgrade) |

### 4.3. Database

| Tiêu chí | Hiện trạng | Đề xuất | Khoảng cách |
|----------|-----------|---------|-------------|
| custom_data JSON | Nhiều trường cốt lõi lưu JSON | Trải phẳng cột vật lý | 🔴 Lớn (cần migration data) |
| extra_attributes | — | Giữ JSON cho dữ liệu động | ✅ Mới |
| Migration naming | `<số>-<mô tả>.sql` | `<số>_<module>_<mô tả>.sql` | 🟡 Nhỏ |
| ORM | Không dùng | **Không dùng** | ✅ Đồng ý |

---

## 5. Phân tích rủi ro (Risk Assessment)

### 5.1. Rủi ro cao

| Rủi ro | Mô tả | Giảm thiểu |
|--------|-------|-----------|
| **Phá vỡ E2E tests** | 257 migration + ~100 E2E test (full-flow-v2.js, FE-01..08). Thay đổi cấu trúc file có thể làm vỡ import path. | Giữ nguyên DB schema; chỉ di chuyển file, không đổi logic. Chạy `npm run build` + E2E sau mỗi bước. |
| **Migration custom_data → cột** | Dữ liệu JSON hiện có cần migrate sang cột mới. Nếu sai, mất dữ liệu. | Viết script migration idempotent (dry-run → --apply), backup DB trước. Test trên bản copy DB. |
| **Coupling ẩn** | Nhiều module gọi hàm chéo không được tài liệu hóa. Tách Event Bus có thể bỏ sót listener. | Trước khi tách, grep toàn bộ `require('../services/...')` để liệt kê dependency graph. |
| **Frontend import path** | VS Code auto-update import có thể sót file (đặc biệt dynamic import, lazy). | Chạy `vite build` sau mỗi bước; kiểm tra console error. |

### 5.2. Rủi ro trung bình

| Rủi ro | Giảm thiểu |
|--------|-----------|
| Thêm thư viện mới (Knex, TanStack, Axios, Socket.io) tăng bundle size | Tree-shaking, code splitting, lazy load. Kiểm tra bundle size sau build. |
| Đổi tên thư mục `pages` → `Pages` trên Windows (case-sensitive issue với Git) | Dùng `git mv` qua tên trung gian (`_pages_temp`). |
| Colocation component: không rõ component nào dùng cho 1 page vs nhiều page | Trước khi kéo, grep import của từng component để xác định số page sử dụng. |
| Worker/Cronjob gọi service: sau khi tách Repository, worker phải gọi service qua Facade | Giữ `index.js` Facade ở mỗi module; worker chỉ import từ Facade. |

### 5.3. Rủi ro thấp

| Rủi ro | Giảm thiểu |
|--------|-----------|
| Swagger docs lệch route sau khi tách module | Cập nhật JSDoc trong route file mới. |
| Naming convention migration file | Thống nhất cú pháp `<số>_<module>_<mô tả>.sql`. |

---

## 6. Lộ trình triển khai (3 bước cuốn chiếu)

### Bước 1: Tách lõi (Core & Shared) — Tuần 1
**Mục tiêu**: Gom tiện ích dùng chung, không đụng logic nghiệp vụ.

- [ ] Tạo `backend/src/core/` (database, middlewares, events, utils) — di chuyển file, giữ nguyên nội dung.
- [ ] Tạo `backend/src/shared/` (dynamic-engine, document-generator, excel-engine, storage) — gom từ services/.
- [ ] Tạo `frontend/src/shared/` (api, ui, dynamic-renderer, hooks, utils) — gom từ components/, utils/, hooks/.
- [ ] Tạo Event Bus skeleton (`core/events/eventBus.js`) — chưa hook vào logic.
- [ ] Kiểm tra: `npm run build` (frontend) + backend start OK + E2E smoke.

**Effort**: ~2–3 ngày (1 dev).

### Bước 2: Tách module ít phụ thuộc (warehouse, crm-leads, ai-assistant) — Tuần 2
**Mục tiêu**: Làm chuẩn mẫu cho các module còn lại.

- [ ] Tạo `backend/src/modules/warehouse/` (5 file) — migrate từ controllers/warehouseController.js + services/warehouse*.js.
- [ ] Tạo `backend/src/modules/crm-leads/` (5 file).
- [ ] Tạo `backend/src/modules/ai-assistant/` (5 file) — gom từ services/assistant/, integrations/crm (phần assistant).
- [ ] Tạo Facade `index.js` cho mỗi module.
- [ ] Chuyển giao tiếp liên module sang Event Bus (warehouse ↔ on-station).
- [ ] Frontend: Colocation component cho `Pages/admin/warehouse/`, `Pages/admin/leads/`.
- [ ] Kiểm tra: E2E full-flow + build.

**Effort**: ~4–5 ngày (1–2 dev).

### Bước 3: Tách lõi nghiệp vụ (proposals, on-station, stations, iam, integrations) — Tuần 3–4
**Mục tiêu**: Tách các module phức tạp nhất.

- [ ] Tạo `backend/src/modules/proposals/` (5 file) — State Machine 22 trạng thái gom vào `proposal.stateMachine.js`.
- [ ] Tạo `backend/src/modules/on-station/` (5 file).
- [ ] Tạo `backend/src/modules/stations/` (5 file).
- [ ] Tạo `backend/src/modules/iam/` (5 file) — cây nhân sự 2 tầng.
- [ ] Tạo `backend/src/modules/integrations/` (5 file) — Google Sheets, CRM webhook.
- [ ] Frontend: Colocation component cho `Pages/admin/proposals/`, `Pages/admin/on-tram/`.
- [ ] Thêm Knex.js (Query Builder) — migrate từng repository.
- [ ] Thêm Axios + TanStack Query (frontend) — migrate từng page.
- [ ] Trải phẳng `custom_data` JSON → cột vật lý (migration data).
- [ ] Kiểm tra: E2E full-flow + build + performance test.

**Effort**: ~8–10 ngày (2 dev).

### Bước 4: Nâng cấp hạ tầng (VPS 16GB) — Sau khi tái cấu trúc ổn định
- [ ] Thêm Redis (cache + queue adapter).
- [ ] Thêm Socket.io (realtime notification).
- [ ] Thêm Bull/Agenda (queue cho xuất file DOCX/PDF hàng loạt).
- [ ] Tinh chỉnh MySQL `innodb_buffer_pool_size` = 6–8GB.

**Effort**: ~3–4 ngày (1 dev + DevOps).

---

## 7. Ước lượng công sức tổng

| Giai đoạn | Effort (ngày-dev) | Số dev gợi ý |
|-----------|-------------------|--------------|
| Bước 1: Tách lõi | 2–3 | 1 |
| Bước 2: Module ít phụ thuộc | 4–5 | 1–2 |
| Bước 3: Lõi nghiệp vụ | 8–10 | 2 |
| Bước 4: Hạ tầng | 3–4 | 1 + DevOps |
| **Tổng** | **17–22 ngày-dev** | — |

**Lưu ý**: Nếu chỉ tái cấu trúc code (không thêm thư viện mới, không trải phẳng DB), effort giảm còn ~10–12 ngày-dev. Nếu thêm đầy đủ (Knex, TanStack, Socket.io, Redis), effort tăng lên ~22–25 ngày-dev.

---

## 8. Khuyến nghị phân công (Task Assignment)

### Nhóm A — Backend Core (1 dev, senior)
- Bước 1: Tách `core/` + `shared/` + Event Bus skeleton.
- Bước 2–3: Tách module `proposals`, `on-station`, `iam` (phức tạp nhất).
- Thêm Knex.js + Repository Pattern.

### Nhóm B — Backend Module (1 dev, mid)
- Bước 2: Tách `warehouse`, `crm-leads`, `ai-assistant`, `integrations`.
- Thêm validation Joi/Zod.
- Viết script migrate `custom_data` → cột.

### Nhóm C — Frontend (1 dev, mid-senior)
- Colocation component (grep import → kéo vào `pages/.../components/`).
- Thêm Axios instance + TanStack Query.
- Thêm TanStack Table cho danh sách đề xuất/trạm.

### Nhóm D — DevOps / QA (0.5 dev)
- Backup DB trước mỗi bước.
- Chạy E2E smoke sau mỗi bước.
- Nâng cấp VPS (Bước 4).

---

## 9. Checklist Definition of Done (cho mỗi bước)

- [ ] Code build không lỗi (`npm run build` frontend, backend start OK).
- [ ] Không có console error trên browser.
- [ ] E2E smoke test pass (FE-01 smoke + full-flow-v2 nếu liên quan).
- [ ] Swagger UI load đúng (`/api-docs`).
- [ ] Authorization vẫn enforce (role-based access).
- [ ] Feature cũ không bị phá (manual verify trên UI).
- [ ] Docker hot reload vẫn chạy.
- [ ] Git commit với message rõ ràng, PR review trước khi merge.

---

## 10. Tài liệu tham khảo

- `AGENTS.md` — đặc tả nghiệp vụ & quy ước dự án.
- `docs/7/` — review toàn mã nguồn (P0/P1/P2 đã fix).
- `docs/8/` — kế hoạch các mốc lớn (46–82).
- `docs/8/90-kien-truc-tai-cau-truc-phan-tich.md` — file này.
- Gemini conversation: https://share.gemini.google/o7zrCtlGvGVU

---

## 11. Quyết định cần chốt trước khi triển khai

| # | Quyết định | Đề xuất | Cần xác nhận |
|---|-----------|---------|-------------|
| 1 | Có dùng ORM không? | **Không** (giữ mysql2 + Knex) | ✅ Đã chốt |
| 2 | Có thêm TanStack Query không? | **Có**, nhưng giai đoạn sau (Bước 3) | ⏳ Chờ xác nhận |
| 3 | Có thêm Socket.io + Redis không? | **Có**, sau khi VPS upgrade (Bước 4) | ⏳ Chờ xác nhận |
| 4 | Có trải phẳng custom_data không? | **Có**, nhưng cần script migrate cẩn thận | ⏳ Chờ xác nhận |
| 5 | Thứ tự module tách trước? | warehouse → crm-leads → ai-assistant → proposals → on-station | ⏳ Chờ xác nhận |
| 6 | Có giữ backward-compat import path không? | **Có** (dùng re-export shim trong giai đoạn chuyển) | ⏳ Chờ xác nhận |

---

> **Ghi chú**: Tài liệu này được tạo để phân công công việc. Khi bắt đầu triển khai, mỗi bước nên có 1 PR riêng, review trước khi merge vào `main`. Không làm nhiều bước cùng lúc để tránh conflict.