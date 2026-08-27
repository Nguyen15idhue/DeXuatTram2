# BUSINESS RULES & PERMISSIONS

---

## 1. ENTITY RELATIONSHIPS

```
┌──────────┐         ┌──────────────────────┐
│  users   │ 1     N │  station_proposals   │
│          │────────▶│                      │
│ id (PK)  │         │ id (PK)              │
│ email    │         │ user_id (FK)         │
│ role     │         │ latitude             │
│ status   │         │ longitude            │
└──────────┘         │ owner_name           │
                     │ owner_phone          │
                     │ address              │
                     │ status               │
                     └──────────────────────┘

┌──────────┐
│ stations │  ← Entity RIÊNG BIỆT, KHÔNG liên kết FK
│          │
│ id (PK)  │
│ name     │
│ latitude │
│ longitude│
│ address  │
│ status   │
└──────────┘
```

**QUAN TRỌNG:** `Station` và `Station Proposal` là hai entity ĐỘC LẬP.
- `Station` = trạm đã có thật
- `Station Proposal` = đề xuất chưa được duyệt
- KHÔNG tự thêm status `PROPOSAL` vào Station

---

## 2. BUSINESS RULES

### Rule 1: Station và Proposal độc lập
- Station chỉ có status: `ACTIVE`, `DEPLOYING`
- Proposal chỉ có status: `PENDING`, `REVIEWING`, `APPROVED`, `REJECTED`
- KHÔNG merge hai entity này
- Khi approve proposal → TẠO MỚI station (không update proposal thành station)

### Rule 2: Proposal phải lưu user_id
- Khi tạo proposal, `user_id` lấy từ JWT token (server-side)
- KHÔNG cho frontend gửi user_id (để tránh giả mạo)

### Rule 3: Latitude/Longitude từ map
- Tọa độ lấy từ vị trí click trên map
- KHÔNG nhập thủ công (readonly trong form)

### Rule 4: Ownership check
- User chỉ được xem/sửa/xóa proposal của chính mình
- Admin có thể xem/sửa/xóa tất cả proposals

### Rule 5: Không xóa admin
- Admin KHÔNG được xóa tài khoản admin khác
- Frontend ẩn nút xóa cho admin users
- Backend check server-side và trả 400

### Rule 6: Lock account
- Khi lock user → user đó không thể login
- Frontend redirect về login nếu token hết hạn
- Backend kiểm tra status !== 'LOCKED' khi login

---

## 3. PERMISSION MATRIX

### API Permissions

| Endpoint | Public | USER | ADMIN |
|----------|--------|------|-------|
| GET /api/test | ✅ | ✅ | ✅ |
| POST /api/auth/register | ✅ | ✅ | ✅ |
| POST /api/auth/login | ✅ | ✅ | ✅ |
| GET /api/auth/me | ❌ | ✅ | ✅ |
| GET /api/stations | ✅ | ✅ | ✅ |
| GET /api/stations/:id | ✅ | ✅ | ✅ |
| POST /api/stations | ❌ | ❌ | ✅ |
| PUT /api/stations/:id | ❌ | ❌ | ✅ |
| DELETE /api/stations/:id | ❌ | ❌ | ✅ |
| GET /api/proposals | ✅ | ✅ | ✅ |
| GET /api/proposals/:id | ✅ | ✅ | ✅ |
| POST /api/proposals | ❌ | ✅ | ✅ |
| GET /api/my-proposals | ❌ | ✅ | ✅ |
| GET /api/admin/proposals | ❌ | ❌ | ✅ |
| PUT /api/admin/proposals/:id/status | ❌ | ❌ | ✅ |
| DELETE /api/admin/proposals/:id | ❌ | ❌ | ✅ |
| GET /api/admin/users | ❌ | ❌ | ✅ |
| POST /api/admin/users | ❌ | ❌ | ✅ |
| PUT /api/admin/users/:id | ❌ | ❌ | ✅ |
| DELETE /api/admin/users/:id | ❌ | ❌ | ✅ |
| PATCH /api/admin/users/:id/lock | ❌ | ❌ | ✅ |
| PATCH /api/admin/users/:id/role | ❌ | ❌ | ✅ |

