# SWAGGER API DOCS — STATION MANAGEMENT SYSTEM

**Ngày cập nhật:** 2026-08-30
**API Version:** 1.0.0
**Tổng số endpoints:** 28

---

## TRUY CẬP

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:3000/api-docs` |
| Swagger JSON | `http://localhost:3000/api-docs.json` |

---

## TỔNG QUAN API

| Thông tin | Giá trị |
|-----------|---------|
| Title | Station Management API |
| Version | 1.0.0 |
| Description | API Documentation for Station Management System |
| Base URL | `http://localhost:3000` |
| Auth | JWT Bearer Token |
| Format | JSON |

---

## AUTHENTICATION

### Cách lấy token
```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "123456"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "id": 1, "email": "user@example.com", "role": "ADMIN" }
  }
}
```

### Sử dụng token
Thêm header vào mọi request cần xác thực:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Swagger UI
1. Mở `http://localhost:3000/api-docs`
2. Nhấn nút **Authorize** (biểu tượng khóa 🔓)
3. Nhập token vào trường `Value`: `Bearer eyJhbGciOi...`
4. Nhấn **Authorize**
5. Từ giờ mọi request trong Swagger sẽ tự động带上 token

---

## PHÂN LOẠI ENDPOINTS

### 🌐 PUBLIC — Không cần đăng nhập

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/stations` | Lấy danh sách trạm |
| `GET` | `/api/stations/{id}` | Lấy thông tin trạm theo ID |
| `GET` | `/api/proposals` | Lấy danh sách đề xuất |
| `GET` | `/api/proposals/{id}` | Lấy thông tin đề xuất theo ID |
| `POST` | `/api/auth/register` | Đăng ký tài khoản mới |
| `POST` | `/api/auth/login` | Đăng nhập |
| `GET` | `/health` | Health check |

### 🔒 USER — Cần đăng nhập (role: USER hoặc ADMIN)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/auth/me` | Lấy thông tin user hiện tại |
| `PUT` | `/api/auth/profile` | Cập nhật hồ sơ cá nhân |
| `POST` | `/api/proposals` | Tạo đề xuất mới |
| `GET` | `/api/my-proposals` | Lấy danh sách đề xuất của mình |
| `PUT` | `/api/my-proposals/{id}` | Cập nhật đề xuất của mình |
| `DELETE` | `/api/my-proposals/{id}` | Xóa đề xuất của mình |
| `POST` | `/api/map/resolve-map-url` | Giải mã link Google Maps |

### 🔒🔒 ADMIN — Cần đăng nhập với role ADMIN

#### Users Management
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/admin/users` | Lấy danh sách users (phân trang) |
| `POST` | `/api/admin/users` | Tạo user mới |
| `PUT` | `/api/admin/users/{id}` | Cập nhật user |
| `DELETE` | `/api/admin/users/{id}` | Xóa user |
| `PATCH` | `/api/admin/users/{id}/lock` | Khóa/mở khóa user |
| `PATCH` | `/api/admin/users/{id}/role` | Đổi role user |

#### Proposals Management
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/admin/proposals` | Lấy danh sách đề xuất (phân trang) |
| `DELETE` | `/api/admin/proposals/{id}` | Xóa đề xuất |
| `PUT` | `/api/admin/proposals/{id}/status` | Cập nhật trạng thái đề xuất |

#### Stations Management
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/stations` | Tạo trạm mới |
| `PUT` | `/api/stations/{id}` | Cập nhật trạm |
| `DELETE` | `/api/stations/{id}` | Xóa trạm |

#### Excel Import/Export
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/admin/excel/export/stations` | Xuất danh sách trạm ra Excel |
| `GET` | `/api/admin/excel/export/proposals` | Xuất danh sách đề xuất ra Excel |
| `GET` | `/api/admin/excel/template` | Tải file template import trạm |
| `POST` | `/api/admin/excel/import/preview` | Preview import trạm từ Excel |
| `POST` | `/api/admin/excel/import/confirm` | Xác nhận import trạm |

