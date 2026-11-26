# Danh sách Công việc Chi tiết — Tái cấu trúc Kiến trúc TMT-EGREEN

> **Mục đích**: Checklist chi tiết để phân công và theo dõi tiến độ. Mỗi task có: ID, mô tả, file liên quan, tiêu chí hoàn thành (DoD), ước lượng.
> **Tham chiếu**: `docs/8/90-kien-truc-tai-cau-truc-phan-tich.md`
>
> **Cập nhật 2026-11-25 — phạm vi và quyết định**:
> - Không thêm lớp `repository`. Mọi task có `*.repository.js` được hiểu là query nằm trong `*.service.js`.
> - Người phụ trách **backend** (cá nhân): mục Phase 2 và Phase 3 phần backend, theo `docs/8/92-backend-phan-tich-so-do.md`.
> - Người khác phụ trách: `shared/` và `core/` (mục 1.1, 1.2, 1.4 của Phase 1 backend), toàn bộ frontend (1.3, 2.5, 3.7, 3.8), hạ tầng Phase 4.
> - Knex.js, Zod và trải phẳng `custom_data` (3.5, 3.6, 3.9) chưa chốt, không thuộc phạm vi backend cá nhân trong đợt này.

---

## PHASE 0 — Chuẩn bị (Pre-work) — 1 ngày

### P0.1 — Backup & Snapshot
- [ ] **P0.1.1** Backup DB MySQL đầy đủ (`mysqldump` → `backups/pre-restructure-YYYYMMDD.sql`).
- [ ] **P0.1.2** Tạo branch Git `refactor/architecture` từ `main`, push lên remote.
- [ ] **P0.1.3** Chạy toàn bộ E2E hiện tại (`npm run test:e2e` + `node e2e/full-flow-v2.js`) → lưu kết quả baseline (số pass/fail) vào `docs/8/baseline-test-results.md`.
- [ ] **P0.1.4** Chạy `npm run build` frontend → lưu kích thước bundle baseline.

### P0.2 — Phân tích dependency graph (grep)
- [ ] **P0.2.1** Liệt kê tất cả `require('../services/...')` và `require('../controllers/...')` trong backend → file `docs/8/dep-graph-backend.md`.
- [ ] **P0.2.2** Liệt kê tất cả import cross-component trong frontend (`grep -r "from '../components"`) → file `docs/8/dep-graph-frontend.md`.
- [ ] **P0.2.3** Với mỗi component trong `components/admin/`, `components/common/`, `components/map/`, `components/report/`, đếm số page import nó → bảng `docs/8/component-usage-count.md` (để quyết định Colocation vs Shared).

### P0.3 — Quyết định kỹ thuật (chốt với team)
- [ ] **P0.3.1** Chốt: có dùng Knex.js không? (đề xuất: Có, nhưng chỉ ở Repository layer)
- [ ] **P0.3.2** Chốt: có dùng Joi/Zod không? (đề xuất: Có, Zod)
- [ ] **P0.3.3** Chốt: có dùng TanStack Query không? (đề xuất: Có, Bước 3)
- [ ] **P0.3.4** Chốt: có trải phẳng custom_data không? (đề xuất: Có, Bước 3, cần script migrate)
- [ ] **P0.3.5** Chốt: thứ tự module tách (warehouse → crm-leads → ai-assistant → proposals → on-station → stations → iam → integrations)
- [ ] **P0.3.6** Chốt: giữ backward-compat import path (re-export shim) trong giai đoạn chuyển.

---

## PHASE 1 — Tách lõi (Core & Shared) — 2–3 ngày

