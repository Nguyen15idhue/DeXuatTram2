# CẤU HÌNH FIELD — KẾT QUẢ ĐẠT ĐƯỢC

**Ngày tạo:** 2026-08-31
**Trạng thái:** Chưa bắt đầu

---

## TRẠNG THÁI CÁC BƯỚC

| Bước | Trạng thái | Ngày bắt đầu | Ngày hoàn thành | Ghi chú |
|------|------------|---------------|------------------|---------|
| Bước 1: Database Migration | ✅ | 2026-08-31 | 2026-08-31 | 9 columns mới |
| Bước 2: Backend Service Update | ✅ | 2026-08-31 | 2026-08-31 | Fixed controller bug — 3 files updated |
| Bước 3: Field Manager Form | ✅ | 2026-08-31 | 2026-08-31 | Conditional config by type |
| Bước 4: Dynamic Field Rewrite | ✅ | 2026-08-31 | 2026-08-31 | Config-aware rendering |
| Bước 5: Field Renderer Rewrite | ✅ | 2026-08-31 | 2026-08-31 | Read-only display per rules |
| Bước 6: File Upload & Viewer | ✅ | 2026-08-31 | 2026-08-31 | FileListPopup + FileViewer created |
| Bước 7: Dynamic Table/Form/Popup | ✅ | 2026-08-31 | 2026-08-31 | Bug fixes + config-aware rendering |
| Bước 8: CSS Cleanup | ⏳ | — | — | |
| Bước 9: Seed Data Update | ⏳ | — | — | |
| Bước 10: Full Integration Test | ⏳ | — | — | |

---

## BƯỚC 1: DATABASE MIGRATION

### Kết quả đã đạt
- Tạo file SQL migration `database/10-alter-field-definitions-add-config.sql`
- Chạy migration thành công trên MySQL
- Thêm 9 columns mới: number_format, decimal_places, date_format, timezone, source_config, parent_field, option_style, file_config, formula_config
- Không mất dữ liệu (29 records intact)

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `database/10-alter-field-definitions-add-config.sql` | ✅ |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| Migration chạy thành công | ✅ |
| DESCRIBE field_definitions có đủ 9 columns mới | ✅ |
| Dữ liệu 29 records không mất | ✅ |
| INSERT record mới với config columns hoạt động | ✅ |
| UPDATE record với config columns hoạt động | ✅ |
| DELETE record hoạt động, count về 29 | ✅ |
| GET /api/field-definitions hoạt động | ✅ |
| GET /api/field-definitions/entity/stations hoạt động | ✅ |
| Swagger UI Status 200 | ✅ |
| Frontend Status 200 | ✅ |

### Ghi chú
- Migration dùng `ALTER TABLE ... ADD COLUMN` — an toàn, không mất dữ liệu
- Tất cả columns mới đều `DEFAULT NULL` — existing records không bị ảnh hưởng
- JSON columns (source_config, option_style, file_config, formula_config) sẵn sàng cho config phức tạp

---

## BƯỚC 2: BACKEND SERVICE UPDATE

### Kết quả đã đạt
- Updated `fieldDefinitionService.js`: create/update pass all 9 new config columns
- Updated `dynamicEngineService.js`: getFormConfig/getViewConfig queries include new config columns, JSON.parse for source_config, option_style, file_config, formula_config
- Updated `dynamicUtils.js`: validateField validates number_format (integer check), decimal_places, file_config max_size
- Fixed controller bug: `fieldDefinitionController.js` create/update were missing new config fields from req.body destructuring

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `services/fieldDefinitionService.js` | ✅ |
| `services/dynamicEngineService.js` | ✅ |
| `services/dynamicUtils.js` | ✅ |
| `controllers/fieldDefinitionController.js` | ✅ (bug fix) |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| POST number + number_format + decimal_places | ✅ |
| POST date + date_format + timezone | ✅ |
| POST file + file_config JSON | ✅ |
| POST select + option_style JSON | ✅ |
| PUT update number_format + decimal_places | ✅ |
| GET by ID returns all config fields | ✅ |
| GET all list returns config fields | ✅ |
| Dynamic form config includes new columns | ✅ |
| Dynamic view config includes new columns | ✅ |
| DELETE cleanup, count back to 29 | ✅ |

