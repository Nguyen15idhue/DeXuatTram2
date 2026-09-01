# TỐI ƯU FORMULA EDITOR + NUMBER FORMATTING

**Ngày tạo:** 2026-09-01
**Phụ thuộc:** Phase B (Formula Pre/Post) đã hoàn thành

---

## TÓM TẮT

Tối ưu giao diện FormulaEditor và xây dựng hệ thống định dạng số thống nhất.

---

## CÁC YÊU CẦU

### REQ-1: Tối ưu layout operator buttons
**Vấn đề:** 9 nút `(` `)` `+` `-` `*` `/` `^` `,` `>` chiếm quá nhiều diện tích
**Giải pháp:** Xếp thành 1-2 hàng, mỗi hàng 4-5 nút
**Files:** `frontend/src/components/dynamic/FormulaEditor.jsx`, `frontend/src/App.css`

### REQ-2: Collapsible sections cho field buttons
**Vấn đề:** Trường số, Trường text, Biến metadata chiếm nhiều diện tích
**Giải pháp:** Thu gọn/mở rộng, xếp 2 thông tin 1 hàng (grid 2 cột)
**Files:** `frontend/src/components/dynamic/FormulaEditor.jsx`, `frontend/src/App.css`

### REQ-3: Autocomplete cho ô nhập công thức
**Vấn đề:** User phải nhớ tên functions, không có gợi ý
**Giải pháp:** Hiển thị dropdown gợi ý khi nhập, bao gồm cả fields và functions
**Files:** `frontend/src/components/dynamic/FormulaEditor.jsx`, `frontend/src/App.css`

### REQ-4: Hệ thống định dạng số
**Vấn đề:** Không có định dạng số thống nhất, mỗi nơi format khác nhau
**Giải pháp:** Tạo utility `formatNumber()` dùng chung, áp dụng cho:
- Formula field (form + table)
- Number field (form + table)
- Select/Multiselect có optionType=number
- Data List cột type=number

**Sub-requirements:**
- REQ-4a: Thêm phân loại optionType (text/number) cho select/multiselect
- REQ-4b: Tạo utility formatNumber(value, config)
- REQ-4c: Cập nhật FieldManager config number format
- REQ-4d: Cập nhật DynamicField + FieldRenderer hiển thị đúng format
- REQ-4e: Cập nhật FormulaEditor output config
- REQ-4f: Cập nhật DataListEditor hiển thị number format
- REQ-4g: Backend tương thích

---

## TRẠNG THÁI

| Bước | Yêu cầu | Trạng thái | Bắt đầu | Hoàn thành | Ghi chú |
|------|----------|------------|----------|------------|---------|
| 1 | REQ-1: Operator buttons layout | ✅ | 2026-09-01 | 2026-09-01 | 2 hàng紧凑, operators-grid CSS |
| 2 | REQ-2: Collapsible sections | ✅ | 2026-09-01 | 2026-09-01 | CollapsibleSection + items-grid-2 |
| 3 | REQ-3: Autocomplete dropdown | ✅ | 2026-09-01 | 2026-09-01 | Fields + functions + metadata |
| 4 | REQ-4a: optionType cho select/multiselect | ✅ | 2026-09-01 | 2026-09-01 | optionType text/number per option |
| 5 | REQ-4b: utility formatNumber() | ✅ | 2026-09-01 | 2026-09-01 | 4 formats: plain/dot/comma/space |
| 6 | REQ-4c: FieldManager number config | ✅ | 2026-09-01 | 2026-09-01 | display_format + unit |
| 7 | REQ-4d: DynamicField + FieldRenderer format | ✅ | 2026-09-01 | 2026-09-01 | formatNumber cho number/select/multiselect/formula |
| 8 | REQ-4e: FormulaEditor output format | ✅ | 2026-09-01 | 2026-09-01 | numberFormat selector |
| 9 | REQ-4f: DataListEditor number format | ✅ | 2026-09-01 | 2026-09-01 | Cell display + column config |
| 10 | REQ-4g: Backend tương thích | ✅ | 2026-09-01 | 2026-09-01 | Không cần thay đổi backend |
| 11 | Test tổng hợp + Build | ✅ | 2026-09-01 | 2026-09-01 | Frontend build + backend start OK |

---

## CHI TIẾT TỪNG BƯỚC

### BƯỚC 1: REQ-1 — Operator Buttons Layout

### Kết quả
- 9 nút xếp thành 1 hàng gọn với `operators-grid` (flex wrap)
- CSS: `display: flex; gap: 4px; flex-wrap: wrap;`
- Mỗi nút: `min-width: 32px; height: 30px; font-size: 13px;`

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/dynamic/FormulaEditor.jsx` | ✅ |
| `frontend/src/App.css` | ✅ |

---

## BƯỚC 2: REQ-2 — Collapsible Sections

### Kết quả
- `CollapsibleSection` component: header clickable + arrow ▾/▸ + count badge
- Default: expanded, có thể toggle
- Content: `items-grid-2` — grid 2 cột cho field buttons và metadata buttons
- Áp dụng cho: Trường số, Trường text, Biến metadata

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/dynamic/FormulaEditor.jsx` | ✅ (CollapsibleSection) |
| `frontend/src/App.css` | ✅ (collapsible-section, items-grid-2) |