### 1.1 — Backend: Tạo `core/`
- [ ] **1.1.1** Tạo thư mục `backend/src/core/` với subdirs: `database/`, `middlewares/`, `events/`, `utils/`.
- [ ] **1.1.2** Di chuyển `backend/src/utils/db.js` → `backend/src/core/database/db.js`. Cập nhật tất cả import (hoặc tạo shim `utils/db.js` → re-export).
- [ ] **1.1.3** Di chuyển `backend/src/middlewares/auth.js`, `rateLimits.js`, `validators.js`, `crmWebhookAuth.js` → `backend/src/core/middlewares/`. Tạo shim ở `middlewares/`.
- [ ] **1.1.4** Di chuyển `backend/src/utils/cronMatcher.js`, `ttlCache.js`, `dynamicFilter.js`, `multiValueFilter.js`, `proposalAdvancedFilters.js`, `leadPortal.js` → `backend/src/core/utils/`. Tạo shim.
- [ ] **1.1.5** Tạo `backend/src/core/events/eventBus.js` (EventEmitter wrapper) với API: `emit(event, payload)`, `on(event, handler)`, `off(event, handler)`.
- [ ] **1.1.6** Tạo `backend/src/core/events/socketGateway.js` (placeholder, chưa kết nối Socket.io).
- [ ] **1.1.7** Cập nhật `backend/src/app.js` để import từ `core/` (hoặc shim).
- [ ] **1.1.8** Chạy backend → kiểm tra start OK, Swagger load, smoke test API.

### 1.2 — Backend: Tạo `shared/`
- [ ] **1.2.1** Tạo `backend/src/shared/` với subdirs: `dynamic-engine/`, `document-generator/`, `excel-engine/`, `storage/`.
- [ ] **1.2.2** Di chuyển logic dynamic engine (từ `services/dynamicEngineService.js`, `utils/dynamicFilter.js`) → `shared/dynamic-engine/`. Tạo shim.
- [ ] **1.2.3** Di chuyển logic document (từ `services/documentService.js`, `documentTemplateService.js`, `documentXmlService.js`, `libreOfficeService.js`, `signatureSnapshotService.js`, `signedDocumentService.js`) → `shared/document-generator/`. Tạo shim.
- [ ] **1.2.4** Di chuyển logic excel (từ `services/excelService.js`, `customExcelExportService.js`) → `shared/excel-engine/`. Tạo shim.
- [ ] **1.2.5** Di chuyển logic storage/upload (từ `services/fileService.js`, `fileSyncService.js`) → `shared/storage/`. Tạo shim.
- [ ] **1.2.6** Chạy backend → smoke test.

### 1.3 — Frontend: Tạo `shared/`
- [ ] **1.3.1** Tạo `frontend/src/shared/` với subdirs: `api/`, `ui/`, `dynamic-renderer/`, `hooks/`, `utils/`.
- [ ] **1.3.2** Di chuyển `frontend/src/services/api.js`, `helpApi.js` → `frontend/src/shared/api/`. Tạo shim `services/api.js` → re-export.
- [ ] **1.3.3** Di chuyển `frontend/src/components/ui/*` + `components/common/*` → `frontend/src/shared/ui/`. Tạo shim.
- [ ] **1.3.4** Di chuyển `frontend/src/components/dynamic/*` → `frontend/src/shared/dynamic-renderer/`. Tạo shim.
- [ ] **1.3.5** Di chuyển `frontend/src/hooks/*` → `frontend/src/shared/hooks/`. Tạo shim.
- [ ] **1.3.6** Di chuyển `frontend/src/utils/*` (trừ domain-specific) → `frontend/src/shared/utils/`. Tạo shim cho file dùng nhiều.
- [ ] **1.3.7** Chạy `npm run build` → kiểm tra 0 lỗi.

### 1.4 — Kiểm tra Phase 1
- [ ] **1.4.1** `npm run build` frontend pass.
- [ ] **1.4.2** Backend start OK.
- [ ] **1.4.3** E2E smoke (FE-01) pass.
- [ ] **1.4.4** Commit: `refactor(phase1): extract core and shared layers`.

---

## PHASE 2 — Tách module ít phụ thuộc — 4–5 ngày

