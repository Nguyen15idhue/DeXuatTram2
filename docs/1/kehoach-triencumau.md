# KẾ HOẠCH TRIỂN KHAI DYNAMIC FORM & DATA

**Ngày tạo:** 2026-08-28
**Phiên bản:** 1.0
**Trạng thái:** Chờ phê duyệt

---

## MỤC LỤC

1. [Tổng quan](#1-tổng-quan)
2. [Phân tích mã nguồn hiện tại](#2-phân-tích-mã-nguồn-hiện-tại)
3. [Database Migration Plan](#3-database-migration-plan)
4. [Backend Implementation](#4-backend-implementation)
5. [Frontend Implementation](#5-frontend-implementation)
6. [Chi tiết từng Phase](#6-chi-tiết-từng-phase)
7. [API Specification](#7-api-specification)
8. [Testing Strategy](#8-testing-strategy)
9. [Rủi ro & Mitigation](#9-rủi-rò--mitigation)

---

## 1. TỔNG QUAN

### 1.1 Mục tiêu

Chuyển hệ thống từ hardcode schema sang Dynamic Field architecture:

- Admin có thể thêm/sửa/xóa field cho bất kỳ entity nào
- Admin có thể tạo form bằng drag-and-drop
- Admin có thể cấu hình bảng hiển thị (ẩn/hiện cột, sắp xếp, width)
- Hỗ trợ upload file (metadata + persistent storage)
- Hỗ trợ import/export Excel theo cấu hình dynamic
- **Không cần restart server** khi thay đổi config

### 1.2 Phạm vi ảnh hưởng

| Layer | Thay đổi | Mức độ |
|-------|----------|--------|
| Database | Thêm 6 bảng mới + 3 column custom_data | CAO |
| Backend | Thêm ~12 route files mới + sửa 8 files hiện tại | CAO |
| Frontend | Thêm ~10 components mới + 5 pages mới + sửa 8 pages | CAO |

### 1.3 Sequence thực hiện

```
Phase 1: Database Migration (4 files SQL)
Phase 2: Backend CRUD cho Dynamic Configuration (6 route files)
Phase 3: Backend Generic Engine (form renderer, table renderer, file handler)
Phase 4: Frontend Admin Pages (Field Manager, Form Builder, View Builder)
Phase 5: Frontend Dynamic Components (DynamicForm, DynamicTable, FileUpload)
Phase 6: Integration & Refactor existing pages
Phase 7: Excel Import/Export theo config dynamic
Phase 8: Testing & Bug fixes
```

---

## 2. PHÂN TÍCH MÃ NGUỒN HIỆN TẠI

### 2.1 Cấu trúc Backend hiện tại

```
backend/src/
├── app.js                    (1.9 KB) - Entry point, route mounting
├── utils/
│   └── db.js                 (0.4 KB) - MySQL pool
├── middlewares/
│   ├── auth.js               (1.5 KB) - JWT auth
│   └── validators.js         (5.1 KB) - Hardcode validation
└── routes/
    ├── auth.js               (6.0 KB)
    ├── stations.js           (4.7 KB)
    ├── proposals.js          (2.6 KB)
    ├── myProposals.js        (4.1 KB)
    ├── adminProposals.js     (3.5 KB)
    ├── adminUsers.js         (7.4 KB)
    ├── excel.js              (11.2 KB)
    ├── dashboard.js          (2.0 KB)
    ├── mapUtils.js           (1.9 KB)
    └── test.js               (0.3 KB)
```

**Đặc điểm:**
- Không có controllers/services separation
- Mỗi route file chứa cả handler + query SQL
- Validation hardcode trong `validators.js`
- Không có file upload (multer đã cài nhưng chưa dùng)

### 2.2 Cấu trúc Frontend hiện tại

```
frontend/src/
├── main.jsx
├── App.jsx                   (2.1 KB) - Router
├── App.css                   (27.4 KB) - Tất cả styles
├── contexts/
│   └── AuthContext.jsx       (2.3 KB)
├── services/
│   └── api.js                (7.5 KB) - 10 service objects
├── components/               (8 components)
│   ├── MapView.jsx           (12.4 KB) - Map lớn nhất
│   ├── ConfirmDialog.jsx
│   ├── EmptyState.jsx
│   ├── ErrorMessage.jsx
│   ├── FormInput.jsx
│   ├── Loading.jsx
│   ├── Pagination.jsx
│   └── Toast.jsx
├── layouts/                  (3 layouts)
│   ├── PublicLayout.jsx
│   ├── UserLayout.jsx
│   └── AdminLayout.jsx
└── pages/
    ├── auth/                 (2 pages)
    ├── user/                 (3 pages)
    └── admin/                (4 pages)
```

### 2.3 Database hiện tại

```sql
-- 3 bảng business, KHÔNG có dynamic config tables
users              (9 columns)
stations           (8 columns)
station_proposals  (12 columns)
```

### 2.4 API Routes hiện tại

| Group | Routes | Auth |
|-------|--------|------|
| Auth | 4 | Public + requireAuth |
| Stations | 5 | Public read, Admin write |
| Proposals | 3 | Public read, Auth create |
| My Proposals | 3 | requireAuth + ownership |
| Admin Proposals | 3 | requireAuth + Admin |
| Admin Users | 6 | requireAuth + Admin |
| Excel | 5 | requireAuth + Admin |
| Dashboard | 1 | requireAuth + Admin |
| Map Utils | 1 | Public |
| Test | 1 | Public |
| **Tổng** | **32** | |

---

## 3. DATABASE MIGRATION PLAN

### 3.1 Phiên bản migration

| File | Nội dung | Priority |
|------|----------|----------|
| `04-add-custom-data.sql` | Thêm custom_data vào 3 bảng business | CAO |
| `05-create-field-definitions.sql` | Tạo bảng field_definitions | CAO |
| `06-create-forms.sql` | Tạo bảng forms + form_fields | CAO |
| `07-create-views.sql` | Tạo bảng views + view_fields | CAO |
| `08-create-files.sql` | Tạo bảng files | TRUNG BÌNH |
| `09-seed-field-definitions.sql` | Seed data cho field definitions hiện tại | CAO |

### 3.2 Chi tiết Migration 04: Thêm custom_data

```sql
-- File: database/04-add-custom-data.sql

-- Thêm column custom_data JSON vào 3 bảng business
-- KHÔNG DROP, KHÔNG ALTER column cũ

ALTER TABLE users
ADD COLUMN custom_data JSON DEFAULT NULL;

ALTER TABLE stations
ADD COLUMN custom_data JSON DEFAULT NULL;

ALTER TABLE station_proposals
ADD COLUMN custom_data JSON DEFAULT NULL;

-- Tạo index cho custom_data (chỉ JSON typed column, không index nội dung)
-- MySQL 8.0+ hỗ trợ functional index
```

**Lưu ý AGENTS.md:** Không được DROP TABLE. Dùng ALTER TABLE ADD COLUMN.

### 3.3 Chi tiết Migration 05: field_definitions

```sql
-- File: database/05-create-field-definitions.sql

CREATE TABLE field_definitions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(100) NOT NULL COMMENT 'Entity name: users, stations, station_proposals',
    `key` VARCHAR(100) NOT NULL COMMENT 'Machine key: antenna_height',
    label VARCHAR(255) NOT NULL COMMENT 'Display label: Chiều cao anten',
    type VARCHAR(50) NOT NULL DEFAULT 'text' COMMENT 'text,textarea,number,email,phone,url,date,datetime,boolean,select,multiselect,file,formula',
    source_type VARCHAR(20) NOT NULL DEFAULT 'json' COMMENT 'column or json',
    required TINYINT(1) NOT NULL DEFAULT 0,
    validation JSON DEFAULT NULL COMMENT '{"min":0,"max":100,"pattern":"..."}',
    options JSON DEFAULT NULL COMMENT '[{"value":"a","label":"A"},{"value":"b","label":"B"}]',
    formula VARCHAR(500) DEFAULT NULL COMMENT 'Formula expression',
    placeholder VARCHAR(255) DEFAULT NULL,
    help_text VARCHAR(500) DEFAULT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_entity_key (entity, `key`),
    INDEX idx_entity (entity),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.4 Chi tiết Migration 06: forms + form_fields

```sql
-- File: database/06-create-forms.sql

CREATE TABLE forms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_entity (entity),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE form_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT NOT NULL,
    field_id INT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    config JSON DEFAULT NULL COMMENT '{"colSpan":2,"className":"..."}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_form_id (form_id),
    INDEX idx_field_id (field_id),
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.5 Chi tiết Migration 07: views + view_fields

```sql
-- File: database/07-create-views.sql

CREATE TABLE views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_entity (entity),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE view_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    view_id INT NOT NULL,
    field_id INT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    width INT DEFAULT NULL COMMENT 'Column width in px',
    sortable TINYINT(1) NOT NULL DEFAULT 1,
    filterable TINYINT(1) NOT NULL DEFAULT 0,
    config JSON DEFAULT NULL COMMENT '{"align":"left","className":"..."}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_view_id (view_id),
    INDEX idx_field_id (field_id),
    FOREIGN KEY (view_id) REFERENCES views(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.6 Chi tiết Migration 08: files

```sql
-- File: database/08-create-files.sql

CREATE TABLE files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_name VARCHAR(500) NOT NULL,
    storage_key VARCHAR(500) NOT NULL COMMENT 'Path relative to storage root',
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    checksum VARCHAR(64) DEFAULT NULL,
    storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    uploaded_by INT DEFAULT NULL,
    status ENUM('active','deleted') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_uploaded_by (uploaded_by),
    INDEX idx_status (status),
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.7 Chi tiết Migration 09: Seed field definitions

```sql
-- File: database/09-seed-field-definitions.sql

-- Stations
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('stations', 'antenna_height', 'Chiều cao anten', 'number', 'json', 0),
('stations', 'tower_type', 'Loại cột', 'select', 'json', 0),
('stations', 'power_capacity', 'Công suất', 'number', 'json', 0);

-- Station Proposals
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('station_proposals', 'investment_cost', 'Chi phí đầu tư', 'number', 'json', 0),
('station_proposals', 'legal_document', 'Hồ sơ pháp lý', 'file', 'json', 0),
('station_proposals', 'site_images', 'Hình ảnh hiện trường', 'file', 'json', 0);

-- Users
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('users', 'employee_code', 'Mã nhân viên', 'text', 'json', 0),
('users', 'department', 'Phòng ban', 'select', 'json', 0),
('users', 'avatar', 'Ảnh đại diện', 'file', 'json', 0);
```

---

## 4. BACKEND IMPLEMENTATION

### 4.1 Cấu trúc mới

```
backend/src/
├── app.js                          (MODIFY - mount routes mới)
├── utils/
│   ├── db.js                       (giữ nguyên)
│   └── dynamicUtils.js             (NEW - helper functions)
├── middlewares/
│   ├── auth.js                     (giữ nguyên)
│   └── validators.js               (MODIFY - thêm validators mới)
└── routes/
    ├── auth.js                     (MODIFY - hỗ trợ custom_data)
    ├── stations.js                 (MODIFY - hỗ trợ custom_data)
    ├── proposals.js                (MODIFY - hỗ trợ custom_data)
    ├── myProposals.js              (MODIFY - hỗ trợ custom_data)
    ├── adminProposals.js           (MODIFY - hỗ trợ custom_data)
    ├── adminUsers.js               (MODIFY - hỗ trợ custom_data)
    ├── excel.js                    (MODIFY - theo dynamic config)
    ├── dashboard.js                (giữ nguyên)
    ├── mapUtils.js                 (giữ nguyên)
    ├── test.js                     (giữ nguyên)
    │
    ├── fieldDefinitions.js         (NEW - CRUD field_definitions)
    ├── forms.js                    (NEW - CRUD forms)
    ├── formFields.js               (NEW - CRUD form_fields)
    ├── views.js                    (NEW - CRUD views)
    ├── viewFields.js               (NEW - CRUD view_fields)
    ├── files.js                    (NEW - upload/download/delete)
    ├── dynamicEngine.js            (NEW - generic form/table renderer)
    └── adminExcelDynamic.js        (NEW - dynamic import/export)
```

### 4.2 Files mới cần tạo

#### 4.2.1 `routes/fieldDefinitions.js` (~120 dòng)

```
GET    /api/field-definitions              (admin) - List all, filter by entity
GET    /api/field-definitions/:id          (admin) - Get one
GET    /api/field-definitions/entity/:entity (public) - Get by entity (for form rendering)
POST   /api/field-definitions              (admin) - Create
PUT    /api/field-definitions/:id          (admin) - Update
DELETE /api/field-definitions/:id          (admin) - Delete
PATCH  /api/field-definitions/:id/status   (admin) - Toggle active/inactive
```

#### 4.2.2 `routes/forms.js` (~100 dòng)

```
GET    /api/forms                         (admin) - List all, filter by entity
GET    /api/forms/:id                     (public) - Get form with fields (for rendering)
POST   /api/forms                         (admin) - Create form
PUT    /api/forms/:id                     (admin) - Update form
DELETE /api/forms/:id                     (admin) - Delete form
```

#### 4.2.3 `routes/formFields.js` (~80 dòng)

```
GET    /api/forms/:formId/fields          (public) - Get fields of a form
POST   /api/forms/:formId/fields          (admin) - Add field to form
PUT    /api/forms/:formId/fields/:id      (admin) - Update field config
DELETE /api/forms/:formId/fields/:id      (admin) - Remove field from form
PUT    /api/forms/:formId/fields/reorder  (admin) - Reorder fields
```

#### 4.2.4 `routes/views.js` (~100 dòng)

```
GET    /api/views                         (admin) - List all, filter by entity
GET    /api/views/:id                     (public) - Get view with fields
POST   /api/views                         (admin) - Create view
PUT    /api/views/:id                     (admin) - Update view
DELETE /api/views/:id                     (admin) - Delete view
```

#### 4.2.5 `routes/viewFields.js` (~80 dòng)

```
GET    /api/views/:viewId/fields          (public) - Get fields of a view
POST   /api/views/:viewId/fields          (admin) - Add field to view
PUT    /api/views/:viewId/fields/:id      (admin) - Update field config
DELETE /api/views/:viewId/fields/:id      (admin) - Remove field from view
PUT    /api/views/:viewId/fields/reorder  (admin) - Reorder fields
```

#### 4.2.6 `routes/files.js` (~150 dòng)

```
POST   /api/files/upload                  (auth) - Upload file
GET    /api/files/:id                     (auth) - Get file metadata
GET    /api/files/:id/download            (auth) - Download file (with auth check)
DELETE /api/files/:id                     (auth) - Delete file (soft delete)
```

**Lưu ý:** Dùng multer để xử lý upload. Storage path: `storage/uploads/{entity}/{record_id}/{file_id}.{ext}`

#### 4.2.7 `routes/dynamicEngine.js` (~200 dòng)

Đây là core engine — đọc config từ DB, merge với data, validate:

```
GET    /api/dynamic/:entity/form/:formId   (public) - Render form config
GET    /api/dynamic/:entity/view/:viewId   (public) - Render table config
POST   /api/dynamic/:entity/validate       (auth) - Validate data against field definitions
```

**Functions:**
- `getFormConfig(formId)` → Đọc form + form_fields + field_definitions
- `getViewConfig(viewId)` → Đọc view + view_fields + field_definitions
- `validateData(entity, data)` → Validate theo field_definitions
- `splitData(entity, data)` → Tách fixed columns vs custom_data
- `mergeData(entity, row)` → Merge fixed columns + custom_data thành flat object

#### 4.2.8 `utils/dynamicUtils.js` (~100 dòng)

Helper functions dùng chung:

```javascript
// Parse field_definitions.options từ JSON string
function parseOptions(optionsJson) { ... }

// Validate single field
function validateField(fieldDef, value) { ... }

// Split data into {fixed: {}, dynamic: {}}
function splitData(entity, data, fieldDefs) { ... }

// Merge fixed + dynamic into flat object
function mergeData(row, fieldDefs) { ... }

// Build SQL SET clause for dynamic update
function buildDynamicUpdate(entity, data, fieldDefs) { ... }
```

### 4.3 Files hiện tại cần sửa

#### 4.3.1 `app.js` — Mount routes mới

Thêm 8 route groups mới:

```javascript
// Dynamic Configuration
app.use('/api/field-definitions', require('./routes/fieldDefinitions'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/forms', require('./routes/formFields'));
app.use('/api/views', require('./routes/views'));
app.use('/api/views', require('./routes/viewFields'));

// File Management
app.use('/api/files', require('./routes/files'));

// Dynamic Engine
app.use('/api/dynamic', require('./routes/dynamicEngine'));

// Static file serving cho uploads
app.use('/uploads', express.static(path.join(__dirname, '../storage/uploads')));
```

#### 4.3.2 `routes/stations.js` — Hỗ trợ custom_data

Sửa GET `/api/stations` và GET `/api/stations/:id`:
- Đọc field_definitions cho entity `stations`
- Merge custom_data vào response
- Trả về `dynamic_fields` array kèm field definitions

Sửa POST/PUT:
- Nhận dynamic fields từ request body
- Validate theo field_definitions
- Tách fixed + dynamic → lưu vào custom_data

#### 4.3.3 `routes/proposals.js` — Tương tự stations

#### 4.3.4 `routes/myProposals.js` — Tương tự

#### 4.3.5 `routes/adminProposals.js` — Tương tự

#### 4.3.6 `routes/adminUsers.js` — Tương tự

#### 4.3.7 `routes/excel.js` — Dynamic export

Sửa export stations/proposals:
- Đọc view config thay vì hardcode columns
- Export theo field definitions + view_fields

#### 4.3.8 `routes/auth.js` — Profile với custom_data

Sửa PUT `/api/profile`:
- Nhận dynamic fields
- Lưu vào custom_data

#### 4.3.9 `middlewares/validators.js` — Dynamic validation

Thêm function:
```javascript
function validateDynamicFields(entity, data, fieldDefs) { ... }
```

---

## 5. FRONTEND IMPLEMENTATION

### 5.1 Cấu trúc mới

```
frontend/src/
├── components/
│   ├── MapView.jsx                    (giữ nguyên)
│   ├── ConfirmDialog.jsx              (giữ nguyên)
│   ├── EmptyState.jsx                 (giữ nguyên)
│   ├── ErrorMessage.jsx               (giữ nguyên)
│   ├── Loading.jsx                    (giữ nguyên)
│   ├── Pagination.jsx                 (giữ nguyên)
│   ├── Toast.jsx                      (giữ nguyên)
│   │
│   ├── dynamic/                       (NEW - Dynamic Components)
│   │   ├── DynamicForm.jsx            (NEW - Render form từ config)
│   │   ├── DynamicField.jsx           (NEW - Render field theo type)
│   │   ├── DynamicTable.jsx           (NEW - Render table từ config)
│   │   ├── DynamicFilter.jsx          (NEW - Render filter)
│   │   ├── FieldRenderer.jsx          (NEW - Hiển thị value theo type)
│   │   └── FileUpload.jsx             (NEW - Upload component)
│   │
│   └── admin/                         (NEW - Admin Builder Components)
│       ├── FieldManager.jsx           (NEW - Quản lý field definitions)
│       ├── FormBuilder.jsx            (NEW - Xây dựng form)
│       ├── ViewBuilder.jsx            (NEW - Xây dựng view/table)
│       └── DragDropList.jsx           (NEW - Drag & drop list)
│
├── pages/
│   ├── admin/
│   │   ├── AdminDashboard.jsx         (giữ nguyên)
│   │   ├── AdminUsersPage.jsx         (MODIFY - dùng dynamic form)
│   │   ├── AdminStationsPage.jsx      (MODIFY - dùng dynamic form)
│   │   ├── AdminProposalsPage.jsx     (MODIFY - dùng dynamic form)
│   │   │
│   │   ├── AdminFieldsPage.jsx        (NEW - Field Definitions Manager)
│   │   ├── AdminFormsPage.jsx         (NEW - Forms Manager)
│   │   ├── AdminFormBuilderPage.jsx   (NEW - Form Builder)
│   │   ├── AdminViewsPage.jsx         (NEW - Views Manager)
│   │   └── AdminViewBuilderPage.jsx   (NEW - View Builder)
│   │
│   └── user/
│       ├── MapPage.jsx                (MODIFY - dùng dynamic form)
│       ├── MyProposalsPage.jsx        (MODIFY - dùng dynamic form)
│       └── ProfilePage.jsx            (MODIFY - dùng dynamic form)
│
├── services/
│   └── api.js                         (MODIFY - thêm services mới)
│
└── layouts/
    └── AdminLayout.jsx                (MODIFY - thêm menu items mới)
```

### 5.2 Files mới cần tạo

#### 5.2.1 `components/dynamic/DynamicForm.jsx` (~200 dòng)

**Props:**
```javascript
{
  formId: Number,           // ID form config
  entityId: String,         // 'stations', 'users', ...
  initialData: Object,      // Dữ liệu ban đầu (edit mode)
  onSubmit: Function,       // Callback khi submit
  onCancel: Function,       // Callback khi cancel
  readOnly: Boolean         // Chế độ xem
}
```

**Behavior:**
1. Gọi API `GET /api/forms/:formId` để lấy config
2. Render từng field theo `form_fields.order_index`
3. Mỗi field render theo `field_definitions.type`
4. Validate trước khi submit
5. Gọi API validate server-side
6. Submit data

#### 5.2.2 `components/dynamic/DynamicField.jsx` (~150 dòng)

**Props:**
```javascript
{
  field: Object,            // field_definition object
  value: any,               // Current value
  onChange: Function,       // Callback
  error: String,            // Validation error
  disabled: Boolean
}
```

**Render theo type:**
| Type | Component |
|------|-----------|
| text | `<input type="text">` |
| textarea | `<textarea>` |
| number | `<input type="number">` |
| email | `<input type="email">` |
| phone | `<input type="tel">` |
| url | `<input type="url">` |
| date | `<input type="date">` |
| datetime | `<input type="datetime-local">` |
| boolean | `<input type="checkbox">` |
| select | `<select>` với options từ field_definition |
| multiselect | `<select multiple>` |
| file | `<FileUpload>` component |
| formula | `<input readonly>` với calculated value |

#### 5.2.3 `components/dynamic/DynamicTable.jsx` (~200 dòng)

**Props:**
```javascript
{
  viewId: Number,           // ID view config
  entityId: String,
  data: Array,              // Dữ liệu rows
  pagination: Object,       // {page, limit, total}
  onPageChange: Function,
  onSort: Function,
  onFilter: Function,
  onRowClick: Function,
  actions: Array            // [{label, onClick, icon}]
}
```

**Behavior:**
1. Gọi API `GET /api/views/:viewId` để lấy config columns
2. Render `<th>` theo `view_fields` (order, visible, width)
3. Render cell value theo `field_definitions.type` dùng `FieldRenderer`
4. Hỗ trợ sort, filter, pagination

#### 5.2.4 `components/dynamic/FieldRenderer.jsx` (~80 dòng)

Hiển thị giá trị readonly cho table/detail view:

| Type | Render |
|------|--------|
| text | Text plain |
| number | Number.toLocaleString() |
| boolean | ✓ / ✗ |
| select | Label từ options |
| file | Link download |
| date/datetime | formatDate() |

#### 5.2.5 `components/dynamic/FileUpload.jsx` (~120 dòng)

**Props:**
```javascript
{
  value: String/Array,       // file_id hoặc [file_id, ...]
  multiple: Boolean,
  maxFiles: Number,
  maxSize: Number,
  allowedExtensions: Array,
  onChange: Function
}
```

**Behavior:**
1. Hiển thị nút "Chọn file" + drag-and-drop area
2. Validate client-side (size, extension, count)
3. Upload via `POST /api/files/upload`
4. Trả về file_id
5. Hiển thị preview (image) hoặc icon (pdf, etc)

#### 5.2.6 `components/admin/FieldManager.jsx` (~250 dòng)

Quản lý field definitions:
- Bảng danh sách fields (filter theo entity)
- Form tạo/sửa field
- Toggle active/inactive
- Xem trước field options

#### 5.2.7 `components/admin/FormBuilder.jsx` (~300 dòng)

Form Builder với drag-and-drop:
- Chọn form (hoặc tạo mới)
- Panel bên trái: danh sách available fields (từ field_definitions)
- Panel bêntright: form layout (kéo field vào)
- Config mỗi field: visible, order, colSpan, className
- Lưu vào form_fields

#### 5.2.8 `components/admin/ViewBuilder.jsx` (~300 dòng)

View Builder:
- Chọn view (hoặc tạo mới)
- Panel bên trái: available fields
- Panel bên phải: table columns
- Config: visible, order, width, sortable, filterable
- Lưu vào view_fields

#### 5.2.9 `components/admin/DragDropList.jsx` (~100 dòng)

Reusable drag-and-drop list:
- Dùng HTML5 Drag and Drop API (không cần library bên ngoài)
- Hỗ trợ reorder, add, remove
- Render item tùy chỉnh

### 5.3 Pages mới cần tạo

#### 5.3.1 `pages/admin/AdminFieldsPage.jsx` (~150 dòng)

```
/ admin / fields
```

- Hiển thị FieldManager component
- Header: "Quản lý Field Definitions"
- Filter theo entity dropdown

#### 5.3.2 `pages/admin/AdminFormsPage.jsx` (~100 dòng)

```
/ admin / forms
```

- Bảng danh sách forms
- Nút "Tạo Form mới"
- Link tới FormBuilder

#### 5.3.3 `pages/admin/AdminFormBuilderPage.jsx` (~80 dòng)

```
/ admin / forms / :id / edit
```

- Hiển thị FormBuilder component
- Parameter: form ID từ URL

#### 5.3.4 `pages/admin/AdminViewsPage.jsx` (~100 dòng)

```
/ admin / views
```

- Bảng danh sách views
- Nút "Tạo View mới"
- Link tới ViewBuilder

#### 5.3.5 `pages/admin/AdminViewBuilderPage.jsx` (~80 dòng)

```
/ admin / views / :id / edit
```

- Hiển thị ViewBuilder component

### 5.4 Files hiện tại cần sửa

#### 5.4.1 `App.jsx` — Thêm routes mới

```jsx
// Admin Dynamic Configuration
<Route path="fields" element={<AdminFieldsPage />} />
<Route path="forms" element={<AdminFormsPage />} />
<Route path="forms/:id/edit" element={<AdminFormBuilderPage />} />
<Route path="views" element={<AdminViewsPage />} />
<Route path="views/:id/edit" element={<AdminViewBuilderPage />} />
```

#### 5.4.2 `layouts/AdminLayout.jsx` — Thêm menu items

```jsx
// Thêm vào sidebar menu
{ path: '/admin/fields', label: 'Field Definitions', icon: '...' }
{ path: '/admin/forms', label: 'Form Builder', icon: '...' }
{ path: '/admin/views', label: 'View Builder', icon: '...' }
```

#### 5.4.3 `services/api.js` — Thêm services mới

```javascript
// Dynamic Configuration
export const fieldDefinitionService = { ... }
export const formService = { ... }
export const formFieldService = { ... }
export const viewService = { ... }
export const viewFieldService = { ... }

// File Management
export const fileService = {
  upload(file, entityId, recordId) { ... },
  getMetadata(id) { ... },
  download(id) { ... },
  delete(id) { ... }
}

// Dynamic Engine
export const dynamicService = {
  getFormConfig(formId) { ... },
  getViewConfig(viewId) { ... },
  validate(entity, data) { ... }
}
```

#### 5.4.4 Pages hiện tại — Tùy chọn refactor

Có 2 cách tiếp cận:

**Cách A: Thay thế dần (Recommended)**
- Mỗi page hiện tại vẫn giữ logic của riêng mình
- Khi admin đã cấu hình xong form/view, chuyển page sang dùng DynamicForm/DynamicTable
- Timeline: Sau khi Phase 5 hoàn thành

**Cách B: Thay thế ngay**
- Sửa AdminStationsPage, AdminProposalsPage, AdminUsersPage dùng DynamicForm/DynamicTable ngay
- Timeline:parallel với Phase 5

---

## 6. CHI TIẾT TỪNG PHASE

### Phase 1: Database Migration

| Task | File | Effort |
|------|------|--------|
| Tạo migration 04 | `04-add-custom-data.sql` | 15 phút |
| Tạo migration 05 | `05-create-field-definitions.sql` | 30 phút |
| Tạo migration 06 | `06-create-forms.sql` | 30 phút |
| Tạo migration 07 | `07-create-views.sql` | 30 phút |
| Tạo migration 08 | `08-create-files.sql` | 20 phút |
| Tạo migration 09 | `09-seed-field-definitions.sql` | 30 phút |
| Test migrations | Docker MySQL | 30 phút |
| **Tổng** | | **~3 giờ** |

### Phase 2: Backend CRUD cho Dynamic Configuration

| Task | File | Effort |
|------|------|--------|
| Tạo fieldDefinitions.js | CRUD 7 endpoints | 2 giờ |
| Tạo forms.js | CRUD 5 endpoints | 1.5 giờ |
| Tạo formFields.js | CRUD 5 endpoints | 1.5 giờ |
| Tạo views.js | CRUD 5 endpoints | 1.5 giờ |
| Tạo viewFields.js | CRUD 5 endpoints | 1.5 giờ |
| Mount routes trong app.js | app.js | 30 phút |
| Test tất cả CRUD APIs | Postman/curl | 1 giờ |
| **Tổng** | | **~9.5 giờ** |

### Phase 3: Backend Generic Engine

| Task | File | Effort |
|------|------|--------|
| Tạo dynamicUtils.js | Helper functions | 1.5 giờ |
| Tạo dynamicEngine.js | 3 endpoints | 2 giờ |
| Tạo files.js | Upload/download/delete | 2 giờ |
| Config multer + storage | storage/uploads | 1 giờ |
| Thêm static file serving | app.js | 30 phút |
| Sửa stations.js | Hỗ trợ custom_data | 1.5 giờ |
| Sửa proposals.js | Hỗ trợ custom_data | 1 giờ |
| Sửa myProposals.js | Hỗ trợ custom_data | 1 giờ |
| Sửa adminProposals.js | Hỗ trợ custom_data | 1 giờ |
| Sửa adminUsers.js | Hỗ trợ custom_data | 1 giờ |
| Sửa auth.js | Profile custom_data | 30 phút |
| Sửa validators.js | Dynamic validation | 1 giờ |
| **Tổng** | | **~13.5 giờ** |

### Phase 4: Frontend Admin Pages

| Task | File | Effort |
|------|------|--------|
| Tạo DragDropList.jsx | Reusable DnD | 2 giờ |
| Tạo FieldManager.jsx | Field CRUD UI | 3 giờ |
| Tạo FormBuilder.jsx | Form Builder UI | 4 giờ |
| Tạo ViewBuilder.jsx | View Builder UI | 4 giờ |
| Tạo AdminFieldsPage.jsx | Page wrapper | 30 phút |
| Tạo AdminFormsPage.jsx | Page wrapper | 30 phút |
| Tạo AdminFormBuilderPage.jsx | Page wrapper | 30 phút |
| Tạo AdminViewsPage.jsx | Page wrapper | 30 phút |
| Tạo AdminViewBuilderPage.jsx | Page wrapper | 30 phút |
| Sửa AdminLayout.jsx | Thêm menu | 30 phút |
| Sửa App.jsx | Thêm routes | 30 phút |
| **Tổng** | | **~15 giờ** |

### Phase 5: Frontend Dynamic Components

| Task | File | Effort |
|------|------|--------|
| Tạo DynamicField.jsx | Field renderer | 2 giờ |
| Tạo FieldRenderer.jsx | Display renderer | 1 giờ |
| Tạo FileUpload.jsx | Upload component | 2 giờ |
| Tạo DynamicForm.jsx | Form renderer | 3 giờ |
| Tạo DynamicTable.jsx | Table renderer | 3 giờ |
| Tạo DynamicFilter.jsx | Filter component | 1.5 giờ |
| Sửa api.js | Thêm services | 1 giờ |
| **Tổng** | | **~13.5 giờ** |

### Phase 6: Integration

| Task | Effort |
|------|--------|
| Sửa AdminStationsPage dùng DynamicForm/DynamicTable | 2 giờ |
| Sửa AdminProposalsPage | 1.5 giờ |
| Sửa AdminUsersPage | 1.5 giờ |
| Sửa MyProposalsPage | 1 giờ |
| Sửa ProfilePage | 1 giờ |
| Sửa MapPage | 1 giờ |
| **Tổng** | **~8 giờ** |

### Phase 7: Excel Dynamic

| Task | Effort |
|------|--------|
| Sửa excel.js export theo view config | 2 giờ |
| Sửa excel.js import theo form config | 2 giờ |
| **Tổng** | **~4 giờ** |

### Phase 8: Testing & Fixes

| Task | Effort |
|------|--------|
| Test toàn bộ CRUD APIs | 2 giờ |
| Test form builder flow | 2 giờ |
| Test view builder flow | 2 giờ |
| Test file upload/download | 1 giờ |
| Test dynamic form rendering | 1 giờ |
| Test dynamic table rendering | 1 giờ |
| Fix bugs | 3 giờ |
| **Tổng** | **~12 giờ** |

---

### Tổng kết Effort

| Phase | Effort | Blocker |
|-------|--------|---------|
| Phase 1: Database | 3 giờ | — |
| Phase 2: Backend CRUD Config | 9.5 giờ | Phase 1 |
| Phase 3: Backend Engine | 13.5 giờ | Phase 2 |
| Phase 4: Frontend Admin | 15 giờ | Phase 2 |
| Phase 5: Frontend Dynamic | 13.5 giờ | Phase 3 |
| Phase 6: Integration | 8 giờ | Phase 4 + 5 |
| Phase 7: Excel Dynamic | 4 giờ | Phase 3 |
| Phase 8: Testing | 12 giờ | Tất cả |
| **Tổng** | **~78.5 giờ** | |

**Timeline ước tính:** 10-14 ngày làm việc (6-8 giờ/ngày)

---

## 7. API SPECIFICATION

### 7.1 Field Definitions

```
GET /api/field-definitions
Query: ?entity=stations&status=active
Response: {
  success: true,
  data: [{
    id: 1,
    entity: "stations",
    key: "antenna_height",
    label: "Chiều cao anten",
    type: "number",
    source_type: "json",
    required: false,
    validation: null,
    options: null,
    formula: null,
    status: "active"
  }],
  pagination: { page, limit, total }
}

POST /api/field-definitions
Body: {
  entity: "stations",
  key: "antenna_height",
  label: "Chiều cao anten",
  type: "number",
  source_type: "json",
  required: false,
  validation: { min: 0, max: 100 },
  options: null
}
Response: { success: true, data: { id, ... } }
```

### 7.2 Forms

```
GET /api/forms?entity=station_proposals
Response: {
  success: true,
  data: [{ id, entity, name, description, status }]
}

GET /api/forms/:id
Response: {
  success: true,
  data: {
    id: 1,
    entity: "station_proposals",
    name: "Tạo đề xuất trạm",
    fields: [{
      id: 1,
      field_id: 4,
      order_index: 0,
      visible: true,
      config: null,
      field: {
        key: "investment_cost",
        label: "Chi phí đầu tư",
        type: "number",
        required: true,
        validation: { min: 0 }
      }
    }]
  }
}
```

### 7.3 Views

```
GET /api/views/:id
Response: {
  success: true,
  data: {
    id: 1,
    entity: "station_proposals",
    name: "Bảng đề xuất",
    fields: [{
      id: 1,
      field_id: 4,
      order_index: 0,
      visible: true,
      width: 150,
      sortable: true,
      filterable: false,
      field: { key, label, type, options }
    }]
  }
}
```

### 7.4 Files

```
POST /api/files/upload
Content-Type: multipart/form-data
Body: file + entityId + recordId
Response: {
  success: true,
  data: {
    id: "f001",
    original_name: "giay_phep.pdf",
    storage_key: "station_proposals/123/f001.pdf",
    mime_type: "application/pdf",
    size: 2457600
  }
}

GET /api/files/:id/download
Response: Binary file stream
```

### 7.5 Dynamic Engine

```
GET /api/dynamic/:entity/form/:formId
Response: {
  success: true,
  data: {
    form: { id, name, entity },
    fields: [{
      key: "investment_cost",
      label: "Chi phí đầu tư",
      type: "number",
      required: true,
      validation: { min: 0 },
      order_index: 0,
      visible: true,
      config: null
    }]
  }
}

POST /api/dynamic/:entity/validate
Body: { formId: 1, data: { investment_cost: -100 } }
Response: {
  success: false,
  errors: [{ field: "investment_cost", message: "Giá trị phải >= 0" }]
}
```

---

## 8. TESTING STRATEGY

### 8.1 Manual Testing Checklist

#### Database
- [ ] Migration 04: custom_data columns added to 3 tables
- [ ] Migration 05: field_definitions table created, unique constraint works
- [ ] Migration 06: forms + form_fields created, FK cascade works
- [ ] Migration 07: views + view_fields created
- [ ] Migration 08: files table created
- [ ] Migration 09: seed data inserted correctly

#### Backend APIs
- [ ] CRUD field_definitions (7 endpoints)
- [ ] CRUD forms (5 endpoints)
- [ ] CRUD form_fields (5 endpoints)
- [ ] CRUD views (5 endpoints)
- [ ] CRUD view_fields (5 endpoints)
- [ ] File upload (POST /api/files/upload)
- [ ] File download (GET /api/files/:id/download)
- [ ] File delete (DELETE /api/files/:id)
- [ ] Dynamic form config (GET /api/dynamic/:entity/form/:formId)
- [ ] Dynamic view config (GET /api/dynamic/:entity/view/:viewId)
- [ ] Dynamic validation (POST /api/dynamic/:entity/validate)
- [ ] Stations CRUD với custom_data
- [ ] Proposals CRUD với custom_data
- [ ] Users CRUD với custom_data
- [ ] Excel export theo view config
- [ ] Excel import theo form config

#### Frontend
- [ ] Field Manager: tạo/sửa/xóa field definition
- [ ] Form Builder: kéo field vào form, sắp xếp, lưu
- [ ] View Builder: kéo field vào view, cấu hình width/sortable, lưu
- [ ] Dynamic Form: render form từ config, validate, submit
- [ ] Dynamic Table: render table từ config, sort, filter, pagination
- [ ] File Upload: upload, preview, xóa
- [ ] Existing pages vẫn hoạt động sau refactor

### 8.2 Regression Testing

| Feature | Test Case | Expected |
|---------|-----------|----------|
| Login | Đăng nhập với đúng credentials | Thành công |
| Login | Đăng nhập sai password | Lỗi 401 |
| Map | Hiển thị markers stations | Xanh/Vàng theo status |
| Map | Click tạo đề xuất | Mở form |
| Stations | Admin CRUD stations | Thành công |
| Stations | User không tạo được station | Lỗi 403 |
| Proposals | User tạo proposal | Thành công |
| My Proposals | User xem/sửa/xóa proposal | Thành công |
| My Proposals | User sửa proposal không phải PENDING | Lỗi |
| Excel | Export stations | File Excel đúng format |
| Excel | Import stations | Preview → Confirm → Thành công |
| Dashboard | Hiển thị stats | Số liệu đúng |

---

## 9. RỦI RO & MITIGATION

| # | Rủi ro | Impact | Probability | Mitigation |
|---|--------|--------|-------------|------------|
| 1 | Migration phá vỡ dữ liệu hiện tại | CAO | THẤP | ALTER TABLE ADD COLUMN an toàn, KHÔNG DROP |
| 2 | Frontend refactor quá lớn,引入 regressions | CAO | TRUNG BÌNH | Implement dần, giữ backward compatibility |
| 3 | Custom_data JSON query性能 thấp | TRUNG BÌNH | CAO | Chỉ query khi cần, cache field_definitions |
| 4 | File upload bảo mật lỏng lẻo | CAO | TRUNG BÌNH | Validate ở backend, auth check khi download |
| 5 | Form Builder UI phức tạp | TRUNG BÌNH | CAO | Bắt đầu với simple version, improve sau |
| 6 | Không backward compatible với code hiện tại | CAO | THẤP | Giữ API cũ, thêm API mới song song |
| 7 | MySQL JSON không support index đầy đủ | THẤP | TRUNG BÌNH | Generated column cho field cần search |

---

## APPENDIX: Mapping hiện tại → tương lai

### Current Hardcoded → Future Dynamic

| Hiện tại | Tương lai | File ảnh hưởng |
|----------|-----------|----------------|
| AdminStationsPage form | DynamicForm (formId=1) | AdminStationsPage.jsx |
| AdminStationsPage table | DynamicTable (viewId=1) | AdminStationsPage.jsx |
| AdminProposalsPage form | DynamicForm (formId=2) | AdminProposalsPage.jsx |
| AdminProposalsPage table | DynamicTable (viewId=2) | AdminProposalsPage.jsx |
| AdminUsersPage form | DynamicForm (formId=3) | AdminUsersPage.jsx |
| AdminUsersPage table | DynamicTable (viewId=3) | AdminUsersPage.jsx |
| validators.js hardcode | field_definitions.validation | validators.js |
| Excel hardcode columns | view_fields config | excel.js |

### Field Type Mapping

| Current Hardcoded Input | Dynamic Type | Options Source |
|------------------------|--------------|----------------|
| `<input type="text">` | text | — |
| `<textarea>` | textarea | — |
| `<input type="number">` | number | — |
| `<select>` với options cứng | select | field_definitions.options |
| `<input type="file">` | file | field_definitions.validation |
