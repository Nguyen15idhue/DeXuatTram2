# DYNAMIC FORM & DATA — CÁC BƯỚC CẦN THỰC HIỆN

**Ngày tạo:** 2026-08-30
**Phiên bản:** 1.0
**Trạng thái:** Sẵn sàng thực hiện

---

## PHASE 1: DATABASE MIGRATION

### Yêu cầu
- Tạo 6 file SQL migration (04-09)
- KHÔNG DROP TABLE — chỉ ALTER TABLE ADD COLUMN hoặc CREATE TABLE mới
- Chạy migration trên MySQL Docker, verify không lỗi
- Seed data cho field_definitions

### Bước thực hiện

#### Bước 1.1: Tạo file `database/04-add-custom-data.sql`
```sql
ALTER TABLE users ADD COLUMN custom_data JSON DEFAULT NULL;
ALTER TABLE stations ADD COLUMN custom_data JSON DEFAULT NULL;
ALTER TABLE station_proposals ADD COLUMN custom_data JSON DEFAULT NULL;
```
**Kiểm tra:** `SHOW COLUMNS FROM stations LIKE 'custom_data';` → phải có dòng custom_data

#### Bước 1.2: Tạo file `database/05-create-field-definitions.sql`
```sql
CREATE TABLE field_definitions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(100) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'text',
    source_type VARCHAR(20) NOT NULL DEFAULT 'json',
    required TINYINT(1) NOT NULL DEFAULT 0,
    validation JSON DEFAULT NULL,
    options JSON DEFAULT NULL,
    formula VARCHAR(500) DEFAULT NULL,
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
**Kiểm tra:** `SHOW TABLES LIKE 'field_definitions';` → phải có
**Kiểm tra:** Thêm 2 field cùng entity+key → phải lỗi duplicate key

#### Bước 1.3: Tạo file `database/06-create-forms.sql`
```sql
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
    config JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_form_id (form_id),
    INDEX idx_field_id (field_id),
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
**Kiểm tra:** Xóa form → form_fields tự xóa (CASCADE)

#### Bước 1.4: Tạo file `database/07-create-views.sql`
```sql
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
    width INT DEFAULT NULL,
    sortable TINYINT(1) NOT NULL DEFAULT 1,
    filterable TINYINT(1) NOT NULL DEFAULT 0,
    config JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_view_id (view_id),
    INDEX idx_field_id (field_id),
    FOREIGN KEY (view_id) REFERENCES views(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### Bước 1.5: Tạo file `database/08-create-files.sql`
```sql
CREATE TABLE files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_name VARCHAR(500) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
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

#### Bước 1.6: Tạo file `database/09-seed-field-definitions.sql`
```sql
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('stations', 'antenna_height', 'Chiều cao anten', 'number', 'json', 0),
('stations', 'tower_type', 'Loại cột', 'select', 'json', 0),
('stations', 'power_capacity', 'Công suất', 'number', 'json', 0);

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('station_proposals', 'investment_cost', 'Chi phí đầu tư', 'number', 'json', 0),
('station_proposals', 'legal_document', 'Hồ sơ pháp lý', 'file', 'json', 0),
('station_proposals', 'site_images', 'Hình ảnh hiện trường', 'file', 'json', 0);

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('users', 'employee_code', 'Mã nhân viên', 'text', 'json', 0),
('users', 'department', 'Phòng ban', 'select', 'json', 0),
('users', 'avatar', 'Ảnh đại diện', 'file', 'json', 0);
```

#### Bước 1.7: Chạy migration và verify
```bash
docker compose exec mysql mysql -u root -proot station_db < database/04-add-custom-data.sql
docker compose exec mysql mysql -u root -proot station_db < database/05-create-field-definitions.sql
docker compose exec mysql mysql -u root -proot station_db < database/06-create-forms.sql
docker compose exec mysql mysql -u root -proot station_db < database/07-create-views.sql
docker compose exec mysql mysql -u root -proot station_db < database/08-create-files.sql
docker compose exec mysql mysql -u root -proot station_db < database/09-seed-field-definitions.sql
```

