# API REFERENCE

> **Base URL:** `http://localhost:3000/api`
> **Auth:** JWT Bearer token
> **Response Format:** `{ success: boolean, data?: any, message?: string, pagination?: {...} }`

---

## 1. TỔNG QUAN ENDPOINTS

| Method | Endpoint | Auth | Role | Mô tả |
|--------|----------|------|------|-------|
| GET | `/api/test` | No | - | Health check |
| POST | `/api/auth/register` | No | - | Đăng ký |
| POST | `/api/auth/login` | No | - | Đăng nhập |
| GET | `/api/auth/me` | Yes | Any | Lấy info user |
| GET | `/api/stations` | No | - | Danh sách trạm |
| GET | `/api/stations/:id` | No | - | Chi tiết trạm |
| POST | `/api/stations` | Yes | ADMIN | Tạo trạm |
| PUT | `/api/stations/:id` | Yes | ADMIN | Sửa trạm |
| DELETE | `/api/stations/:id` | Yes | ADMIN | Xóa trạm |
| GET | `/api/proposals` | No | - | Danh sách đề xuất |
| GET | `/api/proposals/:id` | No | - | Chi tiết đề xuất |
| POST | `/api/proposals` | Yes | Any | Tạo đề xuất |
| GET | `/api/my-proposals` | Yes | Any | Đề xuất của tôi |
| GET | `/api/admin/proposals` | Yes | ADMIN | Quản lý đề xuất |
| PUT | `/api/admin/proposals/:id/status` | Yes | ADMIN | Đổi trạng thái |
| DELETE | `/api/admin/proposals/:id` | Yes | ADMIN | Xóa đề xuất |
| GET | `/api/admin/users` | Yes | ADMIN | Danh sách users |
| POST | `/api/admin/users` | Yes | ADMIN | Tạo user |
| PUT | `/api/admin/users/:id` | Yes | ADMIN | Sửa user |
| DELETE | `/api/admin/users/:id` | Yes | ADMIN | Xóa user |
| PATCH | `/api/admin/users/:id/lock` | Yes | ADMIN | Khóa/mở khóa |
| PATCH | `/api/admin/users/:id/role` | Yes | ADMIN | Đổi role |

---

## 2. AUTHENTICATION

### POST `/api/auth/register`

**Request:**
```json
{
  "full_name": "Nguyễn Văn A",
  "email": "user@example.com",
  "phone": "0912345678",
  "password": "123456"
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Đăng ký thành công",
  "data": {
    "user": {
      "id": 5,
      "full_name": "Nguyễn Văn A",
      "email": "user@example.com",
      "phone": "0912345678",
      "role": "USER",
      "status": "ACTIVE"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Error 400:**
```json
{ "success": false, "message": "Email đã tồn tại" }
```

---

### POST `/api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "user": { "id": 2, "full_name": "...", "email": "...", "role": "USER", "status": "ACTIVE" },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Errors:**
- 400: `Email không tồn tại` hoặc `Mật khẩu không đúng`
- 403: `Tài khoản đã bị khóa`

---

### GET `/api/auth/me`

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "full_name": "Nguyễn Văn A",
    "email": "user@example.com",
    "phone": "0912345678",
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

---

## 3. STATIONS

### GET `/api/stations`

**Query Parameters:**
| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| search | string | - | Tìm theo tên/địa chỉ (LIKE) |
| status | string | - | Lọc: ACTIVE, DEPLOYING |
| page | number | 1 | Số trang |
| limit | number | 10 | Số items/trang |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Trạm Sạc Quận 1",
      "latitude": "10.77690000",
      "longitude": "106.70090000",
      "address": "123 Nguyễn Huệ, Quận 1",
      "status": "ACTIVE",
      "description": "...",
      "created_at": "2026-08-27T15:54:21.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 14,
    "totalPages": 2
  }
}
```

---

### GET `/api/stations/:id`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Trạm Sạc Quận 1",
    "latitude": "10.77690000",
    "longitude": "106.70090000",
    "address": "123 Nguyễn Huệ, Quận 1",
    "status": "ACTIVE",
    "description": "...",
    "created_at": "2026-08-27T15:54:21.000Z",
    "updated_at": "2026-08-27T15:54:21.000Z"
  }
}
```

---

### POST `/api/stations` (Admin only)

**Headers:** `Authorization: Bearer <admin_token>`

**Request:**
```json
{
  "name": "Trạm Sạc Hà Nội",
  "latitude": "21.0285",
  "longitude": "105.8542",
  "address": "Kim Mã, Hà Nội",
  "status": "ACTIVE",
  "description": "Trạm mới"
}
```

**Required fields:** `name`, `latitude`, `longitude`, `address`

**Response 201:**
```json
{
  "success": true,
  "message": "Tạo trạm thành công",
  "data": { "id": 8, "name": "Trạm Sạc Hà Nội", ... }
}
```

---

### PUT `/api/stations/:id` (Admin only)

**Request:** Same as POST.

