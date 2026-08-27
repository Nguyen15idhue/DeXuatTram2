# CÁC BƯỚC THỰC HIỆN - DỰ ÁN QUẢN LÝ TRẠM & ĐỀ XUẤT TRẠM

> **Stack:** React + Vite | Node + Express | MySQL | Docker  
> **Thời gian ước lượng:** ~20 giờ  
> **Mục tiêu:** MVP hoàn chỉnh, có thể demo

---

## BƯỚC 1: THIẾT LẬP MÔI TRƯỜNG (Docker + Project Skeleton)

### Yêu cầu cần đạt

- [ ] Tạo cấu trúc thư mục dự án
- [ ] Thiết lập Docker với 3 containers: frontend, backend, mysql
- [ ] Frontend: React + Vite, hot reload hoạt động
- [ ] Backend: Node + Express, hot reload hoạt động
- [ ] MySQL: Kết nối thành công
- [ ] Chạy `docker compose up` → tất cả hoạt động

### Cấu trúc thư mục

```
station-management/
├── frontend/          # React + Vite
├── backend/           # Node + Express  
├── database/          # SQL scripts
├── docker/
├── docker-compose.yml
├── .env
└── .env.example
```

### Checklist kiểm tra

- [ ] Mở trình duyệt → localhost:5173 → thấy React app
- [ ] Postman → localhost:3000/api/test → thấy response
- [ ] MySQL client → kết nối localhost:3306 → thành công

---

## BƯỚC 2: THIẾT LẬP DATABASE

### Yêu cầu cần đạt

- [ ] Tạo 3 bảng: users, stations, station_proposals
- [ ] Thiết lập relationships giữa các bảng
- [ ] Seed dữ liệu mẫu (1 admin, 3 users, 5 stations, 3 proposals)

### Schema thiết kế

**Bảng users**
| Field | Type | Ghi chú |
|-------|------|---------|
| id | INT AUTO_INCREMENT | Primary key |
| full_name | VARCHAR(100) | |
| email | VARCHAR(100) | Unique |
| phone | VARCHAR(20) | |
| password | VARCHAR(255) | Hash |
| role | ENUM('USER','ADMIN') | Default: USER |
| status | ENUM('ACTIVE','LOCKED') | Default: ACTIVE |
| created_at | TIMESTAMP | |

**Bảng stations**
| Field | Type | Ghi chú |
|-------|------|---------|
| id | INT AUTO_INCREMENT | Primary key |
| name | VARCHAR(200) | |
| latitude | DECIMAL(10,8) | |
| longitude | DECIMAL(11,8) | |
| address | VARCHAR(255) | |
| status | ENUM('ACTIVE','DEPLOYING','PROPOSAL') | |
| description | TEXT | |
| created_at | TIMESTAMP | |

**Bảng station_proposals**
| Field | Type | Ghi chú |
|-------|------|---------|
| id | INT AUTO_INCREMENT | Primary key |
| user_id | INT | Foreign key → users |
| latitude | DECIMAL(10,8) | |
| longitude | DECIMAL(11,8) | |
| owner_name | VARCHAR(100) | |
| owner_phone | VARCHAR(20) | |
| address | VARCHAR(255) | |
| area | VARCHAR(50) | |
| land_type | VARCHAR(100) | |
| description | TEXT | |
| status | ENUM('PENDING','REVIEWING','APPROVED','REJECTED') | Default: PENDING |
| created_at | TIMESTAMP | |

### Checklist kiểm tra

- [ ] `docker exec -it mysql mysql -u root -p` → vào được DB
- [ ] `SHOW TABLES;` → thấy 3 bảng
- [ ] `SELECT * FROM users;` → thấy dữ liệu seed

---

## BƯỚC 3: XÂY DỰNG AUTHENTICATION (Đăng nhập)

### Yêu cầu cần đạt

- [ ] API Register: Tạo tài khoản mới
- [ ] API Login: Đăng nhập, trả về token
- [ ] API Get Me: Lấy thông tin user hiện tại
- [ ] Password hash (bcrypt)
- [ ] JWT token

### API Endpoints

```
POST /api/auth/register
  Body: { full_name, email, phone, password }
  Response: { user, token }

POST /api/auth/login
  Body: { email, password }
  Response: { user, token }

GET /api/auth/me
  Header: Authorization: Bearer <token>
  Response: { user }
```

### Checklist kiểm tra

