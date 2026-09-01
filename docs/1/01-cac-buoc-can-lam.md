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
# Database name: station_management, Password: password
docker compose exec mysql mysql -u root -ppassword station_management < database/04-add-custom-data.sql
docker compose exec mysql mysql -u root -ppassword station_management < database/05-create-field-definitions.sql
docker compose exec mysql mysql -u root -ppassword station_management < database/06-create-forms.sql
docker compose exec mysql mysql -u root -ppassword station_management < database/07-create-views.sql
docker compose exec mysql mysql -u root -ppassword station_management < database/08-create-files.sql
docker compose exec mysql mysql -u root -ppassword station_management < database/09-seed-field-definitions.sql
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
- Tạo 5 feature mới, mỗi feature gồm 3 files: route + controller + service
- Tất cả endpoints phải có Swagger JSDoc comments trong route file
- Mount routes trong app.js

### Cấu trúc file mới (MVC pattern)
```
routes/fieldDefinitions.js      → routing + Swagger JSDoc
controllers/fieldDefinitionController.js → request/response handling
services/fieldDefinitionService.js      → business logic (DB queries)

routes/forms.js                 → routing + Swagger JSDoc
controllers/formController.js           → request/response handling
services/formService.js                 → business logic

routes/formFields.js            → routing + Swagger JSDoc
controllers/formFieldController.js      → request/response handling
services/formFieldService.js            → business logic

routes/views.js                 → routing + Swagger JSDoc
controllers/viewController.js           → request/response handling
services/viewService.js                 → business logic

routes/viewFields.js            → routing + Swagger JSDoc
controllers/viewFieldController.js      → request/response handling
services/viewFieldService.js            → business logic
```

### Bước thực hiện

#### Bước 2.1: Tạo fieldDefinitionService.js + fieldDefinitionController.js + fieldDefinitions.js

**Services** (business logic):
```
getAllFieldDefinitions(entity, status, page, limit)
getFieldDefinitionById(id)
getFieldDefinitionsByEntity(entity)
createFieldDefinition(data)
updateFieldDefinition(id, data)
deleteFieldDefinition(id)
updateFieldDefinitionStatus(id, status)
```

**Controllers** (request/response): gọi service, xử lý req/res

**Routes** (routing + Swagger): mount middleware + gọi controller

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

#### Bước 2.2: Tạo formService.js + formController.js + forms.js

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/forms` | admin | List all, filter by entity |
| GET | `/api/forms/:id` | public | Get form + fields |
| POST | `/api/forms` | admin | Create form |
| PUT | `/api/forms/:id` | admin | Update form |
| DELETE | `/api/forms/:id` | admin | Delete form (CASCADE form_fields) |

#### Bước 2.3: Tạo formFieldService.js + formFieldController.js + formFields.js

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/forms/:formId/fields` | public | Get fields of form |
| POST | `/api/forms/:formId/fields` | admin | Add field to form |
| PUT | `/api/forms/:formId/fields/:id` | admin | Update field config |
| DELETE | `/api/forms/:formId/fields/:id` | admin | Remove field from form |
| PUT | `/api/forms/:formId/fields/reorder` | admin | Reorder fields |

#### Bước 2.4: Tạo viewService.js + viewController.js + views.js

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/views` | admin | List all, filter by entity |
| GET | `/api/views/:id` | public | Get view + fields |
| POST | `/api/views` | admin | Create view |
| PUT | `/api/views/:id` | admin | Update view |
| DELETE | `/api/views/:id` | admin | Delete view (CASCADE view_fields) |

#### Bước 2.5: Tạo viewFieldService.js + viewFieldController.js + viewFields.js

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
- [ ] 5 route files mới tạo (routing + Swagger)
- [ ] 5 controller files mới tạo (request/response)
- [ ] 5 service files mới tạo (business logic)
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
- Tạo `services/dynamicUtils.js` — helper functions
- Tạo 2 feature mới: dynamicEngine (route+controller+service), files (route+controller+service)
- Tạo thư mục `storage/uploads/` trên host
- Sửa 6 service files hiện tại hỗ trợ custom_data
- Sửa `middlewares/validators.js` thêm dynamic validation

### Cấu trúc file mới (MVC pattern)
```
services/dynamicUtils.js                    → helper functions (parseOptions, validateField, etc.)
routes/dynamicEngine.js + controllers/dynamicEngineController.js + services/dynamicEngineService.js
routes/files.js + controllers/fileController.js + services/fileService.js
```

### Bước thực hiện

#### Bước 3.1: Tạo `services/dynamicUtils.js`

```javascript
// Các functions cần có:
parseOptions(optionsJson)      // Parse JSON options
validateField(fieldDef, value) // Validate 1 field
validateData(entity, data, fieldDefs) // Validate all fields
splitData(entity, data, fieldDefs)    // Tách fixed vs dynamic
mergeData(row, fieldDefs)             // Merge fixed + custom_data
buildDynamicSetClause(data, fieldDefs) // Build SQL SET
```

#### Bước 3.2: Tạo dynamicEngineService.js + dynamicEngineController.js + dynamicEngine.js

**Services:**
```
getFormConfig(entity, formId)    // Render form config
getViewConfig(entity, viewId)    // Render view config
validateEntityData(entity, data) // Validate data
```

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/dynamic/:entity/form/:formId` | public | Render form config |
| GET | `/api/dynamic/:entity/view/:viewId` | public | Render view config |
| POST | `/api/dynamic/:entity/validate` | auth | Validate data |