**Response 200:**
```json
{
  "success": true,
  "message": "Cập nhật trạm thành công",
  "data": { "id": 1, ... }
}
```

---

### DELETE `/api/stations/:id` (Admin only)

**Response 200:**
```json
{ "success": true, "message": "Xóa trạm thành công" }
```

**Error 404:**
```json
{ "success": false, "message": "Không tìm thấy trạm" }
```

---

## 4. PROPOSALS

### GET `/api/proposals`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 2,
      "latitude": "10.76260000",
      "longitude": "106.66010000",
      "owner_name": "Nguyễn Văn A",
      "owner_phone": "0912345678",
      "address": "123 Nguyễn Lương Bằng, Q7",
      "area": "200m2",
      "land_type": "Thương mại",
      "description": "Dự kiến mở trạm Q7",
      "status": "PENDING",
      "user_name": "Nguyễn Văn A"
    }
  ]
}
```

---

### POST `/api/proposals` (Authenticated)

**Request:**
```json
{
  "latitude": "10.7626",
  "longitude": "106.6601",
  "owner_name": "Nguyễn Văn A",
  "owner_phone": "0912345678",
  "address": "123 Đường Test, Quận 7",
  "area": "200m2",
  "land_type": "Thương mại",
  "description": "Ghi chú"
}
```

**Required:** `latitude`, `longitude`, `owner_name`, `owner_phone`, `address`

**Note:** `user_id` tự động lấy từ JWT token.

**Response 201:**
```json
{
  "success": true,
  "message": "Tạo đề xuất thành công",
  "data": { "id": 6, "status": "PENDING", ... }
}
```

---

### GET `/api/my-proposals` (Authenticated)

**Query:** `?status=PENDING`

**Response 200:**
```json
{
  "success": true,
  "data": [...proposals where user_id = current user...]
}
```

---

## 5. ADMIN PROPOSALS

### GET `/api/admin/proposals` (Admin only)

**Query:** `?status=PENDING`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 2,
      "owner_name": "Nguyễn Văn A",
      "status": "PENDING",
      "user_name": "Nguyễn Văn A",
      "user_email": "user1@example.com",
      ...
    }
  ]
}
```

---

### PUT `/api/admin/proposals/:id/status` (Admin only)

**Request:**
```json
{ "status": "APPROVED" }
```

**Valid statuses:** `PENDING`, `REVIEWING`, `APPROVED`, `REJECTED`

**Response 200:**
```json
{ "success": true, "message": "Cập nhật trạng thái thành công" }
```

---

### DELETE `/api/admin/proposals/:id` (Admin only)

**Response 200:**
```json
{ "success": true, "message": "Xóa đề xuất thành công" }
```

---

## 6. ADMIN USERS

### GET `/api/admin/users` (Admin only)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "full_name": "Admin System",
      "email": "admin@station.com",
      "phone": "0901234567",
      "role": "ADMIN",
      "status": "ACTIVE",
      "created_at": "2026-08-27T..."
    }
  ]
}
```

---

### POST `/api/admin/users` (Admin only)

**Request:**
```json
{
  "full_name": "New User",
  "email": "new@example.com",
  "phone": "0999999999",
  "password": "123456",
  "role": "USER",
  "status": "ACTIVE"
}
```

**Response 201:**
```json
{ "success": true, "message": "Tạo user thành công" }
```

---

### PUT `/api/admin/users/:id` (Admin only)

**Request:** Same fields as POST. `password` optional.

---

### PATCH `/api/admin/users/:id/lock` (Admin only)

Toggle status: `ACTIVE` ↔ `LOCKED`

**Response 200:**
```json
{ "success": true, "message": "Khóa tài khoản thành công" }
```

---

### PATCH `/api/admin/users/:id/role` (Admin only)

**Request:**
```json
{ "role": "ADMIN" }
```

**Response 200:**
```json
{ "success": true, "message": "Cập nhật vai trò thành công" }
```

---

### DELETE `/api/admin/users/:id` (Admin only)

**Cannot delete ADMIN users.**

**Response 200:**
```json
{ "success": true, "message": "Xóa user thành công" }
```

**Error 400:**
```json
{ "success": false, "message": "Không thể xóa admin" }
```

---

## 7. ERROR RESPONSES

| Status | Meaning | Example |
|--------|---------|---------|
| 400 | Bad request | Thiếu field bắt buộc |
| 401 | Unauthorized | Không có token hoặc token hết hạn |
| 403 | Forbidden | Không có quyền (USER gọi admin API) |
| 404 | Not found | Resource không tồn tại |
| 500 | Server error | Lỗi server nội bộ |

### Format
```json
{
  "success": false,
  "message": "Mô tả lỗi"
}
```

---

## 8. JWT TOKEN

### Header
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Payload
```json
{
  "id": 1,
  "email": "admin@station.com",
  "role": "ADMIN",
  "iat": 1787849521,
  "exp": 1788454321
}
```

### Expiry
- 7 ngày từ thời điểm tạo
- Hết hạn → trả 401
