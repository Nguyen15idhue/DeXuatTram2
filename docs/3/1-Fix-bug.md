# Fix Bug Log

## Bug #1: `setSuccess` undefined — AdminStationsPage.jsx:103

**Mô tả:** Dòng `setSuccess('')` gọi biến chưa khai báo, gây crash khi submit form tạo/sửa trạm.

**File thay đổi:** `frontend/src/pages/admin/AdminStationsPage.jsx`
- Xóa dòng `setSuccess('')` (dòng 103). Thành công đã được xử lý qua `setToast` ở dòng 118.

**Kết quả test:**
- [x] File đã sửa đúng — không còn reference `setSuccess`
- [x] `npm run build` thành công, không lỗi

---

## Bug #3: AuthContext bypass service layer

**Mô tả:** AuthContext tự gọi `fetch()` trực tiếp với `API_URL` hardcode, không dùng service layer trong `api.js`.

**Files thay đổi:**
- `frontend/src/services/api.js` — Thêm `authService` (login, register, fetchUser) + `mapService` (resolveMapUrl)
- `frontend/src/contexts/AuthContext.jsx` — Import `authService`, xóa `API_URL` hardcode, refactor login/register/fetchUser dùng authService

**Kết quả test:**
- [x] AuthContext không còn gọi `fetch()` trực tiếp
- [x] AuthContext không còn define `API_URL`
- [x] `npm run build` thành công, không lỗi

---

## Bug #4: 3 cách xác định API URL khác nhau

**Mô tả:** api.js hardcode, AuthContext hardcode, mapHelpers dùng env var — 3 nơi khác nhau.

**Files thay đổi:**
- `frontend/src/services/api.js` — Đổi `const API_URL` dùng `import.meta.env.VITE_API_URL || 'http://localhost:3000/api'`
- `frontend/src/contexts/AuthContext.jsx` — Xóa `const API_URL` (dùng authService thay thế)
- `frontend/src/utils/mapHelpers.js` — Import `mapService` từ api.js, xóa `API_BASE` hardcode

**Kết quả test:**
- [x] Chỉ còn 1 nơi define API_URL (trong api.js)
- [x] `grep VITE_API_URL` cho thấy chỉ api.js có reference
- [x] `npm run build` thành công, không lỗi

---

## Bug #5: Users không thể xóa proposal của mình

**Mô tả:** Backend `myProposals.js` chỉ có GET + PUT, không có DELETE endpoint. Frontend MyProposalsPage không có nút xóa.

**Files thay đổi:**
- `backend/src/routes/myProposals.js` — Thêm `DELETE /:id` endpoint, check ownership + chỉ cho xóa khi status=PENDING
- `frontend/src/services/api.js` — Thêm `myProposalService.delete(id, token)`
- `frontend/src/pages/user/MyProposalsPage.jsx` — Import ConfirmDialog, thêm state `confirmDelete`, thêm hàm `handleDeleteClick` + `handleConfirmDelete`, thêm nút "Xóa" trong cột Thao tác (chỉ hiện khi status=PENDING)

**Kết quả test:**
- [x] Backend: DELETE endpoint check ownership (`WHERE id = ? AND user_id = ?`)
- [x] Backend: Chỉ cho xóa khi status=PENDING
- [x] Frontend: Nút "Xóa" chỉ hiện khi status=PENDING, cạnh nút "Sửa"
- [x] Frontend: Hiển thị ConfirmDialog trước khi xóa
- [x] `npm run build` thành công, không lỗi

---

## Bug #6: Admin có thể xóa chính mình

**Mô tả:** Backend chỉ check `role === 'ADMIN'` nhưng không check `req.user.id !== id`. Frontend hiển thị nút xóa cho mọi admin khác.

**Files thay đổi:**
- `backend/src/routes/adminUsers.js` — Thêm check `parseInt(id) === req.user.id` → trả 400 "Không thể xóa chính mình"
- `frontend/src/pages/admin/AdminUsersPage.jsx` — Lấy `user: currentUser` từ useAuth(), ẩn nút xóa khi `u.id === currentUser.id`

**Kết quả test:**
- [x] Backend: Trả 400 khi admin cố xóa chính mình
- [x] Frontend: Nút xóa không hiển thị cho chính admin đang login
- [x] `npm run build` thành công, không lỗi

---

## Bug #7: Không có transaction trong Excel import confirm

**Mô tả:** Import confirm insert từng row trong loop, nếu row 3/10 lỗi thì 2 row đầu đã commit — dữ liệu bị một phần.

**File thay đổi:** `backend/src/routes/excel.js`
- Dùng `pool.getConnection()` + `connection.beginTransaction()`
- Nếu có row lỗi → `connection.rollback()` → trả 400, không import row nào
- Nếu tất cả thành công → `connection.commit()`
- `finally` gọi `connection.release()`

**Kết quả test:**
- [x] Import thành công: commit tất cả rows
- [x] Import có lỗi: rollback toàn bộ, không insert row nào
- [x] Frontend build thành công

---

## Bug #8: Security (CORS + rate limit + JWT secret)

**Mô tả:** CORS open (chấp nhận mọi origin), không rate limiting, JWT secret hardcode fallback.

