# Chưa làm được — P2 Medium/Low + dead code + lệch docs

## P2 Medium
- **M1. Preview post-formula thiếu dữ liệu record** — `formulaService.js:132-139` `evaluatePostFormula` gọi `buildPostScope(metadata,{})`, bỏ `recordData` → preview công thức dùng trường record (`ma_tinh`...) luôn rỗng. Fix: truyền recordData vào scope preview.
- **M2. Validate công thức phân biệt hoa thường sai** — `formulaService.js:80-108`: `concat/seq` thường bị báo `Trường không tồn tại`. Fix: so tên hàm upper-case cả 2 phía.
- **M3. Số post-formula luôn 2 thập phân + dính unit** — `dynamicEngineService.js:~264-274` (`toFixed(decimalPlaces ?? 2)` + nối unit thành string), bỏ qua `display_format`; import lại `parseFloat("123 unit")` thành NaN. Fix: lưu số thô, format lúc hiển thị (đồng bộ với M-fix ở H9).
- **M4. Hai validator động không khớp nhau** — `dynamicUtils.validateField` vs `middlewares/validators.js:validateDynamicFields` check tập type khác nhau, cùng field cho kết quả khác. Fix: gộp 1 nơi.
- **M5. Select động không validate options khi import** — `excelService.js:269-275` chỉ check `status`; `users.role`/select nguồn list lọt giá trị bậy. Fix: validate mọi select theo options/data-list.
- **M6. Seed role cũ + update theo ID cứng** — `09-seed` seed `USER/ADMIN`, script 27 update options `WHERE id=44` (ID cứng dễ miss); import users không validate role mới. Fix: seed/update theo `key`, validate role khi import.
- **M7. Ảnh đại diện/đếm footer hardcode** — `FieldRenderer` avatar chỉ khi key là `avatar`; footer COUNT đếm mảng đã lọc số → cột text luôn 0. Fix: nhận biết image-duy-nhất theo mime; COUNT đếm dòng.
- **M8. CTV chỉ xem được popup đề xuất của mình** — `MyProposalsPage.jsx:allowEdit={isAdmin}` ép view-only dù backend cho chủ sửa (phải đi nút Sửa riêng). Fix: `allowEdit` theo chủ sở hữu. **Skip loi nay, bat ky role nao cung sua duoc de xuat cua minh tru khi no khong con o trang thai PENDING**
- **M9. Sales reset pass CTV không cần pass cũ/không audit** — `adminUserController.js:244-252` (đã scope đúng nhánh). Fix: thêm audit log + (nên) thông báo cho user. **Tru khi reset o trang /profile thi can pass cu, con reset o trang admin/users khong can pass cu**
- **M10. Track-by-code + check-nearby-public lộ lọt** — `trackByCode` mask phone nhưng full tên/địa chỉ/tọa độ/custom chỉ bằng mã đoán được (formula tuần tự) + limiter yếu; `check-nearby-public` harvest tọa độ+PII. Fix: captcha + giới hạn trường trả về + mã khó đoán hơn.
- **M11. Thiếu rate-limit vài endpoint nhạy** — `/my-proposals`, download file, validate công thức không limiter → dò ID/brute-force. Fix: gắn limiter như các route khác.
- **M12. `trust proxy` + IP spoof** — `app.js:43-50` không set trong Docker → `req.ip` sai, limiter theo IP dễ bypass. Fix: `app.set('trust proxy', 1)`.
- **M13. File service path mong manh** — `fileService.js` split `storage/uploads/` + nối `storage_key` có thể sai thư mục ngày/Windows path. Fix: lưu absolute path lúc upload.
- **M14. Cột `originalName` không sanitize kỹ** — dùng vào `Content-Disposition`. Fix: strip `"`/`;`/non-ASCII.
- **M15. 404 trả thay 403 khi sai chủ** — `myProposalController` trả 404 → oracle IDOR. Fix: 403 đúng ngữ nghĩa.
- **M16. Update cứng tên cột** — `proposalService` INSERT liệt kê cột tay (thiếu `submission_source/submitter_ip/contact_*` ở các script mới) → thêm cột DB là phải sửa code. Fix: build INSERT động theo whitelist.

## P3 Low
- Swagger ghi `SUPER_ADMIN` cho queue-logs trong khi code cho sales (đã mở rộng) — cập nhật docs.
- Swagger `default: USER` không còn tồn tại (roles mới) — sửa ví dụ.
- `AGENTS.md` ghi 13 types nhưng code xử lý thêm `table`/`password` (`dynamicUtils`, validators, `table_config` map vào `source_config` trong khi DB không có cột đó).
- Validator bắt `address` buộc trong khi DB `NULL` + seed `required=0` — thống nhất 1 nơi.
- `clearFilters` audit-log không reload; `AdminMapConfigPage` gọi relative URL thay `VITE_API_URL`; form tạo proposal formId 9 (map) vs 13 (admin) lệch cấu hình; `AdminUsersPage` còn map role `USER` cũ; `tdt_tong_cong` formula rỗng (user yêu cầu bỏ qua).

## Dead code (xóa hoặc đánh dấu, đã grep không ai gọi)
- `adminUserService.deleteUser`, `dynamicUtils.buildDynamicSetClause` (nguy hiểm nếu gọi: ghi đè `custom_data`), `middlewares/auth.js:optionalAuth` (bypass LOCKED nếu dùng sai), `DynamicTable` fallback Sửa (`onRowClick` không trang nào truyền), nhánh `password`/`table` trong `validateDynamicFields` (ngoài 13 types).
