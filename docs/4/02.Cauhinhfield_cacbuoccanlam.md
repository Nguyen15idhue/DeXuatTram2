# CẤU HÌNH FIELD — CÁC BƯỚC CẦN LÀM

**Ngày tạo:** 2026-08-31

---

## BƯỚC 1: DATABASE MIGRATION

### Chi tiết cần làm
Tạo file `database/10-alter-field-definitions-add-config.sql`:

```sql
-- Thêm cột config cho field_definitions
ALTER TABLE field_definitions
  ADD COLUMN number_format VARCHAR(20) DEFAULT NULL COMMENT 'integer|float|currency' AFTER type,
  ADD COLUMN decimal_places INT DEFAULT NULL COMMENT 'Số chữ số thập phân' AFTER number_format,
  ADD COLUMN date_format VARCHAR(30) DEFAULT NULL COMMENT 'DD/MM/YYYY, YYYY-MM-DD, etc.' AFTER decimal_places,
  ADD COLUMN timezone VARCHAR(50) DEFAULT NULL COMMENT 'Múi giờ' AFTER date_format,
  ADD COLUMN source_config JSON DEFAULT NULL COMMENT 'Cấu hình data source cho select' AFTER options,
  ADD COLUMN parent_field VARCHAR(100) DEFAULT NULL COMMENT 'Field key của parent cho cascading' AFTER source_config,
  ADD COLUMN option_style JSON DEFAULT NULL COMMENT 'Style cho options: color, borderRadius' AFTER parent_field,
  ADD COLUMN file_config JSON DEFAULT NULL COMMENT 'Cấu hình file: accept, maxSize, multiple' AFTER option_style,
  ADD COLUMN formula_config JSON DEFAULT NULL COMMENT 'Cấu hình formula: expression, referencedFields' AFTER file_config;
```

### Yêu cầu cần đạt
- Migration chạy thành công trên MySQL
- Không mất dữ liệu hiện có
- Các cột mới có default values phù hợp

### Checklist test
- [ ] Chạy migration SQL thành công
- [ ] Kiểm tra DESCRIBE field_definitions có đủ columns mới
- [ ] Kiểm tra dữ liệu 29 records hiện có không bị ảnh hưởng
- [ ] INSERT record mới với config columns hoạt động
- [ ] UPDATE record hiện có với config columns hoạt động

---

## BƯỚC 2: BACKEND — FIELD DEFINITION SERVICE UPDATE

### Chi tiết cần làm
Sửa `backend/src/services/fieldDefinitionService.js`:
- `createFieldDefinition`: Thêm hỗ trợ columns mới (number_format, decimal_places, date_format, timezone, source_config, parent_field, option_style, file_config, formula_config)
- `updateFieldDefinition`: Tương tự
- `getAllFieldDefinitions`: Trả về tất cả columns mới
- `getFieldDefinitionById`: Trả về tất cả columns mới

Sửa `backend/src/services/dynamicUtils.js`:
- `validateField`: Update validation theo config mới (number_format, file_config, etc.)

### Yêu cầu cần đạt
- Tạo field với config mới lưu đúng vào DB
- Lấy field ra có đủ config mới
- Validate dữ liệu theo config mới

### Checklist test
- [ ] POST /api/field-definitions với number_format, decimal_places → lưu OK
- [ ] POST /api/field-definitions với date_format, timezone → lưu OK
- [ ] POST /api/field-definitions với source_config, parent_field → lưu OK
- [ ] POST /api/field-definitions với file_config → lưu OK
- [ ] POST /api/field-definitions với formula_config → lưu OK
- [ ] PUT /api/field-definitions/:id cập nhật config → OK
- [ ] GET /api/field-definitions trả về config đầy đủ → OK
- [ ] GET /api/field-definitions/entity/:entity trả về config đầy đủ → OK

---

## BƯỚC 3: FRONTEND — FIELD MANAGER FORM REWRITE

### Chi tiết cần làm
Rewrite `frontend/src/components/admin/FieldManager.jsx`:

**Default fields (luôn hiện):**
- Entity (select)
- Key (text)
- Label (text)
- Placeholder (text)
- Type (select)
- Required (checkbox)

**Conditional fields (ẩn/hiện theo type):**

| Type | Additional fields |
|------|-------------------|
| number | Number format (select: integer/float/currency), Decimal places (number, hiện khi float) |
| date | Date format (select: DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY) |
| datetime | Datetime format (select), Timezone (select) |
| select | Options editor (+/- items, color, borderRadius), Source type (user_input/data_source) |
| multiselect | Options editor, Source type, Max selection (number) |
| file | Accept images (checkbox), Accept videos (checkbox), Accept documents (checkbox), Max size MB (number), Multiple (checkbox) |
| formula | Formula editor (textarea/select với field references) |

