# DATA LISTS & FORMULA — CÁC BƯỚC CẦN LÀM

**Ngày tạo:** 2026-08-31
**Cập nhật:** 2026-08-31

---

## QUAN TRỌNG: Nguyen tac song song

```
field.options        → Mặc định, admin nhập thủ công
field.data_list.data  → Chỉ dùng khi admin chọn "Nguồn: Data List"
→ CẢ HAI CÙNG TỒN TẠI, không bỏ field.options
→ Frontend ưu tiên: nếu field.data_list_id ≠ null → dùng data_list.data, ngược lại → dùng field.options
```

---

## PHASE A: DATA LISTS — Dữ liệu dùng chung

---

## BƯỚC A1: DATABASE — TẠO BẢNG DATA LISTS

### Chi tiết cần làm
Tạo file `database/11-create-data-lists.sql`:

```sql
CREATE TABLE IF NOT EXISTS data_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  columns_config JSON NOT NULL COMMENT 'Cấu trúc columns: [{key, label, type}]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_list_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_id INT NOT NULL,
  data JSON NOT NULL COMMENT 'Dữ liệu dòng: {column_key: value}',
  parent_row_id INT DEFAULT NULL COMMENT 'Self-reference cho multi-level cascading',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES data_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_row_id) REFERENCES data_list_rows(id) ON DELETE SET NULL,
  INDEX idx_list_id (list_id),
  INDEX idx_parent_row_id (parent_row_id)
);
```

Tạo file `database/12-alter-field-definitions-add-data-list.sql`:

```sql
ALTER TABLE field_definitions
  ADD COLUMN data_list_id INT DEFAULT NULL COMMENT 'Tham chiếu data_lists.id. NULL=options thủ công' AFTER options,
  ADD FOREIGN KEY (data_list_id) REFERENCES data_lists(id) ON DELETE SET NULL;
```

### Yêu cầu cần đạt
- 2 bảng mới tạo thành công
- field_definitions thêm cột data_list_id DEFAULT NULL
- 29 records hiện có KHÔNG BỊ ẢNH HƯỞNG (data_list_id = NULL)

### Checklist test
- [ ] Chạy SQL tạo bảng data_lists thành công
- [ ] Chạy SQL tạo bảng data_list_rows thành công
- [ ] ALTER field_definitions thêm data_list_id thành công
- [ ] DESCRIBE data_lists có đủ columns
- [ ] DESCRIBE data_list_rows có đủ columns + FK
- [ ] DESCRIBE field_definitions có cột data_list_id
- [ ] 29 field_definitions vẫn giữ nguyên, data_list_id = NULL

---

## BƯỚC A2: BACKEND — CRUD DATA LISTS

### Chi tiết cần làm

**Tạo file `backend/src/routes/dataLists.js`:**
```
GET    /api/data-lists                  — Danh sách data lists
GET    /api/data-lists/:id              — Chi tiết + rows
POST   /api/data-lists                  — Tạo mới
PUT    /api/data-lists/:id              — Cập nhật
DELETE /api/data-lists/:id              — Xóa (cascade rows)
POST   /api/data-lists/:id/rows         — Thêm rows (bulk)
PUT    /api/data-lists/:id/rows/:rowId  — Sửa row
DELETE /api/data-lists/:id/rows/:rowId  — Xóa row
```

**Tạo file `backend/src/controllers/dataListController.js`:**
- CRUD operations
- Validate columns_config format
- Validate row data type theo columns_config

**Tạo file `backend/src/services/dataListService.js`:**
- CRUD DB operations
- Bulk insert rows
- Handle parent_row_id cascade

**Update `backend/src/app.js`:**
- Thêm route `/api/data-lists`

### Checklist test
- [ ] POST /api/data-lists tạo mới
- [ ] GET /api/data-lists trả về danh sách
- [ ] GET /api/data-lists/:id trả về chi tiết + rows
- [ ] PUT /api/data-lists/:id cập nhật
- [ ] DELETE /api/data-lists/:id xóa cascade
- [ ] POST /api/data-lists/:id/rows thêm rows bulk
- [ ] PUT /api/data-lists/:id/rows/:rowId sửa row
- [ ] DELETE /api/data-lists/:id/rows/:rowId xóa row
- [ ] Swagger docs đầy đủ