---

## BƯỚC 3: REQ-3 — Autocomplete Dropdown

### Kết quả
- `ALL_SUGGESTIONS`: combines fields + functions + metadata
- `getWordAtCursor()`: detect word tại vị trí con trỏ
- `filterSuggestions()`: filter matches theo prefix
- `handleKeyDown()`: ArrowUp/Down navigate, Enter select, Escape dismiss
- `handleExpressionChange()`: trigger autocomplete khi nhập
- Dropdown: hiển thị dưới textarea, type badges (field/function/var)
- Click hoặc Enter → insert suggestion (function insert placeholder)

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/dynamic/FormulaEditor.jsx` | ✅ |
| `frontend/src/App.css` | ✅ (autocomplete-dropdown, autocomplete-item) |

---

### BƯỚC 4: REQ-4a — optionType cho Select/Multiselect

### Kết quả
- Mỗi option trong select/multiselect có thêm `optionType` (text|number)
- Khi optionType=number → hiển thị thêm `numberFormat` selector per option
- Field-level `numberFormat` hiển thị khi có ít nhất 1 option là number

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/admin/FieldManager.jsx` | ✅ |

---

## BƯỚC 5: REQ-4b — Utility formatNumber()

### Kết quả
- Tạo `frontend/src/utils/formatNumber.js`
- `formatNumber(value, { format, decimalPlaces, unit })` — format số theo cấu hình
- 4 formats: `plain` (1000), `comma` (1,000), `dot` (1.000), `space` (1 000)
- `parseFormattedNumber(str)` — parse chuỗi đã format về số
- `NUMBER_FORMAT_OPTIONS` — export cho select dropdown

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/utils/formatNumber.js` | ✅ (mới) |

---

## BƯỚC 6: REQ-4c — FieldManager Number Config

### Kết quả
- Number field: thêm `display_format` selector (plain/comma/dot/space)
- Number field: thêm `unit` text input
- Select/multiselect: thêm field-level `numberFormat` khi có option number
- Default form: thêm `display_format: 'plain'`, `unit: ''`

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/admin/FieldManager.jsx` | ✅ |

---

## BƯỚC 7: REQ-4d — DynamicField + FieldRenderer Format

### Kết quả
- FieldRenderer `number`: dùng `formatNumber(value, { format, decimalPlaces, unit })`
- FieldRenderer `select`: check `optionType === 'number'` → format theo numberFormat
- FieldRenderer `multiselect`: tương tự select
- FieldRenderer `formula`: thêm case — URL type render as link
- DynamicForm `computeFormula`: dùng `formatNumber()` thay vì `toFixed()`

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/dynamic/FieldRenderer.jsx` | ✅ |
| `frontend/src/components/dynamic/DynamicForm.jsx` | ✅ |

---

## BƯỚC 8: REQ-4e — FormulaEditor Output Format

### Kết quả
- Thêm `numberFormat` selector vào output config (plain/comma/dot/space)
- `formatResult()` dùng `formatNumber()` thay vì `toFixed()`
- Config: `{ numberFormat, decimalPlaces, unit }`

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/dynamic/FormulaEditor.jsx` | ✅ |

---

## BƯỚC 9: REQ-4f — DataListEditor Number Format

### Kết quả
- DataListManager: thêm `number_format` selector cho cột type=number
- DataListEditor: cell display dùng `formatNumber()` cho cột number

### Files
| File | Trạng thái |
|------|------------|
| `frontend/src/components/admin/DataListManager.jsx` | ✅ |
| `frontend/src/components/admin/DataListEditor.jsx` | ✅ |

---

## BƯỚC 10: REQ-4g — Backend Tương Thích

### Kết quả
- Không cần thay đổi backend
- `number_format`, `display_format`, `unit` lưu trong field_definitions (JSON fields)
- `formula_config.numberFormat` lưu trong formula_config JSON
- `columns_config[].number_format` lưu trong data_lists JSON

---

## BƯỚC 11: Test Tổng Hợp

### Kết quả
- Frontend build: ✅ (9.21s)
- Backend start: ✅
- All REQ completed: 11/11

### Files mới tạo/sửa
| File | Trạng thái |
|------|------------|
| `frontend/src/utils/formatNumber.js` | ✅ (mới) |
| `frontend/src/components/dynamic/FormulaEditor.jsx` | ✅ (updated) |
| `frontend/src/components/dynamic/DynamicForm.jsx` | ✅ (updated) |
| `frontend/src/components/dynamic/FieldRenderer.jsx` | ✅ (updated) |
| `frontend/src/components/admin/FieldManager.jsx` | ✅ (updated) |
| `frontend/src/components/admin/DataListManager.jsx` | ✅ (updated) |
| `frontend/src/components/admin/DataListEditor.jsx` | ✅ (updated) |
| `frontend/src/App.css` | ✅ (updated) |