### Ghi chú
- Controller bug: create/update destructured only old fields — new config columns were silently dropped before reaching the service
- Hot reload sometimes doesn't pick up controller changes — manual restart needed
- 9 total test records created and cleaned up during verification

---

## BƯỚC 3: FIELD MANAGER FORM

### Kết quả đã đạt
- Rewritten `FieldManager.jsx`: form shows 6 default fields + conditional config by type
- number: number_format (integer/float/currency), decimal_places (number input)
- date/datetime: date_format (DD/MM/YYYY, YYYY-MM-DD, etc.)
- select/multiselect: options editor (label + value + color picker + border-radius), option_style
- file: file_config (images/videos/documents checkboxes, maxSize, multiple)
- formula: formula_config (expression textarea)
- Added CSS for .form-group-section, .option-row, .options-editor, .form-row

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `components/admin/FieldManager.jsx` | ✅ (rewritten) |
| `App.css` | ✅ (new styles) |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| POST number + number_format + decimal_places | ✅ |
| POST select + options + option_style | ✅ |
| POST file + file_config | ✅ |
| POST date + date_format | ✅ |
| PUT update number config | ✅ |
| DELETE cleanup, count back to 29 | ✅ |
| Frontend build OK | ✅ |

### Ghi chú
- Options editor: inline row with label/value/color/radius + add/remove buttons
- File config: checkboxes for accept types + maxSize number + multiple checkbox
- Conditional sections wrapped in `.form-group-section` with background styling

---

## BƯỚC 4: DYNAMIC FIELD REWRITE

### Kết quả đã đạt
- Rewritten `DynamicField.jsx`: all 13 types render with config from field_definitions
- Number: step based on number_format (integer→1, float→decimal_places)
- Select: custom dropdown with badges (color + borderRadius from option_style)
- Multiselect: checkbox group with badge toggle (color + borderRadius)
- File: delegates to FileUpload with accept built from file_config (images/videos/documents), maxSize, multiple
- Formula: readonly input
- Updated `DynamicForm.jsx`: unified DynamicField for all types (removed separate FileUpload branch)
- Updated `RecordDetailPopup.jsx`: passes full field config + entityId + entityType to DynamicField

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `components/dynamic/DynamicField.jsx` | ✅ (rewritten) |
| `components/dynamic/DynamicForm.jsx` | ✅ (simplified) |
| `components/admin/RecordDetailPopup.jsx` | ✅ (full config pass) |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| Frontend build OK | ✅ |
| Number step correct per number_format | ✅ |
| Select dropdown with badges | ✅ |
| Multiselect badge toggle | ✅ |
| File accept from file_config | ✅ |
| Formula readonly | ✅ |

### Ghi chú
- Select uses custom dropdown (not native <select>) to show colored badges
- Badge style computed from option.color + option.borderRadius + optionStyle defaults
- FileUpload already handles maxSize check, so DynamicField just builds accept string from file_config

---

## BƯỚC 5: FIELD RENDERER REWRITE

### Kết quả đã đạt
- Rewritten `FieldRenderer.jsx`: read-only display per business rules
- email: text only (NO link)
- phone: text only (NO link)
- url: blue text #4a6cf7 (NO underline)
- boolean: ✓ if true, empty if false (NO ✗)
- number: toLocaleString('vi-VN')
- date/datetime: formatted per date_format config
- select: badge with color + borderRadius from option config
- multiselect: badge list with color + borderRadius
- file: button "Xem file (count)" styled badge
- textarea: truncated at 100 chars + "..."

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `components/dynamic/FieldRenderer.jsx` | ✅ (rewritten) |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| Frontend build OK | ✅ |
| Email/phone: no link | ✅ |
| URL: blue, no underline | ✅ |
| Boolean: ✓/empty | ✅ |
| Number: locale formatted | ✅ |
| Date: format per config | ✅ |
| Select: badge colored | ✅ |
| Multiselect: badge list | ✅ |
| File: button display | ✅ |

### Ghi chú
- Badge style uses same logic as DynamicField (option.color + borderRadius + optionStyle defaults)
- File display: button style "Xem file (count)" — actual file viewing handled by FileListPopup/FileViewer (Step 6)

---

