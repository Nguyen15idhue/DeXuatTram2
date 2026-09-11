# AGENTS.md

## 1. Project Overview

```
Project: Station Management System
Purpose: Quản lý trạm sạc, hiển thị trên bản đồ, đề xuất vị trí trạm
Stack: React + Vite | Node.js + Express | MySQL | Leaflet | Docker Compose
```

## 2. Architecture

```
Browser → Frontend → REST API → Backend → MySQL
```

```
/frontend    React + Vite
/backend     Node.js + Express
/database    MySQL scripts
/docker      Docker configs
/swagger     http://localhost:3000/api-docs
```

## 3. Business Entities

### User
- Roles: `SUPER_ADMIN`, `ADMIN`, `SALES`, `CTV` (file 25, thay `USER`/`ADMIN` cũ)
- `CTV.parent_id` trỏ `SALES` quản lý; `external_id` map hệ ngoài
- Status: `ACTIVE`, `LOCKED`

### Station (trạm đã được tạo)
- Status: `ACTIVE`, `DEPLOYING`

### Station Proposal (đề xuất trạm mới)
- Status: `PENDING`, `REVIEWING`, `APPROVED`, `REJECTED`

### Field Definition (định nghĩa trường động)
- 13 types: `text`, `textarea`, `number`, `email`, `phone`, `url`, `date`, `datetime`, `boolean`, `select`, `multiselect`, `file`, `formula`
- Entity: `stations`, `station_proposals`, `users`
- Source: `fixed` (cột DB) hoặc `json` (lưu trong custom_data)
- Select/Multiselect có thể lấy data từ Data List hoặc manual options

### Form (cấu hình form nhập liệu)
- Gắn với 1 entity
- Chứa danh sách fields sắp xếp theo `order_index`

### View (cấu hình bảng hiển thị)
- Gắn với 1 entity
- Chứa columns với `width`, `sortable`, `filterable`, `visible`

### Data List (danh sách dữ liệu dùng chung)
- Schema: `columns_config` JSON `[{key, label, type}]`
- Rows: `data` JSON `{column_key: value}`
- Hỗ trợ hierarchy qua `parent_row_id`

**QUAN TRỌNG:**
- `Station` và `Station Proposal` là hai entity ĐỘC LẬP
- `Station` là trạm đã có thật
- `Station Proposal` là đề xuất chưa được duyệt
- KHÔNG được merge hai entity này
- KHÔNG tự thêm status `PROPOSAL` vào Station

## 4. Business Rules

### Permission Rules (file 25)
1. CTV chỉ được xem/sửa/xóa proposal của chính mình (= `USER` cũ)
2. Super/Admin được quản lý tất cả proposals và stations
3. CTV KHÔNG được truy cập admin API (`/admin/*`); Sales chỉ 4 trang (`/admin`, `/admin/users`, `/admin/stations`, `/admin/proposals`)
4. Chỉ `SUPER_ADMIN` được vào trang cấu hình (`/admin/fields`, `/admin/forms`, `/admin/views`, `/admin/data-lists`, `/admin/map-config`, `/admin/roles`) + tạo super admin
5. Sales chỉ được xem trạm (không nút Sửa), dùng `allowEdit={!isSales}` trong RecordDetailPopup

### Data Rules
4. Proposal phải lưu `user_id` của người tạo (`user_id` được NULL với guest qua `POST /api/proposals/guest`)
5. Form `/admin` chỉ hiện đúng cấu hình form (nhập tay tọa độ được); trang `/map` có click-to-fill tọa độ cho đề xuất

