# CẤU HÌNH FIELD — PHÂN TÍCH & YÊU CẦU

**Ngày tạo:** 2026-08-31
**Trạng thái:** Đang thực hiện

---

## 1. MỤC TIÊU

Quy chuẩn mã nguồn về:
- 1 bộ font chữ duy nhất
- 1 bộ giao diện table/form duy nhất
- Form cấu hình field tại `/admin/fields` hiển thị conditional theo type
- Mỗi loại field có behavior riêng về dữ liệu và giao diện

---

## 2. HIỆN TRẠNG

### 2.1 Database `field_definitions`

```
Cột hiện có:
  id, entity, key, label, type, source_type, required,
  validation(JSON), options(JSON), formula, placeholder,
  help_text, status, created_at, updated_at
```

- `validation`: JSON — hiện tại chưa dùng
- `options`: JSON array — chỉ dùng cho select/multiselect, dạng `[{label, value}]`
- `formula`: string — chỉ dùng cho formula type

### 2.2 Font chữ

- `index.css`: `Arial, sans-serif` (đã xóa, chỉ còn comment)
- `App.css:14`: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif` ← **ĐANG DÙNG**
- Đã quy chuẩn xong (Phase trước)

### 2.3 CSS Table — 3 bộ duplicate

| Bộ | Selector | Dùng ở | Ghi chú |
|----|----------|--------|---------|
| 1 | `.table-container` | FieldManager, DynamicTable | padding: 10px 12px |
| 2 | bare `table/th/td` | Toàn app | padding: 12px 15px — conflict |
| 3 | `.dynamic-table` | KHÔNG DÙNG | CSS tồn tại nhưng không apply |

### 2.4 CSS Form — 2 bộ conflict

| Bộ | Selector | Dùng ở | Ghi chú |
|----|----------|--------|---------|
| 1 | `.form-group input` | Auth forms, admin modals | padding: 12px, border-radius: 5px, font-size: 16px |
| 2 | `.form-control` | DynamicField, ProfilePage | padding: 8px 12px, border-radius: 6px, font-size: 14px |

### 2.5 FieldManager form hiện tại

- Hiển thị tất cả field cùng lúc (entity, key, label, type, placeholder, help_text, options, required)
- Không có conditional display theo type
- Options chỉ nhập text phân tách bằng dấu phẩy

### 2.6 DynamicField hiện tại

13 type render cơ bản:
- `email`: `<input type="email">` — form input OK
- `phone`: `<input type="tel">` — form input OK
- `url`: `<input type="url">` — form input OK
- `number`: `<input type="number" step="any">` — không phân biệt int/float
- `date`: `<input type="date">` — không có format tùy chọn
- `datetime`: `<input type="datetime-local">` — không có format tùy chọn
- `boolean`: checkbox + label text
- `select`: `<select>` cơ bản
- `multiselect`: checkbox group cơ bản
- `file`: `<input type="file">` cơ bản — không drag-drop
- `formula`: readonly input
- `text`, `textarea`: mặc định

### 2.7 FieldRenderer hiện tại

- `email`: `<a href="mailto:...">` — ** Sai yêu cầu ** (phải là text thường)
- `phone`: `<a href="tel:...">` — ** Sai yêu cầu ** (phải là text thường)
- `url`: `<a href="..." underline>` — ** Sai yêu cầu ** (phải là text màu xanh, không underline)
- `boolean`: ✓/✗ — ** Sai yêu cầu ** (phải là ✓/rỗng)
- `file`: hiển thị "N file(s)" — ** Sai yêu cầu ** (phải là button mở popup danh sách file)
- `number`: `toLocaleString()` — OK
- `date/datetime`: `toLocaleDateString/toLocaleString('vi-VN')` — cần hỗ trợ format tùy chọn

---

## 3. YÊU CẦU CHI TIẾT

### 3.1 FieldManager form — Conditional display

**Luôn hiển thị (mặc định):**
- Entity (select: stations/station_proposals/users)
- Key (text, tự động hóa từ label)
- Label (text)
- Placeholder (text)
- Type (select: 13 loại)
- Required (checkbox)

**Hiển thị khi chọn type:**

| Type | Additional fields |
|------|-------------------|
| `number` | Number format (integer/float/currency), decimal places |
| `date` | Date format (DD/MM/YYYY, YYYY-MM-DD, etc.), timezone |
| `datetime` | Datetime format, timezone |
| `select` | Options editor (add/remove/color/border-radius), source type (user input/data source) |
| `multiselect` | Options editor (add/remove/color/border-radius), source type, max selection |
| `file` | Accept config (images/videos/documents), max size (MB), multiple (boolean) |
| `formula` | Formula editor với field references |
| `text`, `textarea`, `email`, `phone`, `url`, `boolean` | Không thêm gì |

### 3.2 Type-specific behaviors

#### Email/Phone
- **Form input:** `<input type="email">` / `<input type="tel">`
- **Table display:** Text thường, KHÔNG hiển thị link
- **Value:** String

#### Text/Textarea
- **Form input:** `<input type="text">` / `<textarea>`
- **Table display:** Text (textarea giới hạn 100 ký tự + "...")
- **Value:** String

#### Number
- **Form input:** `<input type="number">`
- **Config:** numberFormat (integer/float/currency), decimalPlaces
- **Table display:** `toLocaleString('vi-VN')` + format theo config
- **Value:** Number

#### URL
- **Form input:** `<input type="url">`
- **Table display:** Text màu xanh (`#4a6cf7`), KHÔNG underline
- **Value:** String

#### Date
- **Form input:** `<input type="date">`
- **Config:** dateFormat (DD/MM/YYYY, YYYY-MM-DD, etc.), timezone
- **Table display:** Hiển thị theo dateFormat
- **Value:** String (ISO date)

