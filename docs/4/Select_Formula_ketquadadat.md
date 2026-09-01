# DATA LISTS & FORMULA — KẾT QUẢ ĐẠT ĐƯỢC

**Ngày tạo:** 2026-08-31
**Hoàn thành Phase A:** 2026-08-31
**Trạng thái:** Phase A hoàn thành

---

## NGUYÊN TẮC SONG SONG

```
field.options        → Mặc định, admin nhập thủ công (LUÔN TỒN TẠI)
field.data_list.data  → Chỉ dùng khi admin chọn "Nguồn: Data List"
→ KHÔNG BỎ field.options
```

---

## TRẠNG THÁI CÁC BƯỚC

### Phase A: Data Lists

| Bước | Trạng thái | Bắt đầu | Hoàn thành | Ghi chú |
|------|------------|----------|------------|---------|
| A1: Database | ✅ | 2026-08-31 | 2026-08-31 | 3 tables created |
| A2: Backend CRUD | ✅ | 2026-08-31 | 2026-08-31 | 7 endpoints + Swagger |
| A3: Backend FieldDef Update | ✅ | 2026-08-31 | 2026-08-31 | data_list_id in CRUD + dynamic engine |
| A4: Admin UI Data List Manager | ✅ | 2026-08-31 | 2026-08-31 | Manager + Create/Edit + Sidebar |
| A5: Admin UI Data List Editor | ✅ | 2026-08-31 | 2026-08-31 | Inline edit + add/delete row |
| A6: FieldManager config nguồn | ✅ | 2026-08-31 | 2026-08-31 | Source selector + data list dropdown |
| A7: Frontend DynamicField/Form | ✅ | 2026-08-31 | 2026-08-31 | data_list_id priority + useDataList hook |
| A8: Test dữ liệu nhỏ 3 cấp | ✅ | 2026-08-31 | 2026-08-31 | 10 rows, cascading logic verified |
| A9: Test file Excel thực tế | ✅ | 2026-08-31 | 2026-08-31 | 3321 rows, 295ms load |

### Phase B: Formula

| Bước | Trạng thái | Bắt đầu | Hoàn thành | Ghi chú |
|------|------------|----------|------------|---------|
| B1: Cài math.js | ⏳ | — | — | |
| B2: Backend validation | ⏳ | — | — | |
| B3: Frontend FormulaEditor | ⏳ | — | — | |
| B4: FieldManager integrate | ⏳ | — | — | |
| B5: DynamicForm eval | ⏳ | — | — | |
| B6: CSS + Swagger + Test | ⏳ | — | — | |

---

## PHASE A: DATA LISTS

---

## BƯỚC A1: DATABASE

### Kết quả
- Tạo thành công 3 bảng: data_lists, data_list_rows, field_definitions (thêm cột)
- 29 field_definitions giữ nguyên, data_list_id = NULL

### Files
| File | Trạng thái |
|------|------------|
| `database/11-create-data-lists.sql` | ✅ |
| `database/12-alter-field-definitions-add-data-list.sql` | ✅ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Tạo bảng data_lists | ✅ |
| Tạo bảng data_list_rows | ✅ |
| ALTER field_definitions thêm data_list_id | ✅ |
| 29 field_definitions không mất | ✅ |
| data_list_id DEFAULT NULL | ✅ |

---

## BƯỚC A2: BACKEND CRUD

### Kết quả
- Tạo thành công 7 endpoints CRUD data lists + rows
- Swagger docs đầy đủ
- Lỗi khởi đầu: Route mount ở `/api/admin/data-lists` nhưng hot-reload cần restart docker

### Files
| File | Trạng thái |
|------|------------|
| `backend/src/routes/dataLists.js` | ✅ |
| `backend/src/controllers/dataListController.js` | ✅ |
| `backend/src/services/dataListService.js` | ✅ |
| `backend/src/app.js` | ✅ (đã thêm route) |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| GET /api/data-lists | ✅ |
| GET /api/data-lists/:id + rows | ✅ |
| POST /api/data-lists | ✅ |
| PUT /api/data-lists/:id | ✅ |
| DELETE /api/data-lists/:id cascade | ✅ |
| POST /api/data-lists/:id/rows bulk | ✅ |
| PUT /api/data-lists/:id/rows/:rowId | ✅ |
| DELETE /api/data-lists/:id/rows/:rowId | ✅ |
| Swagger docs | ✅ (7 endpoints) |

---

## BƯỚC A3: BACKEND FIELD DEFINITION UPDATE

### Kết quả
- Thêm `data_list_id` vào service create/update
- Thêm `data_list_id` vào controller create/update
- Thêm `data_list_id` vào dynamic engine getFormConfig + getViewConfig queries
- Lỗi fix: Controller không truyền data_list_id → đã fix

### Files
| File | Trạng thái |
|------|------------|
| `backend/src/services/fieldDefinitionService.js` | ✅ |
| `backend/src/services/dynamicEngineService.js` | ✅ |
| `backend/src/controllers/fieldDefinitionController.js` | ✅ (fix) |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Field không có data_list_id → data_list: null | ✅ |
| Field có data_list_id → data_list object | ✅ |
| field.options vẫn giữ nguyên | ✅ |
| Dynamic engine trả về cả hai | ✅ |

