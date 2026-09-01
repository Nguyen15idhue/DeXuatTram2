# FORMULA PRE + POST — THIẾT KẾ

**Ngày tạo:** 2026-09-01
**Trạng thái:** Thiết kế (chưa code)

---

## TỔNG QUAN

Formula field hỗ trợ 2 chế độ tính toán:
- **Pre-computation**: Tính trong lúc điền form, trước khi submit
- **Post-computation**: Tính SAU khi record đã được tạo (có ID)

---

## 1. PRE-COMPUTATION (Hiện tại)

### Mô tả
- Tính giá trị trong lúc user điền form
- Dữ liệu đầu vào = các trường khác trong cùng form
- Kết quả hiển thị ngay lập tức (real-time)
- Giá trị được submit cùng lúc với các field khác

### Khi nào dùng
- Tổng, hiệu, tích, thương của các số trong form
- Link có thể tạo trước khi có ID
- Bất kỳ tính toán nào cần kết quả NGAY khi user nhập data

### Ví dụ
```
field: "total_cost"
expression: "unit_price * quantity * (1 - discount)"
→ Kết quả tính ngay khi user nhập unit_price, quantity, discount
```

### Workflow
```
User nhập form → computeFormula() chạy → hiển thị kết quả → User submit → Gửi cả giá trị computed
```

### Limitations
- Chỉ dùng được dữ liệu có sẵn trong form (trước khi submit)
- Không dùng được record ID, created_at, hay bất kỳ metadata nào của record

---

## 2. POST-COMPUTATION (Mới)

### Mô tả
- Tính giá trị SAU khi record đã được tạo thành công (có ID)
- Dữ liệu đầu vào = record metadata (id, entity, base_url, created_at, ...)
- Kết quả được lưu lại vào record sau khi compute

### Khi nào dùng
- Tạo URL link đến record (cần ID): `http://localhost:5173/admin/proposals/view=14`
- Tạo mã code tự động: `PROP-2026-00014`
- Tính toán dựa trên created_at: `Tháng 8/2026`
- Bất kỳ giá trị nào cần metadata của record để tính

### Ví dụ
```
field: "record_link"
expression: "CONCAT('http://localhost:5173/admin/', entity, '/view=', id)"
→ Kết quả: "http://localhost:5173/admin/station_proposals/view=14"

field: "proposal_code"
expression: "CONCAT('PROP-', YEAR(created_at), '-', LPAD(id, 5, '0'))"
→ Kết quả: "PROP-2026-00014"
```

### Workflow
```
User submit form → Backend insert record → Lấy ID mới → Compute post-formula → Update record → Trả kết quả về frontend
```

### Record Metadata có thể dùng trong post-formula

| Variable | Mô tả | Ví dụ |
|----------|-------|-------|
| `id` | ID của record vừa tạo | `14` |
| `entity` | Entity name | `station_proposals` |
| `base_url` | Base URL của frontend | `http://localhost:5173` |
| `created_at` | Thời gian tạo (server time) | `2026-09-01T10:30:00Z` |
| `user_id` | ID của user tạo record | `5` |
| `user_email` | Email của user tạo record | `user@example.com` |

---

## 3. FORMULA_CONFIG SCHEMA MỚI

### Hiện tại
```json
{
  "expression": "price * quantity",
  "referencedFields": ["price", "quantity"]
}
```

### Mới (thêm compute_mode và nhiều fields hơn)
```json
{
  "compute_mode": "pre",
  "expression": "price * quantity * (1 - discount)",
  "referencedFields": ["price", "quantity", "discount"],
  "outputType": "number",
  "outputFormat": "currency",
  "decimalPlaces": 0,
  "unit": "VND"
}
```

### Post-formula config
```json
{
  "compute_mode": "post",
  "expression": "CONCAT(base_url, '/', entity, '/view=', id)",
  "referencedFields": [],
  "outputType": "url",
  "label": "Xem chi tiết"
}
```

