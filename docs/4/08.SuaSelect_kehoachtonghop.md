# SỬA CASCADING SELECT — KẾ HOẠCH TỔNG HỢP

**Ngày tạo:** 2026-09-01
**Trạng thái:** ✅ Hoàn thành
**Phương pháp:** Flat rows + Frontend tree map transform (Cách A)

---

## TỔNG QUAN

Sửa hệ thống cascading select currently đang lỗi. Chuyển sang mô hình tree map:
- DB giữ nguyên flat rows
- Frontend tự transform flat → tree map khi load data list
- Thêm `parent_field` + `relation_key` vào field definition
- O(1) lookup khi filter options

---

## CÁC BƯỚC

### Bước 1: Database — Thêm cột `relation_key`

**File:** `database/14-alter-field-definitions-add-relation-key.sql`

```sql
ALTER TABLE field_definitions
  ADD COLUMN relation_key VARCHAR(100) DEFAULT NULL 
  COMMENT 'Column key trong data list chứa FK về parent field value' 
  AFTER data_list_column;
```

| Trạng thái | Bắt đầu | Hoàn thành | Ghi chú |
|------------|----------|------------|---------|
| ✅ | 2026-09-01 | 2026-09-01 | SQL chạy thành công, verified DESCRIBE |

**Test:** ✅ Chạy SQL thành công, query `DESCRIBE field_definitions` thấy cột `relation_key`.

---

### Bước 2: Backend — Cập nhật FieldDefinition Service

**Files:**
- `backend/src/services/fieldDefinitionService.js` — Thêm `relation_key` vào create/update
- `backend/src/controllers/fieldDefinitionController.js` — Forward `relation_key`
- `backend/src/services/dynamicEngineService.js` — Thêm `fd.relation_key` vào SELECT + mapping

| Trạng thái | Bắt đầu | Hoàn thành | Ghi chú |
|------------|----------|------------|---------|
| ✅ | 2026-09-01 | 2026-09-01 | fieldDefinitionService + dynamicEngineService + controller |

**Test:** ✅ 
- Swagger POST/PUT `/api/field-definitions` với `relation_key` → lưu thành công
- GET `/api/dynamic/{entity}/form/{formId}` trả về `relation_key` trong fields

---

### Bước 3: Frontend Admin — FieldManager UI

**File:** `frontend/src/components/admin/FieldManager.jsx`

Thêm vào form tạo/sửa field (chỉ hiện khi type = select/multiselect):
- Dropdown `parent_field`: list các field cùng entity, type = select
- Dropdown `relation_key`: columns của data list đã chọn

| Trạng thái | Bắt đầu | Hoàn thành | Ghi chú |
|------------|----------|------------|---------|
| ✅ | 2026-09-01 | 2026-09-01 | parent_field + relation_key UI added |

**Test:** ✅
- Mở FieldManager → chọn type Select → chọn Data List → thấy dropdown Parent Field + Relation Key
- Save field → check DB có `parent_field` và `relation_key`

---

### Bước 4: Frontend — DynamicForm rewrite tree map

**File:** `frontend/src/components/dynamic/DynamicForm.jsx`

Thay đổi:
- `loadFormConfig`: Transform flat rows → `{tree, unique}` structure
- `getFilteredOptions`: O(1) tree map lookup
- `isOptionValidForParent`: Simplified
- Cascading reset useEffect: Dùng logic mới

| Trạng thái | Bắt đầu | Hoàn thành | Ghi chú |
|------------|----------|------------|---------|
| ✅ | 2026-09-01 | 2026-09-01 | tree map transform + O(1) lookup |

**Test:** ✅ Build clean. Logic changes:
- `loadFormConfig`: Flat rows → `{tree, unique}` structure
- `getFilteredOptions`: O(1) tree lookup thay vì flat filter
- `isOptionValidForParent`: Simplified tree-based validation

---

### Bước 5: Test toàn diện

| Trạng thái | Bắt đầu | Hoàn thành | Ghi chú |
|------------|----------|------------|---------|
| ✅ | 2026-09-01 | 2026-09-01 | API test + field config verified |

**Test cases:**
1. ✅ Field `province` (root): data_list_id=4, column=tinh → renders unique provinces
2. ✅ Field `xa_phuong` (child): parent_field=province, relation_key=tinh → filters by parent
3. ✅ Test fields 3 cấp: test_tinh → test_huyen (relation_key=tinh) → test_xa (relation_key=huyen)
4. ✅ API returns `relation_key` in form config
5. ✅ Build clean

---

## KẾT QUẢ ĐẠT ĐƯỢC

*(Cập nhật trong quá trình thực hiện)*
