# Chưa làm được — P0 Critical (làm trước)

> Tất cả đã đọc code verify trực tiếp.

## P0-1. Public API lộ toàn bộ PII đề xuất
- `backend/src/routes/proposals.js:30,59` + `backend/src/services/proposalService.js:7-33`
- `GET /api/proposals` và `GET /api/proposals/:id` **không auth**, trả full `owner_name/owner_phone/custom_data` (`SELECT p.*`), dò được bằng tăng id.
- **Khắc phục:** bỏ `phone` + `custom_data` khỏi response public (chỉ giữ trường hiển thị bản đồ: id/lat/lng/tên rút gọn/địa chỉ chung/trạng thái); `GET /:id` public chỉ trả bản rút gọn.
- ✅ **Đã fix 10/09/2026:** `getAllProposals`/`getProposalById` chỉ `SELECT id,latitude,longitude,address,status,created_at` (bỏ cả `description` vì description đang nhúng PII từ template render). `MapView.jsx:createProposalPopupContent` bỏ hàng Chủ sở hữu/SĐT/Người đề xuất/Mô tả. Swagger cập nhật rút gọn. **Test:** BE `GET /api/proposals` keys=`id,latitude,longitude,address,status,created_at`, không `owner_phone/owner_name/custom_data`, enum `/:id` sạch; FE `test-p01.cjs` 12/12 PASS (login admin → `/map` markers=40, build OK).

## P0-2. Thư mục `/uploads` public bypass mọi check quyền
- `backend/src/app.js:99-113` — `express.static('/uploads')`, path đoán được (`general/DD-MM-YYYY/`).
- File private (CCCD, pháp lý) ai cũng tải được dù API download có check quyền.
- **Khắc phục:** bỏ static public, phục vụ file qua API có auth + ownership (đã có `GET /files/:id/download`).
- ✅ **Đã fix 10/09/2026:** Xóa `express.static('/uploads')` khỏi `app.js`; `GET /files/:id/download` + `/:id/image` chuyển sang `optionalAuth` + `canAccessFile()` (admin bypass, owner `uploaded_by`, guest cùng `submitter_ip`); `requireAuth/optionalAuth` hỗ trợ `?token=` cho thẻ `<img>`/`<a>`; FE `FileViewer/FileListPopup/FileUpload/FieldRenderer/AdminRecordFilesPage/ProfilePage` chuyển từ `/uploads/storage_key` sang `/files/:id/download|image`. **Test:** `/uploads/...`=404, download không auth=403, admin=200, CTV tải file admin=403, image `?token=`=200; `test-p02.cjs` 9/9 PASS, build OK.

## P0-3. Upload có auth nhận mọi loại file
- `backend/src/routes/files.js:30-34` — nhánh auth **không có `fileFilter`** (chỉ guest có allowlist); giữ nguyên extension (`path.extname(originalname)`); `.svg` serve `image/svg+xml` → XSS lưu trữ, `.exe/.js/.php` 10MB.
- **Khắc phục:** áp allowlist chung (ảnh/pdf/word/excel/text), chặn svg/html/js/exe/php, random tên file, quét MIME thực.
- ✅ **Đã fix 10/09/2026:** Thêm `fileFilter` cho auth (`AUTH_MIME_TYPES`: jpg/png/gif/webp/pdf/doc/docx/xls/xlsx/csv/txt), chặn `BLOCKED_EXTS` kể cả double-ext (`*.png.php`), tên file random + ext ép từ MIME (`MIME_TO_EXT`), bỏ `preservePath`, `verifyMagic()` check chữ ký thực (PNG/JPEG/GIF/WEBP/PDF/ZIP/OLE) cho cả auth + guest. **Test:** svg/html/exe/js/php→400, png thật→201 ext `.png` an toàn, png giả (`MZ`)→400, pdf/txt thật→201; `test-p03.cjs` 9/9 PASS, build OK.

## P0-4. Khóa tài khoản không chặn SUPER_ADMIN/self
- `backend/src/controllers/adminUserController.js:175-193` (`toggleLock`) — trong khi `delete`/`changeRole` đều chặn.
- ADMIN khóa được SUPER_ADMIN (DoS toàn hệ thống); ADMIN khóa **chính mình** (tự sát, không ai mở).
- **Khắc phục:** chặn target SUPER_ADMIN (trừ super tự xử nhau) + chặn self-lock như `delete` đã làm.
- ✅ **Đã fix 10/09/2026:** `toggleLock` chặn self (`400 Không thể khóa chính mình`) + target `SUPER_ADMIN` khi requester không phải SUPER (403), dùng `findById` đủ role; FE `AdminUsersPage` ẩn nút Khóa/Mở trên hàng của chính mình + hiện `ErrorMessage` khi BE từ chối. **Test:** ADMIN khóa SUPER=403, ADMIN tự khóa=400, SUPER tự khóa=400, ADMIN khóa/mở CTV=200/200; `test-p04.cjs` 8/8 PASS (FE `/admin/users` 15 nút Khóa/Mở, build OK).