### Proposal Review & Notification Rules
- Từ chối đề xuất: **bắt buộc** `reject_reason`; lưu `reviewed_by`, `reviewed_at` (`adminProposalService.updateStatus`).
- Đổi trạng thái → tạo `notifications` cho chủ đề xuất (luôn tạo, kể cả self). Type = status; **5 loại** thông báo + màu: `REJECTED` đỏ, `APPROVED` xanh lá, `PENDING` vàng, `REVIEWING` xanh lam, `RESUBMITTED` vàng (gửi lại).
- CTV được sửa đề xuất khi `PENDING` hoặc `REJECTED`; khi `REJECTED` nút lưu đổi thành **"Gửi lại"** → lưu xong status về `PENDING` + notify người đã từ chối với type `RESUBMITTED`.
- Ngoài ra, đổi status sang REJECTED qua form sửa cũ cũng tạo notification (lưới an toàn).
- Chuông `NotificationBell` ở header user + admin (polling 30s + refresh ngay qua sự kiện `notifications:refresh`; nhấp nháy + badge chưa đọc). Dropdown render qua `createPortal` ra `body` (`position:fixed`, `z-index:9999`) để không bị `.drawer-side` che/cắt. Badge/list chỉ tính thông báo trong **`NOTIFICATION_RETENTION_DAYS`** ngày gần nhất (mặc định 7).
- **Tab thông báo**: trang user (và role SALES) chỉ "Của bạn"; trang admin + ADMIN/SUPER có thêm tab **"Tất cả"** (`GET /api/notifications/all`, requireAdmin, chỉ đọc, hiện tên người nhận). Badge luôn = chưa đọc của chính mình.
- CTV/owner lưu sửa qua `myProposalService` (RecordDetailPopup `updateService`), KHÔNG dùng admin API. Nút "Gửi lại" hiện khi status `REJECTED` ở mọi đường sửa; lưu xong reset `REJECTED → PENDING` + notify `RESUBMITTED` (cả `myProposalService` và `adminProposalService.updateProposal`).

### Map Marker Rules
6. Station `ACTIVE` → marker xanh
7. Station `DEPLOYING` → marker vàng
8. Proposal → marker màu trạng thái đề xuất

### Map Tile Rules
9. Tile server lỗi → fallback proxy `/tiles/{z}/{x}/{y}` tự động, KHÔNG hiện warning cho user
10. Geolocation: debug log `console.error('[MapView] Geolocation error:')` khi có lỗi, user thấy alert
11. MyProposalsPage mini map: click → realtime sync lat/lng vào DynamicForm qua `initialData` prop

### Create Form Modal Rules
12. Tất cả create form modals phải có nút X (X icon lucide-react) ở góc phải title

### Ownership Rules
13. Khi update/delete proposal, phải check `user_id` khớp với user đang login
14. Admin có thể bypass ownership check

### Dynamic Field Rules
15. Field `source_type=fixed` không được đổi key hoặc xóa
16. Field `source_type=json` lưu trong cột `custom_data` JSON của entity
17. Select/Multiselect có 2 nguồn: manual options hoặc Data List
18. Cascading select: child field có `parent_field` + `relation_key`
19. Formula field: pre-compute (trong form), post-compute (sau khi tạo record)

### Data List Rules
20. Data List name phải unique
21. Columns config: `[{key, label, type}]`, type = `text` hoặc `number`
22. Row data lưu JSON trong cột `data`
23. Delete row → orphaned children set `parent_row_id = NULL`

## 5. Coding Conventions

```
Frontend components:     PascalCase.jsx
Variables/functions:     camelCase
Constants:               UPPER_SNAKE_CASE
Database tables:         snake_case, plural
Database columns:        snake_case
API routes:              /api/[resource]
```

### General Rules
- JavaScript (không dùng TypeScript)
- Async/await cho bất đồng bộ
- Try-catch cho error handling
- Không thêm comments trừ khi được yêu cầu
- **Backend test OK ≠ Frontend OK**: Sau khi fix backend, PHẢI kiểm tra frontend như mở trình duyệt test — verify nút bấm hiển thị đúng, gọi đúng API, hiển thị dữ liệu đúng, không ẩn/hiện sai. Không được chỉ test backend rồi kết luận frontend OK.