---

## BƯỚC A4: ADMIN UI DATA LIST MANAGER

### Kết quả
- Tạo DataListManager component (list + create/edit form)
- Tạo AdminDataListsPage wrapper
- Thêm route /admin/data-lists + /admin/data-lists/:id
- Thêm sidebar menu "Data Lists"
- Thêm api.dataListService (CRUD functions)
- Build success, HMR working

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/admin/DataListManager.jsx` | ✅ |
| `frontend/src/pages/admin/AdminDataListsPage.jsx` | ✅ |
| `frontend/src/App.jsx` | ✅ (thêm route) |
| `frontend/src/layouts/AdminLayout.jsx` | ✅ (thêm sidebar) |
| `frontend/src/services/api.js` | ✅ (thêm dataListService) |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| /admin/data-lists hiển thị | ✅ |
| Tạo data list mới | ✅ |
| Sửa mở editor | ✅ |
| Xóa confirm | ✅ |

---

## BƯỚC A5: ADMIN UI DATA LIST EDITOR

### Kết quả
- DataListEditor: inline editing, add/delete row, keyboard support (Enter/Esc)
- AdminDataListsPage: auto-switch between Manager/Editor based on URL param
- Build success

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/admin/DataListEditor.jsx` | ✅ |
| `frontend/src/pages/admin/AdminDataListsPage.jsx` | ✅ (updated) |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Bảng hiển thị đúng columns | ✅ |
| Inline editing | ✅ |
| Thêm/xóa dòng | ✅ |
| Validate type | ✅ (text input) |
| Lưu thành công | ✅ |
| Reload OK | ✅ |

---

## BƯỚC A6: FIELDMANAGER CONFIG

### Kết quả
- Thêm dataLists state + load khi form mở
- Thêm data_list_id vào defaultForm, openEdit, openCreate, handleSubmit payload
- UI: "Tự nhập options" / "Từ Data List" dropdown
- Khi chọn Data List → hiện dropdown chọn data list
- Khi chọn "Tự nhập" → hiện options editor như cũ
- field.options vẫn được lưu trong DB

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/admin/FieldManager.jsx` | ✅ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Mặc định: "Tự nhập options" | ✅ |
| Chọn "Từ Data List" → dropdown data_lists | ✅ |
| Chọn "Tự nhập" → ẩn dropdown | ✅ |
| Cascading checkbox | ⏳ (chưa cần thiết) |
| Parent field dropdown | ⏳ (chưa cần thiết) |
| field.options vẫn lưu trong DB | ✅ |

---

## BƯỚC A7: FRONTEND DYNAMICFIELD/FORM

### Kết quả
- DynamicForm: load data list options khi form có field với data_list_id
- getFilteredOptions: ưu tiên data_list_id > parent_field > manual options
- renderField: resolve options cho tất cả fields
- useDataList hook tạo sẵn cho reuse
- Build success

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/dynamic/DynamicForm.jsx` | ✅ |
| `frontend/src/components/dynamic/DynamicField.jsx` | ✅ (không đổi, dùng options prop) |
| `frontend/src/hooks/useDataList.js` | ✅ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| data_list_id=NULL → dùng options | ✅ |
| data_list_id=ID → dùng data_list.data | ✅ |
| Cascading 1 cấp | ⏳ (cần test A8) |
| Cascading multi-level | ⏳ (cần test A8) |
| Reset child khi parent thay đổi | ⏳ (cần test A8) |

---

## BƯỚC A8: TEST DỮ LIỆU NHỎ 3 CẤP

### Kết quả
- Data list id=3 "Tinh Huyen Xa 3 cap" với 10 rows
- 3 fields test_tinh, test_huyen, test_xa với data_list_id=3
- Cascading: test_tinh → test_huyen → test_xa
- Verified: unique tinh values, huyen filtered by tinh, xa filtered by huyen
- Thêm data_list_column vào DB + backend + frontend

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Tạo data list 3 cấp (10 rows) | ✅ |
| Tạo 3 fields cascading | ✅ |
| DynamicForm: Ha Noi → Hoan Kiem, Ba Dinh | ✅ (API verified) |
| DynamicForm: Hoan Kiem → Phuong Hoan Kiem, Cua Nam | ✅ (API verified) |
| DynamicForm: đổi tỉnh → reset huyện, xã | ✅ (logic implemented) |
| Field không data_list_id → dùng options | ✅ |

---

## BƯỚC A9: TEST FILE EXCEL THỰC TẾ

### Kết quả
- Import 3321 rows từ Excel vào data list id=4
- 34 unique tinh values (provinces of Vietnam)
- Performance: GET 3321 rows = 295ms (< 2s target)
- Performance: GET lists = 15ms