- [ ] Register thành công → tạo user trong DB
- [ ] Login đúng → trả về token
- [ ] Login sai password → trả lỗi 400
- [ ] Gọi /me với token hợp lệ → trả user info
- [ ] Gọi /me không có token → trả lỗi 401

---

## BƯỚC 4: FRONTEND LAYOUT + ROUTING

### Yêu cầu cần đạt

- [ ] Tạo 3 layout: PublicLayout, UserLayout, AdminLayout
- [ ] Setup routing cho các trang
- [ ] Protected routes: Chưa login → chuyển về /login
- [ ] Phân quyền: User chỉ vào trang User, Admin chỉ vào trang Admin

### Routes

| Route | Layout | Mô tả |
|-------|--------|-------|
| /login | Public | Đăng nhập |
| /register | Public | Đăng ký |
| /map | User | Bản đồ |
| /my-proposals | User | Đề xuất của tôi |
| /admin/users | Admin | Quản lý users |
| /admin/stations | Admin | Quản lý trạm |
| /admin/proposals | Admin | Quản lý đề xuất |

### Checklist kiểm tra

- [ ] Chưa login → vào /map → chuyển về /login
- [ ] Login với User → thấy menu User
- [ ] Login với Admin → thấy menu Admin + User
- [ ] User vào /admin → chặn
- [ ] Click logout → về trang login

---

## BƯỚC 5: XÂY DỰNG BẢN ĐỒ

### Yêu cầu cần đạt

- [ ] Hiển thị bản đồ với React Leaflet + OpenStreetMap
- [ ] Hiển thị markers các stations từ database
- [ ] Hiển thị markers các proposals từ database
- [ ] Click marker → hiển thị popup thông tin
- [ ] Phân biệt màu marker theo status

### Màu marker

| Status | Màu | Ý nghĩa |
|--------|-----|----------|
| ACTIVE | Xanh | Đang hoạt động |
| DEPLOYING | Vàng | Đang triển khai |
| PENDING | Cam | Đang đề xuất |

### Checklist kiểm tra

- [ ] Mở trang /map → thấy bản đồ
- [ ] Thấy markers hiển thị vị trí stations
- [ ] Click marker → popup hiện tên trạm, địa chỉ
- [ ] Cuộn bản đồ → markers vẫn đúng vị trí

---

## BƯỚC 6: QUẢN LÝ TRẠM (Station Management)

### Yêu cầu cần đạt

- [ ] API CRUD Stations (GET, POST, PUT, DELETE)
- [ ] Frontend: Danh sách trạm
- [ ] Frontend: Form tạo/sửa trạm
- [ ] Sau khi tạo → map tự động cập nhật marker

### API Endpoints

```
GET    /api/stations              → Danh sách (có phân trang)
GET    /api/stations/:id          → Chi tiết
POST   /api/stations              → Tạo mới (Admin only)
PUT    /api/stations/:id          → Cập nhật (Admin only)
DELETE /api/stations/:id          → Xóa (Admin only)
```

### Form fields

- Tên trạm (required)
- Latitude (required)
- Longitude (required)
- Địa chỉ (required)
- Trạng thái: ACTIVE / DEPLOYING
- Mô tả

### Checklist kiểm tra

- [ ] Admin tạo station mới → marker xuất hiện trên map
- [ ] Admin sửa station → marker cập nhật
- [ ] Admin xóa station → marker biến mất
- [ ] User thường → không thấy nút CRUD

---

## BƯỚC 7: ĐỀ XUẤT TRẠM (Core Feature)

### Yêu cầu cần đạt

- [ ] User click vị trí trên map → lấy được tọa độ
- [ ] Mở form đề xuất với tọa độ đã chọn
- [ ] Submit → tạo proposal trong database
- [ ] Proposal xuất hiện trên map với marker màu riêng

### Flow

```
User click map
    ↓
Lấy Lat/Lng
    ↓
Mở form
    ↓
Nhập thông tin
    ↓
Submit
    ↓
API → Database
    ↓
Marker xuất hiện trên map
```

### Form fields

- Latitude (readonly)
- Longitude (readonly)
- Họ tên chủ MB (required)
- Số điện thoại (required)
- Địa chỉ (required)
- Diện tích
- Loại mặt bằng
- Ghi chú

### Checklist kiểm tra

- [ ] Click vị trí bất kỳ trên map → form hiện tọa độ đúng
- [ ] Nhập đầy đủ thông tin → submit thành công
- [ ] Submit xong → marker xuất hiện trên map
- [ ] Click marker proposal → thấy thông tin đã nhập

---