---

## BƯỚC A3: BACKEND — UPDATE FIELD DEFINITION SERVICE

### Chi tiết cần làm

**Sửa `backend/src/services/fieldDefinitionService.js`:**
- `getAllFieldDefinitions`: Thêm LEFT JOIN data_lists → trả về `data_list` object (hoặc NULL)
- `getFieldDefinitionById`: Tương tự
- `createFieldDefinition`: Hỗ trợ `data_list_id` field
- `updateFieldDefinition`: Hỗ trợ `data_list_id` field

**Sửa `backend/src/services/dynamicEngineService.js`:**
- `getFormConfig`: Nếu field có `data_list_id` → fetch data_list rows → GÁN vào `field.data_list` (KHÔNG thay thế field.options)
- `getViewConfig`: Tương tự

**Nguyên tắc:**
```
field.options = JSON array thủ công (luôn có)
field.data_list = { id, name, data: [...] } (chỉ có khi data_list_id ≠ NULL)
Frontend quyết định dùng cái nào
```

### Checklist test
- [ ] GET /api/field-definitions/:id → trả về data_list: null (nếu không có data_list_id)
- [ ] GET /api/field-definitions/:id → trả về data_list object (nếu có data_list_id)
- [ ] Field options vẫn giữ nguyên, không bị ghi đè
- [ ] Dynamic engine trả về cả field.options và field.data_list

---

## BƯỚC A4: ADMIN UI — DATA LIST MANAGER (LIST PAGE)

### Chi tiết cần làm

**Tạo file `frontend/src/pages/admin/AdminDataListsPage.jsx`:**
- Bảng: Tên, Mô tả, Số columns, Số rows, Thao tác
- Nút "Tạo mới" → modal/dialog nhập tên + columns_config
- Nút "Sửa" → mở trang editor
- Nút "Xóa" → confirm dialog

**Update `frontend/src/App.jsx`:**
- Route `/admin/data-lists` → AdminDataListsPage

### Checklist test
- [ ] Trang /admin/data-lists hiển thị
- [ ] Tạo data list mới hoạt động
- [ ] Sửa mở trang editor
- [ ] Xóa hiện confirm

---

## BƯỚC A5: ADMIN UI — DATA LIST EDITOR (EXCEL-LIKE)

### Chi tiết cần làm

**Tạo file `frontend/src/components/admin/DataListEditor.jsx`:**
- Hiển thị dữ liệu dạng bảng inline
- Header: tên columns từ columns_config
- Cells: click để edit inline
- Thêm dòng: Enter ở dòng cuối hoặc nút "+"
- Xóa dòng: nút "×" mỗi row
- Validate type theo columns_config
- Nút "Lưu" → bulk save API
- Nút "Hủy"

**Tạo file `frontend/src/pages/admin/AdminDataListEditorPage.jsx`:**
- Load data list theo ID
- Render DataListEditor

**Update `frontend/src/App.jsx`:**
- Route `/admin/data-lists/:id/edit`

### Checklist test
- [ ] Bảng hiển thị đúng columns
- [ ] Click cell → edit inline
- [ ] Enter ở dòng cuối → thêm dòng mới
- [ ] Xóa dòng hoạt động
- [ ] Validate type dữ liệu
- [ ] Lưu thành công
- [ ] Reload → dữ liệu giữ nguyên

---

## BƯỚC A6: ADMIN UI — FIELDMANAGER CẤU HÌNH NGUỒN + CASCADING

### Chi tiết cần làm

**Sửa `frontend/src/components/admin/FieldManager.jsx`:**

Form select/multiselect thêm section "Nguồn dữ liệu":
```
Nguồn dữ liệu:
  ○ Tự nhập options (mặc định)    ← HIỆN section Options thủ công
  ○ Từ Data List                  ← HIỆN dropdown chọn data_list, ẨN Options thủ công
```

Form select/multiselect thêm section "Cascading":
```
Cascading:
  ☐ Có parent field
  Nếu có:
    Parent field: [dropdown chọn field cùng entity]
```