#### Bước 3.3: Tạo fileService.js + fileController.js + files.js

**Services:**
```
uploadFile(file, userId, entityId)  // Upload + save metadata
getFileById(id)                     // Get metadata
downloadFile(id)                    // Stream file
deleteFile(id)                      // Soft delete + physical delete
```

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

#### Bước 3.6: Sửa các service files hiện tại

**Lưu ý:** Vì đã refactor MVC, KHÔNG sửa route files — sửa service files:

**services/stationService.js:**
- getAllStations(): merge custom_data + field_definitions vào response
- createStation(), updateStation(): tách dynamic fields → lưu custom_data

**services/proposalService.js:** Tương tự

**services/myProposalService.js:** Tương tự

**services/adminProposalService.js:** Tương tự

**services/adminUserService.js:** Tương tự

**services/authService.js:** updateProfile() hỗ trợ custom_data

**middlewares/validators.js:** Thêm `validateDynamicFields(entity, data, fieldDefs)`

### Checklist Phase 3
- [ ] dynamicUtils.js: tất cả functions hoạt động
- [ ] dynamicEngine: route + controller + service tạo xong
- [ ] dynamicEngine: GET form config trả về đúng data
- [ ] dynamicEngine: GET view config trả về đúng data
- [ ] dynamicEngine: POST validate trả về errors đúng
- [ ] files: route + controller + service tạo xong
- [ ] files: upload thành công, file lưu đúng path
- [ ] files: download trả về binary stream
- [ ] files: delete soft delete + file vật lý xóa
- [ ] storage/uploads/ tồn tại + .gitignore
- [ ] stationService: CRUD hoạt động với custom_data
- [ ] proposalService: CRUD hoạt động với custom_data
- [ ] adminUserService: CRUD hoạt động với custom_data
- [ ] authService: Profile hoạt động với custom_data
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
- Export/Import dùng tất cả field definitions (fixed + json/custom_data)
- STT luôn là cột đầu tiên
- Thứ tự cột: Table Columns (view_fields) trước, sau đó Available Fields (các field chưa có trong view)
- **Admin Stations / Admin Users / My Proposals:** Import + Export
- **Admin Proposals:** Chỉ Export (không Import)
- **Data Lists:** Import/Export theo cấu trúc data list (cột đầu là STT)

### Scope theo trang

| Trang | Entity | Import | Export | Ghi chú |
|-------|--------|--------|--------|---------|
| AdminStationsPage | stations | ✅ | ✅ | View ID = 6 |
| AdminUsersPage | users | ✅ | ✅ | View ID = 7 |
| AdminProposalsPage | station_proposals | ❌ | ✅ | View ID = 8 |
| MyProposalsPage | station_proposals | ✅ | ✅ | View ID = 8 |
| DataListManager | data_lists | ✅ | ✅ | Theo data list structure |

### Thứ tự cột Excel (áp dụng cho tất cả)

```
Cột 1: STT (mới, tự tăng)
Cột 2+: Table Columns (view_fields theo order_index)
Cột N+: Available Fields (field_definitions chưa có trong view)
```

Ví dụ stations:
```
| STT | Name | Latitude | Longitude | Address | Status | Description | antenna_height | tower_type | power_capacity |
```
- 7 cột từ View Stations (view_id=6): name, latitude, longitude, address, status, description, antenna_height
- 3 cột Available Fields: tower_type, power_capacity (chưa thêm vào view)

---

### Bước thực hiện

#### Bước 7.1: Tạo `services/excelService.js` mới