### Checklist Phase 1
- [ ] custom_data column có trong users, stations, station_proposals
- [ ] field_definitions table tồn tại + unique constraint hoạt động
- [ ] forms + form_fields tồn tại + FK cascade hoạt động
- [ ] views + view_fields tồn tại + FK cascade hoạt động
- [ ] files table tồn tại
- [ ] Seed data 9 field_definitions đã insert
- [ ] existing data không bị ảnh hưởng

---

## PHASE 2: BACKEND CRUD CHO DYNAMIC CONFIGURATION

### Yêu cầu
- Tạo 5 route files mới: fieldDefinitions.js, forms.js, formFields.js, views.js, viewFields.js
- Mỗi file có đầy đủ CRUD endpoints
- Tất cả endpoints phải có Swagger JSDoc comments
- Mount routes trong app.js

### Bước thực hiện

#### Bước 2.1: Tạo `routes/fieldDefinitions.js`

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/field-definitions` | admin | List all, filter by entity/status |
| GET | `/api/field-definitions/:id` | admin | Get one |
| GET | `/api/field-definitions/entity/:entity` | public | Get by entity |
| POST | `/api/field-definitions` | admin | Create |
| PUT | `/api/field-definitions/:id` | admin | Update |
| DELETE | `/api/field-definitions/:id` | admin | Delete |
| PATCH | `/api/field-definitions/:id/status` | admin | Toggle active/inactive |

**Validate:** entity không rỗng, key không rỗng, type trong danh sách cho phép

#### Bước 2.2: Tạo `routes/forms.js`

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/forms` | admin | List all, filter by entity |
| GET | `/api/forms/:id` | public | Get form + fields |
| POST | `/api/forms` | admin | Create form |
| PUT | `/api/forms/:id` | admin | Update form |
| DELETE | `/api/forms/:id` | admin | Delete form (CASCADE form_fields) |

#### Bước 2.3: Tạo `routes/formFields.js`

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/forms/:formId/fields` | public | Get fields of form |
| POST | `/api/forms/:formId/fields` | admin | Add field to form |
| PUT | `/api/forms/:formId/fields/:id` | admin | Update field config |
| DELETE | `/api/forms/:formId/fields/:id` | admin | Remove field from form |
| PUT | `/api/forms/:formId/fields/reorder` | admin | Reorder fields |

#### Bước 2.4: Tạo `routes/views.js`

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/views` | admin | List all, filter by entity |
| GET | `/api/views/:id` | public | Get view + fields |
| POST | `/api/views` | admin | Create view |
| PUT | `/api/views/:id` | admin | Update view |
| DELETE | `/api/views/:id` | admin | Delete view (CASCADE view_fields) |