#### Dashboard
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/admin/dashboard` | Lấy thống kê dashboard |

---

## COMPONENTS / SCHEMAS

### User
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "Nguyen Van A",
  "phone": "0123456789",
  "role": "USER",
  "status": "ACTIVE",
  "created_at": "2026-08-30T10:00:00.000Z",
  "updated_at": "2026-08-30T10:00:00.000Z"
}
```

### Station
```json
{
  "id": 1,
  "name": "Trạm sạc ABC",
  "latitude": 10.762622,
  "longitude": 106.660172,
  "address": "123 Đường ABC, Quận 1, TP.HCM",
  "status": "ACTIVE",
  "capacity": 10,
  "created_at": "2026-08-30T10:00:00.000Z",
  "updated_at": "2026-08-30T10:00:00.000Z"
}
```

### Proposal
```json
{
  "id": 1,
  "name": "Đề xuất trạm XYZ",
  "latitude": 10.762622,
  "longitude": 106.660172,
  "address": "456 Đường XYZ, Quận 2, TP.HCM",
  "reason": "Vùng thiếu trạm sạc",
  "status": "PENDING",
  "user_id": 1,
  "created_at": "2026-08-30T10:00:00.000Z",
  "updated_at": "2026-08-30T10:00:00.000Z"
}
```

### Pagination
```json
{
  "currentPage": 1,
  "totalPages": 5,
  "totalItems": 50,
  "itemsPerPage": 10
}
```

### Error
```json
{
  "success": false,
  "message": "Lỗi mô tả"
}
```

---

## VÍ DỤ SỬ DỤNG

### 1. Đăng nhập và lấy token
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@station.com", "password": "123456"}'
```

### 2. Lấy danh sách transom (public)
```bash
curl http://localhost:3000/api/stations?page=1&limit=10
```

### 3. Tạo transom mới (admin)
```bash
curl -X POST http://localhost:3000/api/stations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Trạm sạc mới",
    "latitude": 10.762622,
    "longitude": 106.660172,
    "address": "123 Đường ABC",
    "status": "ACTIVE",
    "capacity": 10
  }'
```

### 4. Tạo đề xuất (user)
```bash
curl -X POST http://localhost:3000/api/proposals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Đề xuất trạm mới",
    "latitude": 10.762622,
    "longitude": 106.660172,
    "address": "456 Đường XYZ",
    "reason": "Vùng thiếu trạm sạc"
  }'
```

### 5. Xuất Excel (admin)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/admin/excel/export/stations \
  --output stations.xlsx
```

### 6. Import Excel (admin)
```bash
# Step 1: Preview
curl -X POST http://localhost:3000/api/admin/excel/import/preview \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@stations.xlsx"

# Step 2: Confirm
curl -X POST http://localhost:3000/api/admin/excel/import/confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"items": [...]}'
```

---

## RATE LIMITING

| Endpoint Group | Limit (Dev) | Limit (Prod) | Window |
|----------------|-------------|--------------|--------|
| `/api/auth/*` | 30 req | 10 req | 1 phút |
| `/api/admin/*` | 120 req | 60 req | 1 phút |
| `/api/admin/excel/*` | 30 req | 10 req | 1 phút |

Khi vượt quá limit, server trả về:
```json
{
  "success": false,
  "message": "Quá nhiều yêu cầu, vui lòng thử lại sau"
}
```
HTTP Status: `429 Too Many Requests`

---

## SECURITY HEADERS (Helmet)

| Header | Value |
|--------|-------|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | SAMEORIGIN |
| Strict-Transport-Security | max-age=31536000; includeSubDomains |
| X-XSS-Protection | 0 |
| Content-Security-Policy | default-src 'self'; ... |
| Referrer-Policy | no-referrer |

---

## TROUBLESHOOTING

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| `401 Unauthorized` | Token hết hạn hoặc sai | Đăng nhập lại, lấy token mới |
| `403 Forbidden` | Không có quyền (USER gọi admin API) | Dùng account có role ADMIN |
| `413 Payload Too Large` | Request body > 10MB | Giảm kích thước payload |
| `429 Too Many Requests` | Vượt quá rate limit | Chờ 1 phút rồi thử lại |
| Swagger không load | Backend chưa start | `docker compose up -d` |