**Thay vì sửa file cũ → Viết lại hoàn toàn** vì logic khác hoàn toàn.

```
exports.exportDynamic(entity, viewId)     → Export theo view config + all fields
exports.importPreviewDynamic(entity, file) → Preview import với tất cả fields
exports.importConfirmDynamic(entity, rows) → Import data + custom_data
exports.getTemplateDynamic(entity)         → Template với tất cả fields
exports.exportDataList(listId)             → Export data list theo columns_config
exports.importDataListPreview(listId, file) → Preview import data list
exports.importDataListConfirm(listId, rows) → Import data list rows
```

#### Bước 7.2: Backend — Helper functions

**`buildExportColumns(entity, viewId)`:**
1. Lấy view_fields theo viewId (order_index ASC, visible=true)
2. Lấy allFields từ field_definitions (entity, status=active)
3. Filter out fields đã có trong view → còn lại là availableFields
4. Trả về: `[{ key, label, type, source_type, isInView, width? }]`
5. Luôn thêm cột `{ key: '_stt', label: 'STT', type: 'number', source_type: 'system', isInView: true }` ở vị trí đầu

**`buildImportColumns(entity)`:**
1. Lấy tất cả field_definitions theo entity (status=active)
2. Trả về: `[{ key, label, type, source_type, required }]`
3. Luôn thêm cột `{ key: '_stt', label: 'STT', type: 'number', source_type: 'system' }` ở vị trí đầu

**`parseExcelRow(row, columns)`:**
- Đọc dữ liệu từ Excel row theo thứ tự columns
- Trả về: `{ fixedData: {...}, dynamicData: {...}, errors: [] }`

#### Bước 7.3: Backend — Export Dynamic

**Logic export:**
```javascript
exports.exportDynamic = async (entity, viewId) => {
  // 1. Build columns từ view config
  const columns = await buildExportColumns(entity, viewId);

  // 2. Query data (SELECT fixed columns + custom_data)
  const rows = await getAllData(entity); // stations/users/station_proposals

  // 3. Tạo workbook
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(entity);

  // 4. Header row (STT + labels)
  sheet.addRow(columns.map(c => c.label));

  // 5. Data rows
  rows.forEach((row, idx) => {
    const values = columns.map(col => {
      if (col.key === '_stt') return idx + 1;
      if (col.source_type === 'fixed') return row[col.key];
      // json field → custom_data
      const custom = JSON.parse(row.custom_data || '{}');
      return custom[col.key] ?? '';
    });
    sheet.addRow(values);
  });

  // 6. Style header (tím, bold, border)
  // 7. Auto-width columns
  // 8. Return buffer
};
```

**Helper — getAllData(entity):**
```javascript
async function getAllData(entity) {
  const tableMap = { stations: 'stations', users: 'users', station_proposals: 'station_proposals' };
  const table = tableMap[entity];
  // SELECT all columns + custom_data FROM table
  const [rows] = await db.query(`SELECT * FROM ${table}`);
  return rows;
}
```

#### Bước 7.4: Backend — Import Dynamic Preview

**Logic preview:**
```javascript
exports.importPreviewDynamic = async (entity, file) => {
  // 1. Build columns từ field_definitions
  const columns = await buildImportColumns(entity);

  // 2. Read Excel file
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const sheet = workbook.getWorksheet(1);

  // 3. Validate header row (so sánh với columns labels)
  const headerRow = sheet.getRow(1);
  const headerErrors = validateHeaders(headerRow, columns);

  // 4. Validate data rows
  const validRows = [];
  const errors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const parsed = parseExcelRow(row, columns);
    if (parsed.errors.length > 0) {
      errors.push({ row: rowNumber, errors: parsed.errors });
    } else {
      validRows.push({ rowNumber, fixedData: parsed.fixedData, dynamicData: parsed.dynamicData });
    }
  });

  return { columns, validRows, errors, totalRows: sheet.rowCount - 1 };
};
```

#### Bước 7.5: Backend — Import Dynamic Confirm

**Logic confirm (transaction):**
```javascript
exports.importConfirmDynamic = async (entity, rows) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    for (const row of rows) {
      const fixedData = row.fixedData;
      const dynamicData = row.dynamicData;

      // 1. INSERT INTO entity table (fixed columns)
      const columns = Object.keys(fixedData);
      const values = Object.values(fixedData);
      const placeholders = columns.map(() => '?').join(', ');
      const [result] = await connection.query(
        `INSERT INTO ${entity} (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );

      // 2. UPDATE custom_data JSON (nếu có dynamic fields)
      if (Object.keys(dynamicData).length > 0) {
        await connection.query(
          `UPDATE ${entity} SET custom_data = ? WHERE id = ?`,
          [JSON.stringify(dynamicData), result.insertId]
        );
      }
    }

    await connection.commit();
    return { imported: rows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};
