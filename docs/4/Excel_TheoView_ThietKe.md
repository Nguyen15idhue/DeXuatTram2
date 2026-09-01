# EXCEL THEO VIEW — THIẾT KẾ

**Ngày tạo:** 2026-09-01
**Trạng thái:** Thiết kế (chưa code)

---

## TỔNG QUAN

Excel import/export giờ dùng **View Columns + Available Fields** từ admin/views thay vì hardcoded.

### Nguyên tắc
```
View config (admin/views) quyết định:
  - Cột nào xuất hiện trong Excel
  - Thứ tự cột
  - Label cho header
  - Kiểu dữ liệu cho validation
```

---

## 1. NGUYÊN TẮC HOẠT ĐỘNG

### Hiện tại (Hardcoded)
```
Excel export stations → 8 cột cố định: ID, Tên, Vĩ độ, Kinh độ, ...
Excel export proposals → 13 cột cố định: ID, Chủ MB, SDT, ...
→ KHÔNG liên quan đến View config
→ Dynamic fields (json) KHÔNG được export
```

### Mới (Theo View)
```
Excel export stations → Dùng view ID=6
  → Lấy configured fields từ view_fields
  → Export đúng các cột admin đã cấu hình
  → Dynamic fields (json) cũng được export

Excel import stations → Dùng view ID=6
  → Template headers = field labels từ view
  → Validate theo field types
  → Import vào cả fixed columns + custom_data JSON
```

---

## 2. EXPORT FLOW

### Bước 1: Fetch View Config
```
GET /api/dynamic/{entity}/view/{viewId}
→ Response:
  {
    fields: [
      { key: "name", label: "Tên trạm", type: "text", visible: true },
      { key: "status", label: "Trạng thái", type: "select", visible: true },
      { key: "latitude", label: "Vĩ độ", type: "number", visible: true },
      ...
    ],
    allFields: [ ... ]
  }
```

### Bước 2: Filter visible fields
```
visible_fields = fields.filter(f => f.visible === true)
→ Lấy đúng các cột admin đã bật trong view builder
```

### Bước 3: Query data
```
Query entity table:
  - Fixed fields: SELECT trực tiếp từ columns
  - JSON fields: SELECT custom_data → parse JSON → lấy key
  - JOIN users nếu entity = station_proposals (lấy user_name, user_email)
```

### Bước 4: Render Excel
```
Header row: visible_fields.map(f => f.label)  // "Tên trạm", "Trạng thái", ...
Data rows:  visible_fields.map(f => getFieldValue(row, f.key, f.type))
```

### Ví dụ: Export stations với view ID=6

**View config (admin đã cấu hình):**
```
| # | Field Key    | Label       | Type     | Visible |
|---|-------------|-------------|----------|---------|
| 1 | name        | Tên trạm    | text     | true    |
| 2 | status      | Trạng thái  | select   | true    |
| 3 | latitude    | Vĩ độ       | number   | true    |
| 4 | longitude   | Kinh độ     | number   | true    |
| 5 | address     | Địa chỉ    | text     | true    |
| 6 | description | Mô tả       | textarea | false   |
| 7 | tower_type  | Loại cột    | select   | true    |
```

**Excel output:**
```
| Tên trạm     | Trạng thái | Vĩ độ   | Kinh độ  | Địa chỉ        | Loại cột |
|-------------|------------|---------|----------|----------------|----------|
| Trạm Bến Nghé | ACTIVE    | 10.7769 | 106.7009 | Quận 1, HCM   | Cột thép  |
```

- `description` KHÔNG xuất (visible=false trong view)
- `tower_type` xuất (dynamic field, lưu trong custom_data)
- Label lấy từ `field_definitions.label`

---

## 3. IMPORT FLOW

### Bước 1: Fetch View Config
```
GET /api/dynamic/{entity}/view/{viewId}
→ Lấy visible fields
```

### Bước 2: Generate Template
```
Header row: visible_fields.map(f => f.label)
Sample row: visible_fields.map(f => f.default_value || '')
```

### Bước 3: Parse Upload
```
1. Đọc header row từ Excel
2. Map header → field: headerText → field.label → field.key
3. Validate: header phải match với field labels từ view
4. Parse data rows
```

