# EXCEL IMPORT/EXPORT - Fixes & Hướng dẫn mở rộng

> **Ngày tạo:** 28/08/2026
> **Scope:** Chức năng Import/Export Excel cho Stations và Proposals

---

## PHẦN 1: CÁC LỖI ĐÃ SỬA

### Lỗi 1: multer v2 Breaking Changes

**Triệu chứng:**
```
POST /api/admin/excel/import/preview → 500 Internal Server Error
Preview import error: TypeError: Cannot read properties of undefined (reading 'every')
```

**Nguyên nhân:**
- `npm install multer` cài phiên bản `2.2.0` (mới nhất)
- multer v2 thay đổi API hoàn toàn so với v1
- `multer.memoryStorage()` hoạt động khác trong v2
- File buffer không được attach đúng cách vào `req.file`

**Cách fix:**
```bash
# Trong Docker container
docker exec station-backend npm install multer@1.4.5-lts.1

# Trong package.json
"multer": "^1.4.5-lts.1"
```

**Code sau fix:**
```js
// backend/src/routes/excel.js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }  // 5MB
});

// Route handler
router.post('/import/preview',
  requireAuth,
  requireAdmin,
  upload.single('file'),  // multer v1 middleware
  async (req, res) => {
    // req.file.buffer có data
  }
);
```

**Lưu ý:** multer v2 có package size nhỏ hơn nhưng API không backward-compatible. Luôn chỉ định version khi cài.

---

### Lỗi 2: row.cellValues undefined

**Triệu chứng:**
```
Preview import error: TypeError: Cannot read properties of undefined (reading 'every')
at /app/src/routes/excel.js:197:34
```

**Nguyên nhân:**
```js
// Code cũ (SAI)
const row = sheet.getRow(i);
if (!row || row.cellValues.every((v) => !v)) continue;
// row.cellValues là undefined trong ExcelJS某些版本
```

ExcelJS không guarantee `cellValues` property trên Row object. Property này có thể undefined tùy version.

**Cách fix:**
```js
// Code mới (ĐÚNG)
const row = sheet.getRow(i);
const cellValues = [];
row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
  cellValues[colNumber] = cell.value;
});
if (cellValues.length === 0 || cellValues.every((v) => !v)) continue;
```

**Giải thích:**
- `eachCell({ includeEmpty: true })` duyệt qua tất cả cells kể cả empty
- Build array `cellValues` thủ công, đảm bảo luôn có data
- Kiểm tra `length === 0` để skip row trống hoàn toàn

---

### Lỗi 3: Node modules không sync giữa Host và Docker

**Triệu chứng:**
```
GET /api/admin/excel/export/stations → 404 Not Found
```

**Nguyên nhân:**
- `npm install exceljs multer` chạy trên host (Windows)
- Docker container có `node_modules` riêng (Linux)
- Source code mounted qua volume nhưng `node_modules` thì không
- Container không tìm thấy module mới

**Cách fix:**
```bash
# Cài trực tiếp trong container
docker exec station-backend npm install exceljs multer

# Hoặc rebuild container
docker compose down
docker compose up --build
```

**Ngăn ngừa:** Luôn thêm dependencies vào `package.json` TRƯỚC khi chạy `docker compose up --build`.

---

### Lỗi 4: express.json() conflict với multipart

**Triệu chứng:**
```
SyntaxError: Expected property name or '}' in JSON at position 1
at JSON.parse (<anonymous>)
```

**Nguyên nhân:**
- `app.use(express.json())` chạy TRƯỚC multer middleware
- Request multipart/form-data bị express.json() cố parse thành JSON
- Gây lỗi khi body rỗng hoặc không phải JSON

**Cách fix:**
- multer v1 xử lý đúng thứ tự middleware
- Không cần fix gì thêm khi dùng multer v1

**Nếu vẫn lỗi:** Thêm route-level middleware:
```js
router.post('/import/preview',
  requireAuth,
  requireAdmin,
  express.raw({ type: 'multipart/form-data' }),  // thay vì express.json()
  upload.single('file'),
  async (req, res) => { ... }
);
```

---

## PHẦN 2: HƯỚNG DẪN MỞ RỘNG TRƯỜNG

### Tổng quan kiến trúc

Chức năng Excel có 3 lớp cần sửa khi thêm trường:

```
┌─────────────────────────────────────────────┐
│  1. BACKEND: excel.js                       │
│     - Export: SQL query + sheet.columns     │
│     - Template: sheet.columns + sample row  │
│     - Import Preview: validation rules      │
│     - Import Confirm: INSERT query          │
├─────────────────────────────────────────────┤
│  2. DATABASE: stations / station_proposals  │
│     - Thêm column nếu cần                  │
├─────────────────────────────────────────────┤
│  3. FRONTEND: AdminStationsPage.jsx         │
│     - Preview table headers                │
│     - Error display fields                 │
└─────────────────────────────────────────────┘
```