### 2.1 — Backend: Module `warehouse`
- [ ] **2.1.1** Tạo `backend/src/modules/warehouse/` với 5 file: `warehouse.routes.js`, `warehouse.controller.js`, `warehouse.service.js`, `warehouse.repository.js`, `index.js`.
- [ ] **2.1.2** Di chuyển logic từ `controllers/warehouseController.js` → `warehouse.controller.js`.
- [ ] **2.1.3** Di chuyển logic từ `services/warehouseService.js`, `supplierService.js`, `chargingFinanceService.js` (phần kho) → `warehouse.service.js`.
- [ ] **2.1.4** Viết `warehouse.repository.js` — chuyển các query SQL từ service sang repository (dùng mysql2 hoặc Knex nếu đã thêm).
- [ ] **2.1.5** Viết `warehouse.routes.js` — đăng ký route với middleware auth/RBAC.
- [ ] **2.1.6** Viết `index.js` (Facade) — export các hàm public.
- [ ] **2.1.7** Cập nhật `app.js` để mount route từ module.
- [ ] **2.1.8** Tạo shim ở `controllers/warehouseController.js` và `services/warehouseService.js` → re-export từ module (backward-compat).
- [ ] **2.1.9** Smoke test API warehouse + E2E.

### 2.2 — Backend: Module `crm-leads`
- [ ] **2.2.1** Tạo `backend/src/modules/crm-leads/` (5 file).
- [ ] **2.2.2** Di chuyển `controllers/adminLeadController.js` → `crm-leads.controller.js`.
- [ ] **2.2.3** Di chuyển `services/leadService.js`, `leadAssignmentService.js`, `leadConsultationService.js`, `leadProposalService.js`, `journeyActivityService.js`, `journeySyncService.js` → `crm-leads.service.js`.
- [ ] **2.2.4** Viết `crm-leads.repository.js`.
- [ ] **2.2.5** Viết `crm-leads.routes.js` + mount.
- [ ] **2.2.6** Viết `index.js` Facade.
- [ ] **2.2.7** Shim backward-compat.
- [ ] **2.2.8** Smoke test + E2E.

### 2.3 — Backend: Module `ai-assistant`
- [ ] **2.3.1** Tạo `backend/src/modules/ai-assistant/` (5 file).
- [ ] **2.3.2** Di chuyển `services/assistant/` (gemini, openrouter, router, guard, attachments, assistantService) → `ai-assistant.service.js`.
- [ ] **2.3.3** Di chuyển `services/knowledgeService.js`, `codeKnowledgeService.js`, `assistantConfigService.js` → `ai-assistant.service.js`.
- [ ] **2.3.4** Di chuyển `controllers/adminAssistant.js`, `assistant.js` → `ai-assistant.controller.js`.
- [ ] **2.3.5** Di chuyển `routes/adminAssistant.js`, `assistant.js` → `ai-assistant.routes.js`.
- [ ] **2.3.6** Viết `index.js` Facade.
- [ ] **2.3.7** Shim backward-compat.
- [ ] **2.3.8** Smoke test chatbot.

### 2.4 — Backend: Module `integrations`
- [ ] **2.4.1** Tạo `backend/src/modules/integrations/` (5 file).
- [ ] **2.4.2** Di chuyển `services/crmInboundService.js`, `crmOutboundService.js`, `crmFullSyncService.js`, `crmProvinceMapping.js`, `crmStatusMapping.js` → `integrations.service.js`.
- [ ] **2.4.3** Di chuyển `services/proposalSheetSyncService.js`, `onStationSheetSyncService.js` → `integrations.service.js`.
- [ ] **2.4.4** Di chuyển `integrations/crm/` → `modules/integrations/crm/`.
- [ ] **2.4.5** Di chuyển workers sheet sync + CRM sync → `modules/integrations/workers/` (hoặc giữ trong `workers/` nhưng import từ module).
- [ ] **2.4.6** Viết `index.js` Facade.
- [ ] **2.4.7** Thay giao tiếp liên module: `proposals` phát event `PROPOSAL_APPROVED` → `integrations` lắng nghe → xử lý sync.
- [ ] **2.4.8** Smoke test + E2E.