### Bước 4: Validate Data
```
Cho mỗi row, validate theo field type:
  - text: not empty (nếu required)
  - number: is number, check range (latitude: -90~90, longitude: -180~180)
  - select: value phải nằm trong options
  - date/datetime: valid date format
  - phone: 10 chữ số
  - email: valid email format
  
Dynamic fields (json type):
  - Validate tương tự
  - Save vào custom_data JSON column
```

### Bước 5: Import
```
For each valid row:
  1. Separate fixed fields → INSERT columns
  2. Separate dynamic fields → INSERT custom_data JSON
  3. INSERT into entity table
  
Transaction: all-or-nothing
```

### Ví dụ: Import stations

**Template Excel (auto-generated từ view):**
```
| Tên trạm | Trạng thái | Vĩ độ | Kinh độ | Địa chỉ | Loại cột |
|----------|------------|-------|---------|----------|----------|
```

**User upload với data:**
```
| Tên trạm     | Trạng thái | Vĩ độ   | Kinh độ  | Địa chỉ        | Loại cột |
|-------------|------------|---------|----------|----------------|----------|
| Trạm mới    | ACTIVE     | 10.7769 | 106.7009 | Quận 1, HCM   | Cột thép  |
```

**Backend xử lý:**
```
fixed_fields = { name: "Trạm mới", status: "ACTIVE", latitude: 10.7769, longitude: 106.7009, address: "Quận 1, HCM" }
custom_data = { tower_type: "Cột thép" }

INSERT INTO stations (name, status, latitude, longitude, address, custom_data)
VALUES ('Trạm mới', 'ACTIVE', 10.7769, 106.7009, 'Quản 1, HCM', '{"tower_type":"Cột thép"}')
```

---

## 4. VIEW-EXCEL MAPPING

### Entity → View ID

| Entity | View ID | View Name | Ghi chú |
|--------|---------|-----------|---------|
| `stations` | 6 | Stations View | Export/Import stations |
| `station_proposals` | 8 | Proposals View | Export proposals |
| `users` | 7 | Users View | Export users |

### Import chỉ hỗ trợ một số entity

| Entity | Import | Export | Ghi chú |
|--------|--------|--------|---------|
| `stations` | ✅ | ✅ | Có import |
| `station_proposals` | ❌ | ✅ | Chỉ export (data nhạy cảm, cần validate thủ công) |
| `users` | ❌ | ✅ | Chỉ export |

---

## 5. FIELD TYPE → EXCEL HANDLING

| Field Type | Export | Import | Validation |
|------------|--------|--------|------------|
| `text` | String | String | Required check |
| `textarea` | String | String | Required check |
| `number` | Number | Number | Type check, range check |
| `email` | String | String | Email format |
| `phone` | String | String | 10 digits |
| `url` | String | String | URL format |
| `date` | Date string | Date string | Date format |
| `datetime` | Datetime string | Datetime string | Datetime format |
| `boolean` | TRUE/FALSE | TRUE/FALSE | Boolean check |
| `select` | Label string | Label hoặc value | Options check |
| `multiselect` | Label string (comma separated) | Labels hoặc values | Array check |
| `file` | Filename | ❌ | Skip (file cần upload riêng) |
| `formula` | Computed value | ❌ | Skip (tính tự động) |

### Date Format trong Excel
- Export: `DD/MM/YYYY` (hoặc theo field config)
- Import: Parse多种 formats (`DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`)

### Select Field trong Excel
- Export: Hiển thị **label** (not value) với badge style
- Import: Chấp nhận cả **label** hoặc **value**
- Ví dụ: Export "ACTIVE" → "Hoạt động". Import chấp nhận cả "ACTIVE" hoặc "Hoạt động"

---

## 6. BACKEND API CHANGES

### New endpoints

```
GET  /api/admin/excel/export/{entity}?viewId={viewId}
     → Export theo view config
     
GET  /api/admin/excel/template/{entity}?viewId={viewId}
     → Download template theo view config

POST /api/admin/excel/import/preview/{entity}?viewId={viewId}
     → Preview import theo view config

POST /api/admin/excel/import/confirm/{entity}?viewId={viewId}
     → Confirm import theo view config
```

### Old endpoints (backward compatible)

```
GET  /api/admin/excel/export/stations     → Redirect to new endpoint với viewId=6
GET  /api/admin/excel/export/proposals    → Redirect to new endpoint với viewId=8
GET  /api/admin/excel/template             → Redirect to new endpoint
POST /api/admin/excel/import/preview       → Redirect to new endpoint
POST /api/admin/excel/import/confirm       → Redirect to new endpoint
```

