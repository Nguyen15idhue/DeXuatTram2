# Backend Features - Station Management System

## Tổng quan

Backend xây dựng bằng Node.js + Express, kết nối MySQL (MySQL2), phục vụ REST API cho frontend React. Tổng cộng ~71 API endpoints.

---

## 1. Infrastructure

### Server Stack
- Node.js + Express
- MySQL (MySQL2 promise pool, connection limit 10, charset utf8mb4)
- JWT authentication (token expiry 7 ngày)
- bcrypt password hashing (salt rounds 10)

### Middleware Stack
- **Helmet**: Security HTTP headers
- **CORS**: Configurable origins (`localhost:5173`, `localhost:3000`), credentials enabled
- **Body Parser**: JSON + URL-encoded, giới hạn 10MB
- **Static File Serving**: `/uploads` phục vụ `storage/uploads/` với MIME type đúng cho text, SVG, PDF
- **Swagger UI**: Mount tại `/api-docs`, JSON spec tại `/api-docs.json`
- **Health Check**: `GET /health` trả `{ status: 'ok', timestamp }`

### Rate Limiting (3 tier)
| Limiter | production | development | Áp dụng |
|---------|-----------|-------------|---------|
| `authLimiter` | 10 req/min | 30 req/min | `/api/auth/*` |
| `adminLimiter` | 60 req/min | 120 req/min | `/api/admin/*` |
| `excelLimiter` | 10 req/min | 30 req/min | `/api/admin/excel/*` |

### Swagger / API Documentation
- OpenAPI 3.0.0 spec
- Bearer JWT security scheme
- Predefined schemas: User, Station, Proposal, Pagination, Error
- 10 tag groups
- Auto-scan JSDoc annotations từ route files

---

## 2. Authentication (`/api/auth`)

| Endpoint | Mô tả |
|----------|-------|
| `POST /register` | Đăng ký tài khoản mới |
| `POST /login` | Đăng nhập bằng email + password |
| `GET /me` | Lấy thông tin user hiện tại |
| `PUT /profile` | Cập nhật profile + đổi password |

### Business Rules
- Kiểm tra trùng email khi register
- Hash password bằng bcrypt
- Role mặc định: `USER`, Status mặc định: `ACTIVE`
- JWT token chứa `{ id, email, role }`, expiry 7 ngày
- Login bị block nếu user status = `LOCKED` (trả 403)
- Đổi password yêu cầu `current_password` + `new_password` (min 6 ký tự)
- Hỗ trợ field `custom_data` trong DB cho user

### Validation Rules
- `full_name`: 2-100 ký tự
- `email`: regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- `phone`: đúng 10 chữ số `^\d{10}$`
- `password`: tối thiểu 6 ký tự

---

## 3. Stations (`/api/stations`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `GET /` | Public | Danh sách trạm (phân trang, tìm kiếm) |
| `GET /:id` | Public | Chi tiết trạm |
| `POST /` | Admin | Tạo trạm mới |
| `PUT /:id` | Admin | Cập nhật trạm |
| `DELETE /:id` | Admin | Xóa trạm |

### Query Parameters
- `search`: Tìm theo tên hoặc địa chỉ (LIKE)
- `status`: Lọc theo `ACTIVE` hoặc `DEPLOYING`
- `page`, `limit`: Phân trang (mặc định page=1, limit=10)

### Dynamic Fields
- Dữ liệu động lưu trong cột `custom_data` (JSON)
- `dynamicUtils.mergeData()` merge JSON columns về row object
- `dynamicUtils.splitData()` tách data thành fixed columns + dynamic JSON

---

## 4. Station Proposals (`/api/proposals`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `GET /` | Public | Danh sách tất cả đề xuất (cho bản đồ) |
| `GET /:id` | Public | Chi tiết đề xuất |
| `POST /` | User logged-in | Tạo đề xuất mới |

### Business Rules
- GET trả tất cả proposals, không phân trang (để hiển thị trên map)
- POST tự gán `user_id` từ JWT token
- Dynamic fields merge từ `custom_data`
- Status enum: `PENDING`, `REVIEWING`, `APPROVED`, `REJECTED`