### Frontend Page Access

| Page | Public | USER | ADMIN |
|------|--------|------|-------|
| /login | ✅ | Redirect → /map | Redirect → /admin |
| /register | ✅ | Redirect → /map | Redirect → /admin |
| /map | ❌ | ✅ | ✅ |
| /my-proposals | ❌ | ✅ | ✅ |
| /profile | ❌ | ✅ | ✅ |
| /admin | ❌ | ❌ | ✅ |
| /admin/users | ❌ | ❌ | ✅ |
| /admin/stations | ❌ | ❌ | ✅ |
| /admin/proposals | ❌ | ❌ | ✅ |

---

## 4. STATUS WORKFLOW

### Station Status
```
ACTIVE ←→ DEPLOYING
```
| From | To | Trigger |
|------|----|---------|
| ACTIVE | DEPLOYING | Admin update |
| DEPLOYING | ACTIVE | Admin update |

### Proposal Status
```
PENDING → REVIEWING → APPROVED
                     → REJECTED
```
| From | To | Trigger |
|------|----|---------|
| PENDING | REVIEWING | Admin update |
| PENDING | APPROVED | Admin update |
| PENDING | REJECTED | Admin update |
| REVIEWING | APPROVED | Admin update |
| REVIEWING | REJECTED | Admin update |
| Any | Any | Admin có thể chuyển bất kỳ |

---

## 5. MAP MARKER COLORS

| Entity | Status | Color | Hex |
|--------|--------|-------|-----|
| Station | ACTIVE | 🟢 Green | #22c55e |
| Station | DEPLOYING | 🟡 Yellow | #eab308 |
| Proposal | PENDING | 🟠 Orange | #f97316 |
| Proposal | REVIEWING | 🔵 Blue | #3b82f6 |
| Proposal | APPROVED | 🟢 Green | #22c55e |
| Proposal | REJECTED | 🔴 Red | #ef4444 |

---

## 6. VALIDATION RULES

### Backend Validation

| Field | Rule | Error |
|-------|------|-------|
| email | Required, valid format, unique | 400 |
| password | Required, min 6 chars | 400 |
| full_name | Required, 2-100 chars | 400 |
| phone | Optional, 10 digits | 400 |
| latitude | Required, -90 to 90 | 400 |
| longitude | Required, -180 to 180 | 400 |
| owner_name | Required | 400 |
| owner_phone | Required | 400 |
| address | Required (stations, proposals) | 400 |
| status | Must be valid enum value | 400 |

### Frontend Validation

| Field | Rule |
|-------|------|
| confirmPassword | Must match password |
| Email format | Basic regex check |
| Required fields | Mark with * |

---

## 7. DATA OWNERSHIP

### Stations
- **Owner:** System (Admin manages)
- **User access:** Read only (view on map)
- **Admin access:** Full CRUD

### Proposals
- **Owner:** User who created (user_id from JWT)
- **User access:** 
  - Read: Own proposals only
  - Create: Yes
  - Update: Not implemented
  - Delete: Not implemented
- **Admin access:** Full CRUD + status change

### Users
- **Owner:** Admin manages all
- **Self access:** View profile only (read-only)
- **Admin access:** Full CRUD + lock + role change

---

## 8. SECURITY NOTES

### Implemented
- ✅ Password hashing (bcrypt)
- ✅ JWT authentication
- ✅ Role-based access control
- ✅ Parameterized SQL queries (no injection)
- ✅ Admin cannot delete other admins
- ✅ User cannot access admin APIs
- ✅ Ownership check on proposals (backend)

### Not Implemented (intentionally simple)
- ❌ Rate limiting
- ❌ Input sanitization (XSS)
- ❌ CSRF protection
- ❌ Email verification
- ❌ Password reset
- ❌ Audit logging
- ❌ IP blocking
