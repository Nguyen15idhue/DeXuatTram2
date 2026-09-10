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
│                       files, dataLists, formulas
├── controllers/        (matching routes)
├── services/           auth, station, proposal, myProposal, adminProposal,
│                       adminUser, dashboard, map, fieldDefinition, form,
│                       formField, view, viewField, dynamicEngine, dynamicUtils,
│                       file, excel, dataList, formula
└── utils/              db.js (MySQL pool)
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
- **KHÔNG dùng migration — schema quản lý thủ công qua SQL scripts**

### Database Tables (12 bảng)

| Bảng | Mô tả |
|------|-------|
| `users` | Tài khoản người dùng |
| `stations` | Trạm sạc |
| `station_proposals` | Đề xuất trạm mới |
| `field_definitions` | Định nghĩa trường động (13 types) |
| `forms` | Cấu hình form |
| `form_fields` | Trường trong form (order_index, visible, config) |
| `views` | Cấu hình view/table |
| `view_fields` | Trường trong view (width, sortable, filterable) |
| `files` | File uploaded |
| `data_lists` | Danh sách dữ liệu (columns_config JSON) |
| `data_list_rows` | Rows trong data list (data JSON) |
| `map_configs` | Cấu hình tile provider, center, zoom cho bản đồ |

### Database Migrations
- `database/14-alter-field-definitions-add-display-format-unit.sql` — Thêm `display_format` và `unit` vào `field_definitions`

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

### Docker node_modules
- Named volume: `frontend_node_modules`, `backend_node_modules`
- Install new package: `docker exec station-frontend npm install <pkg>`
- After install: rebuild container

## 11. Dynamic System Architecture

### Field Types
- 13 types: text, textarea, number, email, phone, url, date, datetime, boolean, select, multiselect, file, formula
- Each type has specific config (number_format, decimal_places, display_format, unit, date_format, file_config, formula_config, option_style)
- Fields stored in `field_definitions` table

### Form/View Builder
- Admin tạo Forms/Views tại `/admin/forms` và `/admin/views`
- FormBuilder: drag & drop fields, configure visibility + colSpan
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
- **File đính kèm**: field `files` = JSON string `[{name,file}]` trong body `contact/insert` (hoặc `update`); KHÔNG dùng endpoint upload-file riêng; gửi **tất cả file trong 1 request**; `update` **append** file (chỉ gửi file mới để tránh trùng); tên file nên **bỏ đuôi** vì 1Office tự thêm đuôi theo nội dung
- **Mapping target đặc biệt**: `desc` (nguồn = Desc Template, cố định) và `files` (gộp mọi field file) luôn link sẵn; `api_field_mappings` unique theo `target_field` (1 nguồn → nhiều đích, 1 đích ← 1 nguồn)
- **Non-working fields**: gender, group_type_id, trade_ids, websites, status_id, source_id, region — API nhận nhưng không lưu (khóa kéo–thả ở FieldMappingPanel)
- **Non-working arrays**: contacts[] — API không parse; detail[] — chỉ lưu department_id
- **Desc field HTML**: type `html` trong docs, INSERT lưu HTML đúng, GET strip HTML → plain text, Web UI render HTML đúng
- **Code**: `backend/src/services/fieldMapper.js` (ONE_OFFICE_FIELDS), `frontend/src/components/admin/FieldMappingPanel.jsx` (SOURCE_TYPES_FORCE_TEXT)

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

## 15. Definition of Done

Task is complete when:
- [ ] Feature works end-to-end
- [ ] Frontend has no runtime errors
- [ ] Backend API returns expected results
- [ ] Authorization is enforced
- [ ] Existing features are not broken
- [ ] Docker hot reload still works
- [ ] No console errors