---

## 5. My Proposals (`/api/my-proposals`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `GET /` | Auth | Danh sách đề xuất của user đang login |
| `PUT /:id` | Auth | Sửa đề xuất (chỉ status PENDING) |
| `DELETE /:id` | Auth | Xóa đề xuất (chỉ status PENDING) |

### Ownership Rules
- Query `WHERE id = ? AND user_id = ?` — user chỉ thấy/sửa/xóa đề xuất của mình
- Cập nhật/xóa bị chặn nếu status khác `PENDING`
- Query `status` filter, phân trang

---

## 6. Admin Proposals (`/api/admin/proposals`)

| Endpoint | Mô tả |
|----------|-------|
| `GET /` | Danh sách tất cả đề xuất (phân trang, lọc theo status) |
| `PUT /:id` | Cập nhật dữ liệu đề xuất |
| `PUT /:id/status` | Chỉ cập nhật trạng thái |
| `DELETE /:id` | Xóa đề xuất |

### Business Rules
- Admin thấy `user_name` và `user_email` qua JOIN với `users`
- Không có ownership check — admin sửa được mọi proposal
- Status validation: `PENDING`, `REVIEWING`, `APPROVED`, `REJECTED`

---

## 7. Admin Users (`/api/admin/users`)

| Endpoint | Mô tả |
|----------|-------|
| `GET /` | Danh sách user (phân trang, tìm kiếm) |
| `POST /` | Tạo user mới |
| `PUT /:id` | Cập nhật user |
| `DELETE /:id` | Xóa user |
| `PATCH /:id/lock` | Khóa/mở khóa user |
| `PATCH /:id/role` | Đổi role (USER/ADMIN) |

### Business Rules
- Không xóa được ADMIN users hoặc chính mình
- Lock toggle chuyển đổi giữa `ACTIVE` và `LOCKED`
- Tạo user: kiểm tra trùng email, hash password, set role/status
- Cập nhật: kiểm tra trùng email (loại trừ chính mình), password change optional

---

## 8. Dashboard (`/api/admin/dashboard`)

| Endpoint | Mô tả |
|----------|-------|
| `GET /` | Thống kê tổng hợp |

### Trả về
- `users`: total, active, locked
- `stations`: total, active, deploying
- `proposals`: total, pending, approved, rejected

---

## 9. Excel Import/Export (`/api/admin/excel`)

| Endpoint | Mô tả |
|----------|-------|
| `GET /export/stations` | Xuất stations ra file .xlsx |
| `GET /export/proposals` | Xuất proposals ra file .xlsx |
| `GET /template` | Download template import |
| `POST /import/preview` | Xem trước khi import (upload file .xlsx) |
| `POST /import/confirm` | Xác nhận import |

### Business Rules
- **Export**: ExcelJS tạo file .xlsx format headers (tím)
- **Stations Export**: id, name, latitude, longitude, address, status, description, created_at
- **Proposals Export**: id, owner_name, owner_phone, address, lat/lng, area, land_type, description, status, user_name, user_email, created_at
- **Template**: Dòng mẫu với dữ liệu ví dụ
- **Import Preview**: Validate required headers (name, latitude, longitude, address), validate từng row (lat/lng ranges, required fields, valid status)
- **Import Confirm**: MySQL transaction với rollback nếu fail (atomic import — all-or-nothing)
- File upload: `multer.memoryStorage()`, giới hạn 5MB

---

## 10. Map Utils (`/api/map`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `POST /resolve-map-url` | Public | Trích xuất lat/lng từ Google Maps URL |

### Business Rules
- Parse 8 pattern Google Maps URL (với `@lat,lng`, `?q=lat,lng`, `/maps/place/`, `?ll=`, `?center=`, ...)
- Xử lý short URLs (`maps.app.goo.gl`, `goo.gl/maps`) bằng cách follow redirect với `fetch()`
- Validate coordinate ranges

---

