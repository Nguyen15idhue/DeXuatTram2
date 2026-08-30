# CƠ CHẾ BẢO MẬT — STATION MANAGEMENT SYSTEM

**Ngày cập nhật:** 2026-08-30
**Phiên bản:** 2.0 (Thêm Helmet, Body Size Limit, Admin Rate Limit)

---

## TỔNG QUAN CƠ CHẾ BẢO MẬT

| # | Cơ chế | File | Trạng thái |
|---|--------|------|------------|
| 1 | Helmet (Security Headers) | `app.js` | ✅ |
| 2 | Body Size Limit (10MB) | `app.js` | ✅ |
| 3 | CORS | `app.js` | ✅ |
| 4 | Rate Limiting — Auth | `app.js` | ✅ |
| 5 | Rate Limiting — Admin | `app.js` | ✅ |
| 6 | Rate Limiting — Excel | `app.js` | ✅ |
| 7 | JWT Authentication | `middlewares/auth.js` | ✅ |
| 8 | Role-based Authorization | `middlewares/auth.js` | ✅ |
| 9 | Input Validation | `middlewares/validators.js` | ✅ |
| 10 | Password Hashing (bcrypt) | `routes/auth.js` | ✅ |
| 11 | SQL Injection Prevention | Tất cả routes | ✅ |
| 12 | Ownership Check | `routes/myProposals.js` | ✅ |
| 13 | Self-delete Protection | `routes/adminUsers.js` | ✅ |
| 14 | JWT Secret Validation | `middlewares/auth.js` | ✅ |

---

## 1. HELMET — SECURITY HEADERS

**File:** `backend/src/app.js`
**Package:** `helmet` v8.0.0

### Cài đặt
```javascript
const helmet = require('helmet');
app.use(helmet());
```

### Headers được thêm

| Header | Giá trị | Ngăn chặn |
|--------|---------|-----------|
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing attack |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | SSL stripping |
| `X-XSS-Protection` | `0` | Deprecated XSS filter |
| `Content-Security-Policy` | `default-src 'self'; ...` | XSS injection |
| `Referrer-Policy` | `no-referrer` | Information leakage |
| `Permissions-Policy` | (empty = deny all) | Feature abuse |

### Test
```bash
curl -I http://localhost:3000/health
# Kiểm tra các headers trả về
```

---

## 2. BODY SIZE LIMIT — CHỐNG PAYLOAD ATTACKS

**File:** `backend/src/app.js`

### Cài đặt
```javascript
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

### Tại sao 10MB

| Limit | Kịch bản |
|-------|----------|
| 100KB | Quá nhỏ, file upload sẽ lỗi |
| 1MB | Đủ cho form data thông thường |
| **10MB** | Đủ cho form lớn + JSON payload phức tạp |
| 100MB | Quá lớn, dễ bị abuse |
| Không limit | Rất nguy hiểm — DoS dễ dàng |

### Test
```bash
# Payload 11MB → Phải trả 413
python -c "print('{\"name\":\"' + 'x'*11534336 + '\"}')" | curl -X POST http://localhost:3000/api/stations -H "Content-Type: application/json" -d @-
# Response: 413 Payload Too Large
```

---

## 3. CORS — CROSS-ORIGIN RESOURCE SHARING

**File:** `backend/src/app.js`

### Cài đặt
```javascript
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
```

### Config
| Env Var | Giá trị hiện tại |
|---------|-----------------|
| `CORS_ORIGINS` | Chưa set (dùng default) |
| Default origins | `http://localhost:5173`, `http://localhost:3000` |

### Production recommendation
```
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

---

## 4. RATE LIMITING

**File:** `backend/src/app.js`
**Package:** `express-rate-limit` v8.7.0

### 4.1 Auth Rate Limit
```javascript
const authLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 phút
  max: process.env.NODE_ENV === 'production' ? 10 : 30,
  message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth', authLimiter, authRoutes);
