# Field Configuration - Chi tiết cấu hình trường

## Tổng quan

Hệ thống hỗ trợ 13 loại trường, cấu hình tại trang `/admin/fields`. Mỗi trường thuộc 1 entity (`stations`, `station_proposals`, `users`) và có các thuộc tính mở rộng tùy loại.

---

## 1. Các loại trường (13 loại)

| Loại | Mô tả | Giá trị lưu |
|------|-------|-------------|
| `text` | Nhập text ngắn | String |
| `textarea` | Nhập text dài | String |
| `number` | Số (integer/float/currency) | Number |
| `email` | Email | String |
| `phone` | Số điện thoại (10 chữ số) | String |
| `url` | URL | String |
| `date` | Ngày tháng | Date string |
| `datetime` | Ngày giờ | Datetime string |
| `boolean` | Đúng/sai (checkbox) | Boolean |
| `select` | Chọn 1 từ dropdown | String |
| `multiselect` | Chọn nhiều từ checkbox group | Array |
| `file` | Upload file | File reference |
| `formula` | Tính tự động | String (computed) |

---

## 2. Thuộc tính chung (tất cả loại)

| Thuộc tính | Mô tả |
|------------|-------|
| `entity` | Entity chứa field: `stations`, `station_proposals`, `users` |
| `key` | Identifier duy nhất trong entity (vd: `province`, `status`) |
| `label` | Tên hiển thị trên UI |
| `type` | Loại trường (13 loại ở trên) |
| `required` | Bắt buộc hay không |
| `placeholder` | Placeholder text |
| `help_text` | Gợi ý dưới field |
| `source_type` | `json` (tự nhập options) hoặc `fixed` (field cố định hệ thống) |
| `status` | `active` hoặc `inactive` |

---

## 3. Cấu hình chi tiết theo loại

### 3.1 Text / Textarea

Không có cấu hình đặc biệt除了 thuộc tính chung.

### 3.2 Number

| Thuộc tính | Mô tả | Giá trị |
|------------|-------|---------|
| `number_format` | Định dạng số | `integer`, `float`, `currency` |
| `decimal_places` | Số chữ số thập phân | 0-10 |
| `display_format` | Hiển thị số | `plain` (1000), `comma` (1,000), `dot` (1.000), `space` (1 000) |
| `unit` | Đơn vị đo lường | String (VD: `m`, `km`, `W`, `kW`) |

### 3.3 Date / Datetime

| Thuộc tính | Mô tả | Giá trị |
|------------|-------|---------|
| `date_format` | Định dạng ngày | `DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD` |
| `timezone` | Múi giờ | String (VD: `Asia/Ho_Chi_Minh`) |

### 3.4 Boolean

Không có cấu hình đặc biệt.

### 3.5 Select / Multiselect

Đây là loại trường phức tạp nhất, có 2 nguồn dữ liệu:

#### Nguồn 1: Manual Options (`source_type = json`)

| Thuộc tính | Mô tả |
|------------|-------|
| `options` | Mảng `[{label, value, color, borderRadius}]` |
| `option_style` | `{ defaultColor: '#hex', defaultBorderRadius: 'rounded' }` |

**Option properties:**
- `label`: Tên hiển thị
- `value`: Giá trị lưu
- `color`: Màu badge (24 màu có sẵn trong palette)
- `borderRadius`: Bo góc badge: `square`, `rounded-sm`, `rounded`, `rounded-full`

**Option style:**
- `defaultColor`: Màu mặc định cho option không có color riêng
- `defaultBorderRadius`: Bo góc mặc định

#### Nguồn 2: Data List (`source_type = json` + `data_list_id`)

| Thuộc tính | Mô tả |
|------------|-------|
| `data_list_id` | ID của data list nguồn |
| `data_list_column` | Cột trong data list chứa giá trị cho field này |
| `parent_field` | Key của field cha (tạo cascading select) |
| `relation_key` | Cột trong data list chứa FK về parent (nếu khác parent_field.key) |

**Cách hoạt động:**
1. Field chỉ định data list và column để lấy values
2. Frontend fetch data list, transform flat rows → tree map
3. Select options = unique values từ column chỉ định

#### Cascading Select (Parent-Child)

Khi field A là parent của field B:
- Field B có `parent_field = key của A`
- Field B có `relation_key` = cột trong data list chứa FK về parent value
- Khi user chọn parent value, child options được lọc tự động

**Ví dụ thực tế:**
- `province` (parent): data_list_id=4, data_list_column="tinh"
- `xa_phuong` (child): data_list_id=4, data_list_column="xa", parent_field="province", relation_key="tinh"
- Khi chọn "Thành phố Hà Nội" → dropdown chỉ hiện phường/xã của Hà Nội

### 3.6 File

| Thuộc tính | Mô tả | Giá trị |
|------------|-------|---------|
| `file_config` | Cấu hình loại file | Object |
| `file_config.images` | Cho phép ảnh | Boolean |
| `file_config.videos` | Cho phép video | Boolean |
| `file_config.documents` | Cho phép tài liệu (pdf, doc, docx, xls, xlsx, txt) | Boolean |
| `file_config.maxSize` | Kích thước tối đa (MB) | Number (1-100) |
| `file_config.multiple` | Cho phép nhiều file | Boolean |

### 3.7 Formula