```

#### Bước 7.6: Backend — Template Dynamic

**Logic template:**
```javascript
exports.getTemplateDynamic = async (entity) => {
  const columns = await buildImportColumns(entity);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(entity);

  // Header row
  sheet.addRow(columns.map(c => c.label));

  // Sample row (empty hoặc dummy data)
  sheet.addRow(columns.map(c => getSampleValue(c)));

  // Style header
  // Auto-width
  return workbook.xlsx.writeBuffer();
};

function getSampleValue(col) {
  switch (col.type) {
    case 'number': return 0;
    case 'email': return 'example@email.com';
    case 'phone': return '0901234567';
    case 'date': return '01/01/2026';
    case 'datetime': return '01/01/2026 12:00';
    case 'boolean': return 'true/false';
    case 'select': return 'option1';
    case 'multiselect': return 'option1,option2';
    default: return '';
  }
}
```

#### Bước 7.7: Backend — Data List Export/Import

**Export Data List:**
```javascript
exports.exportDataList = async (listId) => {
  // 1. Lấy data list metadata + columns_config
  const list = await dataListService.getById(listId);
  const columnsConfig = JSON.parse(list.columns_config); // [{key, label, type}]

  // 2. Lấy rows
  const rows = await dataListService.getAllRows(listId);

  // 3. Build columns: STT + columnsConfig
  const columns = [
    { key: '_stt', label: 'STT', type: 'number' },
    ...columnsConfig.map(c => ({ key: c.key, label: c.label, type: c.type }))
  ];

  // 4. Tạo workbook
  // 5. Header: column labels
  // 6. Data: rows.map(r => columns.map(c => c.key === '_stt' ? i+1 : r.data[c.key]))
  // 7. Return buffer
};
```

**Import Data List Preview:**
```javascript
exports.importDataListPreview = async (listId, file) => {
  // 1. Lấy columns_config từ data list
  const list = await dataListService.getById(listId);
  const columnsConfig = JSON.parse(list.columns_config);
  const columns = [
    { key: '_stt', label: 'STT', type: 'number' },
    ...columnsConfig
  ];

  // 2. Read Excel, validate headers (phải khớp với columnsConfig labels)
  // 3. Validate rows (number type check, required check)
  // 4. Return { columns, validRows, errors }
};
```

**Import Data List Confirm:**
```javascript
exports.importDataListConfirm = async (listId, rows) => {
  // 1. Lấy columns_config để biết keys
  const list = await dataListService.getById(listId);
  const columnsConfig = JSON.parse(list.columns_config);

  // 2. Bulk add rows
  const insertRows = rows.map(row => {
    const data = {};
    columnsConfig.forEach(col => {
      data[col.key] = row.dynamicData[col.key] ?? row[col.key];
    });
    return { data: JSON.stringify(data), parent_row_id: row.parent_row_id || null };
  });

  await dataListService.addRows(listId, insertRows);
  return { imported: rows.length };
};
```

#### Bước 7.8: Backend — Routes mới

**File: `routes/excel.js`** — Sửa endpoints hiện tại + thêm mới:

| Method | Endpoint | Auth | Thay đổi |
|--------|----------|------|----------|
| GET | `/api/admin/excel/export/stations` | admin | **Sửa** → dùng exportDynamic(entity, viewId=6) |
| GET | `/api/admin/excel/export/proposals` | admin | **Sửa** → dùng exportDynamic(entity, viewId=8) |
| GET | `/api/admin/excel/export/users` | admin | **Thêm** → dùng exportDynamic(entity, viewId=7) |
| GET | `/api/admin/excel/template` | admin | **Sửa** → thêm param `?entity=`, dùng getTemplateDynamic(entity) |
| POST | `/api/admin/excel/import/preview` | admin | **Sửa** → thêm param `?entity=`, dùng importPreviewDynamic(entity, file) |
| POST | `/api/admin/excel/import/confirm` | admin | **Sửa** → thêm param `?entity=`, dùng importConfirmDynamic(entity, rows) |

**File: `routes/dataLists.js`** — Thêm Excel endpoints:

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/admin/data-lists/:id/export` | admin | Export data list ra Excel |
| POST | `/api/admin/data-lists/:id/import/preview` | admin | Preview import data list |
| POST | `/api/admin/data-lists/:id/import/confirm` | admin | Confirm import data list |