```

| Env | Max requests/phút |
|-----|-------------------|
| Development | 30 |
| Production | 10 |

**Áp dụng cho:** `/api/auth/*` (register, login, me, profile)

### 4.2 Admin Rate Limit
```javascript
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 60 : 120,
  message: { success: false, message: 'Quá nhiều yêu cầu admin, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/admin/users', adminLimiter, adminUsersRoutes);
app.use('/api/admin/proposals', adminLimiter, adminProposalsRoutes);
app.use('/api/admin/dashboard', adminLimiter, dashboardRoutes);
```

| Env | Max requests/phút |
|-----|-------------------|
| Development | 120 |
| Production | 60 |

**Áp dụng cho:** Tất cả `/api/admin/*` endpoints

### 4.3 Excel Rate Limit
```javascript
const excelLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 30,
  message: { success: false, message: 'Quá nhiều yêu cầu Excel, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/admin/excel', adminLimiter, excelLimiter, excelRoutes);
```

| Env | Max requests/phút |
|-----|-------------------|
| Development | 30 |
| Production | 10 |

**Áp dụng cho:** `/api/admin/excel/*` (export, import, template)
**Lưu ý:** Excel endpoints có cả `adminLimiter` + `excelLimiter` (stacked)

---

## 5. JWT AUTHENTICATION

**File:** `backend/src/middlewares/auth.js`

### Cài đặt
```javascript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set in environment variables');
  process.exit(1);
}
```

### Token flow
```
1. User login → Server generate JWT (expires: 7 days)
2. Client store token (localStorage/sessionStorage)
3. Client send request với header: Authorization: Bearer <token>
4. Middleware verify token → attach req.user
```

### Payload
```javascript
{
  id: user.id,
  email: user.email,
  role: user.role,    // 'USER' hoặc 'ADMIN'
  iat: ...,
  exp: ...            // 7 days from now
}
```

### Test
```bash
# Không có token → 401
curl http://localhost:3000/api/auth/me
# {"success":false,"message":"Chưa đăng nhập"}

# Token sai → 401
curl -H "Authorization: Bearer invalid" http://localhost:3000/api/auth/me
# {"success":false,"message":"Token không hợp lệ hoặc đã hết hạn"}
```

---

## 6. ROLE-BASED AUTHORIZATION

**File:** `backend/src/middlewares/auth.js`

### Middleware
```javascript
const requireAuth = (req, res, next) => { ... };   // Verify JWT
const requireAdmin = (req, res, next) => { ... };   // Check role === 'ADMIN'
const optionalAuth = (req, res, next) => { ... };   // Attach user if exists
```

### Phân quyền
| Endpoint | Auth | Role | Middleware |
|----------|------|------|-----------|
| `GET /api/stations` | Public | — | None |
| `POST /api/stations` | Required | ADMIN | `requireAuth, requireAdmin` |
| `GET /api/proposals` | Public | — | None |
| `POST /api/proposals` | Required | Any | `requireAuth` |
| `GET /api/my-proposals` | Required | Any | `requireAuth` |
| `GET /api/admin/*` | Required | ADMIN | `requireAuth, requireAdmin` |

### Test
```bash
# User gọi admin endpoint → 403
curl -H "Authorization: Bearer <user_token>" http://localhost:3000/api/admin/users
# {"success":false,"message":"Không có quyền truy cập"}
```

---

## 7. INPUT VALIDATION

**File:** `backend/src/middlewares/validators.js`

### Validators
| Validator | Rules |
|-----------|-------|
| `validateEmail` | Required, format email |
| `validatePhone` | Required, đúng 10 chữ số |
| `validateFullName` | Required, 2-100 ký tự |
| `validatePassword` | Required, tối thiểu 6 ký tự |
| `validateLatitude` | Required, -90 đến 90 |
| `validateLongitude` | Required, -180 đến 180 |
| `validateRequired` | Không rỗng |
| `validateEnum` | Phải nằm trong danh sách cho phép |

### Applied to
| Route | Validator |
|-------|-----------|
| `POST /api/auth/register` | `validateRegister` |
| `POST /api/auth/login` | `validateLogin` |
| `POST /api/stations` | `validateCreateStation` |
| `PUT /api/stations/:id` | `validateUpdateStation` |
| `POST /api/proposals` | `validateCreateProposal` |
| `POST /api/admin/users` | `validateCreateUser` |
| `PUT /api/admin/users/:id` | `validateUpdateUser` |

---

## 8. PASSWORD HASHING

**File:** `backend/src/routes/auth.js`
**Package:** `bcryptjs`

### Cài đặt
```javascript
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(password, salt);
```

### Config
| Param | Giá trị | Ý nghĩa |
|-------|---------|---------|
| Salt rounds | 10 | 2^10 = 1024 iterations |

### Lưu ý
- KHÔNG lưu plaintext password
- Mỗi user có salt riêng
- So sánh: `bcrypt.compare(password, hashedPassword)`

---

## 9. SQL INJECTION PREVENTION

**Phương pháp:** Parameterized queries (`?` placeholders)

### Ví dụ
```javascript
// ✅ AN TOÀN — Parameterized
await pool.query('SELECT * FROM users WHERE email = ?', [email]);

// ❌ NGUY HIỂM — String concatenation (KHÔNG dùng)
await pool.query(`SELECT * FROM users WHERE email = '${email}'`);
```

### Kiểm tra
Tất cả route files đều dùng `?` placeholders cho query parameters.

---

## 10. OWNERSHIP CHECK

**File:** `backend/src/routes/myProposals.js`

### Logic
```javascript
// Kiểm tra proposal có thuộc về user đang login không
const [existing] = await pool.query(
  'SELECT id, status FROM station_proposals WHERE id = ? AND user_id = ?',
  [id, req.user.id]
);

if (existing.length === 0) {
  return res.status(404).json({ message: 'Không tìm thấy đề xuất' });
}
```

### Áp dụng
- `PUT /api/my-proposals/:id` — Chỉ update được proposal của mình
- `DELETE /api/my-proposals/:id` — Chỉ delete được proposal của mình
- `PUT /api/my-proposals/:id` — Chỉ update được khi status === 'PENDING'

---

## 11. SELF-DELETE & ADMIN PROTECTION

**File:** `backend/src/routes/adminUsers.js`

### Logic
```javascript
// Không thể xóa admin
if (existing[0].role === 'ADMIN') {
  return res.status(400).json({ message: 'Không thể xóa admin' });
}

// Không thể xóa chính mình
if (parseInt(id) === req.user.id) {
  return res.status(400).json({ message: 'Không thể xóa chính mình' });
}
```

---

## 12. SUMMARY — THAYER MODEL

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT                           │
│  (React + Vite on port 5173)                        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS (production)
                       ▼
┌─────────────────────────────────────────────────────┐
│              SECURITY LAYER                         │
│  ┌─────────────────────────────────────────────┐    │
│  │ 1. CORS — Chỉ cho phép origins config       │    │
│  │ 2. Helmet — Security headers                │    │
│  │ 3. Rate Limiting — Auth/Admin/Excel         │    │
│  │ 4. Body Size Limit — 10MB max               │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              AUTH LAYER                              │
│  ┌─────────────────────────────────────────────┐    │
│  │ 5. JWT Verification — Token validation      │    │
│  │ 6. Role Check — USER/ADMIN                  │    │
│  │ 7. Ownership Check — user_id match          │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              VALIDATION LAYER                       │
│  ┌─────────────────────────────────────────────┐    │
│  │ 8. Input Validation — Email, Phone, etc.    │    │
│  │ 9. Password Hashing — bcrypt                │    │
│  │ 10. SQL Injection Prevention — Parameters   │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              DATABASE                               │
│  (MySQL 8.0 on port 3306)                           │
└─────────────────────────────────────────────────────┘
```

---

## TEST RESULTS

### Helmet Headers
| Header | Value | Status |
|--------|-------|--------|
| X-Content-Type-Options | nosniff | ✅ |
| X-Frame-Options | SAMEORIGIN | ✅ |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | ✅ |
| X-XSS-Protection | 0 | ✅ |
| Content-Security-Policy | default-src 'self'; ... | ✅ |
| Referrer-Policy | no-referrer | ✅ |

### Body Size Limit
| Payload Size | Result | Status |
|--------------|--------|--------|
| 11MB | 413 Payload Too Large | ✅ |
| 5MB | 401 Unauthorized (pass size check) | ✅ |

### Rate Limiting
| Endpoint | Limit | Result | Status |
|----------|-------|--------|--------|
| `/api/auth/*` | 30 req/min (dev) | Request 30: 429 | ✅ |
| `/api/admin/*` | 120 req/min (dev) | Request 121: 429 | ✅ |

---

## RECOMMENDATIONS CHO PRODUCTION

| # | Việc | Ưu tiên |
|---|------|---------|
| 1 | Thêm HTTPS qua nginx reverse proxy | CAO |
| 2 | Giảm JWT有效期 (1 ngày) + refresh token | TRUNG BÌNH |
| 3 | Structured logging (winston/pino) | TRUNG BÌNH |
| 4 | Swagger auth trong production | THẤP |
| 5 | Request timeout middleware | THẤP |