**Lưu ý:**
- `field.options` LUÔN được lưu (dù chọn nguồn nào)
- `field.data_list_id` = NULL nếu "Tự nhập", = ID nếu "Từ Data List"
- Khi load form edit: nếu `data_list_id` ≠ null → chọn radio "Từ Data List"

### Checklist test
- [ ] Mặc định: "Tự nhập options" → hiện Options editor
- [ ] Chọn "Từ Data List" → hiện dropdown data_lists, ẩn Options editor
- [ ] Chọn "Tự nhập" → hiện Options editor, ẩn dropdown
- [ ] Cascading checkbox hoạt động
- [ ] Parent field dropdown chỉ hiện fields cùng entity
- [ ] Submit → data_list_id lưu đúng
- [ ] Field.options vẫn giữ nguyên trong DB

---

## BƯỚC A7: FRONTEND — DYNAMICFIELD/DYNAMICFORM

### Chi tiết cần làm

**Sửa `frontend/src/components/dynamic/DynamicField.jsx`:**
```javascript
// Logic ưu tiên:
const options = field.data_list_id && field.data_list?.data
  ? field.data_list.data          // Ưu tiên data_list
  : field.options;                // Fallback về options thủ công
```

**Sửa `frontend/src/components/dynamic/DynamicForm.jsx`:**
- Cascading logic: dùng `field.data_list.data` nếu có, nếu không → `field.options`
- Multi-level: filter theo `parent_row_id`
- Khi parent thay đổi → reset child

**Tạo file `frontend/src/hooks/useDataList.js`:**
- Fetch data_list theo ID
- Cache

### Checklist test
- [ ] Field data_list_id = NULL → dùng field.options
- [ ] Field data_list_id = ID → dùng field.data_list.data
- [ ] Cascading 1 cấp hoạt động
- [ ] Cascading multi-level hoạt động
- [ ] Reset child khi parent thay đổi

---

## BƯỚC A8: TEST DỮ LIỆU NHỎ 3 CẤP

### Chi tiết cần làm
Tạo data test nhỏ (không dùng data thật) để verify logic 3 cấp:

**Data list "Loại区域" (3 cấp):**
```
Cấp 1 (Tỉnh): Hà Nội, TP.HCM
Cấp 2 (Huyện): Hoàn Kiếm, Ba Đình (→ Hà Nội), Quận 1, Quận 3 (→ TP.HCM)
Cấp 3 (Xã): Phường Hoàn Kiếm, Phường Cửa Nam (→ Hoàn Kiếm), Phường Bến Nghé (→ Quận 1)
```

- Tạo data list bằng API (POST /api/data-lists + rows)
- Tạo 3 field select: `tinh_thanh`, `quan_huyen`, `xa_phuong`
- Configure cascading: xa_phuong → parent=quan_huyen, quan_huyen → parent=tinh_thanh
- Test trong DynamicForm: chọn tỉnh → filter huyện → chọn huyện → filter xã

### Checklist test
- [ ] Tạo data list 3 cấp thành công (10 rows)
- [ ] Tạo 3 fields với cascading config
- [ ] DynamicForm: chọn "Hà Nội" → hiện "Hoàn Kiếm", "Ba Đình"
- [ ] DynamicForm: chọn "Hoàn Kiếm" → hiện "Phường Hoàn Kiếm", "Phường Cửa Nam"
- [ ] DynamicForm: đổi từ "Hà Nội" → "TP.HCM" → reset huyện, xã
- [ ] DynamicForm: field không có data_list_id vẫn dùng options thủ công

---

## BƯỚC A9: TEST FILE EXCEL THỰC TẾ

### Chi tiết cần làm
Sau khi test thành công bước A8, test với file `test_files/Danh-muc-Phuong-xa_moi.xlsx`:

- File: 3322 rows, 2 cấp (tỉnh → xã), KHÔNG có cấp huyện
- Columns: STT, Tên tỉnh/TP mới, Tên Phường/Xã mới

**Bước 1:** Import Excel → tạo data list "Tỉnh/Phường xã":
- Parse Excel bằng SheetJS (frontend) hoặc backend
- Tạo data_list với columns: code (từ STT), name, parent_name
- Bulk insert rows

**Bước 2:** Tạo 2 field select: `tinh_thanh`, `phuong_xa`
- Configure cascading: phuong_xa → parent=tinh_thanh