---

### Ví dụ: Thêm trường `power_capacity` (công suất) vào Stations

#### Bước 1: Database - Thêm column

```sql
ALTER TABLE stations
ADD COLUMN power_capacity VARCHAR(50) DEFAULT NULL
AFTER description;
```

#### Bước 2: Backend - Sửa `excel.js`

##### 2a. Export Stations

```js
// file: backend/src/routes/excel.js
// Section: GET /export/stations

// THÊM column vào sheet.columns:
sheet.columns = [
  { header: 'ID', key: 'id', width: 8 },
  { header: 'Tên trạm', key: 'name', width: 30 },
  { header: 'Vĩ độ', key: 'latitude', width: 15 },
  { header: 'Kinh độ', key: 'longitude', width: 15 },
  { header: 'Địa chỉ', key: 'address', width: 40 },
  { header: 'Trạng thái', key: 'status', width: 15 },
  { header: 'Mô tả', key: 'description', width: 40 },
  // THÊM MỚI:
  { header: 'Công suất (kW)', key: 'power_capacity', width: 20 },
  { header: 'Ngày tạo', key: 'created_at', width: 20 }
];

// THÊM field vào sheet.addRow():
stations.forEach((s) => {
  sheet.addRow({
    id: s.id,
    name: s.name,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    address: s.address,
    status: s.status,
    description: s.description || '',
    // THÊM MỚI:
    power_capacity: s.power_capacity || '',
    created_at: s.created_at ? new Date(s.created_at).toLocaleString('vi-VN') : ''
  });
});

// CẬP NHẬT SQL query:
const [stations] = await pool.query(
  'SELECT id, name, latitude, longitude, address, status, description, power_capacity, created_at FROM stations ORDER BY created_at DESC'
);
```

##### 2b. Template

```js
// Section: GET /template

sheet.columns = [
  { header: 'name', key: 'name', width: 30 },
  { header: 'latitude', key: 'latitude', width: 15 },
  { header: 'longitude', key: 'longitude', width: 15 },
  { header: 'address', key: 'address', width: 40 },
  { header: 'status', key: 'status', width: 15 },
  { header: 'description', key: 'description', width: 40 },
  // THÊM MỚI:
  { header: 'power_capacity', key: 'power_capacity', width: 20 }
];

// Thêm sample row:
sheet.addRow({
  name: 'Trạm A',
  latitude: 10.762622,
  longitude: 106.660172,
  address: 'Quận 1, TP.HCM',
  status: 'ACTIVE',
  description: 'Mô tả trạm',
  // THÊM MỚI:
  power_capacity: '50kW'
});
```

##### 2c. Import Preview - Validation

```js
// Section: POST /import/preview
// THÊM validation rule mới (sau phần validate status):

if (rowData.power_capacity) {
  const capacity = parseFloat(rowData.power_capacity);
  if (isNaN(capacity) || capacity <= 0) {
    rowErrors.push('Công suất không hợp lệ (phải là số dương)');
  }
}

// THÊM field vào results.push():
results.push({
  row: rowNum,
  name: rowData.name,
  latitude: lat,
  longitude: lng,
  address: rowData.address,
  status: rowData.status ? rowData.status.toUpperCase() : 'ACTIVE',
  description: rowData.description || '',
  // THÊM MỚI:
  power_capacity: rowData.power_capacity || ''
});
```

##### 2d. Import Confirm - INSERT query

```js
// Section: POST /import/confirm

// CẬP NHẬT INSERT query:
await pool.query(
  'INSERT INTO stations (name, latitude, longitude, address, status, description, power_capacity) VALUES (?, ?, ?, ?, ?, ?, ?)',
  [row.name, row.latitude, row.longitude, row.address, row.status || 'ACTIVE', row.description || '', row.power_capacity || null]
);
```

#### Bước 3: Frontend - Cập nhật Preview Table

```jsx
// file: frontend/src/pages/admin/AdminStationsPage.jsx
// Section: Import Preview Table

// THÊM column vào header:
<thead>
  <tr>
    <th>Dòng</th>
    <th>Tên trạm</th>
    <th>Vĩ độ</th>
    <th>Kinh độ</th>
    <th>Địa chỉ</th>
    <th>Trạng thái</th>
    // THÊM MỚI:
    <th>Công suất</th>
  </tr>
</thead>

// THÊM cell vào body:
<tbody>
  {importPreview.rows.map((row, idx) => (
    <tr key={idx}>
      <td>{row.row}</td>
      <td>{row.name}</td>
      <td>{row.latitude}</td>
      <td>{row.longitude}</td>
      <td>{row.address}</td>
      <td><span className={`badge badge-${row.status.toLowerCase()}`}>{row.status}</span></td>
      // THÊM MỚI:
      <td>{row.power_capacity}</td>
    </tr>
  ))}
</tbody>
```