#### Bước 2.5: Tạo `routes/viewFields.js`

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/views/:viewId/fields` | public | Get fields of view |
| POST | `/api/views/:viewId/fields` | admin | Add field to view |
| PUT | `/api/views/:viewId/fields/:id` | admin | Update field config |
| DELETE | `/api/views/:viewId/fields/:id` | admin | Remove field from view |
| PUT | `/api/views/:viewId/fields/reorder` | admin | Reorder fields |

#### Bước 2.6: Mount routes trong `app.js`
```javascript
app.use('/api/field-definitions', require('./routes/fieldDefinitions'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/forms', require('./routes/formFields'));
app.use('/api/views', require('./routes/views'));
app.use('/api/views', require('./routes/viewFields'));
```

#### Bước 2.7: Test tất cả CRUD APIs qua Swagger UI

### Checklist Phase 2
- [ ] fieldDefinitions: 7 endpoints hoạt động
- [ ] forms: 5 endpoints hoạt động
- [ ] formFields: 5 endpoints hoạt động
- [ ] views: 5 endpoints hoạt động
- [ ] viewFields: 5 endpoints hoạt động
- [ ] Swagger UI hiển thị tất cả endpoints mới
- [ ] Pagination hoạt động cho list endpoints
- [ ] Auth check: user không gọi được admin endpoints
- [ ] CASCADE: xóa form/view → fields tự xóa

---

## PHASE 3: BACKEND GENERIC ENGINE

### Yêu cầu
- Tạo `utils/dynamicUtils.js` — helper functions
- Tạo `routes/dynamicEngine.js` — core engine
- Tạo `routes/files.js` — file upload/download/delete
- Tạo thư mục `storage/uploads/` trên host
- Sửa 8 route files hiện tại hỗ trợ custom_data

### Bước thực hiện

#### Bước 3.1: Tạo `utils/dynamicUtils.js`

```javascript
// Các functions cần có:
parseOptions(optionsJson)      // Parse JSON options
validateField(fieldDef, value) // Validate 1 field
validateData(entity, data, fieldDefs) // Validate all fields
splitData(entity, data, fieldDefs)    // Tách fixed vs dynamic
mergeData(row, fieldDefs)             // Merge fixed + custom_data
buildDynamicSetClause(data, fieldDefs) // Build SQL SET
```

#### Bước 3.2: Tạo `routes/dynamicEngine.js`

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/dynamic/:entity/form/:formId` | public | Render form config |
| GET | `/api/dynamic/:entity/view/:viewId` | public | Render view config |
| POST | `/api/dynamic/:entity/validate` | auth | Validate data |

#### Bước 3.3: Tạo `routes/files.js`

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| POST | `/api/files/upload` | auth | Upload file (multer) |
| GET | `/api/files/:id` | auth | Get file metadata |
| GET | `/api/files/:id/download` | auth | Download file |
| DELETE | `/api/files/:id` | auth | Soft delete file |

**Config multer:**
```javascript
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../storage/uploads', req.body.entityId || 'general');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
```

**Storage path:** `storage/uploads/{entity}/{record_id}/{file_id}.{ext}`

#### Bước 3.4: Tạo thư mục `storage/uploads/`
```bash
mkdir -p storage/uploads
# Thêm vào .gitignore
echo "storage/uploads/*" >> .gitignore
```

#### Bước 3.5: Thêm static file serving vào `app.js`
```javascript
app.use('/uploads', express.static(path.join(__dirname, '../storage/uploads')));
```

#### Bước 3.6: Sửa các route files hiện tại

**stations.js:**
- GET: merge custom_data + field_definitions vào response
- POST/PUT: tách dynamic fields → lưu custom_data

**proposals.js:** Tương tự stations

**myProposals.js:** Tương tự

**adminProposals.js:** Tương tự

**adminUsers.js:** Tương tự

**auth.js:** PUT /profile hỗ trợ custom_data

**validators.js:** Thêm `validateDynamicFields(entity, data, fieldDefs)`

### Checklist Phase 3
- [ ] dynamicUtils.js: tất cả functions hoạt động
- [ ] dynamicEngine: GET form config trả về đúng data
- [ ] dynamicEngine: GET view config trả về đúng data
- [ ] dynamicEngine: POST validate trả về errors đúng
- [ ] files: upload thành công, file lưu đúng path
- [ ] files: download trả về binary stream
- [ ] files: delete soft delete + file vật lý xóa
- [ ] storage/uploads/ tồn tại + .gitignore
- [ ] stations CRUD hoạt động với custom_data
- [ ] proposals CRUD hoạt động với custom_data
- [ ] users CRUD hoạt động với custom_data
- [ ] Auth profile hoạt động với custom_data
- [ ] Existing features không bị regress

---

## PHASE 4: FRONTEND ADMIN PAGES

### Yêu cầu
- Tạo 4 components mới: DragDropList, FieldManager, FormBuilder, ViewBuilder
- Tạo 5 pages mới: AdminFieldsPage, AdminFormsPage, AdminFormBuilderPage, AdminViewsPage, AdminViewBuilderPage
- Sửa App.jsx thêm routes
- Sửa AdminLayout.jsx thêm menu items

### Bước thực hiện

#### Bước 4.1: Tạo `components/admin/DragDropList.jsx`
- HTML5 Drag and Drop API (không cần library)
- Props: items, onReorder, renderItem, onAdd, onRemove
- Hỗ trợ reorder, add, remove

#### Bước 4.2: Tạo `components/admin/FieldManager.jsx`
- Table danh sách field definitions
- Filter theo entity dropdown
- Form tạo/sửa field
- Toggle active/inactive
- Validation: entity không rỗng, key không rỗng

#### Bước 4.3: Tạo `components/admin/FormBuilder.jsx`
- Panel trái: available fields (từ field_definitions)
- Panel phải: form layout (kéo field vào)
- Config mỗi field: visible, order, colSpan, className
- Nút lưu → POST/PUT /api/forms + /api/forms/:id/fields

#### Bước 4.4: Tạo `components/admin/ViewBuilder.jsx`
- Panel trái: available fields
- Panel phải: table columns
- Config: visible, order, width, sortable, filterable
- Nút lưu → POST/PUT /api/views + /api/views/:id/fields

#### Bước 4.5: Tạo 5 pages mới
- AdminFieldsPage.jsx → FieldManager
- AdminFormsPage.jsx → table forms + link builder
- AdminFormBuilderPage.jsx → FormBuilder
- AdminViewsPage.jsx → table views + link builder
- AdminViewBuilderPage.jsx → ViewBuilder

#### Bước 4.6: Sửa `App.jsx`
```jsx
<Route path="fields" element={<AdminFieldsPage />} />
<Route path="forms" element={<AdminFormsPage />} />
<Route path="forms/:id/edit" element={<AdminFormBuilderPage />} />
<Route path="views" element={<AdminViewsPage />} />
<Route path="views/:id/edit" element={<AdminViewBuilderPage />} />
```

#### Bước 4.7: Sửa `layouts/AdminLayout.jsx`
Thêm menu parent "Cấu hình" với 5 submenu items:

```jsx
// Menu structure
{
  label: 'Cấu hình',
  icon: '⚙️',
  children: [
    { path: '/admin/fields', label: 'Field Definitions' },
    { path: '/admin/forms', label: 'Forms Manager' },
    { path: '/admin/forms/:id/edit', label: 'Form Builder', hidden: true },
    { path: '/admin/views', label: 'Views Manager' },
    { path: '/admin/views/:id/edit', label: 'View Builder', hidden: true },
  ]
}
```

**Lưu ý:** Form Builder và View Builder là deep link pages (chỉ hiển thị khi navigate tới), không hiển thị trong menu. Menu chỉ hiện 3 items: Field Definitions, Forms Manager, Views Manager.

### Checklist Phase 4
- [ ] DragDropList: reorder hoạt động
- [ ] FieldManager: CRUD field definitions
- [ ] FormBuilder: kéo field vào form, lưu thành công
- [ ] ViewBuilder: kéo field vào view, lưu thành công
- [ ] Tất cả pages render đúng
- [ ] Routes hoạt động
- [ ] Menu "Cấu hình" hiển thị với submenu
- [ ] Submenu items hoạt động đúng

---

## PHASE 5: FRONTEND DYNAMIC COMPONENTS

### Yêu cầu
- Tạo 6 components mới: DynamicField, FieldRenderer, FileUpload, DynamicForm, DynamicTable, DynamicFilter
- Sửa api.js thêm services mới

### Bước thực hiện

#### Bước 5.1: Tạo `components/dynamic/DynamicField.jsx`
- Render input theo field.type: text, textarea, number, email, phone, url, date, datetime, boolean, select, multiselect, file, formula
- Props: field, value, onChange, error, disabled

#### Bước 5.2: Tạo `components/dynamic/FieldRenderer.jsx`
- Hiển thị value readonly cho table/detail
- number: toLocaleString(), boolean: ✓/✗, select: label

#### Bước 5.3: Tạo `components/dynamic/FileUpload.jsx`
- Nút "Chọn file" + drag-and-drop
- Validate client-side (size, extension, count)
- Upload qua POST /api/files/upload
- Preview image hoặc icon

#### Bước 5.4: Tạo `components/dynamic/DynamicForm.jsx`
- Gọi GET /api/dynamic/:entity/form/:formId
- Render fields theo order_index
- Validate client-side + server-side
- Submit data

#### Bước 5.5: Tạo `components/dynamic/DynamicTable.jsx`
- Gọi GET /api/dynamic/:entity/view/:viewId
- Render th theo view_fields
- Sort, filter, pagination

#### Bước 5.6: Tạo `components/dynamic/DynamicFilter.jsx`
- Render filter từ view_fields.filterable
- Support text, select, date range

#### Bước 5.7: Sửa `services/api.js`
Thêm: fieldDefinitionService, formService, formFieldService, viewService, viewFieldService, fileService, dynamicService

### Checklist Phase 5
- [ ] DynamicField render đúng cho mỗi type
- [ ] FieldRenderer hiển thị đúng
- [ ] FileUpload upload + preview hoạt động
- [ ] DynamicForm render form từ config
- [ ] DynamicTable render table từ config
- [ ] DynamicFilter hoạt động
- [ ] api.js services hoạt động

---

## PHASE 6: INTEGRATION

### Yêu cầu
- Sửa existing pages dùng dynamic components
- Giữ backward compatibility

### Bước thực hiện

#### Bước 6.1: Sửa AdminStationsPage
- Form tạo/sửa → DynamicForm
- Table → DynamicTable

#### Bước 6.2: Sửa AdminProposalsPage
- Tương tự

#### Bước 6.3: Sửa AdminUsersPage
- Tương tự

#### Bước 6.4: Sửa MyProposalsPage
- Tương tự

#### Bước 6.5: Sửa ProfilePage
- Form sửa profile → DynamicForm

#### Bước 6.6: Sửa MapPage
- Form tạo đề xuất → DynamicForm

### Checklist Phase 6
- [ ] AdminStationsPage hoạt động với dynamic
- [ ] AdminProposalsPage hoạt động với dynamic
- [ ] AdminUsersPage hoạt động với dynamic
- [ ] MyProposalsPage hoạt động với dynamic
- [ ] ProfilePage hoạt động với dynamic
- [ ] MapPage hoạt động với dynamic
- [ ] Không có regress

---

## PHASE 7: EXCEL DYNAMIC

### Yêu cầu
- Sửa excel.js: export + import cho cả 3 entity (stations, proposals, users)
- Export theo view config (view_fields)
- Import theo form config (field_definitions)
- Template download cho từng entity

### Bước thực hiện

#### Bước 7.1: Export Stations
- Đọc view config `views.entity = 'stations'`
- Export theo view_fields (column order, visible)
- Dynamic columns từ field_definitions

#### Bước 7.2: Import Stations
- Đọc form config `forms.entity = 'stations'`
- Validate theo field_definitions
- Preview → Confirm

#### Bước 7.3: Export Proposals
- Đọc view config `views.entity = 'station_proposals'`
- Export theo view_fields
- Dynamic columns từ field_definitions

#### Bước 7.4: Import Proposals
- Đọc form config `forms.entity = 'station_proposals'`
- Validate theo field_definitions
- Preview → Confirm

#### Bước 7.5: Export Users
- Đọc view config `views.entity = 'users'`
- Export theo view_fields
- Dynamic columns từ field_definitions

#### Bước 7.6: Import Users
- Đọc form config `forms.entity = 'users'`
- Validate theo field_definitions
- Preview → Confirm

#### Bước 7.7: Template download cho từng entity
- GET `/api/admin/excel/template?entity=stations`
- GET `/api/admin/excel/template?entity=station_proposals`
- GET `/api/admin/excel/template?entity=users`

### API endpoints hiện tại cần sửa

| Endpoint | Thay đổi |
|----------|----------|
| `GET /api/admin/excel/export/stations` | Đọc view config thay vì hardcode |
| `GET /api/admin/excel/export/proposals` | Đọc view config |
| `GET /api/admin/excel/export/users` | **NEW** — Export users |
| `GET /api/admin/excel/template` | Thêm param `?entity=` |
| `POST /api/admin/excel/import/preview` | Validate theo form config |
| `POST /api/admin/excel/import/confirm` | Import theo form config |

### Checklist Phase 7
- [ ] Export stations theo view config
- [ ] Export proposals theo view config
- [ ] Export users theo view config (NEW)
- [ ] Import stations theo form config
- [ ] Import proposals theo form config (NEW)
- [ ] Import users theo form config (NEW)
- [ ] Template stations đúng format
- [ ] Template proposals đúng format (NEW)
- [ ] Template users đúng format (NEW)
- [ ] File Excel đúng format cho cả 3 entity

---

## PHASE 8: TESTING & FIXES

### Checklist Phase 8
- [ ] Tất cả CRUD APIs hoạt động
- [ ] Form builder flow hoàn chỉnh
- [ ] View builder flow hoàn chỉnh
- [ ] File upload/download hoạt động
- [ ] Dynamic form rendering đúng
- [ ] Dynamic table rendering đúng
- [ ] Existing features không bị regress
- [ ] Frontend build không lỗi
- [ ] Docker hot reload hoạt động
- [ ] Không có console errors
