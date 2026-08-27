# CẤU TRÚC DỰ ÁN

> **Dự án:** Station Management System (Quản lý Trạm & Đề xuất Trạm)
> **Stack:** React + Vite | Node.js + Express | MySQL 8.0 | Docker Compose

---

## 1. CẤU TRÚC THƯ MỤC

```
DeXuatTram2/
├── frontend/                    # React + Vite (port 5173)
│   ├── src/
│   │   ├── main.jsx             # Entry point
│   │   ├── App.jsx              # Root component + routing
│   │   ├── App.css              # Tất cả styles
│   │   ├── index.css            # Global reset
│   │   ├── components/          # Reusable components
│   │   │   └── MapView.jsx      # Leaflet map wrapper
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx  # Auth state (React Context)
│   │   ├── layouts/
│   │   │   ├── PublicLayout.jsx # Cho login/register
│   │   │   ├── UserLayout.jsx   # Cho user pages
│   │   │   └── AdminLayout.jsx  # Cho admin pages
│   │   ├── pages/
│   │   │   ├── auth/            # LoginPage, RegisterPage
│   │   │   ├── user/            # MapPage, MyProposalsPage, ProfilePage
│   │   │   └── admin/           # AdminDashboard, AdminUsersPage,
│   │   │                        # AdminStationsPage, AdminProposalsPage
│   │   ├── services/
│   │   │   └── api.js           # API client layer
│   │   └── utils/
│   │       └── mapHelpers.js    # Marker color utilities
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.js
│
├── backend/                     # Node.js + Express (port 3000)
│   ├── src/
│   │   ├── app.js               # Entry point
│   │   ├── middlewares/
│   │   │   └── auth.js          # JWT + role middleware
│   │   ├── routes/
│   │   │   ├── test.js          # GET /api/test
│   │   │   ├── auth.js          # Register, Login, Get Me
│   │   │   ├── stations.js      # Station CRUD
│   │   │   ├── proposals.js     # Public proposal API
│   │   │   ├── myProposals.js   # User's own proposals
│   │   │   ├── adminProposals.js# Admin proposal management
│   │   │   └── adminUsers.js    # Admin user management
│   │   └── utils/
│   │       └── db.js            # MySQL2 connection pool
│   ├── Dockerfile
│   └── package.json
│
├── database/                    # SQL scripts
│   ├── 01-create-tables.sql     # Schema
│   ├── 02-seed-data.sql         # Sample data
│   └── 03-update-passwords.sql  # Password utilities
│
├── docker-compose.yml           # 3 services orchestration
├── .env                         # Environment variables
├── .env.example                 # Template
├── .gitignore
├── AGENTS.md                    # AI coding conventions
└── docs/                        # Tài liệu dự án
```

---

## 2. TECHNOLOGY STACK

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | React | 18.2 | UI library |
| Frontend | React Router DOM | 6.20 | Client-side routing |
| Frontend | React Leaflet | 4.2 | Map component |
| Frontend | Leaflet | 1.9 | Map rendering |
| Build | Vite | 5.0 | Dev server + bundler |
| Backend | Node.js | 20 | Runtime |
| Backend | Express | 4.18 | HTTP framework |
| Auth | jsonwebtoken | 9.0 | JWT tokens |
| Auth | bcrypt | 5.1 | Password hashing |
| Database | MySQL | 8.0 | Relational DB |
| DB Driver | mysql2 | 3.6 | MySQL client (promise) |
| Deploy | Docker Compose | v2 | Container orchestration |

---

## 3. DOCKER SERVICES

| Service | Container Name | Image | Port | Volumes |
|---------|---------------|-------|------|---------|
| frontend | station-frontend | node:20-alpine | 5173 | Hot reload (src, vite.config.js) |
| backend | station-backend | node:20-alpine | 3000 | Hot reload (src) |
| mysql | station-mysql | mysql:8.0 | 3306 | Persistent named volume |

### Network
- Bridge network: `station-network`
- All 3 containers communicate via service names

### Startup Order
```
MySQL (healthcheck) → Backend (depends_on: mysql healthy) → Frontend (depends_on: backend)
```

---

## 4. MÔI TRƯỜNG

### Biến môi trường (`.env`)

```env
# Backend
PORT=3000
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=station_management
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

### Frontend
- API URL hardcoded: `http://localhost:3000/api`
- Vite dev server: `0.0.0.0:5173`
- HMR polling interval: 1000ms (for Docker on Windows)

---

## 5. QUY ƯỚC ĐẶT TÊN

| Target | Convention | Example |
|--------|-----------|---------|
| Component file | PascalCase.jsx | `MapView.jsx` |
| Variable/function | camelCase | `loadStations` |
| Constant | UPPER_SNAKE_CASE | `API_URL` |
| DB table | snake_case (plural) | `station_proposals` |
| DB column | snake_case | `created_at` |
| API route | /api/[resource] | `/api/stations` |
| CSS class | kebab-case | `badge-active` |

---

## 6. CẤU TRÚC ROUTING

```
/                       → Redirect → /login
/login                  → PublicLayout → LoginPage
/register               → PublicLayout → RegisterPage

/map                    → UserLayout → MapPage
/my-proposals           → UserLayout → MyProposalsPage
/profile                → UserLayout → ProfilePage

/admin                  → AdminLayout → AdminDashboard
/admin/users            → AdminLayout → AdminUsersPage
/admin/stations         → AdminLayout → AdminStationsPage
/admin/proposals        → AdminLayout → AdminProposalsPage

/*                      → Redirect → /login
```

---

## 7. TỔNG QUAN DATA FLOW

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┐
│   Browser   │────▶│ Frontend     │────▶│ Backend API  │────▶│ MySQL   │
│ (localhost  │     │ (port 5173)  │     │ (port 3000)  │     │(:3306)  │
│   :5173)    │◀────│ React + Vite │◀────│ Express      │◀────│         │
└─────────────┘     └──────────────┘     └──────────────┘     └─────────┘
```

### Request Lifecycle
1. Browser sends request to `localhost:5173`
2. Vite serves React app (or proxies to backend)
3. React makes API calls to `localhost:3000/api/*`
4. Backend processes request (auth check, business logic)
5. Backend queries MySQL via connection pool
6. Response returned to frontend
7. React updates UI state
