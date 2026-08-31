# SELECT/MULTISELECT & FORMULA — PHÂN TÍCH & KẾ HOẠCH

**Ngày tạo:** 2026-08-31
**Cập nhật:** 2026-08-31
**Trạng thái:** Đã duyệt,准备实施

---

## PHẦN 1: DATA LISTS — Quản lý dữ liệu dùng chung

### 1.1. Hiện trạng

| Thành phần | Hiện tại | Vấn đề |
|-----------|---------|--------|
| Options | Admin nhập JSON thủ công per field | Trùng lặp, không tái sử dụng |
| Cascading | DB schema có `parent_field` + `source_config`; DynamicForm có logic lọc | Admin UI không có chỗ cấu hình |
| Shared source | Không có | Mỗi field tự chứa options riêng |
| Dữ liệu VN | Không có danh sách tỉnh/tp/huyện/xa | Admin phải nhập 34 tỉnh + hàng trăm huyện + hàng nghìn xã thủ công |

### 1.2. Yêu cầu

- Admin tạo mới dữ liệu bằng giao diện nhập类似 Excel (inline editing, thêm/sửa/xóa dòng)
- Nhiều loại dữ liệu: tỉnh thành, huyện, xã, loại trạm, trạng thái, loài cây, điều kiện kinh tế...
- Dữ liệu lưu dạng JSON trong MySQL
- Field select/multiselect tham chiếu data list thay vì nhập thủ công
- Hỗ trợ multi-level cascading (tỉnh → huyện → xã)

### 1.3. Nguyên tắc quan trọng

```
field.options        → Mặc định, admin nhập thủ công (LUÔN TỒN TẠI)
field.data_list.data  → Chỉ dùng khi admin chọn "Nguồn: Data List"
→ CẢ HAI CÙNG TỒN TẠI, KHÔNG BỎ field.options
→ Frontend ưu tiên: data_list_id ≠ null → dùng data_list.data, ngược lại → dùng field.options
```

### 1.3. Kiến trúc

#### Bảng mới: `data_lists`

```sql
CREATE TABLE data_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,           -- 'Tỉnh/Thành phố', 'Loại trạm'
  description TEXT,
  columns_config JSON,                          -- Cấu trúc columns: [{key, label, type, parentKey}]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**`columns_config`** — cấu trúc cột của bảng dữ liệu:
```json
[
  { "key": "code", "label": "Mã", "type": "text" },
  { "key": "name", "label": "Tên", "type": "text" },
  { "key": "parent_code", "label": "Thuộc", "type": "ref", "refColumn": "code" }
]
```

- `type`: `text`, `number`, `select`, `ref`
- `refColumn`: Nếu type=`ref`, link tới column nào trong cùng list (cho cascading)

#### Bảng mới: `data_list_rows`

```sql
CREATE TABLE data_list_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_id INT NOT NULL,
  data JSON NOT NULL,                           -- {"code":"01","name":"Hà Nội","parent_code":""}
  parent_row_id INT NULL,                       -- FK self-reference cho multi-level
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES data_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_row_id) REFERENCES data_list_rows(id) ON DELETE SET NULL
);
```

Ví dụ dữ liệu tỉnh/tp:
```json
[
  { "code": "01", "name": "Hà Nội", "parent_code": "" },
  { "code": "01001", "name": "Ba Đình", "parent_code": "01" },
  { "code": "01002", "name": "Hoàn Kiếm", "parent_code": "01" },
  { "code": "79", "name": "TP.HCM", "parent_code": "" },
  { "code": "79001", "name": "Quận 1", "parent_code": "79" }
]
```

#### Sửa `field_definitions`

```sql
ALTER TABLE field_definitions
  ADD COLUMN data_list_id INT NULL AFTER options,
  ADD FOREIGN KEY (data_list_id) REFERENCES data_lists(id) ON DELETE SET NULL;
```

- `data_list_id` = NULL → dùng `options` JSON thủ công (backward compatible)
- `data_list_id` = ID → tham chiếu `data_lists`, bỏ qua `options` JSON

#### Flow dữ liệu

```
Admin tạo data_list "Tỉnh/Thành phố" (columns: code, name)
  ↓