## 6. Folder Responsibilities

### Frontend
```
frontend/src/
├── components/
│   ├── dynamic/        DynamicForm, DynamicTable, DynamicField, FieldRenderer,
│   │                   FileUpload, FileViewer, FileListPopup, DynamicFilter,
│   │                   FormulaEditor
│   ├── admin/          FieldManager, FormBuilder, ViewBuilder, DragDropList,
│   │                   DataListManager, DataListEditor, RecordDetailPopup
│   └── (common)        Toast, Pagination, ErrorMessage, Loading, EmptyState,
│                       ConfirmDialog, FormInput
├── pages/
│   ├── admin/          AdminDashboard, AdminUsersPage, AdminStationsPage,
│   │                   AdminProposalsPage, AdminFieldsPage, AdminFormsPage,
│   │                   AdminViewsPage, AdminFormBuilderPage, AdminViewBuilderPage,
│   │                   AdminDataListsPage, AdminRecordFilesPage
│   └── user/           MapPage, MyProposalsPage, ProfilePage
├── services/           api.js (all API calls)
├── hooks/              useFieldOptions, useDataList
├── layouts/            PublicLayout, UserLayout, AdminLayout
├── contexts/           AuthContext
├── utils/              mapHelpers, formatNumber
├── App.jsx             routing + lazy page imports
└── main.jsx            entry point
```

### Backend
```
backend/src/
├── app.js              entry point + middleware stack
├── config/             swagger.js
├── middlewares/         auth.js (JWT), validators.js (16 validators)
├── routes/             auth, stations, proposals, myProposals, adminProposals,
│                       adminUsers, dashboard, excel, mapUtils, fieldDefinitions,
│                       forms, formFields, views, viewFields, dynamicEngine,
│                       files, dataLists, formulas, apiConfigs, externalUsers
├── controllers/        (matching routes)
├── services/           auth, station, proposal, myProposal, adminProposal,
│                       adminUser, dashboard, map, fieldDefinition, form,
│                       formField, view, viewField, dynamicEngine, dynamicUtils,
│                       file, excel, dataList, formula, apiConfig, sync,
│                       personnelSync, externalUser
├── workers/            queueWorker (push/pull), personnelSyncWorker (cron nhân sự)
├── utils/              db.js (MySQL pool), cronMatcher.js
```

## 7. API Conventions

- All routes start with `/api`
- Authentication: JWT (Bearer token)
- Admin endpoints require `ADMIN` role
- Response format: `{ success, data, message, pagination? }`
- Validation happens on backend, not frontend
- Body size limit: 10MB
- Rate limiting: Auth (10-30/min), Admin (60-120/min), Excel (10-30/min)

## 8. Database Rules

- Never store plaintext passwords (use bcrypt)
- All tables use primary key `id`
- Required columns: `created_at`, `updated_at`
- Use foreign keys where appropriate
- **KHÔNG được DROP TABLE rồi CREATE TABLE lại**
- **Không modify schema mà không có migration plan**
- **Schema bằng file SQL thủ công trong `database/` (đánh số thứ tự); áp dụng tự động qua `scripts/migrate.sh` có tracking (`schema_migrations`). Chỉ viết script tiến tới, idempotent; không DROP.**
- **DB mới: dựng bằng datadir + dump chuẩn rồi `mark-all`; không chạy `01-create-tables.sql` tự động.**

### Database Tables (15 bảng)