---

### Checklist khi thêm trường mới

Khi thêm bất kỳ trường nào, cần sửa đúng 7 chỗ:

| # | Vị trí | File | Cần làm |
|---|--------|------|---------|
| 1 | Database | `database/*.sql` | `ALTER TABLE ADD COLUMN` |
| 2 | Export query | `excel.js` → `GET /export/stations` | Thêm vào SQL SELECT |
| 3 | Export columns | `excel.js` → `GET /export/stations` | Thêm vào `sheet.columns` |
| 4 | Export data | `excel.js` → `GET /export/stations` | Thêm vào `sheet.addRow()` |
| 5 | Template | `excel.js` → `GET /template` | Thêm vào `sheet.columns` + sample row |
| 6 | Import validate | `excel.js` → `POST /import/preview` | Thêm validation + `results.push()` |
| 7 | Import insert | `excel.js` → `POST /import/confirm` | Thêm vào INSERT query + params |
| 8 | Frontend preview | `AdminStationsPage.jsx` | Thêm column vào preview table |

---

### Các loại Validation thường dùng

```js
// Required field
if (!rowData.name) rowErrors.push('Thiếu tên trạm');

// Number range
const lat = parseFloat(rowData.latitude);
if (isNaN(lat) || lat < -90 || lat > 90) {
  rowErrors.push('Vĩ độ không hợp lệ (phải từ -90 đến 90)');
}

// Enum / whitelist
const VALID_STATUSES = ['ACTIVE', 'DEPLOYING'];
if (rowData.status && !VALID_STATUSES.includes(rowData.status.toUpperCase())) {
  rowErrors.push(`Trạng thái không hợp lệ: "${rowData.status}"`);
}

// String length
if (rowData.name && rowData.name.length > 200) {
  rowErrors.push('Tên trạm không được quá 200 ký tự');
}

// Pattern (VD: SĐT Việt Nam)
const phoneRegex = /^(0[3-9])\d{8}$/;
if (rowData.phone && !phoneRegex.test(rowData.phone)) {
  rowErrors.push('Số điện thoại không hợp lệ');
}

// Unique check (cần query DB)
const [existing] = await pool.query(
  'SELECT id FROM stations WHERE name = ?', [rowData.name]
);
if (existing.length > 0) {
  rowErrors.push(`Tên trạm "${rowData.name}" đã tồn tại`);
}
```

---

### Thêm Export cho entity mới (VD: Users)

#### Backend

```js
// Thêm vào excel.js

router.get('/export/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, full_name, email, phone, role, status, created_at FROM users ORDER BY created_at DESC'
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Họ tên', key: 'full_name', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'SĐT', key: 'phone', width: 15 },
      { header: 'Vai trò', key: 'role', width: 12 },
      { header: 'Trạng thái', key: 'status', width: 12 },
      { header: 'Ngày tạo', key: 'created_at', width: 20 }
    ];

    // Header styling
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };

    users.forEach((u) => {
      sheet.addRow({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        created_at: u.created_at ? new Date(u.created_at).toLocaleString('vi-VN') : ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=users.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});
```

#### Frontend

```js
// Thêm vào excelService trong api.js

async exportUsers(token) {
  const response = await api.downloadWithAuth('/admin/excel/export/users', token);
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'users.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
},
```

---

### Diff Reference

Khi git diff, các thay đổi thường có pattern:

```diff
# Backend: excel.js
- const STATION_HEADERS = ['name', 'latitude', 'longitude', 'address', 'status', 'description'];
+ const STATION_HEADERS = ['name', 'latitude', 'longitude', 'address', 'status', 'description', 'power_capacity'];

# SQL query
- 'SELECT id, name, latitude, longitude, address, status, description, created_at FROM stations'
+ 'SELECT id, name, latitude, longitude, address, status, description, power_capacity, created_at FROM stations'

# sheet.columns
+ { header: 'Công suất (kW)', key: 'power_capacity', width: 20 }

# Validation
+ if (rowData.power_capacity) {
+   const capacity = parseFloat(rowData.power_capacity);
+   if (isNaN(capacity) || capacity <= 0) {
+     rowErrors.push('Công suất không hợp lệ');
+   }
+ }

# INSERT query
- 'INSERT INTO stations (name, latitude, longitude, address, status, description) VALUES (?, ?, ?, ?, ?, ?)'
+ 'INSERT INTO stations (name, latitude, longitude, address, status, description, power_capacity) VALUES (?, ?, ?, ?, ?, ?, ?)'
```