### 2.5 — Frontend: Colocation cho warehouse & leads
- [ ] **2.5.1** Với mỗi component trong `components/admin/`, grep số page import → tạo bảng usage.
- [ ] **2.5.2** Component chỉ dùng cho 1 page warehouse → di chuyển vào `Pages/admin/warehouse/components/`.
- [ ] **2.5.3** Component chỉ dùng cho leads → di chuyển vào `Pages/admin/leads/components/`.
- [ ] **2.5.4** Component dùng chung ≥2 page → giữ ở `Components/` (đổi tên `components/` → `Components/`).
- [ ] **2.5.5** Chạy `npm run build` → kiểm tra import path.

### 2.6 — Kiểm tra Phase 2
- [ ] **2.6.1** `npm run build` frontend pass.
- [ ] **2.6.2** Backend start OK.
- [ ] **2.6.3** E2E smoke + full-flow-v2 pass.
- [ ] **2.6.4** Commit: `refactor(phase2): extract warehouse, crm-leads, ai-assistant, integrations modules`.

---

## PHASE 3 — Tách lõi nghiệp vụ — 8–10 ngày

### 3.1 — Backend: Module `proposals` (phức tạp nhất)
- [ ] **3.1.1** Tạo `backend/src/modules/proposals/` (5 file).
- [ ] **3.1.2** Tạo `proposals/proposal.stateMachine.js` — gom 22 trạng thái + transition matrix từ `proposalLifecycle.js`.
- [ ] **3.1.3** Di chuyển `controllers/proposalController.js`, `adminProposalController.js`, `myProposalController.js` → `proposals.controller.js`.
- [ ] **3.1.4** Di chuyển `services/proposalService.js`, `myProposalService.js`, `adminProposalService.js`, `proposalLifecycle.js`, `proposalActivityService.js` → `proposals.service.js`.
- [ ] **3.1.5** Viết `proposals.repository.js` — chuyển query SQL.
- [ ] **3.1.6** Viết `proposals.routes.js` + mount.
- [ ] **3.1.7** Viết `index.js` Facade.
- [ ] **3.1.8** Thay giao tiếp: `proposals` phát event `PROPOSAL_APPROVED`, `PROPOSAL_REJECTED`, `PROPOSAL_CANCELLED`, `PROPOSAL_SIGNED` → các module khác lắng nghe.
- [ ] **3.1.9** Shim backward-compat.
- [ ] **3.1.10** Smoke test + E2E full-flow-v2.

### 3.2 — Backend: Module `on-station`
- [ ] **3.2.1** Tạo `backend/src/modules/on-station/` (5 file).
- [ ] **3.2.2** Di chuyển `controllers/chargingStationController.js`, `chargingStationCareController.js`, `chargingStationDeploymentController.js`, `chargingStationShippingController.js`, `chargingFinanceController.js` → `on-station.controller.js`.
- [ ] **3.2.3** Di chuyển `services/chargingStationService.js`, `chargingStationCareService.js`, `chargingStationDeploymentService.js`, `chargingStationShippingService.js`, `chargingStationReadiness.js`, `chargingStationCompletionService.js`, `chargingStationTaskCounts.js` → `on-station.service.js`.
- [ ] **3.2.4** Viết `on-station.repository.js`.
- [ ] **3.2.5** Viết `on-station.routes.js` + mount.
- [ ] **3.2.6** Viết `index.js` Facade.
- [ ] **3.2.7** Lắng nghe event `PROPOSAL_APPROVED` từ proposals → tạo `charging_stations` record.
- [ ] **3.2.8** Shim backward-compat.
- [ ] **3.2.9** Smoke test + E2E.