| Bảng | Mô tả |
|------|-------|
| `users` | Tài khoản người dùng |
| `stations` | Trạm sạc |
| `station_proposals` | Đề xuất trạm mới (+ `reject_reason`, `reviewed_by`, `reviewed_at`) |
| `field_definitions` | Định nghĩa trường động (13 types) |
| `forms` | Cấu hình form |
| `form_fields` | Trường trong form (order_index, visible, config) |
| `views` | Cấu hình view/table |
| `view_fields` | Trường trong view (width, sortable, filterable) |
| `files` | File uploaded |
| `data_lists` | Danh sách dữ liệu (columns_config JSON) |
| `data_list_rows` | Rows trong data list (data JSON) |
| `map_configs` | Cấu hình tile provider, center, zoom cho bản đồ |
| `user_external_map` | Map user nội bộ ↔ ID hệ ngoài |
| `external_users` | Nhân sự hệ ngoài (pull từ 1Office) — nguồn dropdown "Mã NS - Tên" |
| `notifications` | Thông báo trong app (chuông header) |

### Database Migrations
- `database/14-alter-field-definitions-add-display-format-unit.sql` — Thêm `display_format` và `unit` vào `field_definitions`
- `database/45-create-user-external-map.sql`, `database/46-add-system-key-api-configs.sql`
- `database/47-add-api-type-and-sync-schedule-to-api-configs.sql` — `api_type` + cột `sync_*`
- `database/48-create-external-users.sql` — bảng `external_users`
- `database/49-add-proposal-review-fields.sql` — `reject_reason`/`reviewed_by`/`reviewed_at`
- `database/50-create-notifications.sql` — bảng `notifications`

## 9. Swagger & Documentation

- Swagger UI: `http://localhost:3000/api-docs`
- Swagger JSON: `http://localhost:3000/api-docs.json`
- Khi thêm endpoint mới → phải thêm `@swagger` JSDoc trong route file
- Docs folder:
  - `docs/0/` — Backup
  - `docs/1/` — Kế hoạch, đề xuất
  - `docs/2/` — Tài liệu tổng hợp (backend-features, field-configuration, ui-ux-features, bảo mật, swagger)
  - `docs/3/` — Bug fixes
  - `docs/4/` — Thiết kế tính năng (Formula Pre/Post, Excel theo View, Cascading Select, Dynamic Form/View)

## 10. Docker Development

```
- Development uses Docker Compose
- Source code mounted as volumes (hot reload enabled)
- DO NOT remove source-code volumes
- MySQL data uses persistent Docker volume
- DO NOT use docker compose down -v unless requested
```

### Docker Services
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- MySQL: `localhost:3306`

### Docker Timezone
- **Bắt buộc `TZ=Asia/Ho_Chi_Minh`** cho `backend` và `mysql` (cả `docker-compose.yml` dev lẫn `docker-compose.simple.yml` prod). `node:20` và `mysql:8.0` đã có tzdata nên `TZ` env có hiệu lực. Kiểm tra: `docker exec station-backend date` phải hiện `+07`.
- `app.js` cũng set `process.env.TZ='Asia/Ho_Chi_Minh'` làm mặc định.

### Docker node_modules
- Named volume: `frontend_node_modules`, `backend_node_modules`
- Install new package: `docker exec station-frontend npm install <pkg>`
- After install: rebuild container

## 11. Dynamic System Architecture

### Field Types
- 13 types: text, textarea, number, email, phone, url, date, datetime, boolean, select, multiselect, file, formula
- Each type has specific config (number_format, decimal_places, display_format, unit, date_format, file_config, formula_config, option_style)
- Fields stored in `field_definitions` table

### User Field (type `user`)
- Lưu `{ id }` (users.id); hiển thị chip tên, click xem chi tiết (CTV ẩn).
- `source_config.auto_user`: `current_user` (người đăng nhập) | `parent_sales` (sales quản lý) | `owner_or_manager` (CTV → sales quản lý, còn lại → người tạo). Field auto sẽ **tự điền + khoá readonly**.
- BE: `dynamicUtils.applyAutoUserFields` (create/update proposal). FE: `DynamicForm.resolveAutoUserId`.