**Bước 3:** Test DynamicForm:
- Chọn "Thành phố Hà Nội" → hiện các phường xã Hà Nội
- Chọn "Thành phố Huế" → hiện các phường xã Huế

**Bước 4:** Performance test:
- 3322 rows load OK?
- Filter response time < 500ms?

### Checklist test
- [ ] Import Excel → data list 3322 rows thành công
- [ ] Tạo 2 fields cascading
- [ ] DynamicForm: chọn tỉnh → filter xã OK
- [ ] Performance: 3322 rows load < 2s
- [ ] Performance: filter < 500ms

---

## PHASE B: FORMULA VISUAL EDITOR

---

## BƯỚC B1: CÀI MATH.JS

### Chi tiết cần làm
- `npm install mathjs` (frontend + backend)
- Update Docker

### Checklist test
- [ ] npm install thành công
- [ ] Docker restart OK
- [ ] import mathjs hoạt động

---

## BƯỚC B2: BACKEND — FORMULA VALIDATION

### Chi tiết cần làm

**Tạo file `backend/src/services/formulaCustomFunctions.js`:**
```
30 functions: ROUNDUP, ROUNDDOWN, MOD, IF, AND, OR, NOT, IFERROR,
COUNT, COUNTA, COUNTIF, SUMIF, AVERAGE,
CONCAT, LEN, LEFT, RIGHT, UPPER, LOWER, TRIM, DATE, TODAY
```

**Tạo file `backend/src/services/formulaService.js`:**
- validateFormula(expression, availableFields)
- evaluateFormula(expression, scope)

**Tạo file `backend/src/routes/formulas.js`:**
- POST /api/formulas/validate
- POST /api/formulas/preview

**Update `backend/src/app.js`:** Thêm route

### Checklist test
- [ ] Validate expression hợp lệ → valid
- [ ] Validate expression sai → error rõ
- [ ] Preview kết quả đúng
- [ ] 30 custom functions hoạt động
- [ ] Swagger docs

---

## BƯỚC B3: FRONTEND — FORMULA EDITOR

### Chi tiết cần làm

**Tạo file `frontend/src/components/dynamic/FormulaEditor.jsx`:**
- Expression input (textarea)
- Field buttons (number/text/select từ form)
- Operator buttons: `(`, `)`, `+`, `-`, `×`, `÷`
- Function buttons theo nhóm
- Autocomplete dropdown
- Real-time validation
- Preview kết quả mẫu
- Output config (type, format, decimal, unit)

### Checklist test
- [ ] UI đầy đủ
- [ ] Click field → insert
- [ ] Click operator → insert
- [ ] Click function → insert
- [ ] Autocomplete gợi ý đúng
- [ ] Validation real-time
- [ ] Preview đúng

---

## BƯỚC B4: FIELDMANAGER — INTEGRATE

### Chi tiết cần làm
- Thay textarea bằng FormulaEditor
- Truyền allFields, value, onChange

### Checklist test
- [ ] Type formula → hiện FormulaEditor
- [ ] Hiển thị fields từ cùng entity
- [ ] Lưu expression đúng
- [ ] Load lại OK

---

## BƯỚC B5: DYNAMICFORM — EVAL UPDATE

### Chi tiết cần làm
- Import math.js + custom functions
- Thay eval bằng math.evaluate()

### Checklist test
- [ ] Formula tính đúng
- [ ] Custom functions hoạt động
- [ ] Real-time update
- [ ] Error handling

---

## BƯỚC B6: CSS + SWAGGER + TEST

### Chi tiết cần làm
- CSS FormulaEditor
- Swagger docs
- Test full flow

### Checklist test
- [ ] CSS responsive
- [ ] Swagger hiển thị
- [ ] Full flow OK

---

## PHASE C: INTEGRATION

---

## BƯỚC C1: ROUTES + NAVIGATION

### Chi tiết cần làm
- Update App.jsx routes
- Update sidebar menu

---

## BƯỚC C2: FULL INTEGRATION TEST

### Chi tiết cần làm
- Test end-to-end
- Test backward compatibility

---

## BƯỚC C3: COMMIT + PUSH

### Chi tiết cần làm
- Git commit tiếng Việt
- Push GitHub