Admin nhập Excel-like: 34 rows (Hà Nội, TP.HCM, Đà Nẵng...)
  ↓
Admin tạo data_list "Quận/Huyện" (columns: code, name, parent_code [ref: code])
  ↓
Admin nhập Excel-like: 700+ rows, mỗi row link parent_code → tỉnh
  ↓
Admin tạo field select "tinh_thanh" → chọn source = data_list "Tỉnh/Thành phố"
Admin tạo field select "quan_huyen" → chọn source = data_list "Quận/Huyện"
  + cấu hình parent_field = "tinh_thanh"
  ↓
User chọn "Hà Nội" → DynamicForm lọc huyện theo parent_code = "01"
```

### 1.4. Admin UI: Data List Manager

```
┌─ /admin/data-lists ────────────────────────────────────┐
│ Danh sách data lists                                   │
│ [+ Tạo mới]                                           │
│                                                        │
│ │ Tên             │ Columns    │ Rows │ Thao tác │     │
│ │ Tỉnh/Thành phố  │ code, name │ 34   │ Sửa Xóa │     │
│ │ Quận/Huyện      │ code, name, parent │ 700 │ Sửa Xóa │     │
│ │ Loại trạm       │ code, name, color  │ 8   │ Sửa Xóa │     │
└────────────────────────────────────────────────────────┘
```

Khi bấm "Sửa" → mở trang Excel-like editor:

```
┌─ Tỉnh/Thành phố ─────────────────────────────────────┐
│ [+] Thêm dòng │ [Import Excel] │ [Lưu] │ [Hủy]      │
│                                                        │
│ │ # │ Mã ▲▼ │ Tên ▲▼           │ Thao tác │          │
│ │ 1 │ 01     │ Hà Nội           │ [Sửa][Xóa]│         │
│ │ 2 │ 79     │ TP.HCM           │ [Sửa][Xóa]│         │
│ │ 3 │ 48     │ Đà Nẵng          │ [Sửa][Xóa]│         │
│ │ ...                                                   │
└────────────────────────────────────────────────────────┘
```

### 1.5. Các bước thực hiện

| Bước | Nội dung | Files |
|------|---------|-------|
| 1 | Tạo bảng `data_lists` + `data_list_rows` | `database/11-create-data-lists.sql` |
| 2 | Thêm cột `data_list_id` vào `field_definitions` | `database/12-alter-field-definitions-add-data-list.sql` |
| 3 | Backend CRUD data_lists | `routes/dataLists.js`, `controllers/dataListController.js`, `services/dataListService.js` |
| 4 | Backend update fieldDefinitionService — hỗ trợ `data_list_id` | `services/fieldDefinitionService.js` |
| 5 | Admin UI: Data List Manager (list page) | `pages/admin/AdminDataListsPage.jsx` |
| 6 | Admin UI: Data List Editor (Excel-like) | `components/admin/DataListEditor.jsx` |
| 7 | Admin UI: FieldManager — chọn nguồn (data_list hoặc custom) + cascading config | `components/admin/FieldManager.jsx` |
| 8 | Frontend DynamicField — fetch data_list nếu `data_list_id` có giá trị | `components/dynamic/DynamicField.jsx` |
| 9 | Frontend DynamicForm — cập nhật cascading logic dùng data_lists | `components/dynamic/DynamicForm.jsx` |
| 10 | Swagger docs | `routes/dataLists.js` |

---

## PHẦN 2: FORMULA — Trình soạn thảo công thức trực quan

### 2.1. Hiện trạng

| Thành phần | Hiện tại | Vấn đề |
|-----------|---------|--------|
| Nhập liệu | `<textarea>` nhập chuỗi thủ công | Không gợi ý, không check sai |
| Validation | Dùng `Function()` eval — không check trước | Lỗi runtime, không báo trước |
| Field ref | Tự động thay thế tất cả number fields | Không chọn được field cụ thể |
| Kết quả | Hiển thị disabled input | Không thấy preview real-time |
| Input sources | Chỉ dùng number fields trong form | - |

### 2.2. Yêu cầu

**A. Trình soạn thảo trực quan (Click-to-insert + Autocomplete)**

```
Giao diện:
┌──────────────────────────────────────────────────────┐
│  Công thức:                                          │
│  ┌──────────────────────────────────────────────────┐ │
│  │ gia_a * gia_b * (1 - ty_le)                     │ │
│  └──────────────────────────────────────────────────┘ │
│                                                      │
│  📂 Fields:                                          │
│  [💰 Giá A] [💰 Giá B] [📊 Tỷ lệ CKM]              │
│                                                      │
│  🔢 Toán tử: [+] [-] [×] [÷] [(] [)]               │
│                                                      │
│  📊 Hàm: [SUM] [ROUND] [IF] [AVERAGE] [...]        │
│                                                      │
│  ✅ Công thức hợp lệ                                 │
│  Kết quả mẫu: 1,000,000 × 0.5 × (1 - 0.1) = 450,000│
└──────────────────────────────────────────────────────┘
```

- Click field button → insert `[field_key]` vào vị trí con trỏ
- Click operator/function → insert vào vị trí con trỏ
- Gõ `(` sau tên field → autocomplete gợi ý fields & functions
- Real-time validation
- Preview kết quả với dữ liệu mẫu

**B. Hàm hỗ trợ**

| Nhóm | Hàm | Mô tả |
|------|-----|-------|
| Toán học | `+ - * /` | Phép tính cơ bản |
| | `SUM(a, b, ...)` | Tổng |
| | `ROUND(x, n)` | Làm tròn |
| | `ROUNDUP(x, n)` | Làm tròn lên |
| | `ROUNDDOWN(x, n)` | Làm tròn xuống |
| | `MIN(a, b, ...)` | Nhỏ nhất |
| | `MAX(a, b, ...)` | Lớn nhất |
| | `ABS(x)` | Giá trị tuyệt đối |
| | `MOD(a, b)` | Phân dư |
| Điều kiện | `IF(cond, true, false)` | Điều kiện |
| | `AND(a, b, ...)` | Và logic |
| | `OR(a, b, ...)` | Hoặc logic |
| | `NOT(a)` | Phủ định |
| | `IFERROR(expr, fallback)` | Xử lý lỗi |
| Thống kê | `COUNT(a, b, ...)` | Đếm số |
| | `COUNTA(a, b, ...)` | Đếm không rỗng |
| | `COUNTIF(arr, cond)` | Đếm theo điều kiện |
| | `SUMIF(arr, cond)` | Tổng theo điều kiện |
| | `AVERAGE(a, b, ...)` | Trung bình |
| Chuỗi | `CONCAT(a, b, ...)` | Nối chuỗi |
| | `LEN(s)` | Độ dài |
| | `LEFT(s, n)` | Lấy ký tự trái |
| | `RIGHT(s, n)` | Lấy ký tự phải |
| | `UPPER(s)` | Viết hoa |
| | `LOWER(s)` | Viết thường |
| | `TRIM(s)` | Bỏ khoảng trắng |
| Ngày giờ | `DATE(y, m, d)` | Tạo ngày |
| | `TODAY()` | Ngày hôm nay |

**C. Nguồn dữ liệu đầu vào**

| Nguồn | Mô tả |
|-------|-------|
| Fields trong cùng form | Các field number, select, text trong form hiện tại |
| Hằng số | Số cố định: `1000000`, `0.1`, `"text"` |

### 2.3. Kiến trúc

#### Thư viện: math.js

```
npm install mathjs
```

- `math.parse(expr)` → parse AST, check cú pháp
- `math.evaluate(expr, scope)` → eval với scope variables
- Type checking: number, string, boolean

#### Custom Functions (ngoài math.js built-in)

```javascript
// services/formulaCustomFunctions.js
const customFunctions = {
  ROUNDUP: (x, n = 0) => Math.ceil(x * Math.pow(10, n)) / Math.pow(10, n),
  ROUNDDOWN: (x, n = 0) => Math.floor(x * Math.pow(10, n)) / Math.pow(10, n),
  MOD: (a, b) => a % b,
  IF: (cond, trueVal, falseVal) => cond ? trueVal : falseVal,
  AND: (...args) => args.every(Boolean),
  OR: (...args) => args.some(Boolean),
  NOT: (a) => !a,
  IFERROR: (expr, fallback) => {
    try { return expr; } catch { return fallback; }
  },
  COUNT: (...args) => args.filter(v => typeof v === 'number' && !isNaN(v)).length,
  COUNTA: (...args) => args.filter(v => v !== null && v !== undefined && v !== '').length,
  COUNTIF: (arr, cond) => {
    if (!Array.isArray(arr)) return 0;
    return arr.filter(v => {
      if (typeof cond === 'function') return cond(v);
      return v === cond;
    }).length;
  },
  SUMIF: (arr, cond) => {
    if (!Array.isArray(arr)) return 0;
    return arr.filter(v => {
      if (typeof cond === 'function') return cond(v);
      return v === cond;
    }).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  },
  CONCAT: (...args) => args.join(''),
  LEN: (s) => String(s).length,
  LEFT: (s, n) => String(s).slice(0, n),
  RIGHT: (s, n) => String(s).slice(-n),
  UPPER: (s) => String(s).toUpperCase(),
  LOWER: (s) => String(s).toLowerCase(),
  TRIM: (s) => String(s).trim(),
  DATE: (y, m, d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
  TODAY: () => new Date().toISOString().split('T')[0]
};
```

#### Cấu trúc `formula_config` mới

```json
{
  "expression": "gia_a * gia_b * (1 - ty_le_ckm)",
  "referencedFields": ["gia_a", "gia_b", "ty_le_ckm"],
  "outputType": "number",
  "outputFormat": "currency",
  "decimalPlaces": 0,
  "unit": "VND",
  "sampleData": {
    "gia_a": 1000000,
    "gia_b": 0.5,
    "ty_le_ckm": 0.1
  }
}
```

#### Frontend: FormulaEditor Component

```
┌─ FormulaEditor ──────────────────────────────────────┐
│                                                      │
│  ┌─ Expression Input ─────────────────────────────┐  │
│  │ gia_a * (1 + ty_le)                            │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Fields ───────────────────────────────────────┐  │
│  │ [💰 Giá A] [💰 Giá B] [📊 Tỷ lệ] [📦 Số lượng]│  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Operators ────────────────────────────────────┐  │
│  │ [(] [)] [+] [-] [×] [÷]                       │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Functions ────────────────────────────────────┐  │
│  │ [SUM] [ROUND] [IF] [AVERAGE] [MAX] [MIN]      │  │
│  │ [ABS] [ROUNDUP] [ROUNDDOWN] [MOD] [IFERROR]   │  │
│  │ [AND] [OR] [NOT] [COUNT] [COUNTA]             │  │
│  │ [CONCAT] [LEN] [UPPER] [LOWER] [TRIM]         │  │
│  │ [DATE] [TODAY]                                 │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Autocomplete ─────────────────────────────────┐  │
│  │ (hiện khi gõ tên field hoặc function)          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Status: ✅ Công thức hợp lệ                        │
│  Preview: 1,000,000 × (1 + 0.1) = 1,100,000        │
│                                                      │
│  ┌─ Output Config ────────────────────────────────┐  │
│  │ Type: [Number▼] Format: [Currency▼]            │  │
│  │ Decimal: [0] Unit: [VND]                       │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

#### Validation Flow

```
User nhập expression
  ↓
math.parse(expression) → AST
  ↓
Traverse AST → tìm SymbolNodes
  ↓
Kiểm tra mỗi symbol:
  - Là field key? → OK
  - Là function name (SUM, IF...)? → OK
  - Là hằng số (PI, E)? → OK
  - Unknown? → Báo lỗi "Unknown symbol: xxx"
  ↓
Nếu valid → math.evaluate(expression, sampleScope)
  ↓
Hiển thị preview kết quả
```

### 2.4. Các bước thực hiện

| Bước | Nội dung | Files |
|------|---------|-------|
| 1 | Cài math.js | `frontend/package.json`, Docker |
| 2 | Backend custom functions + validation API | `services/formulaService.js`, `services/formulaCustomFunctions.js`, `routes/formulas.js` |
| 3 | Cập nhật `formula_config` schema | `database/13-update-formula-config.sql` |
| 4 | Frontend FormulaEditor component (click-to-insert + autocomplete) | `components/dynamic/FormulaEditor.jsx` |
| 5 | FieldManager — thay textarea bằng FormulaEditor | `components/admin/FieldManager.jsx` |
| 6 | DynamicForm — cập nhật eval dùng math.js + custom functions | `components/dynamic/DynamicForm.jsx` |
| 7 | Swagger docs | `routes/formulas.js` |
| 8 | CSS cho FormulaEditor | `App.css` |

---

## PHẦN 3: Tổng hợp timeline

### Phase A: Data Lists (Ưu tiên cao)

| Bước | Mô tả | Ước lượng |
|------|-------|-----------|
| A1 | Tạo bảng data_lists + data_list_rows | 1-2h |
| A2 | Backend CRUD data_lists | 3-4h |
| A3 | Backend update fieldDefinition | 1h |
| A4 | Admin UI: Data List Manager (list page) | 2-3h |
| A5 | Admin UI: Data List Editor (Excel-like) | 3-4h |
| A6 | Admin UI: FieldManager chọn nguồn + cascading config | 2-3h |
| A7 | Frontend DynamicField/DynamicForm fetch data_list | 2-3h |
| A8 | Test dữ liệu nhỏ 3 cấp | 1-2h |
| A9 | Test file Excel thực tế (3322 rows) | 1-2h |
| A9 | Test + fix | 1-2h |
| **Tổng** | | **16-23h** |

### Phase B: Formula Visual Editor (Ưu tiên trung bình)

| Bước | Mô tả | Ước lượng |
|------|-------|-----------|
| B1 | Cài math.js | 0.5h |
| B2 | Backend custom functions + validation API | 2-3h |
| B3 | Frontend FormulaEditor component | 4-5h |
| B4 | FieldManager integrate FormulaEditor | 1-2h |
| B5 | DynamicForm update eval | 1h |
| B6 | Test + fix | 1-2h |
| **Tổng** | | **9.5-13.5h** |

### Tổng cộng: 25.5-36.5h

---

## PHẦN 4: Chi tiết Step-by-Step

### Phase A: Chi tiết từng bước

**A1. Database (1-2h)**
- Tạo `database/11-create-data-lists.sql`
  - Bảng `data_lists` (id, name, description, columns_config JSON, timestamps)
  - Bảng `data_list_rows` (id, list_id FK, data JSON, parent_row_id self-FK, sort_order, timestamps)
  - Index cho list_id
- Tạo `database/12-alter-field-definitions-add-data-list.sql`
  - Thêm cột `data_list_id` INT NULL vào field_definitions

**A2. Backend CRUD (3-4h)**
- `routes/dataLists.js` — REST endpoints
  - GET `/api/data-lists` — danh sách
  - GET `/api/data-lists/:id` — chi tiết + rows
  - POST `/api/data-lists` — tạo mới
  - PUT `/api/data-lists/:id` — cập nhật
  - DELETE `/api/data-lists/:id` — xóa
  - POST `/api/data-lists/:id/rows` — thêm rows (bulk)
  - PUT `/api/data-lists/:id/rows/:rowId` — sửa row
  - DELETE `/api/data-lists/:id/rows/:rowId` — xóa row
- `controllers/dataListController.js`
- `services/dataListService.js`
- Swagger docs

**A3. Backend update fieldDefinition (1h)**
- `fieldDefinitionService.js` — khi fetch field, nếu `data_list_id` có giá trị → JOIN data_lists + trả về data
- `dynamicEngineService.js` — khi load form config, merge data_list data vào field.options

**A4. Admin UI: Data List Manager (2-3h)**
- `pages/admin/AdminDataListsPage.jsx`
  - Bảng hiển thị: tên, columns, số rows, thao tác
  - nút Tạo mới, Sửa, Xóa

**A5. Admin UI: Data List Editor (3-4h)**
- `components/admin/DataListEditor.jsx`
  - Hiển thị dữ liệu dạng bảng (类似 Excel)
  - Thêm dòng mới (nút hoặc Enter)
  - Sửa cell inline (click để edit)
  - Xóa dòng
  - Sắp xếp thứ tự
  - Validate dữ liệu trước khi lưu
  - Hỗ trợ import từ file (tương lai)

**A6. Admin UI: FieldManager (2-3h)**
- Sửa form select/multiselect:
  - Thêm dropdown "Nguồn dữ liệu": `Tự nhập` | `Data List`
  - Nếu chọn Data List → dropdown chọn data_list
  - Nếu chọn cascading → dropdown chọn `field cha`
- Thêm section "Cascading Config":
  - Chọn parent field
  - Map parent_value → child filter (hoặc tự động từ data_list cấu trúc)

**A7. Frontend DynamicField/DynamicForm (2-3h)**
- `DynamicField.jsx` — nếu field có `data_list_id` → fetch data_list → render options
- `DynamicForm.jsx` — cập nhật cascading:
  - Khi parent value thay đổi → filter child options theo parent_row_id
  - Multi-level: unterstützen depth > 1

**A8. Seed data nhỏ test 3 cấp (1-2h)**
- Tạo data test nhỏ: 2 tỉnh, 4 huyện, 4 xã (10 rows)
- Tạo 3 fields select cascading: tỉnh → huyện → xã
- Test DynamicForm: chọn tỉnh → filter huyện → chọn huyện → filter xã

**A9. Test file Excel thực tế (1-2h)**
- File: `test_files/Danh-muc-Phuong-xa_moi.xlsx` (3322 rows, 2 cấp: tỉnh → xã)
- Import Excel → data list → test cascading
- Performance test: 3322 rows load < 2s, filter < 500ms

### Phase B: Chi tiết từng bước

**B1. Cài math.js (0.5h)**
- `npm install mathjs` (frontend + backend)
- Update Docker

**B2. Backend (2-3h)**
- `services/formulaCustomFunctions.js` — 30 custom functions
- `services/formulaService.js` — validate + evaluate
- `routes/formulas.js` — POST `/api/formulas/validate`, POST `/api/formulas/preview`

**B3. Frontend FormulaEditor (4-5h)**
- `components/dynamic/FormulaEditor.jsx`
  - Expression input (textarea or contenteditable)
  - Field buttons toolbar
  - Operator buttons toolbar
  - Function buttons toolbar
  - Autocomplete dropdown (khi gõ tên)
  - Real-time validation
  - Preview kết quả
  - Output config (type, format, decimal, unit)

**B4. FieldManager integrate (1-2h)**
- Thay `<textarea>` formula bằng `<FormulaEditor>`
- Truyền `allFields` để hiển thị field buttons

**B5. DynamicForm update (1h)**
- Import math.js + custom functions
- Thay `Function()` eval bằng `math.evaluate()` + custom scope
- Cập nhật useEffect tính toán

---

## PHẦN 5: Cấu trúc files mới

```
database/
  11-create-data-lists.sql
  12-alter-field-definitions-add-data-list.sql
  13-update-formula-config.sql

backend/src/
  routes/dataLists.js
  routes/formulas.js
  controllers/dataListController.js
  controllers/formulaController.js
  services/dataListService.js
  services/formulaService.js
  services/formulaCustomFunctions.js

frontend/src/
  pages/admin/AdminDataListsPage.jsx
  pages/admin/AdminDataListEditorPage.jsx
  components/admin/DataListEditor.jsx
  components/dynamic/FormulaEditor.jsx
  hooks/useDataList.js
```
