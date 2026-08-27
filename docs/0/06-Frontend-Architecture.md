# FRONTEND ARCHITECTURE

> **Framework:** React 18.2
> **Build Tool:** Vite 5.0
> **Routing:** React Router DOM 6.20
> **Map:** React Leaflet 4.2

---

## 1. TỔNG QUAN

```
frontend/src/
├── main.jsx              # Entry point (StrictMode)
├── App.jsx               # Root component + routing
├── App.css               # Tất cả styles (728 lines)
├── index.css             # Global reset
│
├── components/           # Reusable UI components
│   └── MapView.jsx       # Leaflet map wrapper
│
├── contexts/
│   └── AuthContext.jsx   # Auth state management
│
├── layouts/              # Layout wrappers
│   ├── PublicLayout.jsx  # Cho unauthenticated pages
│   ├── UserLayout.jsx    # Cho user pages
│   └── AdminLayout.jsx   # Cho admin pages
│
├── pages/
│   ├── auth/
│   │   ├── LoginPage.jsx
│   │   └── RegisterPage.jsx
│   ├── user/
│   │   ├── MapPage.jsx          # Map + proposal creation
│   │   ├── MyProposalsPage.jsx  # User's proposals
│   │   └── ProfilePage.jsx      # User profile (read-only)
│   └── admin/
│       ├── AdminDashboard.jsx     # Dashboard (placeholder)
│       ├── AdminUsersPage.jsx     # User CRUD
│       ├── AdminStationsPage.jsx  # Station CRUD
│       └── AdminProposalsPage.jsx # Proposal management
│
├── services/
│   └── api.js            # API client + service layer
│
└── utils/
    └── mapHelpers.js     # Marker color utilities
```

---

## 2. ROUTING

### Route Tree (`App.jsx`)

```jsx
<AuthProvider>
  <Router>
    <Routes>
      {/* PUBLIC */}
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* USER (authenticated) */}
      <Route element={<UserLayout />}>
        <Route path="/map" element={<MapPage />} />
        <Route path="/my-proposals" element={<MyProposalsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* ADMIN (authenticated + ADMIN role) */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/stations" element={<AdminStationsPage />} />
        <Route path="/admin/proposals" element={<AdminProposalsPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  </Router>
</AuthProvider>
```

---

## 3. LAYOUTS

### PublicLayout
- Hiển thị trên nền gradient tím
- Card centered chứa LoginPage / RegisterPage
- Nếu đã login → redirect sang `/admin` (admin) hoặc `/map` (user)

### UserLayout
- Header bar trên cùng: Logo + Navigation + User info + Logout
- Menu: Bản đồ (`/map`) | Đề xuất của tôi (`/my-proposals`) | Hồ sơ (`/profile`)
- Main content area chứa page

### AdminLayout
- Sidebar trái 250px: Logo + Navigation + User info + Logout
- Menu: Dashboard | Users | Stations | Proposals
- Main content area chứa page

---

## 4. COMPONENTS

### MapView.jsx (`components/MapView.jsx`)

Component bản đồ có thể tái sử dụng.

**Props:**
| Prop | Type | Default | Mô tả |
|------|------|---------|-------|
| center | [lat, lng] | [10.7626, 106.6601] | Tâm bản đồ |
| zoom | number | 12 | Mức zoom |
| height | string | "100%" | Chiều cao |
| onMapClick | function | - | Callback khi click map |
| showStations | bool | true | Hiển thị markers stations |
| showProposals | bool | true | Hiển thị markers proposals |
| fitBounds | bool | false | Tự fit bounds theo markers |

**Features:**
- CARTO light basemap tiles
- Load stations + proposals từ API khi mount
- Color-coded markers theo status
- Click marker → popup chi tiết
- Click map → gọi `onMapClick(latlng)`
- MapClickHandler component để bắt sự kiện click

---

## 5. PAGES CHI TIẾT

### LoginPage.jsx

**Form fields:**
- Email (required)
- Password (required)

**Flow:**
1. Nhập email + password
2. Gọi `AuthContext.login(email, password)`
3. Nếu thành công → redirect `/map`
4. Nếu lỗi → hiện thông báo

---

### RegisterPage.jsx

**Form fields:**
- Họ tên (required)
- Email (required)
- Số điện thoại
- Mật khẩu (required, min 6 chars)
- Xác nhận mật khẩu (required, phải khớp)

**Flow:**
1. Validate password match (client-side)
2. Gọi `AuthContext.register(data)`
3. Nếu thành công → redirect `/map`

---

### MapPage.jsx (User)

**Features:**
- Hiển thị bản đồ toàn trang
- Click trên map → mở form tạo đề xuất
- Form có tọa độ (readonly), nhập chủ MB, SĐT, địa chỉ, diện tích, loại đất, ghi chú
- Submit → gọi API tạo proposal → toast thành công → refresh markers

**Flow:**
```
Click map → Mở form với lat/lng
  → Nhập thông tin → Submit
  → POST /api/proposals
  → Toast "Tạo đề xuất thành công"
  → Refresh markers trên map
```