### 3.3 — Backend: Module `stations`
- [ ] **3.3.1** Tạo `backend/src/modules/stations/` (5 file).
- [ ] **3.3.2** Di chuyển `controllers/stationController.js`, `mapController.js`, `geocodeController.js`, `mapConfigController.js` → `stations.controller.js`.
- [ ] **3.3.3** Di chuyển `services/stationService.js`, `mapService.js`, `geocodeService.js`, `mapConfigService.js`, `proximityService.js` → `stations.service.js`.
- [ ] **3.3.4** Viết `stations.repository.js`.
- [ ] **3.3.5** Viết `stations.routes.js` + mount.
- [ ] **3.3.6** Viết `index.js` Facade.
- [ ] **3.3.7** Shim backward-compat.
- [ ] **3.3.8** Smoke test + E2E.

### 3.4 — Backend: Module `iam`
- [ ] **3.4.1** Tạo `backend/src/modules/iam/` (5 file).
- [ ] **3.4.2** Di chuyển `controllers/authController.js`, `adminUserController.js` → `iam.controller.js`.
- [ ] **3.4.3** Di chuyển `services/authService.js`, `adminUserService.js` → `iam.service.js`.
- [ ] **3.4.4** Viết `iam.repository.js` — bao gồm logic cây nhân sự 2 tầng (đệ quy).
- [ ] **3.4.5** Viết `iam.routes.js` + mount.
- [ ] **3.4.6** Viết `index.js` Facade.
- [ ] **3.4.7** Shim backward-compat.
- [ ] **3.4.8** Smoke test auth + user management.

### 3.5 — Backend: Thêm Knex.js (Query Builder)
- [ ] **3.5.1** Cài `knex` + `mysql2` (đã có) trong backend container.
- [ ] **3.5.2** Tạo `backend/src/core/database/knex.js` — config connection pool.
- [ ] **3.5.3** Migrate từng repository từ raw SQL sang Knex (bắt đầu từ `warehouse.repository.js`).
- [ ] **3.5.4** Kiểm tra query performance (EXPLAIN) cho các query phức tạp (cây nhân sự, báo cáo).
- [ ] **3.5.5** Cập nhật migration script để hỗ trợ Knex (hoặc giữ SQL thuần cho migration).

### 3.6 — Backend: Validation Joi/Zod
- [ ] **3.6.1** Cài `zod` trong backend.
- [ ] **3.6.2** Tạo schema validation cho từng module (proposals, leads, warehouse, iam).
- [ ] **3.6.3** Thay thế validation thủ công trong controller bằng Zod schema.
- [ ] **3.6.4** Gom `dynamicUtils.validateField` + `validators.validateDynamicFields` thành 1 hàm duy nhất.

### 3.7 — Frontend: Colocation cho proposals & on-tram
- [ ] **3.7.1** Grep import count cho từng component trong `components/admin/`, `components/map/`, `components/report/`.
- [ ] **3.7.2** Component chỉ dùng cho 1 page proposals → di chuyển vào `Pages/admin/proposals/.../components/`.
- [ ] **3.7.3** Component chỉ dùng cho on-tram → di chuyển vào `Pages/admin/on-tram/.../components/`.
- [ ] **3.7.4** Component chỉ dùng cho reports → di chuyển vào `Pages/admin/reports/components/`.
- [ ] **3.7.5** Component dùng chung ≥2 page → giữ ở `Components/` (đổi tên `components/` → `Components/`).
- [ ] **3.7.6** Chạy `npm run build` → kiểm tra.