**Options Editor component:**
- Mỗi option: input label + input value + color picker + border-radius select
- Nút "+" thêm option mới
- Nút "x" xóa option
- Border radius options: square, rounded-sm, rounded, rounded-full

**Formula Editor component:**
- Textarea cho formula expression
- Danh sách fields có thể thêm vào formula
- Danh sách functions (SUM, AVG, etc.)
- Preview kết quả (nếu có data)

### Yêu cầu cần đạt
- Khi chưa chọn type: chỉ hiện 6 fields mặc định
- Khi chọn type: hiện đúng additional fields cho type đó
- Options editor hoạt động đúng (add/remove/color/radius)
- Formula editor hoạt động đúng
- Submit form lưu đúng config vào DB

### Checklist test
- [ ] Mở form tạo mới → chỉ hiện 6 fields mặc định
- [ ] Chọn type "number" → hiện Number format + Decimal places
- [ ] Chọn type "date" → hiện Date format
- [ ] Chọn type "select" → hiện Options editor
- [ ] Options editor: thêm option → hiện đúng
- [ ] Options editor: xóa option → hoạt động
- [ ] Options editor: thay đổi color → lưu đúng
- [ ] Options editor: thay đổi borderRadius → lưu đúng
- [ ] Chọn type "file" → hiện Accept config + Max size + Multiple
- [ ] Chọn type "formula" → hiện Formula editor
- [ ] Switch type → additional fields thay đổi đúng
- [ ] Submit form → config lưu vào DB đúng
- [ ] Edit field → load config từ DB đúng

---

## BƯỚC 4: FRONTEND — DYNAMIC FIELD REWRITE

### Chi tiết cần làm
Rewrite `frontend/src/components/dynamic/DynamicField.jsx`:

**Mỗi type render theo config:**

| Type | Config | Form Input |
|------|--------|------------|
| text | - | `<input type="text">` |
| textarea | - | `<textarea>` |
| email | - | `<input type="email">` |
| phone | - | `<input type="tel">` |
| url | - | `<input type="url">` |
| number | numberFormat, decimalPlaces | `<input type="number">` with step |
| date | dateFormat | `<input type="date">` |
| datetime | datetimeFormat | `<input type="datetime-local">` |
| boolean | - | `<input type="checkbox">` |
| select | options, sourceConfig, parentField, optionStyle | Custom dropdown với badges |
| multiselect | options, sourceConfig, parentField, optionStyle | Checkbox group với badges |
| file | fileConfig (accept, maxSize, multiple) | FileUpload component |
| formula | formulaConfig | Readonly input + formula bar |

**Select/Multiselect nâng cao:**
- Hiển thị options theo từng dòng 1
- Mỗi option có badge với color + border-radius từ config
- Nút + thêm option (nếu user_input)
- Nút x xóa option
- Cascading: khi parent field thay đổi → filter options

### Yêu cần đạt
- Mỗi type render đúng theo config từ field_definitions
- Select/multiselect hiển thị badges với color + borderRadius
- Cascading select hoạt động (parent → child)
- File upload hoạt động với config accept/size

### Checklist test
- [ ] Text/textarea: render đúng
- [ ] Email/phone/url: render input đúng type
- [ ] Number: step đúng theo numberFormat
- [ ] Date/datetime: render input đúng
- [ ] Boolean: checkbox hoạt động
- [ ] Select: hiển thị options với badges
- [ ] Select: color hiển thị đúng
- [ ] Select: borderRadius hiển thị đúng
- [ ] Multiselect: checkbox group hoạt động
- [ ] Multiselect: badges hiển thị đúng
- [ ] Cascading select: chọn parent → filter child
- [ ] File: drag-drop hoạt động
- [ ] File: accept config hoạt động
- [ ] File: max size check hoạt động
- [ ] Formula: readonly + hiển thị kết quả

---

## BƯỚC 5: FRONTEND — FIELD RENDERER REWRITE

### Chi tiết cần làm
Rewrite `frontend/src/components/dynamic/FieldRenderer.jsx`:

**Display rules:**