### Form/View Builder
- Admin tạo Forms/Views tại `/admin/forms` và `/admin/views`
- FormBuilder: drag & drop fields, configure visibility + colSpan; **section có nút ▲▼ di chuyển + điều kiện hiển thị** (`section.visibleWhen = { field, value }`, lưu trong `layout_config`). `DynamicForm` chỉ render section khi `formData[field] === value`.
- ViewBuilder: drag & drop columns, configure visibility + width + sortable + filterable

### Select/Multiselect Data Sources
- **Manual options**: Admin nhập thủ công `[{label, value, color, borderRadius}]`
- **Data List**: Lấy từ data_lists table, config `data_list_id` + `data_list_column`
- **Cascading**: Child field có `parent_field` + `relation_key`
- Frontend transform flat rows → tree map `{tree, unique}` cho O(1) lookup

### Cascading Select Flow
```
DB: field_definitions (parent_field, relation_key, data_list_id, data_list_column)
  ↓
Backend: getFormConfig trả field metadata
  ↓
Frontend: loadFormConfig fetch data lists → build tree map
  ↓
getFilteredOptions: root → unique[col], child → tree[relationKey][parentVal]
  ↓
DynamicField render: custom dropdown with badge styling
```

### Formula System
- **Pre-compute**: Tính trong lúc điền form, trước khi submit
- **Post-compute**: Tính SAU khi record tạo xong, dùng record metadata (id, entity, base_url, created_at)
- Config: `formula_config = { compute_mode, expression, referencedFields, outputType, outputFormat, decimalPlaces, unit }`
- Pre: `computeFormula()` dùng mathjs v15.2.0 evaluator
- Post: Backend compute sau INSERT → update record → return kết quả
- 26 custom functions: ROUNDUP, ROUNDDOWN, MOD, IF, AND, OR, NOT, IFERROR, COUNT, COUNTA, COUNTIF, SUMIF, AVERAGE, CONCAT, LEN, LEFT, RIGHT, UPPER, LOWER, TRIM, DATE, TODAY, LPAD, RPAD, YEAR, MONTH, DAY, NOW

### Formula Visual Editor
- Component: `FormulaEditor.jsx` — inline editor với compute mode selector, field/operator/function buttons
- Features: autocomplete dropdown (detect word at cursor, keyboard navigation), collapsible sections, operators-grid-3, function hints
- Output config: numberFormat selector (plain/comma/dot/space), decimalPlaces, unit
- API: `POST /api/formulas/validate`, `POST /api/formulas/preview`

### Number Formatting
- Utility: `frontend/src/utils/formatNumber.js`
- `formatNumber(value, { format, decimalPlaces, unit })` — format số theo cấu hình
- 4 display formats: `plain` (1000), `comma` (1,000), `dot` (1.000), `space` (1 000)
- `parseFormattedNumber(str)` — parse formatted string về number
- Applied in: FieldRenderer, FormulaEditor output, DynamicForm computeFormula, DataListEditor cells
- DB: `display_format` VARCHAR(20) DEFAULT 'plain', `unit` VARCHAR(50) trong `field_definitions`

### File Management
- Upload: `POST /api/files/upload` (multer disk storage, 10MB limit)
- Download: Auth-aware, Content-Disposition, UTF-8 charset
- File types: image, video, audio, pdf, word (.docx → HTML via mammoth), excel (.xlsx → table via xlsx), text
- File viewer: zoom image, play video/audio, render PDF/Word/Excel inline

### Excel Import/Export
- **Hiện tại**: Hardcoded columns cho stations và proposals
- **Planned**: Dùng View Columns + Available Fields từ admin/views
- Export: ExcelJS → .xlsx
- Import: Preview → Validate → Confirm (transaction, all-or-nothing)