## BƯỚC 8: ĐỀ XUẤT CỦA TÔI

### Yêu cầu cần đạt

- [ ] Hiển thị danh sách đề xuất của user đang đăng nhập
- [ ] Hiển thị bản đồ với markers proposals của user
- [ ] Filter theo trạng thái: PENDING, REVIEWING, APPROVED, REJECTED
- [ ] User chỉ thấy đề xuất của mình, không thấy của người khác

### API Endpoints

```
GET /api/my-proposals
  Header: Authorization: Bearer <token>
  Query: ?status=PENDING
  Response: { proposals: [...] }

GET /api/my-proposals/:id
  Response: { proposal: {...} }
```

### Checklist kiểm tra

- [ ] Login User A → thấy proposals của User A
- [ ] Không thấy proposals của User B
- [ ] Filter PENDING → chỉ thấy status PENDING
- [ ] Click proposal → xem chi tiết

---

## BƯỚC 9: QUẢN LÝ NGƯỜI DÙNG (Admin)

### Yêu cầu cần đạt

- [ ] Danh sách users với phân trang
- [ ] Tạo user mới
- [ ] Sửa thông tin user
- [ ] Xóa user (soft delete)
- [ ] Lock/Unlock user
- [ ] Thay đổi role

### API Endpoints

```
GET    /api/admin/users              → Danh sách
POST   /api/admin/users              → Tạo mới
PUT    /api/admin/users/:id          → Sửa
DELETE /api/admin/users/:id          → Xóa
PATCH  /api/admin/users/:id/lock     → Lock/Unlock
PATCH  /api/admin/users/:id/role     → Đổi role
```

### Checklist kiểm tra

- [ ] Admin thấy danh sách users
- [ ] Admin tạo user mới thành công
- [ ] Admin sửa user thành công
- [ ] Admin lock user → user đó không thể login
- [ ] Admin đổi role USER → ADMIN

---

## BƯỚC 10: QUẢN LÝ TRẠM (Admin - Nâng cao)

### Yêu cầu cần đạt

- [ ] Search trạm theo tên
- [ ] Filter theo status
- [ ] Phân trang danh sách
- [ ] Chọn vị trí trên map khi tạo/sửa

### Checklist kiểm tra

- [ ] Search "Trạm A" → thấy kết quả
- [ ] Filter ACTIVE → chỉ thấy trạm ACTIVE
- [ ] Click trang 2 → thấy data trang 2
- [ ] Tạo station → click trên map để lấy tọa độ

---

## BƯỚC 11: QUẢN LÝ ĐỀ XUẤT (Admin)

### Yêu cầu cần đạt

- [ ] Danh sách đề xuất
- [ ] Filter theo status, người đề xuất
- [ ] Xem chi tiết đề xuất
- [ ] Duyệt/Từ chối đề xuất
- [ ] Khi Approved → có thể chuyển thành Station

### Workflow trạng thái

```
PENDING → REVIEWING → APPROVED → (tạo Station)
                         ↓
                      REJECTED
```

### API Endpoints

```
GET    /api/admin/proposals              → Danh sách
GET    /api/admin/proposals/:id          → Chi tiết
PUT    /api/admin/proposals/:id          → Sửa
DELETE /api/admin/proposals/:id          → Xóa
PATCH  /api/admin/proposals/:id/status   → Đổi trạng thái
POST   /api/admin/proposals/:id/approve  → Duyệt + tạo Station
```

### Checklist kiểm tra

- [ ] Admin thấy danh sách đề xuất
- [ ] Filter PENDING → thấy đề xuất chờ duyệt
- [ ] Click duyệt → status chuyển thành APPROVED
- [ ] Tự động tạo Station từ proposal đã duyệt

---

## BƯỚC 12: EXCEL (Import/Export)

### Yêu cầu cần đạt

- [ ] Import Stations từ Excel
- [ ] Export Stations ra Excel
- [ ] Export Proposals ra Excel
- [ ] Preview trước khi import
- [ ] Báo lỗi chi tiết nếu data sai

### Import Flow

```
Upload Excel
    ↓
Parse & Validate
    ↓
Preview (hiển thị data + lỗi)
    ↓
Confirm → Batch Insert
```

### Template Excel Import

| name | latitude | longitude | address | status | description |
|------|----------|-----------|---------|--------|-------------|
| Trạm A | 10.762622 | 106.660172 | Quận 1, HCM | ACTIVE | Mô tả |

### Checklist kiểm tra