### Response format

```javascript
// Export
{ success: true, data: Buffer, filename: "stations.xlsx" }

// Template
{ success: true, data: Buffer, filename: "stations_template.xlsx" }

// Import Preview
{
  success: true,
  data: {
    totalRows: 100,
    validRows: 95,
    errorRows: 5,
    fields: [...],  // view fields info
    rows: [...],    // valid data
    errors: [...]   // invalid rows with error messages
  }
}

// Import Confirm
{
  success: true,
  data: {
    imported: 95,
    failed: 5,
    failDetails: [...]
  }
}
```

---

## 7. FRONTEND CHANGES

### Export/Import buttons trong admin pages

```jsx
// AdminStationsPage.jsx
const STATIONS_VIEW_ID = 6;

const handleExport = async () => {
  const res = await excelService.exportByView('stations', STATIONS_VIEW_ID, token);
  // Download file...
};

const handleImport = async (file) => {
  const preview = await excelService.previewByView('stations', STATIONS_VIEW_ID, file, token);
  // Show preview modal...
};
```

### Template download

```jsx
const handleDownloadTemplate = async () => {
  const res = await excelService.templateByView('stations', STATIONS_VIEW_ID, token);
  // Download file...
};
```

### api.js service updates

```javascript
export const excelService = {
  // New: View-based endpoints
  exportByView(entity, viewId, token) {
    return api.downloadWithAuth(`/admin/excel/export/${entity}?viewId=${viewId}`, token);
  },
  templateByView(entity, viewId, token) {
    return api.downloadWithAuth(`/admin/excel/template/${entity}?viewId=${viewId}`, token);
  },
  previewByView(entity, viewId, file, token) {
    const formData = new FormData();
    formData.append('file', file);
    return api.uploadWithAuth(`/admin/excel/import/preview/${entity}?viewId=${viewId}`, formData, token);
  },
  confirmByView(entity, viewId, rows, token) {
    return api.postWithAuth(`/admin/excel/import/confirm/${entity}?viewId=${viewId}`, { rows }, token);
  },
};
```

---

## 8. VIEW BUILDER → EXCEL INTEGRATION

### Admin thay đổi view → Excel tự cập nhật

```
1. Admin mở View Builder (admin/views/:id)
2. Thêm/bớt/sắp xếp columns
3. Save view config
4. Excel export/import TỰ ĐỘNG dùng config mới

→ Không cần sửa code Excel, chỉ cần sửa view config
```

### Ví dụ thực tế

**Ban đầu:**
- View stations có 5 columns: name, status, latitude, longitude, address
- Excel export: 5 cột
- Excel template: 5 header columns

**Admin thêm column "tower_type" vào view:**
- View stations giờ có 6 columns
- Excel export: TỰ ĐỘNG có thêm cột "Loại cột"
- Excel template: TỰ ĐỘNG có thêm header "Loại cột"

---

## 9. EDGE CASES

| Case | Xử lý |
|------|-------|
| View không có visible fields | Export template rỗng (chỉ có header row trống) |
| Field label trùng nhau | Dùng field.key làm fallback identifier |
| Dynamic field trong import | Save vào custom_data JSON column |
| File field trong export | Hiển thị filename (không có file content) |
| File field trong import | Skip (cần upload riêng) |
| Formula field trong export | Hiển thị computed value (nếu có) |
| Formula field trong import | Skip (tính tự động) |
| Select field import value vs label | Chấp nhận cả hai, ưu tiên value |
| Large dataset (10k+ rows) | Streaming Excel generation |

---

## 10. MIGRATION PLAN

| Bước | Mô tả | Ưu tiên |
|------|-------|---------|
| 1 | Backend: Tạo export/{entity} endpoint theo view | Cao |
| 2 | Backend: Tạo template/{entity} endpoint theo view | Cao |
| 3 | Backend: Refactor import preview/confirm theo view | Cao |
| 4 | Backend: Handle custom_data JSON trong import | Cao |
| 5 | Frontend: Cập nhật excelService.js | Trung bình |
| 6 | Frontend: Cập nhật admin pages | Trung bình |
| 7 | Backward compatible: Old endpoints redirect | Thấp |
| 8 | Test: Export/Import với view config thay đổi | Thấp |