#### Datetime
- **Form input:** `<input type="datetime-local">`
- **Config:** datetimeFormat, timezone
- **Table display:** Hiển thị theo datetimeFormat
- **Value:** String (ISO datetime)

#### Boolean
- **Form input:** `<input type="checkbox">`
- **Table display:** ✓ nếu true, rỗng nếu false (KHÔNG hiện ✗)
- **Value:** Boolean/0/1

#### Select
**Form config:**
```
options: [{ label, value, color?, borderRadius? }]
source_type: "user_input" | "data_source"
data_source: { entity, field } — nếu là data source
parent_field: "field_key" — nếu có cascading
```

**Options editor:**
- Mỗi option: input label + input value + color picker + border-radius select
- Nút + thêm option
- Nút x xóa option
- Border radius: square | rounded-sm | rounded | rounded-full

**Cascading:**
- Field B có `parent_field: "field_a"`
- Khi chọn field_a → filter options của field_b
- Ví dụ: select "tỉnh" → select "xã" chỉ hiện xã thuộc tỉnh đó

**Table display:** Badge/label với color + border-radius từ config
**Form input:** `<select>` hoặc custom dropdown

#### Multiselect
- Tương tự Select nhưng cho phép chọn nhiều
- **Table display:** Badge list (mỗi value 1 badge với color + border-radius)
- **Form input:** Checkbox group với badges

#### File
**Form config:**
```
accept: { images: boolean, videos: boolean, documents: boolean, custom: string[] }
maxSize: number (MB, default 10)
multiple: boolean
```

**Form input:** Drag-drop zone + click to select
- Upload qua `/api/files/upload`
- Preview images
- Hiển thị danh sách files đã upload

**Table display:**
- Avatar field (trang cá nhân): mini thumbnail tròn (border-radius: 50%, 40x40px) — chỉ dùng cho field `avatar` trên entity `users`
- Các file fields khác: button "Xem file" → popup danh sách files

**Popup danh sách files:**
- Hiển thị danh sách tất cả files trong record
- Mỗi file: tên file + icon theo loại + nút "Xem" + nút "Mở tab mới"
- Click "Xem" → mở viewer inline (read-only)
- Click "Mở tab mới" → mở file trong tab mới (tùy chọn)

**Viewer (read-only):**
- Image: `<img>` with zoom controls
- Video: `<video>` with play/pause/seek controls
- Document (PDF, Word, etc.): `<iframe>` or embed viewer
- Không cho phép sửa/xóa file trong viewer

#### Formula
**Form config:**
```
formula: "SUM(field_a, field_b) * field_c"
referencedFields: ["field_a", "field_b", "field_c"]
```

**Supported functions:**
- Math: SUM, AVG, MIN, MAX, COUNT, ABS, ROUND
- Text: CONCAT, LENGTH, UPPER, LOWER, TRIM
- Logic: IF(condition, true_val, false_val)
- Reference: {field_key} để reference field khác

**Form input:** Formula bar (readonly) + formula editor
**Table display:** Kết quả tính toán (readonly)
**Value:** Number/String tùy formula

### 3.3 Giao diện quy chuẩn

#### Table — 1 bộ chuẩn
- Dùng `.table-container` làm chuẩn
- Xóa bare `table/th/td` rules
- Xóa `.dynamic-table` rules trùng lặp
- Áp dụng cho: FieldManager, DynamicTable, import preview

#### Form — 1 bộ chuẩn
- Dùng `.form-control` làm chuẩn cho inputs
- Xóa `.form-group input` rules cũ
- Áp dụng cho: DynamicForm, RecordDetailPopup, auth forms, admin modals

#### RecordDetailPopup
- Hiển thị theo field config từ view
- View mode: FieldRenderer theo type config
- Edit mode: DynamicField theo type config
- Hỗ trợ cascading select trong edit mode

---

## 4. FILES CẦN SỬA/TẠO

### Backend
| File | Thay đổi |
|------|----------|
| `database/10-alter-field-definitions-add-config.sql` | Migration thêm columns |
| `services/fieldDefinitionService.js` | CRUD hỗ trợ config mới |
| `services/dynamicUtils.js` | Validate theo config mới |

### Frontend — Components
| File | Thay đổi |
|------|----------|
| `components/admin/FieldManager.jsx` | **Rewrite** — conditional form |
| `components/dynamic/DynamicField.jsx` | **Rewrite** — type-specific rendering |
| `components/dynamic/FieldRenderer.jsx` | **Rewrite** — type-specific display |
| `components/dynamic/DynamicForm.jsx` | **Rewrite** — cascading, formula |
| `components/dynamic/DynamicTable.jsx` | **Rewrite** — file column (round avatar cho avatar users, button cho các file khác) |
| `components/dynamic/FileUpload.jsx` | **Rewrite** — config accept/size |
| `components/dynamic/FileListPopup.jsx` | **Tạo mới** — popup danh sách files |
| `components/admin/RecordDetailPopup.jsx` | **Rewrite** — full config support |
| `components/dynamic/FormulaEditor.jsx` | **Tạo mới** — formula editor |
| `components/dynamic/SelectOptionsEditor.jsx` | **Tạo mới** — options editor |
| `components/dynamic/FileViewer.jsx` | **Tạo mới** — image/video/doc viewer |
| `components/dynamic/CascadingSelect.jsx` | **Tạo mới** — cascading select |

### Frontend — CSS
| File | Thay đổi |
|------|----------|
| `App.css` | Dọn dẹp duplicate, thêm CSS mới |

### Frontend — Services
| File | Thay đổi |
|------|----------|
| `services/api.js` | Bổ sung API calls mới nếu cần |