## 11. Field Definitions (`/api/field-definitions`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `GET /` | Admin | Danh sách field definitions |
| `GET /entity/:entity` | Public | Fields active của entity |
| `GET /:id` | Admin | Chi tiết field definition |
| `POST /` | Admin | Tạo field definition |
| `PUT /:id` | Admin | Cập nhật field definition |
| `DELETE /:id` | Admin | Xóa (bị chặn nếu `source_type=fixed`) |
| `PATCH /:id/status` | Admin | Chuyển active/inactive |

### Supported Entities
- `stations`, `station_proposals`, `users`

### Supported Field Types (13 loại)
- `text`, `textarea`, `number`, `email`, `phone`, `url`, `date`, `datetime`, `boolean`, `select`, `multiselect`, `file`, `formula`

### Extended Properties per Field
- `number_format`, `decimal_places`, `date_format`, `timezone`
- `source_type` (json/fixed), `source_config`, `parent_field`, `option_style`
- `file_config`, `formula_config`, `formula`
- `data_list_id`, `data_list_column`, `relation_key`
- `placeholder`, `help_text`, `validation` (JSON), `options` (JSON)

### Business Rules
- Duplicate key check: `(entity, key)` phải unique
- Fixed fields (`source_type=fixed`) không đổi key, không xóa

---

## 12. Forms (`/api/forms`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `GET /` | Admin | Danh sách forms |
| `GET /:id` | Public | Form + fields |
| `POST /` | Admin | Tạo form |
| `PUT /:id` | Admin | Cập nhật form |
| `DELETE /:id` | Admin | Xóa form (CASCADE xóa form_fields) |

### Business Rules
- Form gắn với entity (`stations`, `station_proposals`, `users`)
- GET by ID trả form với `form_fields` JOIN `field_definitions`, sắp xếp theo `order_index`
- List có `field_count` qua LEFT JOIN

---

## 13. Form Fields (`/api/forms/:formId/fields`)

| Endpoint | Mô tả |
|----------|-------|
| `GET /:formId/fields` | Fields của form |
| `PUT /:formId/fields/reorder` | Sắp xếp lại thứ tự |
| `POST /:formId/fields` | Thêm field vào form |
| `PUT /:formId/fields/:id` | Cập nhật config field trong form |
| `DELETE /:formId/fields/:id` | Xóa field khỏi form |

### Business Rules
- Entity mismatch check: field entity phải trùng form entity
- Duplicate check: cùng field không thêm 2 lần vào form
- Auto-calculate `order_index` nếu không cung cấp (MAX + 1)
- Properties: `field_id`, `order_index`, `visible`, `config` (JSON)

---

## 14. Views (`/api/views`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `GET /` | Admin | Danh sách views |
| `GET /:id` | Public | View + fields |
| `POST /` | Admin | Tạo view |
| `PUT /:id` | Admin | Cập nhật view |
| `DELETE /:id` | Admin | Xóa view (CASCADE xóa view_fields) |

### Business Rules
- View gắn với entity
- GET by ID trả view với `view_fields` JOIN `field_definitions`
- List có `field_count`

---

## 15. View Fields (`/api/views/:viewId/fields`)

| Endpoint | Mô tả |
|----------|-------|
| `GET /:viewId/fields` | Fields của view |
| `PUT /:viewId/fields/reorder` | Sắp xếp lại thứ tự |
| `POST /:viewId/fields` | Thêm field vào view |
| `PUT /:viewId/fields/:id` | Cập nhật config field trong view |
| `DELETE /:viewId/fields/:id` | Xóa field khỏi view |

### Business Rules
- Same entity mismatch + duplicate checks
- View-specific properties: `width`, `sortable`, `filterable`

---

## 16. Dynamic Engine (`/api/dynamic`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `GET /:entity/form/:formId` | Public | Config form đầy đủ cho rendering |
| `GET /:entity/view/:viewId` | Public | Config view đầy đủ cho rendering table |
| `POST /:entity/validate` | Auth | Validate data theo field definitions |

### Business Rules
- **getFormConfig**: Trả form metadata + tất cả fields với full config (type, options, validation rules, number_format, date_format, ...)
- **getViewConfig**: Trả view metadata + configured fields + `allFields` (tất cả active fields của entity, để add thêm columns)
- **validateData**: Chạy `dynamicUtils.validateEntityData()` — validate từng field value theo type definition
- Entity validation: chỉ chấp nhận `stations`, `station_proposals`, `users`

