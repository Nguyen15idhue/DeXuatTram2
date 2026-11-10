# Fix Bug Log

## BCĐX: PDF cố định và nhiều tài liệu

Áp dụng migration `database/225-proposal-report-documents.sql` trước khi chạy
backend mới. Migration có thể chạy lại; không chuyển đổi hoặc thay file của hồ sơ
đã cấu hình/đã ký. Bảng `proposal_report_documents` giữ quan hệ file gốc, PDF,
file dùng ký và file phê duyệt cuối cho từng tài liệu. Các bản nộp cũ được giữ lại;
`is_current` đánh dấu bộ hồ sơ hiện hành.

Luồng nộp:

1. Tải Word/PDF và chuẩn bị PDF (tối đa 10 tài liệu, 20 MB/tài liệu).
2. Word được chuyển bằng LibreOffice; PDF tải trực tiếp được kiểm tra tính hợp lệ.
   File Word gốc vẫn giữ nguyên. Mỗi lần chuyển có thư mục/profile riêng, timeout
   60 giây; tác vụ được giới hạn đồng thời để tránh xung đột LibreOffice.
3. Nếu chuyển lỗi, giao diện hiển thị lỗi và cho thử lại. Người nộp phải xác nhận
   tiếp tục với Word nếu vẫn muốn sang duyệt; không tự chuyển trạng thái khi chưa xác nhận.
4. Duyệt BCĐX cho phép thử chuyển lại trước khi cấu hình ký. Thành công thì toàn bộ
   preview, cấu hình, ký và xuất dùng cùng file PDF cố định; không convert lại khi xuất.
5. DOCX là dự phòng khi chuyển lỗi và vẫn có nguy cơ lệch bố cục giữa các phần mềm.
   `.doc` chuyển lỗi không được cấu hình ký trực tiếp; phải thay DOCX/PDF.

Mỗi tài liệu có danh sách người ký riêng. Một người có thể ký nhiều tài liệu,
nhưng mỗi lần xác nhận chỉ ký file đang chọn. Chỉ đủ chữ ký khi hoàn tất toàn bộ
phân công trên mọi tài liệu. Tải riêng từng file hoặc toàn bộ dưới dạng ZIP.
Back Office tải file phê duyệt cuối tương ứng từng tài liệu; chỉ kết thúc khi đủ
tất cả. `station_proposals.signed_file_id` vẫn giữ file đầu để tương thích các
kiểm tra trạng thái cuối; quan hệ đầy đủ nằm ở bảng tài liệu.

Tài liệu đã cấu hình ký không được convert lại; phải thu hồi cấu hình trước.
Tài liệu đã có người ký không được thu hồi bằng thao tác này. Hồ sơ legacy đã
cấu hình/đã ký tiếp tục dùng file và tọa độ cũ; không tự đổi sang PDF.

Triển khai: rebuild image backend theo Dockerfile hiện có để có LibreOffice
Writer và fontconfig. Mount/cài đủ font của tài liệu Word (đặc biệt Times New Roman)
để tránh thay font khi chuyển; luôn đối chiếu PDF trước khi đặt ô ký. Việc dùng
PDF cố định bảo vệ tọa độ sau convert, không đảm bảo Word và PDF giống nhau nếu
server thiếu font. Không dùng dịch vụ chuyển đổi bên ngoài.
Đặt `SIGNATURE_FONT_DIR`, hoặc `SIGNATURE_FONT_REGULAR` và
`SIGNATURE_FONT_BOLD`, trỏ tới bộ font Times New Roman hợp lệ khi xuất PDF có chữ ký.
Thiếu font sẽ báo lỗi rõ ràng, không tự thay font. Nginx tăng riêng timeout cho
API chuẩn bị/nộp BCĐX lên 1.500 giây để hỗ trợ chuyển nhiều tài liệu; reverse proxy
ngoài Docker cũng cần timeout tương ứng. Các API khác giữ nguyên timeout.
Compose mount cùng `SIGNATURE_FONT_HOST_DIR` vào thư mục font hệ thống để
LibreOffice cũng đọc được font đang dùng khi xuất chữ ký, thay vì chỉ thấy
thư mục riêng của backend. Cần tạo lại container backend khi cập nhật mount này.

API tài liệu: `GET /api/admin/proposal-reports/:id/documents`,
`POST .../documents/prepare`, `POST .../documents/:documentId/convert`; chủ đề xuất
dùng đường tương ứng `/api/my-proposals/:id/report/documents`.
PUT nộp BCĐX chỉ nhận `accept_conversion_failure: true` sau xác nhận trên giao diện.
Lỗi convert được lưu cùng tài liệu; lỗi quyền/sai bước trả HTTP lỗi, không giả thành công.
Nút **Tạo từ mẫu** vẫn chỉ báo đang triển khai.
Khôi phục đăng ký route download có kiểm tra quyền; preview/ký PDF sử dụng
`GET /api/files/:id/download` để đọc đúng byte PDF gốc, hỗ trợ token và Range.