## P0-5. Mở user trực tiếp luôn hỏng
- `frontend/src/components/admin/RecordDetailPopup.jsx:58` gọi `GET /admin/users/:id` nhưng `backend/src/routes/adminUsers.js` **không có route này** (chỉ `GET /`) → `/admin/users/view=:id` luôn 404.
- Cùng lỗi pattern: `AdminRecordFilesPage`, `loadStationById`, `loadProposalById` fetch **toàn bộ list rồi `.find()` client** → record ngoài page đầu báo “Không tìm thấy” sai.
- **Khắc phục:** thêm `GET /admin/users/:id` (scope + check quyền); 3 trang kia gọi API chi tiết sẵn có (`GET /stations/:id`, `GET /admin/proposals/:id`).
- ✅ **Đã fix 10/09/2026:** Thêm `GET /admin/users/:id` (SALES chỉ self + CTV mình, ADMIN chặn xem SUPER, 404 khi thiếu) + `adminUserService/adminProposalService.getById` FE; `AdminUsersPage/AdminStationsPage/AdminProposalsPage/AdminRecordFilesPage` gọi API chi tiết thay vì `getAll().find()`; sửa hồi quy P0-1: `adminProposalController.getById` dùng `getProposalById(light)+getProposalWithUser(full)` thay vì service public rút gọn. **Test:** BE user 3=200, user missing=404, ADMIN xem SUPER=403; public proposal vẫn rút gọn, admin proposal full có phone; `test-p05.cjs` 7/7 PASS (`/view=3`, station page2 `#140`, proposal page2 `#388` đều mở popup, build OK).

## P0-6. Guest submit tắt captcha mặc định
- `backend/src/services/proposalService.js:89-90` — `CAPTCHA_ENABLED !== 'true'` thì bypass → spam proposal nếu quên cấu hình.
- **Khắc phục:** mặc định BẬT, chỉ tắt khi `CAPTCHA_ENABLED === 'false'` tường minh (fail-closed).
- ✅ **Đã fix 10/09/2026:** `verifyCaptcha` đổi thành `=== 'false'` mới bypass; thiếu env hoặc giá trị khác đều phải verify Turnstile thật (thiếu token/secret → 400). **Test:** với `CAPTCHA_ENABLED=false` hiện tại, guest không token vẫn qua captcha tới check trùng (400 vị trí trùng, không phải lỗi captcha); FE `/de-xuat` load bình thường; `test-p06.cjs` 2/2 PASS.

## P0-7. Import Data List luôn sai
- `backend/src/services/excelService.js:903-939` — vòng `row.eachCell` so `col.label` với **giá trị từng ô** (thay vì header/index cột) → `rowData` rỗng/sai, không import được danh mục.
- **Khắc phục:** dựng header-map từ dòng 1 (đã có `buildHeaderMap` cho entity import) rồi đọc theo index.
- ✅ **Đã fix 10/09/2026:** `importDataListPreview` dùng `buildHeaderMap(headerRow)` + đọc `row.getCell(colNumber)` theo key, giữ nguyên normalize (number/Date/formula-result) và validate số. **Test:** BE preview list #5 với header đảo thứ tự → validRows=2, map đúng `san_pham/gia`, dòng `Giá=not-a-number` bị flag; FE `/admin/data-lists` load + 9 nút Import; build OK.

## P0-8. Script SQL chạy lỗi
- `database/35-standardize-users.sql:19` INSERT cột `order_index` **không tồn tại** trong `field_definitions` (đối chiếu `05` + các ALTER) → chạy là lỗi.
- **Khắc phục:** sửa script theo schema thật (bỏ cột lạ) trước khi ai đó chạy.
- ✅ **Đã fix 10/09/2026:** Bỏ `order_index` khỏi INSERT `chuc_vu` (thứ tự nằm ở `form_fields.order_index`). **Test:** chạy INSERT mẫu cùng cột trong transaction + ROLLBACK → thành công, `leftover=0`; DB hiện tại đã có `chuc_vu` (id 113) + `dm_phong_ban` (id 12, department link đúng) nên không chạy lại script; BE `/health` OK, Swagger 200, FE build OK.

## P0-9. Update proposal ghi NULL khi thiếu trường
- `backend/src/services/adminProposalService.js` (UPDATE `owner_name/phone/address/area/land_type/status` trực tiếp từ `fixedData`, route PUT không validator) — body thiếu trường là ghi đè NULL/mất dữ liệu.
- **Khắc phục:** thêm validator PUT + merge giữ giá trị cũ khi field vắng mặt (pattern `custom_data !== undefined ? ... : existing...` đã có trong users update).
- ✅ **Đã fix 10/09/2026:** `updateProposal` SELECT thêm 7 cột fixed + merge `fixedData.x !== undefined ? ... : prev.x`; thêm `validateUpdateProposal` (chỉ validate field có mặt: lat/lng/phone/status enum) và gắn vào `PUT /admin/proposals/:id`. **Test:** PUT `{description}` giữ nguyên name/phone/address/status + đổi description, PUT phone sai → 400, PUT status sai → 400, restore OK (desc 617); FE `/admin/proposals/edit=404` mở popup chỉnh sửa; `test-p09.cjs` PASS, build OK.