- [ ] Download template → file Excel đúng format
- [ ] Import 5 dòng hợp lệ → thành công
- [ ] Import dòng lỗi → hiển thị lỗi chi tiết
- [ ] Export stations → file Excel có đầy đủ data
- [ ] Export proposals → file Excel có đầy đủ data

---

## BƯỚC 13: VALIDATION & SECURITY (Cơ bản)

### Yêu cầu cần đạt

- [ ] Validate input ở Backend (email, phone, required fields)
- [ ] JWT authentication hoạt động đúng
- [ ] User không gọi được API admin
- [ ] User A không sửa được proposal của User B
- [ ] Không có SQL injection

### Validation Rules

| Field | Rule |
|-------|------|
| email | Valid format, unique |
| phone | 10 digits |
| full_name | Required, 2-100 chars |
| latitude | -90 to 90 |
| longitude | -180 to 180 |
| password | Minimum 6 chars |

### Checklist kiểm tra

- [ ] Submit form thiếu field → lỗi 400
- [ ] Email sai format → lỗi 400
- [ ] User gọi /admin/users → lỗi 403
- [ ] User sửa proposal người khác → lỗi 403

---

## BƯỚC 14: UI/UX CƠ BẢN

### Yêu cầu cần đạt

- [ ] Loading spinner khi tải dữ liệu
- [ ] Thông báo thành công (toast)
- [ ] Thông báo lỗi
- [ ] Empty state khi không có dữ liệu
- [ ] Confirm dialog khi xóa
- [ ] Form validation messages
- [ ] Responsive cơ bản (mobile/desktop)

### Component cần có

```
components/
├── Loading.jsx
├── Toast.jsx
├── ConfirmDialog.jsx
├── EmptyState.jsx
├── ErrorMessage.jsx
├── Pagination.jsx
└── FormInput.jsx
```

### Checklist kiểm tra

- [ ] Đang tải dữ liệu → thấy spinner
- [ ] Thêm thành công → hiện toast thành công
- [ ] Lỗi API → hiện thông báo lỗi
- [ ] Danh sách trống → hiện "Không có dữ liệu"
- [ ] Xóa item → hiện confirm dialog
- [ ] Mở trên điện thoại → bố cục hiển thị đúng

---

## BƯỚC 15: TEST TỔNG THỂ

### Yêu cầu cần đạt

- [ ] Test toàn bộ flow User
- [ ] Test toàn bộ flow Admin
- [ ] Test permission
- [ ] Test Docker persistence

### Test Cases

**User Flow**
- [ ] Register → Login → Xem map → Đề xuất → Xem đề xuất của tôi

**Admin Flow**
- [ ] Login → Quản lý Users → Quản lý Stations → Import/Export → Duyệt Proposals

**Permission**
- [ ] User gọi API admin → Phải lỗi 403
- [ ] User sửa proposal người khác → Phải lỗi 403

**Docker**
- [ ] docker compose down → docker compose up → Data vẫn còn

### Checklist kiểm tra

- [ ] Tất cả test cases pass
- [ ] Không có lỗi khi sử dụng liên tục
- [ ] Data persistence qua restart Docker

---

## BƯỚC 16: DEPLOY PRODUCTION

### Yêu cầu cần đạt

- [ ] Tạo production docker-compose
- [ ] Build optimized images
- [ ] Environment variables cho production
- [ ] Deploy lên server

### Checklist kiểm tra

- [ ] `docker compose -f docker-compose.prod.yml up -d`
- [ ] Truy cập qua domain/IP → hoạt động
- [ ] Đăng nhập → hoạt động
- [ ] CRUD operations → hoạt động

---

## TỔNG THỐNG THỜI GIAN

| Bước | Nội dung | Thời gian |
|------|----------|-----------|
| 1 | Docker + Skeleton | 1.5h |
| 2 | Database | 1.5h |
| 3 | Authentication | 2h |
| 4 | Layout + Routing | 1h |
| 5 | Bản đồ | 2.5h |
| 6 | Station Management | 1.5h |
| 7 | Đề xuất trạm | 2.5h |
| 8 | Đề xuất của tôi | 1h |
| 9 | Admin Users | 1.5h |
| 10 | Admin Stations | 1h |
| 11 | Admin Proposals | 1.5h |
| 12 | Excel | 2.5h |
| 13 | Validation | 1h |
| 14 | UI/UX | 1.5h |
| 15 | Test | 2h |
| 16 | Production | 1.5h |
| **Tổng** | | **~24.5h** |