### 1Office API Field Mapping Rules
- **Content-Type**: `application/x-www-form-urlencoded` (KHÔNG phải JSON)
- **Auth**: `access_token` query param (KHÔNG phải Bearer header)
- **9/14 source types hoạt động**: text, textarea, number, email, phone, date, select, boolean, file
- **5/14 source types chuyển sang text**: url, multiselect, datetime, formula, table
- **1Office select fields dùng ID**: formal_name (1=Ông), scale_id (3=25-50 NV)
- **1Office cf2 dùng label**: "VIP", "VVIP" (KHÔNG phải ID)
- **1Office `user_ids`/`manager_user_ids` nhận CODE/TÊN, KHÔNG nhận ID**: kiểu `string comma` (vd `'NV06,NV08,Nguyễn Văn C'`). `user_external_map.external_id` lưu **`personnel_id`** ("ID Hồ sơ nhân sự" trong UI 1Office). Push quy đổi `personnel_id` → `code` (ưu tiên) hoặc `fullname`; pull dùng `field_raws=user_ids,manager_user_ids` trả `ID` liên hệ → quy đổi `ID` → `personnel_id`. Cần `admin_token` trong `api_configs.auth_config`; thiếu → bỏ qua field (không gửi sai). Lưu ý 3 ID khác nhau: `ID` (contact), `personnel_id`, `code`. **Chỉ nhận người CÓ tài khoản 1Office** — nhân sự chưa có tài khoản bị 1Office bỏ qua (app gắn `warnings` trong kết quả push; dropdown `UserExternalPanel` disable người `contact_id` rỗng).
- **File đính kèm**: field `files` = JSON string `[{name,file}]` trong body `contact/insert` (hoặc `update`); KHÔNG dùng endpoint upload-file riêng; gửi **tất cả file trong 1 request**; `update` **append** file (chỉ gửi file mới để tránh trùng); tên file nên **bỏ đuôi** vì 1Office tự thêm đuôi theo nội dung
- **Mapping target đặc biệt**: `desc` (nguồn = Desc Template, cố định) và `files` (gộp mọi field file) luôn link sẵn; `api_field_mappings` unique theo `target_field` (1 nguồn → nhiều đích, 1 đích ← 1 nguồn). **`desc`/`files` là special target — KHÔNG dùng làm nguồn pull** (`syncService` tự loại khỏi push/pull mappings) để tránh desc bị lặp (pull ghi desc vào `description` rồi push lại lồng vào desc).
- **Non-working fields**: gender, group_type_id, trade_ids, websites, status_id, source_id, region — API nhận nhưng không lưu (khóa kéo–thả ở FieldMappingPanel)
- **Non-working arrays**: contacts[] — API không parse; detail[] — chỉ lưu department_id
- **Desc field HTML**: type `html` trong docs, INSERT lưu HTML đúng, GET strip HTML → plain text, Web UI render HTML đúng
- **Code**: `backend/src/services/fieldMapper.js` (ONE_OFFICE_FIELDS), `frontend/src/components/admin/FieldMappingPanel.jsx` (SOURCE_TYPES_FORCE_TEXT)
- **Phân loại config API**: `api_configs.api_type` = `contact` (liên hệ) | `personnel` (nhân sự). Cùng `system_key='1office'`.
- **API nhân sự (personnel)**: chỉ **pull** — `personnelSyncService.syncFrom1Office` gọi `/api/personnel/profile/gets` (API **Hồ sơ nhân sự**, cần **token riêng cho object `personnel/profile`**; token `admin/user` và token liên hệ KHÔNG dùng được → `"accesstoken not of object"`) → upsert bảng `external_users`. Map: `ID`→`external_id` (personnel_id), `raw_user_id`→`contact_id` (account ID cho pull), `code`→`code` (Mã NS), `name`→`fullname`, `department_id`(tên)→`department_name`; bỏ dòng header `code='STT'`. Sync tay (`POST /api/admin/api-configs/:id/sync-personnel`) + cron (`api_configs.sync_cron`, `sync_enabled`; tick 20s bằng `backend/src/utils/cronMatcher.js` + `workers/personnelSyncWorker.js`, KHÔNG dùng node-cron v4 vì bỏ mốc phút).
- **Push/pull user dùng `external_users`** (không gọi API lúc push): `fieldMapper.getExternalUserMaps` (cache 30s), fallback API khi bảng trống. Dropdown mapping ở `/admin/users`: `GET /api/admin/external-users`.