### 3.8 — Frontend: Thêm Axios + TanStack Query
- [ ] **3.8.1** Cài `axios`, `@tanstack/react-query`, `@tanstack/react-table` trong frontend container.
- [ ] **3.8.2** Tạo `frontend/src/shared/api/axiosInstance.js` — tự gắn JWT, refresh token khi 401, xử lý lỗi tập trung.
- [ ] **3.8.3** Tạo `frontend/src/shared/api/queryClient.js` — config QueryClient (staleTime, cacheTime, retry).
- [ ] **3.8.4** Bọc `QueryClientProvider` trong `app/` (App.jsx hoặc main.jsx).
- [ ] **3.8.5** Migrate từng page: thay `useEffect + fetch` bằng `useQuery` / `useMutation`.
- [ ] **3.8.6** Migrate danh sách đề xuất/trạm sang TanStack Table (sort, filter, pagination).
- [ ] **3.8.7** Cache danh mục dùng chung (tỉnh/thành, nhân sự, loại trụ) với `staleTime: Infinity`.
- [ ] **3.8.8** Chạy `npm run build` + smoke test.

### 3.9 — Database: Trải phẳng custom_data
- [ ] **3.9.1** Phân tích các trường trong `custom_data` JSON của `station_proposals`, `stations`, `leads` → liệt kê trường cốt lõi cần trải phẳng.
- [ ] **3.9.2** Tạo migration SQL: thêm cột mới cho từng bảng (ví dụ `station_proposals.mo_hinh_dau_tu`, `loai_uu_tien`, `owner_name`, `owner_phone`, ...).
- [ ] **3.9.3** Viết script migrate dữ liệu: đọc `custom_data` JSON → điền vào cột mới (dry-run → --apply).
- [ ] **3.9.4** Cập nhật `shared/dynamic-engine/` để đọc từ cột mới thay vì JSON.
- [ ] **3.9.5** Giữ cột `extra_attributes` JSON cho dữ liệu động phát sinh.
- [ ] **3.9.6** Backup DB trước khi chạy migration.
- [ ] **3.9.7** Test trên bản copy DB → verify data integrity.

### 3.10 — Kiểm tra Phase 3
- [ ] **3.10.1** `npm run build` frontend pass.
- [ ] **3.10.2** Backend start OK.
- [ ] **3.10.3** E2E full-flow-v2 pass (93/93).
- [ ] **3.10.4** FE-01..FE-08 Playwright pass.
- [ ] **3.10.5** Performance test: API response time < 200ms cho danh sách đề xuất.
- [ ] **3.10.6** Commit: `refactor(phase3): extract core business modules`.

---

## PHASE 4 — Nâng cấp hạ tầng — 3–4 ngày (sau VPS upgrade)

### 4.1 — Redis
- [ ] **4.1.1** Thêm service `redis` vào `docker-compose.yml` (hoặc `docker-compose.simple.yml`).
- [ ] **4.1.2** Cài `ioredis` trong backend.
- [ ] **4.1.3** Tạo `core/cache/redisClient.js` — kết nối Redis.
- [ ] **4.1.4** Cache danh mục dùng chung (tỉnh/thành, nhân sự) trên Redis với TTL.
- [ ] **4.1.5** Tinh chỉnh MySQL `innodb_buffer_pool_size` = 6–8GB.

### 4.2 — Socket.io (Realtime)
- [ ] **4.2.1** Cài `socket.io` (backend) + `socket.io-client` (frontend).
- [ ] **4.2.2** Tạo `core/events/socketGateway.js` — kết nối Socket.io với Event Bus.
- [ ] **4.2.3** Frontend: tạo `shared/hooks/useSocketEvent.js` — lắng nghe event realtime.
- [ ] **4.2.4** Hook events: `PROPOSAL_STATUS_CHANGED`, `NOTIFICATION_NEW`, `STATION_STATUS_CHANGED`.
- [ ] **4.2.5** Thay polling 30s của NotificationBell bằng Socket.io push.
- [ ] **4.2.6** Test realtime trên 2 tab browser.

### 4.3 — Queue (Bull/Agenda)
- [ ] **4.3.1** Cài `bull` (hoặc `agenda`) trong backend.
- [ ] **4.3.2** Tạo queue cho xuất file DOCX/PDF hàng loạt.
- [ ] **4.3.3** Tạo queue cho đồng bộ Google Sheets (thay outbox polling).
- [ ] **4.3.4** Tạo queue cho gửi email/notification hàng loạt.
- [ ] **4.3.5** Worker xử lý queue chạy trong container riêng (hoặc cùng backend).

