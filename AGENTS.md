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
- Roles: `USER`, `ADMIN`
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

### Permission Rules
1. User chỉ được xem/sửa/xóa proposal của chính mình
2. Admin được quản lý tất cả proposals và stations
3. User KHÔNG được truy cập admin API (`/admin/*`)

### Data Rules
4. Proposal phải lưu `user_id` của người tạo
5. Latitude/Longitude lấy từ vị trí click trên map (không nhập thủ công)

### Map Marker Rules
6. Station `ACTIVE` → marker xanh
7. Station `DEPLOYING` → marker vàng
8. Proposal → marker màu trạng thái đề xuất

### Ownership Rules
9. Khi update/delete proposal, phải check `user_id` khớp với user đang login
10. Admin có thể bypass ownership check

### Dynamic Field Rules
11. Field `source_type=fixed` không được đổi key hoặc xóa
12. Field `source_type=json` lưu trong cột `custom_data` JSON của entity
13. Select/Multiselect có 2 nguồn: manual options hoặc Data List
14. Cascading select: child field có `parent_field` + `relation_key`
15. Formula field: pre-compute (trong form), post-compute (sau khi tạo record)

### Data List Rules
16. Data List name phải unique
17. Columns config: `[{key, label, type}]`, type = `text` hoặc `number`
18. Row data lưu JSON trong cột `data`
19. Delete row → orphaned children set `parent_row_id = NULL`

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

### Database Tables (11 bảng)

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

## 14. Definition of Done

Task is complete when:
- [ ] Feature works end-to-end
- [ ] Frontend has no runtime errors
- [ ] Backend API returns expected results
- [ ] Authorization is enforced
- [ ] Existing features are not broken
- [ ] Docker hot reload still works
- [ ] No console errors