## 12. Performance Optimizations

### Đã áp dụng
- Module-level caching trong `useFieldOptions` (fetch 1 lần, dùng lại)
- `useCallback` trong admin pages load functions
- `useMemo` cho filteredData, sortedData, parentFieldMap
- `React.lazy` + `Suspense` cho FileListPopup trong FieldRenderer
- Cancelled flag pattern trong useFieldOptions, useDataList
- Object URL cleanup on unmount (FileViewer, FileListPopup)
- `Cache-Control: no-store` trong Vite dev server config
- Manual chunks: leaflet tách riêng trong vite.config.js

### Chưa có (cơ hội cải thiện)
- Route-level code splitting (tất cả pages eagerly imported)
- API response caching (không có SWR/ETag)
- Context value memoization (AuthProvider)
- Debounced search
- Skeleton loading states

## 13. Testing

After changing code:
1. Check frontend build (`npm run build`)
2. Check backend starts without errors
3. Check Docker containers running
4. Manually verify the feature works
5. Check existing features still work
6. Check Swagger UI loads correctly

When automated tests do not exist, perform manual verification.

### Playwright Frontend Testing

Playwright đã cài sẵn trong `frontend/package.json`. Test trên host (không chạy trong Docker).

**Cách chạy:**
```powershell
# Từ thư mục frontend/
node test-1office.cjs
```

**Quy tắc viết test:**
- File test đặt tại `frontend/test-*.cjs` (dùng `.cjs` vì package.json có `"type": "module"`)
- Dùng `chromium.launch({ headless: true })` — không cần giao diện
- Login trước khi test các trang admin: `page.request.post(API + '/api/auth/login', { data: { email, password } })` → lưu token vào localStorage
- Dùng `page.waitForLoadState('networkidle')` + `page.waitForTimeout(1000-2000)` sau mỗi hành động
- CSS selectors: dùng `button:has-text("Text")`, `span.font-medium`, `input[placeholder*="..."]`
- KHÔNG dùng `text=...` trong `page.$()` — phải dùng `page.getByText()` hoặc `page.locator()`
- Test results lưu vào `test-1office-results.json`

**Ví dụ test pattern:**
```javascript
const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Test page
  await page.goto(`${BASE}/admin/api-configs`);
  await page.waitForLoadState('networkidle');
  const btn = await page.$('button:has-text("Mapping")');
  console.log('Mapping button:', btn ? 'PASS' : 'FAIL');

  await browser.close();
}
main();
```

## 14. PowerShell UTF-8 Encoding

PowerShell 5.1 (Windows) mặc định dùng Windows-1252 → tiếng Việt hiển thị sai (mojibake).
MUST set UTF-8 encoding trước khi chạy任何 command:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

Khi chạy docker exec mysql, thêm `--default-character-set=utf8mb4`:
```powershell
docker exec station-mysql mysql -u root -ppassword station_management --default-character-set=utf8mb4 -e "QUERY"
```

**KHÔNG dùng `Get-Content`/`Set-Content` của PowerShell để sửa file source** (gây double-encoding → mojibake tiếng Việt). Luôn dùng công cụ `Edit`/`Write` (UTF-8). Nếu buộc phải thao tác file bằng PowerShell, dùng `[System.IO.File]::ReadAllText/WriteAllText` với `[System.Text.UTF8Encoding]::new($false)`.

## 15. Definition of Done

Task is complete when:
- [ ] Feature works end-to-end
- [ ] Frontend has no runtime errors
- [ ] Backend API returns expected results
- [ ] Authorization is enforced
- [ ] Existing features are not broken
- [ ] Docker hot reload still works
- [ ] No console errors