#### Bước 7.9: Frontend — excelService updates

**File: `services/api.js`** — Sửa excelService:

```javascript
export const excelService = {
  // Export — thêm entity param
  async exportData(entity, token) {
    const response = await api.downloadWithAuth(`/admin/excel/export/${entity}`, token);
    // ... blob download pattern
  },

  // Template — thêm entity param
  async downloadTemplate(entity, token) {
    const response = await api.downloadWithAuth(`/admin/excel/template?entity=${entity}`, token);
    // ... blob download
  },

  // Import preview — thêm entity param
  previewImport(entity, file, token) {
    const formData = new FormData();
    formData.append('file', file);
    return api.uploadWithAuth(`/admin/excel/import/preview?entity=${entity}`, formData, token);
  },

  // Import confirm — thêm entity param
  confirmImport(entity, rows, token) {
    return api.postWithAuth(`/admin/excel/import/confirm?entity=${entity}`, { rows }, token);
  },

  // Data List export
  async exportDataList(listId, token) {
    const response = await api.downloadWithAuth(`/admin/data-lists/${listId}/export`, token);
    // ... blob download
  },

  // Data List import preview
  previewDataListImport(listId, file, token) {
    const formData = new FormData();
    formData.append('file', file);
    return api.uploadWithAuth(`/admin/data-lists/${listId}/import/preview`, formData, token);
  },

  // Data List import confirm
  confirmDataListImport(listId, rows, token) {
    return api.postWithAuth(`/admin/data-lists/${listId}/import/confirm`, { rows }, token);
  },
};
```

#### Bước 7.10: Frontend — Admin pages updates

**AdminStationsPage.jsx:**
- Import: Nút "Import" → open modal → chọn file → previewImport('stations', file) → confirmImport('stations', rows)
- Export: Nút "Export" → exportData('stations', token)
- Template: Nút "Template" → downloadTemplate('stations', token)

**AdminUsersPage.jsx:**
- Tương tự stations
- Import: importPreview + confirm với entity='users'
- Export: exportData('users')

**AdminProposalsPage.jsx:**
- **Chỉ Export** (không Import button)
- Export: exportData('station_proposals')
- Template: downloadTemplate('station_proposals') — vẫn giữ cho user download nếu cần

**MyProposalsPage.jsx:**
- Import + Export với entity='station_proposals'
- Import: importPreview + confirm với entity='station_proposals'
- Export: exportData('station_proposals')

**DataListManager.jsx:**
- Mỗi data list có nút Import/Export
- Export: exportDataList(listId)
- Import: previewDataListImport(listId, file) → confirmDataListImport(listId, rows)
- Import dialog: hiển thị preview với validation errors
- Export dialog: download file

#### Bước 7.11: Swagger docs

Thêm `@swagger` JSDoc cho tất cả endpoints mới/sửa trong `routes/excel.js` và `routes/dataLists.js`.

---

### Checklist Phase 7
- [ ] excelService.js viết lại hoàn toàn (7 functions)
- [ ] Helper: buildExportColumns() — STT + view_fields + remaining fields
- [ ] Helper: buildImportColumns() — STT + all field definitions
- [ ] Helper: parseExcelRow() — parse Excel → fixedData + dynamicData
- [ ] Export stations theo view config (view_id=6) + all fields
- [ ] Export users theo view config (view_id=7) + all fields
- [ ] Export proposals theo view config (view_id=8) + all fields (chỉ admin export)
- [ ] Import stations: preview + confirm + custom_data JSON
- [ ] Import users: preview + confirm + custom_data JSON
- [ ] Import proposals: preview + confirm + custom_data JSON (user my-proposals)
- [ ] Template stations/users/proposals với sample data
- [ ] Data List export theo columns_config + STT
- [ ] Data List import preview (validate headers + data)
- [ ] Data List import confirm (bulk add rows)
- [ ] Frontend excelService updates (6 functions)
- [ ] AdminStationsPage: Import/Export buttons hoạt động
- [ ] AdminUsersPage: Import/Export buttons hoạt động
- [ ] AdminProposalsPage: Chỉ Export button
- [ ] MyProposalsPage: Import/Export buttons hoạt động
- [ ] DataListManager: Import/Export buttons hoạt động
- [ ] Swagger docs cho tất cả endpoints
- [ ] Header style: tím, bold, border
- [ ] Auto-width columns
- [ ] Existing Excel features không bị regress

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