**Files thay đổi:**
- `backend/src/app.js` — Cài `express-rate-limit`, cấu hình CORS với `CORS_ORIGINS` env var (default: localhost:5173, localhost:3000), thêm rate limiter cho `/api/auth` (20 requests/15 phút)
- `backend/src/middlewares/auth.js` — Xóa fallback JWT_SECRET, thêm check `if (!JWT_SECRET)` → `process.exit(1)` nếu env var chưa set
- `backend/package.json` — Thêm dependency `express-rate-limit`
- `.env` — Đổi JWT_SECRET thành secret thực
- `.env.example` — Thêm `CORS_ORIGINS`, đổi JWT_SECRET thành placeholder mới
- `docker-compose.yml` — Đồng bộ JWT_SECRET mới

**Kết quả test:**
- [x] CORS chỉ chấp nhận origin từ CORS_ORIGINS
- [x] Rate limit: max 20 requests / 15 phút cho `/api/auth`
- [x] JWT_SECRET: Server crash nếu env var chưa set (không dùng fallback)
- [x] Frontend build thành công

---

## Bug #9: AdminDashboard là placeholder

**Mô tả:** Dashboard hiển thị "-" cho tất cả thống kê, không fetch data.

**Files thay đổi:**
- `backend/src/routes/dashboard.js` — File mới, endpoint `GET /api/admin/dashboard` trả stats (users, stations, proposals với breakdown theo status)
- `backend/src/app.js` — Mount route `/api/admin/dashboard`
- `frontend/src/services/api.js` — Thêm `dashboardService.getStats(token)`
- `frontend/src/pages/admin/AdminDashboard.jsx` — Fetch data từ API, hiển thị tổng quan + chi tiết theo status
- `frontend/src/App.css` — Thêm class `.stat-detail`

**Kết quả test:**
- [x] Backend: GET /api/admin/dashboard trả đúng thống kê
- [x] Frontend: Hiển thị tổng + chi tiết (active/locked, active/deploying, pending/approved/rejected)
- [x] Frontend build thành công

---

## Bug #10: `updated_at` không bao giờ được update

**Mô tả:** Tất cả câu query UPDATE đều không set `updated_at`, nên cột này luôn giữ giá trị cũ.

**Files thay đổi (8 UPDATE queries):**
- `backend/src/routes/adminUsers.js` — 4 queries: update user (with/without password), lock/unlock, change role
- `backend/src/routes/auth.js` — 2 queries: update profile (with/without password)
- `backend/src/routes/adminProposals.js` — 1 query: update proposal status
- `backend/src/routes/stations.js` — 1 query: update station
- `backend/src/routes/myProposals.js` — 1 query: update own proposal

**Kết quả test:**
- [x] Tất cả UPDATE queries đều có `updated_at = NOW()`
- [x] Frontend build thành công

---

## Docker Rebuild + Test toàn bộ

**Thực hiện:** `docker compose build --no-cache` → `docker compose up -d --force-recreate`

**Lý do rebuild:** Backend container cũ thiếu `express-rate-limit` (package mới thêm) → causes 404 on startup if import fails.

**Kết quả test:**

| # | Test | Endpoint | Kết quả |
|---|------|----------|---------|
| 1 | GET stations | `/api/stations` | ✅ |
| 2 | GET proposals | `/api/proposals` | ✅ |
| 3 | Login admin | `POST /api/auth/login` | ✅ |
| 4 | Dashboard stats | `GET /api/admin/dashboard` | ✅ |
| 5 | Login user | `POST /api/auth/login` | ✅ |
| 6 | My proposals | `GET /api/my-proposals` | ✅ |
| 7 | Create + DELETE proposal | `POST + DELETE /api/my-proposals` | ✅ |

**Kết luận:** Tất cả fixes hoạt động đúng trên Docker. Frontend không còn lỗi "Lỗi kết nối server".

---

## Fix Map Issues

### Issue 1: Legend đè lên mobile menu

**Mô tả:** Legend (Chú thích) có `z-index: 1000` + `position: absolute` → tràn lên header/nav trên mobile.

**File thay đổi:** `frontend/src/App.css`
- Tại media query `@media (max-width: 768px)`: `.map-legend { display: none; }` — �藏 legend trên mobile

### Issue 2: Map center focused HCMC thay vì toàn bộ Việt Nam

**Mô tả:** Map center `[10.7626, 106.6601]` zoom 12 → chỉ thấy HCMC.

**File thay đổi:** `frontend/src/components/MapView.jsx`
- Đổi center sang `[14.0583, 108.2772]` (trung tâm Việt Nam)
- Đổi zoom từ `12` sang `6` (toàn bộ Việt Nam)

### Issue 3: "Vị trí của tôi" mở form đề xuất

**Mô tả:** Nút "Vị trí của tôi" gọi `onLocationSelected` → mở form tạo đề xuất. User chỉ muốn xem vị trí.

**File thay đổi:** `frontend/src/components/MapView.jsx`
- Xóa `onLocationSelected` callback khỏi `handleMyLocation` — chỉ set `myLocation` state + flyTo
- Thêm Marker màu xanh cho `myLocation` với popup tọa độ

**Kết quả test:**
- [x] `npm run build` thành công
- [x] Legend ẩn trên mobile (<=768px), hiện trên desktop
- [x] Map mở ra thấy toàn bộ Việt Nam
- [x] Nút "Vị trí của tôi" chỉ hiển thị marker xanh + flyTo, không mở form

---