---

### MyProposalsPage.jsx (User)

**Features:**
- Bảng hiển thị danh sách đề xuất của user đang login
- Filter theo trạng thái (dropdown)
- Badge màu theo status

**API:** `GET /api/my-proposals?status=...`

---

### AdminStationsPage.jsx

**Features:**
- Search input (tìm theo tên/địa chỉ)
- Filter dropdown (ALL / ACTIVE / DEPLOYING)
- Pagination (10 items/trang)
- Bảng danh sách stations
- Nút "Thêm trạm" → mở modal form
- Form có map picker (click map để lấy lat/lng)
- Nút "Sửa" → mở form với data cũ
- Nút "Xóa" → confirm dialog

**State:**
```javascript
stations = []           // Danh sách hiện tại
pagination = { page, limit, total, totalPages }
search = ""             // Từ khóa tìm kiếm
filterStatus = ""       // Filter status
showForm = false        // Hiển thị modal
editingId = null        // ID đang sửa (null = tạo mới)
form = { name, latitude, longitude, address, status, description }
```

---

### AdminUsersPage.jsx

**Features:**
- Bảng danh sách users
- Nút "Thêm user" → modal form
- Nút "Sửa" → modal form với data cũ
- Nút "Khóa/Mở" → toggle lock/unlock
- Dropdown Role → chuyển USER ↔ ADMIN
- Nút "Xóa" → confirm (không cho xóa admin)

---

### AdminProposalsPage.jsx

**Features:**
- Filter theo trạng thái (dropdown)
- Bảng danh sách proposals (kèm tên user tạo)
- Select dropdown để đổi trạng thái (PENDING, REVIEWING, APPROVED, REJECTED)
- Nút "Xóa" → confirm dialog

---

## 6. STATE MANAGEMENT

### AuthContext (`contexts/AuthContext.jsx`)

```javascript
{
  user: { id, full_name, email, phone, role, status },
  token: "eyJhbGciOi...",
  loading: true,

  // Methods
  login(email, password),
  register(data),
  logout()
}
```

**Flow:**
1. Component mount → check localStorage cho token
2. Nếu có token → gọi `GET /api/auth/me`
3. Nếu valid → set user + token
4. Nếu invalid → logout (clear localStorage)

**Persistence:**
- Token lưu trong `localStorage`
- On page load → auto-restore session

---

## 7. API CLIENT (`services/api.js`)

### Structure
```javascript
api = {
  get(endpoint),
  post(endpoint, body),
  put(endpoint, body),
  delete(endpoint),
  getWithAuth(endpoint, token),
  postWithAuth(endpoint, body, token),
  putWithAuth(endpoint, body, token),
  deleteWithAuth(endpoint, token),
  patchWithAuth(endpoint, body, token)
}

stationService = {
  getAll(),
  getAllWithParams(queryString),
  getById(id),
  create(station, token),
  update(id, station, token),
  delete(id, token)
}

proposalService = { getAll(), getById(id), create(proposal, token) }
myProposalService = { getAll(status, token) }
adminProposalService = { getAll(status, token), updateStatus(id, status, token), delete(id, token) }
adminUserService = { getAll(token), create(user, token), update(id, user, token), delete(id, token), toggleLock(id, token), changeRole(id, role, token) }
```

---

## 8. MAP HELPERS (`utils/mapHelpers.js`)

```javascript
getMarkerColor(status) → hex color
  ACTIVE → "#22c55e" (green)
  DEPLOYING → "#eab308" (yellow)
  PENDING → "#f97316" (orange)
  REVIEWING → "#3b82f6" (blue)
  APPROVED → "#22c55e" (green)
  REJECTED → "#ef4444" (red)

createCustomIcon(color) → L.divIcon with colored circle
```

---

## 9. CSS STYLES (`App.css`)

### Major Sections
```
Reset & Base         (1-18)
Public Layout        (20-32)
Auth Pages           (34-116)
User Layout          (118-184)
Admin Layout         (186-247)
Loading              (249-257)
Pages                (259-271)
Profile              (273-289)
Admin Dashboard      (291-314)
Map Styles           (316-386)
Page Header          (387-398)
Filter Bar           (399-430)
Map Picker           (431-445)
Pagination           (446-465)
Modal                (555-628)
Badges               (516-553)
Buttons              (416-478)
Table                (479-514)
Success/Error Msg    (629-642)
```

### Key Classes
| Class | Purpose |
|-------|---------|
| `.filter-bar` | Search + filter controls |
| `.map-picker` | Map container trong form modal |
| `.pagination` | Pagination controls |
| `.modal-lg` | Wide modal (700px) cho form + map |
| `.badge-active` | Green badge |
| `.badge-deploying` | Yellow badge |
| `.badge-pending` | Orange badge |
| `.badge-reviewing` | Blue badge |
| `.badge-approved` | Green badge |
| `.badge-rejected` | Red badge |
