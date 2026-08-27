# AUTHENTICATION FLOW

> **Method:** JWT (JSON Web Token)
> **Expiry:** 7 ngày
> **Password Hashing:** bcrypt (salt rounds: 10)

---

## 1. TỔNG QUAN

```
┌─────────┐         ┌─────────┐         ┌──────────┐
│ Browser │────────▶│ Frontend│────────▶│ Backend  │
│         │◀────────│         │◀────────│          │
└─────────┘         └─────────┘         └──────────┘
     │                   │                   │
     │  1. Login form    │                   │
     │──────────────────▶│                   │
     │                   │  2. POST /login   │
     │                   │──────────────────▶│
     │                   │  3. { user, token }│
     │                   │◀──────────────────│
     │  4. Redirect      │                   │
     │◀──────────────────│                   │
     │                   │  5. Store token   │
     │                   │  in localStorage  │
     │                   │                   │
     │  6. API requests  │                   │
     │──────────────────▶│  7. Bearer token  │
     │                   │──────────────────▶│
     │                   │  8. Response      │
     │                   │◀──────────────────│
```

---

## 2. REGISTER FLOW

### Frontend (`RegisterPage.jsx`)
```
1. User nhập: full_name, email, phone, password, confirmPassword
2. Validate: password === confirmPassword
3. Gọi AuthContext.register(data)
4. AuthContext gọi POST /api/auth/register
5. Nếu success → lưu token → redirect /map
6. Nếu error → hiện thông báo lỗi
```

### Backend (`routes/auth.js`)
```javascript
POST /api/auth/register

1. Validate required fields
   - full_name, email, password phải có
   - password >= 6 chars

2. Check email uniqueness
   SELECT id FROM users WHERE email = ?
   → Nếu tồn tại → 400 "Email đã tồn tại"

3. Hash password
   const hashedPassword = await bcrypt.hash(password, 10);

4. INSERT INTO users
   INSERT INTO users (full_name, email, phone, password, role, status)
   VALUES (?, ?, ?, ?, 'USER', 'ACTIVE')

5. Generate JWT
   const token = jwt.sign(
     { id: result.insertId, email, role: 'USER' },
     JWT_SECRET,
     { expiresIn: '7d' }
   );

6. Return
   { success: true, data: { user, token } }
```

---

## 3. LOGIN FLOW

### Frontend (`LoginPage.jsx`)
```
1. User nhập: email, password
2. Gọi AuthContext.login(email, password)
3. AuthContext gọi POST /api/auth/login
4. Nếu success → lưu token vào localStorage → set user state → redirect /map
5. Nếu error → hiện thông báo lỗi
```

### Backend (`routes/auth.js`)
```javascript
POST /api/auth/login

1. Validate required fields
   - email, password phải có

2. Find user
   SELECT * FROM users WHERE email = ?
   → Nếu không tìm thấy → 400 "Email không tồn tại"

3. Check account status
   → Nếu status === 'LOCKED' → 403 "Tài khoản đã bị khóa"

4. Compare password
   const isValid = await bcrypt.compare(password, user.password);
   → Nếu sai → 400 "Mật khẩu không đúng"

5. Generate JWT
   const token = jwt.sign(
     { id: user.id, email: user.email, role: user.role },
     JWT_SECRET,
     { expiresIn: '7d' }
   );

6. Return (không gửi password)
   { success: true, data: { user: { id, full_name, email, phone, role, status }, token } }
```

---

## 4. SESSION PERSISTENCE

### On Page Load (`AuthContext.jsx`)
```javascript
useEffect(() => {
  const token = localStorage.getItem('token');
  if (token) {
    // Verify token với backend
    fetch('http://localhost:3000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setUser(data.data);
        setToken(token);
      } else {
        logout(); // Token invalid → clear
      }
    })
    .catch(() => logout());
  }
  setLoading(false);
}, []);
```

### Token Storage
```javascript
// Lưu token
localStorage.setItem('token', token);

// Xóa token
localStorage.removeItem('token');

// Đọc token
const token = localStorage.getItem('token');
```

---

## 5. AUTHENTICATED REQUESTS

### Frontend Pattern
```javascript
// Gọi API với auth
const res = await fetch('http://localhost:3000/api/admin/users', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Backend Verification
```javascript
// middleware/auth.js
function requireAuth(req, res, next) {
  // 1. Lấy header
  const authHeader = req.headers.authorization;

  // 2. Check format "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Không có token'
    });
  }

  // 3. Extract token
  const token = authHeader.split(' ')[1];

  // 4. Verify
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // decoded = { id, email, role, iat, exp }

    // 5. Attach to request
    req.user = decoded;

    // 6. Continue
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn'
    });
  }
}
```

---

## 6. ROLE-BASED ACCESS CONTROL

### Permission Matrix

| Action | USER | ADMIN | No Auth |
|--------|------|-------|---------|
| View map | ✅ | ✅ | ✅ |
| View stations | ✅ | ✅ | ✅ |
| View proposals | ✅ | ✅ | ✅ |
| Create proposal | ✅ | ✅ | ❌ |
| View own proposals | ✅ | ✅ | ❌ |
| Manage all proposals | ❌ | ✅ | ❌ |
| Manage stations (CRUD) | ❌ | ✅ | ❌ |
| Manage users (CRUD) | ❌ | ✅ | ❌ |
| Lock/unlock users | ❌ | ✅ | ❌ |
| Change user roles | ❌ | ✅ | ❌ |
| Delete admin users | ❌ | ❌ | ❌ |

### Implementation
```javascript
// Public route - ai cũng gọi được
router.get('/', async (req, res) => { ... });

// Authenticated route - cần login
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id; // Lấy từ JWT
  ...
});

// Admin only route - cần login + role ADMIN
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  ...
});
```

---

## 7. LOGOUT FLOW

### Frontend
```javascript
function logout() {
  // 1. Xóa token khỏi localStorage
  localStorage.removeItem('token');

  // 2. Clear user state
  setUser(null);
  setToken(null);

  // 3. Redirect về login
  navigate('/login');
}
```

---

## 8. JWT TOKEN DETAILS

### Structure
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.    ← Header (algorithm)
eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBzdGF0     ← Payload (data)
aW9uLmNvbSIsInJvbGUiOiJBRE1JTiIsImlh
dCI6MTc4Nzg0OTUyMSwiZXhwIjoxNzg4NDU0
MzIxfQ.                                     ← Separator
FpB8W5QacyBtiNQaRGDKiwzaxf8aNqbF_vkMU  ← Signature
gy_1bk
```

### Decoded Payload
```json
{
  "id": 1,
  "email": "admin@station.com",
  "role": "ADMIN",
  "iat": 1787849521,     // Issued at
  "exp": 1788454321      // Expires (7 days later)
}
```

### Expiry Handling
- Token hết hạn → `jwt.verify()` throw error
- Backend trả 401 → Frontend gọi `logout()`
- User phải login lại