## BƯỚC 6: FILE UPLOAD & VIEWER

### Kết quả đã đạt
- Updated `FileUpload.jsx`: accepts `fileConfig` prop for maxSize validation (was hardcoded 10MB)
- Created `FileListPopup.jsx`: popup showing file list with icon per type, "Xem" button → FileViewer, "Mở tab mới" → window.open
- Created `FileViewer.jsx`: read-only viewer with image zoom (±25%), video controls, audio player, iframe embed for PDF/Word/Excel, fallback download link
- Updated `DynamicField.jsx`: passes `fileConfig` to FileUpload for maxSize
- Updated `FieldRenderer.jsx`: "Xem file (count)" button opens FileListPopup on click

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `components/dynamic/FileUpload.jsx` | ✅ (updated fileConfig prop) |
| `components/dynamic/FileListPopup.jsx` | ✅ (created) |
| `components/dynamic/FileViewer.jsx` | ✅ (created) |
| `components/dynamic/DynamicField.jsx` | ✅ (passes fileConfig) |
| `components/dynamic/FieldRenderer.jsx` | ✅ (opens FileListPopup) |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| Frontend build OK | ✅ |
| File upload: accept config from file_config | ✅ |
| File upload: maxSize from fileConfig.maxSize | ✅ |
| File upload: multiple from file_config | ✅ |
| File upload: drag-drop | ✅ |
| File list popup: shows file list | ✅ |
| File list popup: "Xem" opens FileViewer | ✅ |
| File list popup: "Mở tab mới" opens URL | ✅ |
| Viewer: image zoom ±25% | ✅ |
| Viewer: video controls | ✅ |
| Viewer: audio player | ✅ |
| Viewer: PDF/Word/Excel embed via iframe | ✅ |
| Viewer: fallback download link | ✅ |
| Viewer: read-only (no edit/delete) | ✅ |

### Ghi chú
- FileListPopup modal: overlay click closes, ESC not implemented yet
- FileViewer: zoom only for images, min 25%, max 400%
- FileViewer: non-embeddable files show download link
- File icons: 🖼️ image, 🎬 video, 🎵 audio, 📄 PDF, 📝 Word, 📊 Excel, 📁 fallback

---

## BƯỚC 7: DYNAMIC TABLE & FORM & POPUP

### Kết quả đã đạt
- Rewritten `DynamicTable.jsx`: passes full column config (option_style, number_format, etc.) to FieldRenderer
- Rewritten `DynamicForm.jsx`: cascading select support (parent_field + source_config), formula auto-computation
- Rewritten `RecordDetailPopup.jsx`: passes full field config to both FieldRenderer (view) and DynamicField (edit), updated record from API response after save

### Bug fixes (root cause analysis + fix)

**Bug 1: Labels/status changed in /admin/fields not reflected in admin/users table**
- Root cause: DynamicTable line 178 only passed `{ type, options }` to FieldRenderer, missing option_style, number_format, etc.
- Fix: Now passes the full `col` object to FieldRenderer

**Bug 2: investment_cost and legal_document show null in proposals table**
- Root cause 1: `adminProposalController.update` destructured only fixed fields — dropped dynamic fields from req.body
- Root cause 2: `adminProposalService.getProposalWithUser` didn't call `dynamicUtils.mergeData()` — custom_data not flattened
- Root cause 3: `proposalController.create` also dropped dynamic fields
- Root cause 4: `myProposalController.update` didn't handle custom_data at all
- Root cause 5: `stationController.update` dropped dynamic fields
- Fix: All controllers now pass full `req.body` to services; `getProposalWithUser` calls `mergeData()`; `myProposalService.updateProposal` handles custom_data with `splitData`/`mergeData`

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `components/dynamic/DynamicTable.jsx` | ✅ (full config pass) |
| `components/dynamic/DynamicForm.jsx` | ✅ (cascading + formula) |
| `components/admin/RecordDetailPopup.jsx` | ✅ (full config + save response) |
| `controllers/adminProposalController.js` | ✅ (bug fix) |
| `services/adminProposalService.js` | ✅ (bug fix — mergeData) |
| `controllers/proposalController.js` | ✅ (bug fix) |
| `services/proposalService.js` | ✅ (bug fix) |
| `controllers/myProposalController.js` | ✅ (bug fix) |
| `services/myProposalService.js` | ✅ (bug fix — custom_data) |
| `controllers/stationController.js` | ✅ (bug fix) |
| `services/stationService.js` | ✅ (bug fix) |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| Frontend build OK | ✅ |
| DynamicTable: full config passed to FieldRenderer | ✅ |
| DynamicTable: label from field_definitions used | ✅ |
| DynamicForm: cascading select parent→child | ✅ |
| DynamicForm: formula auto-compute | ✅ |
| RecordDetailPopup: view mode uses full config | ✅ |
| RecordDetailPopup: edit mode uses full config | ✅ |
| PUT proposal saves investment_cost to custom_data | ✅ |
| PUT proposal saves legal_document to custom_data | ✅ |
| PUT proposal saves site_images to custom_data | ✅ |
| GET proposals returns merged dynamic fields | ✅ |
| GET getProposalWithUser returns merged data | ✅ |
| PUT station handles dynamic fields | ✅ |
| myProposal update handles custom_data | ✅ |

