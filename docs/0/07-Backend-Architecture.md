# BACKEND ARCHITECTURE

> **Runtime:** Node.js 20
> **Framework:** Express 4.18
> **Database:** MySQL 8.0 (mysql2 3.6)
> **Auth:** JWT (jsonwebtoken 9.0) + bcrypt 5.1

---

## 1. TỔNG QUAN

```
backend/src/
├── app.js               # Express entry point
├── middlewares/
│   └── auth.js          # JWT + role middleware
├── routes/
│   ├── test.js          # Health check
│   ├── auth.js          # Register, Login, Get Me
│   ├── stations.js      # Station CRUD
│   ├── proposals.js     # Public proposal API
│   ├── myProposals.js   # User's own proposals
│   ├── adminProposals.js# Admin proposal management
│   └── adminUsers.js    # Admin user management
└── utils/
    └── db.js            # MySQL2 connection pool
```

---

## 2. ENTRY POINT (`app.js`)

```javascript
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/test', require('./routes/test'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/stations', require('./routes/stations'));
app.use('/api/proposals', require('./routes/proposals'));
app.use('/api/my-proposals', require('./routes/myProposals'));
app.use('/api/admin/proposals', require('./routes/adminProposals'));
app.use('/api/admin/users', require('./routes/adminUsers'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## 3. DATABASE CONNECTION (`utils/db.js`)

```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'station_management',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
```

**Usage:**
```javascript
const pool = require('../utils/db');
const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
```

**Important:** Luôn dùng parameterized queries (`?`) để tránh SQL injection.

---

## 4. AUTHENTICATION MIDDLEWARE (`middlewares/auth.js`)

### Three Functions

```javascript
// 1. requireAuth - Xác thực JWT
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Không có token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
}

// 2. requireAdmin - Kiểm tra role ADMIN
function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
  }
  next();
}

// 3. optionalAuth - Attach user nếu có token
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {}
  }
  next();
}
```

### JWT Payload
```json
{
  "id": 1,
  "email": "admin@station.com",
  "role": "ADMIN",
  "iat": 1787849521,
  "exp": 1788454321
}
```

- Secret: `process.env.JWT_SECRET`
- Expiry: 7 ngày

### Usage Pattern
```javascript
// Public route
router.get('/', async (req, res) => { ... });

// Authenticated route
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  ...
});

// Admin only route
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  ...
});
```

---

## 5. ROUTES CHI TIẾT

### `routes/test.js`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/test` | No | Health check |

---

### `routes/auth.js`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Đăng ký user mới |
| POST | `/api/auth/login` | No | Đăng nhập |
| GET | `/api/auth/me` | requireAuth | Lấy info user hiện tại |

**Register Logic:**
1. Validate required fields (full_name, email, password)
2. Check email uniqueness
3. Hash password (bcrypt, salt rounds 10)
4. INSERT INTO users (role=USER, status=ACTIVE)
5. Generate JWT token
6. Return { user, token }

**Login Logic:**
1. Validate email + password
2. Find user by email
3. Check status !== 'LOCKED'
4. Compare bcrypt hash
5. Generate JWT token
6. Return { user, token }

---

### `routes/stations.js`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/stations` | No | List (paginated, searchable) |
| GET | `/api/stations/:id` | No | Get by ID |
| POST | `/api/stations` | requireAuth + requireAdmin | Create |
| PUT | `/api/stations/:id` | requireAuth + requireAdmin | Update |
| DELETE | `/api/stations/:id` | requireAuth + requireAdmin | Delete |

**GET /api/stations Query Params:**
```
search    → WHERE name LIKE ? OR address LIKE ?
status    → WHERE status = ?
page      → LIMIT ? OFFSET ?
limit     → Default 10
```

**Response Format:**
```json
{
  "success": true,
  "data": [...],
  "pagination": { "page": 1, "limit": 10, "total": 14, "totalPages": 2 }
}
```

---

### `routes/proposals.js`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/proposals` | No | List all (for map) |
| GET | `/api/proposals/:id` | No | Get by ID |
| POST | `/api/proposals` | requireAuth | Create proposal |

**POST Logic:**
1. Validate required fields
2. Get `user_id` from `req.user.id` (JWT)
3. INSERT INTO station_proposals (status=PENDING)
4. Return created proposal

---

### `routes/myProposals.js`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/my-proposals` | requireAuth | User's own proposals |

**Query:** `?status=PENDING`

**Logic:**
```sql
SELECT * FROM station_proposals
WHERE user_id = ?
[AND status = ?]
ORDER BY created_at DESC
```

---

### `routes/adminProposals.js`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/proposals` | requireAuth + requireAdmin | List all with user info |
| PUT | `/api/admin/proposals/:id/status` | requireAuth + requireAdmin | Update status |
| DELETE | `/api/admin/proposals/:id` | requireAuth + requireAdmin | Delete |

**GET joins user data:**
```sql
SELECT sp.*, u.full_name as user_name, u.email as user_email
FROM station_proposals sp
JOIN users u ON sp.user_id = u.id
ORDER BY sp.created_at DESC
```

---

### `routes/adminUsers.js`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | requireAuth + requireAdmin | List all users |
| POST | `/api/admin/users` | requireAuth + requireAdmin | Create user |
| PUT | `/api/admin/users/:id` | requireAuth + requireAdmin | Update user |
| DELETE | `/api/admin/users/:id` | requireAuth + requireAdmin | Delete (not admins) |
| PATCH | `/api/admin/users/:id/lock` | requireAuth + requireAdmin | Toggle lock |
| PATCH | `/api/admin/users/:id/role` | requireAuth + requireAdmin | Change role |

**Delete Guard:**
```javascript
// Cannot delete ADMIN users
if (user.role === 'ADMIN') {
  return res.status(400).json({ message: 'Không thể xóa admin' });
}
```

**Lock Toggle:**
```javascript
// ACTIVE → LOCKED, LOCKED → ACTIVE
const newStatus = user.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
```

---

## 6. ERROR HANDLING

### Pattern
```javascript
try {
  // Business logic
} catch (error) {
  console.error('Error name:', error);
  res.status(500).json({ success: false, message: 'Lỗi server' });
}
```

### HTTP Status Codes
| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (wrong role) |
| 404 | Not found |
| 500 | Server error |

---

## 7. ENVIRONMENT VARIABLES

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| DB_HOST | localhost | MySQL host |
| DB_PORT | 3306 | MySQL port |
| DB_USER | root | MySQL user |
| DB_PASSWORD | password | MySQL password |
| DB_NAME | station_management | Database name |
| JWT_SECRET | - | JWT signing secret |

---

## 8. DEPENDENCIES (`package.json`)

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "mysql2": "^3.6.0",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "dotenv": "^16.3.1"
  },
  "scripts": {
    "dev": "node --watch src/app.js",
    "start": "node src/app.js"
  }
}
```