### Fields trong formula_config

| Field | Bắt buộc | Mô tả |
|-------|-----------|-------|
| `compute_mode` | Không | `'pre'` (mặc định) hoặc `'post'` |
| `expression` | Có | Biểu thức tính toán |
| `referencedFields` | Không | Danh sách field keys được tham chiếu (chỉ dùng cho pre) |
| `outputType` | Không | `'number'`, `'text'`, `'url'` (mặc định: tự detect) |
| `outputFormat` | Không | `'currency'`, `'percentage'`, `'date'` |
| `decimalPlaces` | Không | Số chữ số thập phân (mặc định: 2) |
| `unit` | Không | Đơn vị hiển thị: `'VND'`, `'%'`, `'m²'` |
| `label` | Không | Text hiển thị cho link (nếu outputType=url) |

---

## 4. BACKEND CHANGES CẦN THIẾT

### 4.1 Insert flow (POST record)

```
1. Receive form data từ client
2. Separate fields: pre-formula fields (computed by client) vs post-formula fields
3. Validate: skip post-formula fields (chưa có giá trị)
4. INSERT record → lấy new INSERT_ID
5. Fetch record metadata: id, entity, created_at, user_id, user_email
6. For each post-formula field:
   a. Get formula_config.expression
   b. Replace variables: {id}, {entity}, {base_url}, {created_at}, {user_id}, {user_email}
   c. Evaluate expression
   d. Store result
7. UPDATE record với post-formula values
8. Return complete record (bao gồm cả post-formula values)
```

### 4.2 Validation update

```javascript
// dynamicUtils.js - validateField
case 'formula':
  if (field.compute_mode === 'post') {
    // Skip validation — sẽ compute sau khi insert
    return { valid: true };
  }
  // Pre-formula: validate như hiện tại
  return { valid: true };
```

### 4.3 Formula evaluation service (Backend)

```javascript
// backend/src/services/formulaService.js (mới)
exports.evaluatePostFormula = (expression, metadata) => {
  let expr = expression;
  
  // Replace metadata variables
  expr = expr.replace(/\bid\b/g, metadata.id);
  expr = expr.replace(/\bentity\b/g, `'${metadata.entity}'`);
  expr = expr.replace(/\bbase_url\b/g, `'${metadata.base_url}'`);
  expr = expr.replace(/\bcreated_at\b/g, `'${metadata.created_at}'`);
  expr = expr.replace(/\buser_id\b/g, metadata.user_id);
  expr = expr.replace(/\buser_email\b/g, `'${metadata.user_email}'`);
  
  // Evaluate (safe — no user input)
  return Function(`"use strict"; return (${expr})`)();
};
```

### 4.4 API changes

```
POST /api/:entity  (create record)
  → Response mới: { success, data: { ...record, _postFormulas: { field_key: computed_value } } }

PUT /api/:entity/:id  (update record)
  → Tương tự: compute post-formula nếu expression thay đổi
```

---

## 5. FRONTEND CHANGES CẦN THIẾT

### 5.1 DynamicForm - Insert handling

```javascript
// Sau khi onSubmit thành công:
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!validate()) return;
  try {
    const res = await onSubmit(formData);
    if (res.success && res.data._postFormulas) {
      // Merge post-formula values vào formData
      setFormData(prev => ({ ...prev, ...res.data._postFormulas }));
    }
  } catch (err) {
    setError(err.message || 'Lỗi lưu dữ liệu');
  }
};
```

### 5.2 RecordDetailPopup - Post-formula display

```
- Khi mở record detail:
  1. Fetch record data
  2. Post-formula fields có giá trị từ server (đã compute lúc insert/update)
  3. Hiển thị bình thường như các field khác

- Khi edit record:
  1. Pre-formula fields: recomputed real-time
  2. Post-formula fields: hiển thị giá trị hiện tại, read-only
  3. Sau khi save: server recomputes post-formula → cập nhật display
```