Kiểm thử chuyển đổi thật trong backend:
`RUN_REPORT_DOCUMENT_TESTS=1 node --test tests/proposalReportDocuments.integration.test.js`.
Test tạo fixture tạm, dùng LibreOffice thật, kiểm tra PDF hai trang, thử lại, quyền
truy cập và giữ nguyên DOCX legacy; dọn fixture sau khi chạy.

Cấu hình nhiều tài liệu gửi `documents: [{document_id, file_id, signers}]`;
mỗi tài liệu dùng `file_id` đúng bản PDF/DOCX hiện hành. Khi ký gửi
`document_id` của tài liệu đang chọn, không ký đồng loạt các file của người dùng.
Thu hồi dùng `POST /api/admin/proposal-approvals/:id/signature-config/withdraw`;
chỉ thực hiện trước chữ ký đầu tiên. Xuất riêng chọn `document_id`, xuất ZIP
chọn `all=1`. Nộp bản phê duyệt cuối gửi
`documents: [{document_id, file_id}]` để ánh xạ đầy đủ từng tài liệu.

Kiểm thử chữ ký và xuất PDF/ZIP:
`node --test tests/proposalMultiDocumentSignature.test.js tests/proposalMultiDocumentExport.test.js`
trong backend. Kiểm tra hai kích thước trang, tách chữ ký theo tài liệu, tọa độ
ảnh chính xác trong 0,01 điểm PDF, và hai thứ tự chạy đồng thời ký/thu hồi.
Smoke trình duyệt/API thật: `node frontend\test-bcdx-documents-real.cjs` từ
root, khi hệ thống local đã chạy. Test tạo dữ liệu tạm, đi qua nộp hai tài liệu,
cấu hình, ký, xuất ZIP và nộp đủ bản cuối tới `APPROVED`; dọn cả ON trạm được
tự tạo và chặn queue fixture gửi sang Google Sheets.

## Đồng bộ Sheet trạm ON: nguồn dữ liệu và khóa EMS

- Chỉ đồng bộ đề xuất ACTIVE, giữ nguyên quyền Admin/Super Admin.
- B: `charging_stations.cms_station_code`, dùng làm khóa đối soát. Trùng trên
  Sheet/DB hoặc thiếu mã thì báo lỗi, không tự ghi đè.
- E: tên tài khoản `station_proposals.custom_data.nguoi_phu_trach.id`.
- F: role NPP → NPP; nếu không, mô hình TDT → TMT; còn lại phòng kinh doanh
  miền Bắc/Trung/Nam của người phụ trách → MB/MT/MN.
- M: bảng trụ đề xuất hiện tại theo mô hình, không phải snapshot lúc tạo.
- N: bảng `chot_so_luong_tru` của BCĐX, ví dụ `LK_2 DC 120kW + NQ_1 AC 22kW`.
- O: tổng số lượng trụ chốt, xuất kiểu số.
- Ghi/cập nhật/xóa nội dung chỉ trong A–Q. Không chèn/xóa nguyên hàng, không
  đọc/ghi cột R trở đi. Đọc Sheet thất bại phải báo lỗi, không coi như Sheet trống.
- Thiếu người phụ trách, nguồn phòng ban hoặc bảng trụ chốt, số lượng không hợp lệ
  được báo trong trạng thái FAILED và hiển thị cạnh nút đồng bộ.

Trước lần chạy đầu trên Sheet cũ, quản trị viên cần đối soát và thay mã ON nội bộ
ở B bằng mã EMS tương ứng; hệ thống không tự suy đoán hai mã là cùng một trạm.
Sau đó dùng nút **Đồng bộ Sheet trạm ON** để cập nhật toàn bộ dữ liệu ACTIVE.
Mã EMS là khóa: nếu thay đổi mã sau khi đồng bộ, phải đối soát mã B trên Sheet
trước khi chạy lại để không giữ dòng thuộc mã cũ.

Kiểm thử backend: `node --test tests/onStationSheetSync.test.js` trong `backend`.
Kiểm thử giao diện: `node test-on-station-sheet.cjs` trong `frontend`; test mock
API đồng bộ nên không gửi thông tin khách hàng lên Google Sheet thật.

## E-sign: `mySignature is not defined`

Trang `/admin/e-sign` gọi `renderMySignature()` nhưng chưa khai báo `mySignature`,
gây crash khi xem chữ ký cá nhân. Đã bổ sung giá trị suy ra từ danh sách chữ ký
theo `user_id` của tài khoản đăng nhập, không chọn nhầm chữ ký của người khác.

Kiểm thử: `cd frontend` rồi `node test-e-sign.cjs` (cần Docker local đang chạy).
Test tạo và dọn tài khoản tạm, kiểm tra SALES và ADMIN: chưa có chữ ký, tải ảnh,
hiển thị ảnh, tải lại trang và xóa chữ ký.

Lỗi 404 tại `/api/admin/signatures/:id/image` là vấn đề riêng: API trả 404 khi
bản ghi hoặc tệp `signatures.file_path` không tồn tại. Nếu DB còn bản ghi nhưng
tệp bị thiếu, cần khôi phục thư mục uploads đúng đường dẫn/mount hoặc tải lại ảnh
chữ ký qua giao diện. Không xóa bản ghi thật hoặc tạo ảnh thay thế tự động.

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