| Thuộc tính | Mô tả |
|------------|-------|
| `formula_config` | `{ compute_mode, expression, referencedFields, outputType, outputFormat, decimalPlaces, unit }` |
| `formula_config.compute_mode` | `pre` (tính khi điền form) hoặc `post` (tính sau khi tạo record) |
| `formula_config.expression` | Biểu thức tính toán (VD: `ROUNDUP(price * quantity, 2)`) |
| `formula_config.outputType` | Kiểu kết quả: `number`, `text`, `date` |
| `formula_config.outputFormat` | Định dạng hiển thị kết quả (VD: `comma`, `dot`) |
| `formula_config.decimalPlaces` | Số chữ số thập phân hiển thị |
| `formula_config.unit` | Đơn vị hiển thị kết quả |

**Cách hoạt động:**
- **Pre-compute**: Frontend dùng mathjs evaluator tính giá trị khi form data thay đổi, hiển thị read-only
- **Post-compute**: Backend tính SAU khi INSERT record, dùng record metadata (id, entity, base_url, created_at), lưu kết quả vào `custom_data`
- mathjs v15.2.0 với 26 custom functions (ROUNDUP, ROUNDDOWN, MOD, IF, AND, OR, NOT, IFERROR, COUNT, COUNTA, COUNTIF, SUMIF, AVERAGE, CONCAT, LEN, LEFT, RIGHT, UPPER, LOWER, TRIM, DATE, TODAY, LPAD, RPAD, YEAR, MONTH, DAY, NOW)

---

## 4. Luồng dữ liệu Select/Multiselect chi tiết

### Bước 1: Admin cấu hình field

Tại `/admin/fields`:
1. Chọn type `select` hoặc `multiselect`
2. Chọn nguồn: Manual options hoặc Data List
3. Nếu Data List: chọn data list, column
4. Nếu cascading: chọn parent field, relation key
5. Submit → Backend lưu vào `field_definitions` table

### Bước 2: Backend trả form config

API `GET /api/dynamic/:entity/form/:formId` trả về:
```
fields: [
  {
    key: "province",
    type: "select",
    data_list_id: 4,
    data_list_column: "tinh",
    parent_field: "",
    relation_key: "",
    options: [...] // manual options nếu có
  },
  {
    key: "xa_phuong",
    type: "select",
    data_list_id: 4,
    data_list_column: "xa",
    parent_field: "province",
    relation_key: "tinh"
  }
]
```

### Bước 3: Frontend load form + data lists

`DynamicForm.jsx`:
1. Fetch form config → setFields
2. Thu thập data list IDs từ fields có `data_list_id`
3. Fetch mỗi data list song song
4. Transform flat rows → tree map:
   ```
   dlMap[4] = {
     tree: {
       "tinh": { "Thành phố Hà Nội": [{value, label, _raw}, ...], ... },
       "xa":   { "Phường Hoàn Kiếm": [{...}], ... }
     },
     unique: {
       "tinh": ["Thành phố Hà Nội", "Hà Nội", ...],
       "xa":   ["Phường Hoàn Kiếm", ...]
     }
   }
   ```

### Bước 4: Render select/multiselect

**Root field (không parent):**
```
getFilteredOptions(province)
  → parent_field = "" (falsy)
  → return unique["tinh"].map(v => ({value: v, label: v}))
  → 3321 rows nhưng chỉ lấy unique tinh
```

**Child field (có parent):**
```
getFilteredOptions(xa_phuong)
  → parent_field = "province"
  → parentVal = formData["province"]  (VD: "Thành phố Hà Nội")
  → parentCol = relation_key || parentField.data_list_column = "tinh"
  → tree["tinh"]["Thành phố Hà Nội"] = [...rows where tinh = HN...]
  → Lấy unique col="xa" từ rows này
  → return [{value: "Phường Hoàn Kiếm", label: "Phường Hoàn Kiếm"}, ...]
```

### Bước 5: DynamicField render

**Select:**
- Custom dropdown với badge màu
- Hiển thị giá trị đã chọn hoặc "-- Chọn --"
- Click mở dropdown với danh sách options

**Multiselect:**
- Checkbox group với badge màu
- Toggle chọn/bỏ chọn
- Hiển thị outline khi đã chọn

### Bước 6: Khi parent thay đổi

```
DynamicForm useEffect:
  parentFieldMap = { "province": ["xa_phuong"] }
  Khi formData["province"] thay đổi:
    → Check isOptionValidForParent(childField, parentVal, currentChildVal)
    → Nếu currentChildVal không còn hợp lệ → reset child = ''
    → Recompute formula fields
```

---

## 5. FieldRenderer (Hiển thị read-only)

Dùng trong DynamicTable và RecordDetailPopup:

| Loại | Hiển thị |
|------|----------|
| `select` | Badge màu với option styling (format number nếu optionType=number) |
| `multiselect` | Nhiều badge trong flex wrap (format number nếu optionType=number) |
| `boolean` | ✓ hoặc khoảng trắng |
| `number` | formatNumber() với display_format + unit (VD: "1.000 m") |
| `formula` | formatNumber() với output config (nếu URL → link) |
| `date/datetime` | Format theo date_format |
| `textarea` | Cắt 100 ký tự + "...", hover hiển thị đầy đủ |
| `url` | Blue link text |
| `file` | "Xem file (N)" button → mở FileListPopup |

---

## 6. Validation khi submit

Backend validate theo type:
- `number`: Kiểm tra precision, decimal places
- `email`: Regex format
- `phone`: Đúng 10 chữ số
- `url`: Valid URL format
- `date/datetime`: Parseable date
- `boolean`: Boolean value
- `select`: Value phải nằm trong options (nếu cấu hình data_list)
- `multiselect`: Array value, mỗi phần tử nằm trong options
- `file`: File size check