### 4.4 — Kiểm tra Phase 4
- [ ] **4.4.1** Load test: 100 concurrent users → API response < 500ms.
- [ ] **4.4.2** Memory usage backend < 4GB (với 16GB VPS).
- [ ] **4.4.3** Redis cache hit rate > 80% cho danh mục.
- [ ] **4.4.4** Socket.io reconnect tự động khi mất kết nối.
- [ ] **4.4.5** Commit: `feat(phase4): add redis, socket.io, queue`.

---

## PHASE 5 — Dọn dẹp & Tối ưu — 2–3 ngày

### 5.1 — Xóa shim backward-compat
- [ ] **5.1.1** Xóa tất cả file shim (re-export) ở `controllers/`, `services/`, `middlewares/`, `utils/`, `components/`, `hooks/`, `services/`.
- [ ] **5.1.2** Xóa thư mục rỗng.
- [ ] **5.1.3** Chạy `npm run build` + E2E → đảm bảo 0 lỗi.

### 5.2 — Cập nhật tài liệu
- [ ] **5.2.1** Cập nhật `AGENTS.md` — phản ánh cấu trúc mới.
- [ ] **5.2.2** Cập nhật Swagger docs (JSDoc trong route file mới).
- [ ] **5.2.3** Cập nhật `README.md` (nếu có) — hướng dẫn dev mới.

### 5.3 — Tối ưu bundle
- [ ] **5.3.1** Kiểm tra bundle size sau build → so sánh với baseline.
- [ ] **5.3.2** Lazy load các module nặng (maplibre-gl, tiptap, xlsx, mammoth).
- [ ] **5.3.3** Tree-shake unused code.

### 5.4 — Kiểm tra cuối
- [ ] **5.4.1** E2E full-flow-v2 pass (93/93).
- [ ] **5.4.2** FE-01..FE-08 Playwright pass.
- [ ] **5.4.3** Manual test: tạo đề xuất → duyệt → ký → ON trạm → kho → nghiệm thu.
- [ ] **5.4.4** Performance test trên VPS 16GB.
- [ ] **5.4.5** Tag release: `v2.0.0-restructure`.

---

## Tổng kết số lượng task

| Phase | Số task | Effort (ngày) |
|-------|---------|---------------|
| Phase 0 — Chuẩn bị | 10 | 1 |
| Phase 1 — Tách lõi | 22 | 2–3 |
| Phase 2 — Module ít phụ thuộc | 30 | 4–5 |
| Phase 3 — Lõi nghiệp vụ | 45 | 8–10 |
| Phase 4 — Hạ tầng | 18 | 3–4 |
| Phase 5 — Dọn dẹp | 12 | 2–3 |
| **Tổng** | **137 task** | **20–26 ngày** |

---

## Ghi chú cho người phân công

1. **Mỗi Phase nên là 1 PR riêng** — review trước khi merge. Không làm nhiều Phase cùng lúc.
2. **Shim backward-compat** là chìa khóa để không phá vỡ code cũ trong quá trình chuyển. Xóa shim chỉ ở Phase 5.
3. **Backup DB trước mỗi Phase** có thay đổi schema (đặc biệt Phase 3.9).
4. **E2E smoke test sau mỗi Phase** — nếu fail, rollback ngay.
5. **Không thay đổi logic nghiệp vụ** trong quá trình tái cấu trúc — chỉ di chuyển file và tách lớp. Logic mới (thêm tính năng) làm sau khi tái cấu trúc xong.
6. **Ưu tiên module ít phụ thuộc trước** (warehouse, crm-leads, ai-assistant) để làm chuẩn mẫu, sau đó nhân bản sang module phức tạp.