### 5.3 FieldManager - Post-formula config UI

```
Khi chọn type = formula:
  ○ Pre-computation (tính trong lúc điền form)
  ○ Post-computation (tính sau khi tạo record)
  
Nếu Post-computation:
  [ ] Có thể chọn metadata variables để chèn vào expression
  Variables available:
    - {id} → ID record
    - {entity} → Tên entity
    - {base_url} → Base URL frontend
    - {created_at} → Thời gian tạo
    - {user_id} → ID user tạo
    - {user_email} → Email user tạo
```

---

## 6. VÍ DỤ CỤ THỂ

### Ví dụ 1: Link xem record

**Field config:**
```json
{
  "key": "record_link",
  "label": "Link xem",
  "type": "formula",
  "formula_config": {
    "compute_mode": "post",
    "expression": "CONCAT(base_url, '/', entity, '/view=', id)",
    "outputType": "url",
    "label": "Xem chi tiết"
  }
}
```

**Khi insert proposal có ID=14:**
```
expression = "CONCAT(base_url, '/', entity, '/view=', id)"
= CONCAT('http://localhost:5173', '/', 'station_proposals', '/view=', 14)
= 'http://localhost:5173/station_proposals/view=14'
```

### Ví dụ 2: Mã code proposal

**Field config:**
```json
{
  "key": "proposal_code",
  "label": "Mã đề xuất",
  "type": "formula",
  "formula_config": {
    "compute_mode": "post",
    "expression": "CONCAT('PROP-', YEAR(created_at), '-', LPAD(id, 5, '0'))",
    "outputType": "text"
  }
}
```

**Khi insert proposal ID=14, created_at=2026-09-01:**
```
= CONCAT('PROP-', YEAR('2026-09-01'), '-', LPAD(14, 5, '0'))
= CONCAT('PROP-', '2026', '-', '00014')
= 'PROP-2026-00014'
```

### Ví dụ 3: Pre + Post combo

**Form có 3 fields:**
1. `unit_price` (number) — user nhập
2. `quantity` (number) — user nhập
3. `total` (formula, pre) — compute: `unit_price * quantity`
4. `record_summary` (formula, post) — compute: `CONCAT('Đơn hàng #', id, ' - Tổng: ', total, ' VND')`

**Workflow:**
```
User nhập unit_price=100000, quantity=5
→ total = 500000 (pre-computed real-time)
→ User submit
→ Backend insert → ID=42
→ Post-compute: record_summary = "Đơn hàng #42 - Tổng: 500000 VND"
→ Update record
→ Return to frontend
```

---

## 7. EDGE CASES

| Case | Xử lý |
|------|-------|
| Post-formula expression lỗi | Bỏ qua field đó, không update, log warning |
| Record update thay đổi field ảnh hưởng pre-formula | Recompute pre-formula real-time |
| Record update không thay đổi gì | Không recompute post-formula |
| Base URL thay đổi (deploy different domain) | Post-formula cần recompute tất cả records |
| Field tham chiếu trong pre-formula bị xóa | Expression lỗi → trả '' |

---

## 8. MIGRATION PLAN

### Phase B (Updated)

| Bước | Mô tả | Ưu tiên |
|------|-------|---------|
| B1 | Cài math.js (thay Function() eval) | Cao |
| B2 | Backend formula validation service | Cao |
| B3 | Backend post-formula compute service | Cao |
| B4 | Backend: Skip post-formula khi insert, compute sau | Cao |
| B5 | Frontend FormulaEditor component | Trung bình |
| B6 | FieldManager: compute_mode selector | Trung bình |
| B7 | DynamicForm: Handle post-formula response | Trung bình |
| B8 | RecordDetailPopup: Display post-formula | Thấp |
| B9 | CSS + Swagger + Test | Thấp |