### Ghi chú
- Bug fix involved 6 backend files (controllers + services) — the pattern was the same: hardcoded destructuring of req.body dropped dynamic fields
- The fix pattern: pass full `req.body` to service → `splitData()` separates fixed/dynamic → `customData` saved to DB
- `mergeData()` flattens `custom_data` JSON to top-level properties on read

---

## BƯỚC 8: CSS CLEANUP

### Kết quả đã đạt
- (chưa thực hiện)

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `App.css` | ⏳ |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| Chỉ còn 1 bộ table CSS | ⏳ |
| Chỉ còn 1 bộ form CSS | ⏳ |
| FieldManager OK | ⏳ |
| DynamicTable OK | ⏳ |
| DynamicForm OK | ⏳ |
| RecordDetailPopup OK | ⏳ |
| Auth forms OK | ⏳ |
| Admin modals OK | ⏳ |

### Ghi chú
- (điền sau khi thực hiện)

---

## BƯỚC 9: SEED DATA UPDATE

### Kết quả đã đạt
- (chưa thực hiện)

### Files đã tạo/sửa
| File | Trạng thái |
|------|------------|
| `database/11-seed-field-config.sql` | ⏳ |

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| 29 records có config mới | ⏳ |
| Select fields có option_style | ⏳ |
| File fields có file_config | ⏳ |
| Number fields có number_format | ⏳ |
| DynamicTable hiển thị đúng | ⏳ |

### Ghi chú
- (điền sau khi thực hiện)

---

## BƯỚC 10: FULL INTEGRATION TEST

### Kết quả đã đạt
- (chưa thực hiện)

### Kết quả kiểm tra
| Test | Kết quả |
|------|---------|
| FieldManager CRUD all types | ⏳ |
| DynamicTable all types | ⏳ |
| DynamicForm all types | ⏳ |
| RecordDetailPopup view/edit | ⏳ |
| File upload + viewer | ⏳ |
| Cascading select | ⏳ |
| Formula calculation | ⏳ |
| Frontend build OK | ⏳ |
| Docker containers OK | ⏳ |
| Swagger UI OK | ⏳ |

### Ghi chú
- (điền sau khi thực hiện)

---

## TỔNG KẾT

### Tổng số files (hoàn thành bước 1-7)
| Loại | Số lượng | Chi tiết |
|------|----------|----------|
| Files mới backend | 1 | SQL migration |
| Files mới frontend | 2 | FileListPopup, FileViewer |
| Files sửa backend | 9 | fieldDefinitionService, dynamicEngineService, dynamicUtils, fieldDefinitionController, adminProposalController, adminProposalService, proposalController, proposalService, myProposalController, myProposalService, stationController, stationService |
| Files sửa frontend | 8 | FieldManager, DynamicField, DynamicForm, FieldRenderer, RecordDetailPopup, DynamicTable, FileUpload, App.css |
| Files SQL | 1 | 10-alter-field-definitions-add-config.sql |
| **Tổng** | **21** | |

### Ghi chú
- Mỗi bước hoàn thành → cập nhật trạng thái tại đây
- Mỗi lần test → cập nhật kết quả test
- Ghi chú các vấn đề phát sinh