| Type | Display |
|------|---------|
| email | Text thường (KHÔNG link) |
| phone | Text thường (KHÔNG link) |
| url | Text màu xanh (#4a6cf7), KHÔNG underline |
| boolean | ✓ nếu true, rỗng nếu false (KHÔNG ✗) |
| number | `toLocaleString('vi-VN')` + format theo config |
| date | Hiển thị theo dateFormat config |
| datetime | Hiển thị theo datetimeFormat config |
| select | Badge với color + borderRadius từ option config |
| multiselect | Badge list với color + borderRadius |
| file | Round avatar (chỉ avatar users) / Button "Xem file" |
| formula | Kết quả tính toán |
| text | Text |
| textarea | Text (giới hạn 100 ký tự + "...") |

**File display:**
- Avatar field (users entity): mini thumbnail tròn (border-radius: 50%, 40x40px) — chỉ cho field `avatar`
- Các file fields khác: button "Xem file" → popup danh sách files

**Popup danh sách files:**
- Hiển thị danh sách files + icon theo loại
- Mỗi file: nút "Xem" (mở viewer inline) + nút "Mở tab mới" (tùy chọn)
- Viewer read-only: image zoom, video play, document embed

### Yêu cầu cần đạt
- Email/phone hiển thị text thường
- URL hiển thị text màu xanh không underline
- Boolean hiển thị ✓/rỗng
- Select/multiselect hiển thị badges với color
- File hiển thị round avatar (chỉ avatar users) hoặc button "Xem file"
- Formula hiển thị kết quả

### Checklist test
- [ ] Email: hiển thị text thường, KHÔNG link mailto
- [ ] Phone: hiển thị text thường, KHÔNG link tel
- [ ] URL: hiển thị text màu xanh, KHÔNG underline
- [ ] Boolean true: hiển thị ✓
- [ ] Boolean false: hiển thị rỗng
- [ ] Number:toLocaleString đúng
- [ ] Date: hiển thị theo format config
- [ ] Select: badge với color đúng
- [ ] Multiselect: badge list đúng
- [ ] File avatar: mini thumbnail tròn (chỉ users entity)
- [ ] File other: button "Xem file" → popup danh sách
- [ ] Popup file: danh sách files hiển thị đúng
- [ ] Popup file: nút "Xem" mở viewer inline
- [ ] Popup file: nút "Mở tab mới" hoạt động
- [ ] Viewer: image zoom OK
- [ ] Viewer: video play OK
- [ ] Viewer: document embed OK
- [ ] Viewer: read-only (không sửa/xóa)
- [ ] Formula: hiển thị kết quả

---

## BƯỚC 6: FRONTEND — FILE UPLOAD & VIEWER

### Chi tiết cần làm

**Rewrite `FileUpload.jsx`:**
- Config accept từ field_config (images/videos/documents/custom)
- Config max_size từ field_config (MB)
- Config multiple từ field_config
- Drag-drop zone
- Upload qua `/api/files/upload`
- Preview images
- Hiển thị danh sách files

**Tạo mới `FileListPopup.jsx`:**
- Popup hiển thị danh sách files của 1 record
- Mỗi file: icon theo loại + tên file + nút "Xem" + nút "Mở tab mới"
- Click "Xem" → mở FileViewer inline (read-only)
- Click "Mở tab mới" → mở file trong tab mới (`window.open`)

**Tạo mới `FileViewer.jsx`:**
- Component viewer read-only
- Image: `<img>` với zoom controls (phóng to/thu nhỏ)
- Video: `<video>` với play/pause/seek/volume controls
- Document (PDF, Word, Excel): `<iframe>` hoặc embed
- Không cho phép sửa/xóa file trong viewer

### Yêu cầu cần đạt
- File upload hoạt động với config accept/size
- File viewer hiển thị đúng định dạng
- Drag-drop hoạt động
- Multiple files hoạt động

### Checklist test
- [ ] File upload: accept images-only → chỉ chọn được ảnh
- [ ] File upload: accept documents-only → chỉ chọn được tài liệu
- [ ] File upload: max size 5MB → từ chối file > 5MB
- [ ] File upload: multiple → chọn nhiều file
- [ ] File upload: drag-drop hoạt động
- [ ] File viewer: mở image → hiển thị đúng với zoom
- [ ] File viewer: mở video → phát được với controls
- [ ] File viewer: mở document → hiển thị được
- [ ] File viewer: read-only (không sửa/xóa)
- [ ] File list popup: hiển thị danh sách files
- [ ] File list popup: nút "Xem" mở viewer inline
- [ ] File list popup: nút "Mở tab mới" hoạt động

---

## BƯỚC 7: FRONTEND — DYNAMIC TABLE & FORM & POPUP

### Chi tiết cần làm

**Rewrite `DynamicTable.jsx`:**
- Column hiển thị theo field config
- File column: round avatar (chỉ avatar users) / button "Xem file" → FileListPopup
- Select column: badge với color
- Number column: format theo config
- URL column: text màu xanh

**Rewrite `DynamicForm.jsx`:**
- Hỗ trợ cascading select
- Hỗ trợ formula readonly
- Hỗ trợ file upload với config

**Rewrite `RecordDetailPopup.jsx`:**
- Hiển thị theo field config từ view
- View mode: FieldRenderer theo type config
- Edit mode: DynamicField theo type config
- Hỗ trợ cascading select

### Yêu cầu cần đạt
- DynamicTable hiển thị đúng theo field config
- DynamicForm hỗ trợ tất cả type behaviors
- RecordDetailPopup hiển thị đúng

### Checklist test
- [ ] DynamicTable: email column hiển thị text thường
- [ ] DynamicTable: URL column hiển thị text màu xanh
- [ ] DynamicTable: boolean column hiển thị ✓/rỗng
- [ ] DynamicTable: file column hiển thị round avatar (chỉ avatar users) hoặc button "Xem file"
- [ ] DynamicTable: select column hiển thị badge
- [ ] DynamicForm: cascading select hoạt động
- [ ] DynamicForm: formula readonly
- [ ] RecordDetailPopup: view mode hiển thị đúng
- [ ] RecordDetailPopup: edit mode hoạt động đúng

---

## BƯỚC 8: CSS CLEANUP

### Chi tiết cần làm
Dọn dẹp `App.css`:

1. **Xóa bare `table/th/td/tr` rules** (lines ~846-869)
2. **Xóa `.dynamic-table` rules** (lines ~2272-2315) — trùng `.table-container`
3. **Xóa `.form-group input` rules** (lines ~59-66) — dùng `.form-control`
4. **Merge import-table vào `.table-container`** hoặc giữ riêng
5. **Thêm CSS cho components mới:** SelectOptionsEditor, FormulaEditor, FileViewer, CascadingSelect

### Yêu cầu cần đạt
- Chỉ còn 1 bộ table CSS (`.table-container`)
- Chỉ còn 1 bộ form CSS (`.form-control`)
- CSS cho components mới hoạt động

### Checklist test
- [ ] FieldManager table hiển thị đúng
- [ ] DynamicTable hiển thị đúng
- [ ] Import preview table hiển thị đúng
- [ ] DynamicForm hiển thị đúng
- [ ] RecordDetailPopup hiển thị đúng
- [ ] Auth forms hiển thị đúng
- [ ] Admin modals hiển thị đúng
- [ ] SelectOptionsEditor CSS OK
- [ ] FormulaEditor CSS OK
- [ ] FileViewer CSS OK

---

## BƯỚC 9: SEED DATA UPDATE

### Chi tiết cần làm
Cập nhật seed data trong `database/09-seed-field-definitions.sql` hoặc tạo file mới:

- Thêm config cho các field hiện có
- Ví dụ: field "Trạng thái" (select) → thêm options với color + borderRadius
- Ví dụ: field "Avatar" (file) → thêm file_config với accept images only
- Ví dụ: field "Vĩ độ" (number) → thêm number_format: float, decimal_places: 6

### Yêu cầu cần đạt
- Tất cả 29 field definitions có config phù hợp
- Select fields có options với color + borderRadius
- File fields có file_config
- Number fields có number_format

### Checklist test
- [ ] SELECT * FROM field_definitions hiển thị config mới
- [ ] Field "Trạng thái" có option_style với color
- [ ] Field "Avatar" có file_config
- [ ] Field "Vĩ độ" có number_format + decimal_places
- [ ] DynamicTable hiển thị đúng theo config mới

---

## BƯỚC 10: FULL INTEGRATION TEST

### Chi tiết cần làm
Test toàn bộ hệ thống:
- FieldManager CRUD với config mới
- DynamicTable hiển thị tất cả types
- DynamicForm hoạt động với tất cả types
- RecordDetailPopup view/edit
- File upload + viewer
- Cascading select
- Formula calculation

### Yêu cầu cần đạt
- Tất cả features hoạt động end-to-end
- Không có runtime errors
- UI thống nhất

### Checklist test
- [ ] FieldManager: tạo field text → hoạt động
- [ ] FieldManager: tạo field number với config → hoạt động
- [ ] FieldManager: tạo field select với options/color → hoạt động
- [ ] FieldManager: tạo field file với config → hoạt động
- [ ] FieldManager: tạo field formula → hoạt động
- [ ] DynamicTable: hiển thị tất cả types đúng
- [ ] DynamicForm: submit với tất cả types
- [ ] RecordDetailPopup: view mode đúng
- [ ] RecordDetailPopup: edit mode đúng
- [ ] File upload hoạt động
- [ ] File viewer hoạt động
- [ ] Cascading select hoạt động
- [ ] Formula calculation đúng
- [ ] Frontend build OK
- [ ] Docker containers chạy OK