---

## 17. File Management (`/api/files`)

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `POST /upload` | Auth | Upload file |
| `GET /:id` | Auth | Metadata file |
| `GET /:id/download` | Auth | Download file với Content-Disposition |
| `DELETE /:id` | Auth | Soft delete + physical delete |

### Business Rules
- **Upload**: multer disk storage, random filename (`Date.now()-randomstring.ext`), phân loại vào subdirectories qua `subdir` body field (mặc định: `general`)
- **Download**: Content-Type detection, UTF-8 charset cho text, safe filename encoding cho non-ASCII, `filename*=UTF-8''`
- **Delete**: Soft-delete (status set `deleted` trong DB) + physical file removal
- **Metadata**: Theo dõi `original_name`, `storage_key`, `mime_type`, `size`, `uploaded_by`, `status`
- JOINs với `users` để hiển thị `uploader_name`
- Giới hạn file size: 10MB

---

## 18. Data Lists (`/api/admin/data-lists`)

| Endpoint | Mô tả |
|----------|-------|
| `GET /` | Danh sách data lists (phân trang, có row_count) |
| `GET /:id` | Data list với tất cả rows |
| `POST /` | Tạo data list với columns_config |
| `PUT /:id` | Cập nhật metadata data list |
| `DELETE /:id` | Xóa data list (cascade rows) |
| `POST /:id/rows` | Bulk add rows |
| `PUT /:id/rows/:rowId` | Cập nhật 1 row |
| `DELETE /:id/rows/:rowId` | Xóa 1 row |

### Business Rules
- `columns_config` định nghĩa schema: mảng `[{ key, label, type }]` type là `text` hoặc `number`
- Row data lưu JSON trong cột `data`
- Rows hỗ trợ hierarchy qua `parent_row_id` và ordering qua `sort_order`
- Khi xóa row, orphaned children được set `parent_row_id = NULL`
- Duplicate name check khi create/update

---

## 19. Dynamic Utils (`dynamicUtils.js`)

### Core Functions
- **splitData()**: Tách data thành fixed columns vs dynamic JSON fields
- **mergeData()**: Merge `custom_data` JSON column về row object
- **validateData()**: Validate tất cả dynamic field values theo type definition
- **validateField()**: Validate từng field, hỗ trợ tất cả 13 field types
- **buildDynamicSetClause()**: Tạo JSON string cho SQL UPDATE
- **getFieldDefinitionsByEntity()**: Lấy active field definitions từ DB

---

## 20. Database Schema

### Tables (11 bảng)

| Bảng | Mô tả |
|------|-------|
| `users` | Tài khoản người dùng |
| `stations` | Trạm sạc |
| `station_proposals` | Đề xuất trạm mới |
| `field_definitions` | Định nghĩa trường động |
| `forms` | Cấu hình form |
| `form_fields` | Trường trong form |
| `views` | Cấu hình view/table |
| `view_fields` | Trường trong view |
| `files` | File uploaded |
| `data_lists` | Danh sách dữ liệu |
| `data_list_rows` | Rows trong data list |

### Key Columns
- Tất cả bảng chính đều có `id` (PK), `created_at`, `updated_at`
- `stations`, `station_proposals`, `users` có cột `custom_data` (JSON) cho dữ liệu động
- `field_definitions` có 15+ extended columns cho cấu hình chi tiết

---

## 21. Middleware Details

### Auth Middleware (`auth.js`)
- **requireAuth**: Validate Bearer JWT, gán `req.user = { id, email, role }`
- **requireAdmin**: Kiểm tra `req.user.role === 'ADMIN'`, trả 403 nếu không
- **optionalAuth**: Gán user nếu có token, tiếp tục nếu không có

### Validation Middleware (`validators.js`)
- 16 exported validation functions
- `validateDynamicFields()`: Validate dynamic field data theo field definitions
- Validate cho: register, login, create/update station, create proposal, create/update user