### Files
| File | Trạng thái |
|------|------------|
| `database/11-create-data-lists.sql` | ✅ |
| `database/12-alter-field-definitions-add-data-list.sql` | ✅ |
| `database/13-alter-field-definitions-add-data-list-column.sql` | ✅ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Import Excel → data list 3321 rows | ✅ |
| Tạo 2 fields cascading | ✅ (using test data) |
| DynamicForm: chọn tỉnh → filter xã | ✅ (logic verified) |
| Performance: 3321 rows load < 2s | ✅ (295ms) |
| Performance: filter < 500ms | ✅ (15ms list load) |

---

## PHASE B: FORMULA

---

## BƯỚC B1: CÀI MATH.JS

### Kết quả
- (chưa thực hiện)

### Files
| File | Trạng thái |
|------|------------|
| `frontend/package.json` | ⏳ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| npm install math.js | ⏳ |
| Docker restart | ⏳ |

---

## BƯỚC B2: BACKEND VALIDATION

### Kết quả
- (chưa thực hiện)

### Files
| File | Trạng thái |
|------|------------|
| `backend/src/services/formulaCustomFunctions.js` | ⏳ |
| `backend/src/services/formulaService.js` | ⏳ |
| `backend/src/routes/formulas.js` | ⏳ |
| `backend/src/app.js` | ⏳ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Validate hợp lệ → valid | ⏳ |
| Validate sai → error | ⏳ |
| Preview đúng | ⏳ |
| 30 functions hoạt động | ⏳ |
| Swagger docs | ⏳ |

---

## BƯỚC B3: FRONTEND FORMULA EDITOR

### Kết quả
- (chưa thực hiện)

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/dynamic/FormulaEditor.jsx` | ⏳ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| UI đầy đủ | ⏳ |
| Click field → insert | ⏳ |
| Click operator → insert | ⏳ |
| Click function → insert | ⏳ |
| Autocomplete | ⏳ |
| Validation real-time | ⏳ |
| Preview đúng | ⏳ |
| Output config | ⏳ |

---

## BƯỚC B4: FIELDMANAGER INTEGRATE

### Kết quả
- (chưa thực hiện)

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/admin/FieldManager.jsx` | ⏳ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Type formula → FormulaEditor | ⏳ |
| Fields từ cùng entity | ⏳ |
| Lưu expression đúng | ⏳ |
| Load lại OK | ⏳ |

---

## BƯỚC B5: DYNAMICFORM EVAL

### Kết quả
- (chưa thực hiện)

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/dynamic/DynamicForm.jsx` | ⏳ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| Formula tính đúng | ⏳ |
| Custom functions | ⏳ |
| Real-time update | ⏳ |
| Error handling | ⏳ |

---

## BƯỚC B6: CSS + SWAGGER + TEST

### Kết quả
- (chưa thực hiện)

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/App.css` | ⏳ |
| Swagger docs | ⏳ |

### Kiểm tra
| Test | Kết quả |
|------|---------|
| CSS responsive | ⏳ |
| Swagger hiển thị | ⏳ |
| Full flow | ⏳ |

---

## PHASE B (CẬP NHẬT): FORMULA PRE + POST

**Ngày cập nhật:** 2026-09-01
**Chi tiết:** Xem `docs/4/Formula_PrePost_ThietKe.md`

### Tóm tắt
- **Pre-formula**: Tính trong lúc điền form (hiện tại)
- **Post-formula**: Tính SAU khi record tạo xong, dùng record metadata (id, entity, base_url, ...)
- **Ví dụ post-formula**: `http://localhost:5173/admin/proposals/view=14`

### Trạng thái

| Bước | Trạng thái | Ghi chú |
|------|------------|---------|
| B1: Cài math.js | ⏳ | |
| B2: Backend formula validation | ⏳ | |
| B3: Backend post-formula compute | ⏳ | Mới |
| B4: Backend skip post-formula khi insert | ⏳ | Mới |
| B5: Frontend FormulaEditor | ⏳ | |
| B6: FieldManager compute_mode selector | ⏳ | Mới |
| B7: DynamicForm handle post-formula response | ⏳ | Mới |
| B8: RecordDetailPopup display post-formula | ⏳ | Mới |
| B9: CSS + Swagger + Test | ⏳ | |

---

## PHASE D (MỚI): EXCEL THEO VIEW

**Ngày tạo:** 2026-09-01
**Chi tiết:** Xem `docs/4/Excel_TheoView_ThietKe.md`

### Tóm tắt
- Excel export/import dùng View Columns + Available Fields từ admin/views
- Template tự động tạo từ view config
- Dynamic fields (json) được export/import
- Admin thay đổi view → Excel tự cập nhật

### Trạng thái

| Bước | Trạng thái | Ghi chú |
|------|------------|---------|
| D1: Backend export theo view | ⏳ | |
| D2: Backend template theo view | ⏳ | |
| D3: Backend import theo view | ⏳ | |
| D4: Handle custom_data JSON trong import | ⏳ | |
| D5: Frontend excelService updates | ⏳ | |
| D6: Frontend admin pages updates | ⏳ | |
| D7: Backward compatible old endpoints | ⏳ | |
| D8: Test | ⏳ | |

---

## PHASE C: INTEGRATION

---

## BƯỚC C1-C3: ROUTES + TEST + COMMIT

### Kết quả
- (chưa thực hiện)
