# AGENTS.md

## 1. Project Overview

```
Project: Station Management System
Purpose: Quản lý trạm sạc, hiển thị trên bản đồ, đề xuất vị trí trạm
Stack:   React 18 + Vite | Node.js 20 + Express | MySQL 8 | Leaflet | Docker Compose
Repo:    https://github.com/Nguyen15idhue/DeXuatTram2
```

## 2. Architecture

```
Browser → Frontend (Vite, :5173) → REST API (/api) → Backend (Express, :3000) → MySQL (:3306)
```

```
/frontend    React + Vite (JS, không TypeScript)
/backend     Node.js + Express
/database    SQL migrations (đánh số thứ tự)
/docker      Docker configs + MySQL datadir/dump
/scripts     migrate.sh (tracking schema_migrations), sync-data.sh
/e2e         Playwright E2E (root config: playwright.config.js)
/tests       Script test API thủ công (test_api.js)
/docs        Tài liệu theo mốc (0–8)
Swagger UI:  http://localhost:3000/api-docs
```

## 3. Business Entities

### User
- Roles: `SUPER_ADMIN`, `ADMIN`, `SALES`, `CTV`, `NPP` (file 25, thay `USER`/`ADMIN` cũ; `NPP` thêm ở migration `77` — **hoạt động y hệt `CTV`**, không có RBAC riêng)
- Cây 2 tầng: `CTV`/`NPP.parent_id` → `SALES` (GĐKV) → `SALES` (GĐTT cùng Trung tâm) — migration 90–92 + script `seed-sales-tree.js`. Gán cây: form **tạo user tự gợi ý parent** theo phòng ban + chức vụ (GĐKV mới → GĐTT cùng trung tâm; CTV/NPP → GĐKV cùng phòng ban, tự chọn khi duy nhất; vẫn sửa tay được); popup view/edit user cũng có mục Phân nhánh cho target GĐKV. Scope nhánh **đệ quy** (`adminUserService.getBranchIds`): GĐTT thấy mình + GĐKV + CTV dưới quyền; GĐKV thấy mình + CTV trực tiếp. **Xem ngược lên**: SALES được `GET /admin/users/:id` của cấp trên trong chuỗi `parent_id` (`getAncestorIds`, chỉ xem — `PUT` ngoài nhánh vẫn 403, trả `_scope: 'branch'|'ancestor'`); danh sách user của SALES (`getAllUsers`) gồm nhánh + cấp trên (cây hiện GĐTT phía trên; nút Sửa/Khóa/Xóa vẫn gate theo rank nên cấp trên chỉ Xem); options user (`/options/all`) của SALES = nhánh + cấp trên, của CTV/NPP = mình + cấp trên (để field `user` như GĐTTKD hiện tên ở form edit; `UserField` tự fetch bù user theo id khi vắng trong options)
- `external_id` map hệ ngoài (unique, = Mã NV 1Office)
- Field `department` (Phòng ban) + `chuc_vu` (Chức vụ): select options thủ công từ Excel nhân sự (10 PB / 16 CD); `chuc_vu` dùng phân biệt GĐTT/GĐKV trong hiển thị
- `token_version` tăng khi đổi mật khẩu → revoke JWT cũ
- Status: `ACTIVE`, `LOCKED`

### Station (trạm đã có thật)
- Status: `PLANNING`, `ACTIVE`, `DEPLOYING`, `REJECTED` (`REJECTED` của trạm **tách biệt** `REJECTED` của proposal)
- `mo_hinh_tram`: select TDT/LK/NQ/**NQ_LK** (migration `86` thêm `NQ_LK` "Nhượng quyền + Liên kết" để map 1:1 với đề xuất; label đầy đủ, value viết tắt)
- `loai_uu_tien`: formula post — TDT→1 (Cấp 1), LK/NQ/NQ_LK/trống→2 (Cấp 2)

### Station Proposal (đề xuất trạm mới)
- Status: **8 giá trị** `PENDING`, `REVIEWING`, `APPROVED`, `REJECTED`, `CANCELLED` (Đã hủy, terminal), `CONTRACT_SIGNED` (Ký thành công), `CONTRACT_FAILED` (Ký thất bại), `ARCHIVED` (Đã lưu trữ, ngang hàng `APPROVED`: duyệt nhưng ưu tiên thấp, cất kho; vào từ `REVIEWING`, ra `CONTRACT_SIGNED`/`CANCELLED`) — migration `86` (7 status) + `94` (`ARCHIVED`). Ma trận cứng trong `proposalLifecycle.js` (đường duy nhất đổi status, sai → 400 + log denied); `PUT /admin/proposals/:id` cấm đổi `status`. **`CANCELLED` vào được từ MỌI trạng thái chưa kết thúc** (`PENDING`, `REVIEWING`, `PRINCIPLE_APPROVED`, `APPROVED`, `ARCHIVED`, `CONTRACT_SIGNED`, `CONTRACT_FAILED`, `REJECTED`) — menu 3 chấm ở bảng đề xuất luôn có "Hủy đề xuất" (bắt buộc nhập lý do), trừ chính `CANCELLED` (terminal, chỉ SUPER_ADMIN "Mở lại khẩn cấp")
- `station_id` FK → `stations.id` (dấu hiệu đề xuất đã thành trạm; proposal giữ `CONTRACT_SIGNED`)
- `loai_uu_tien`: formula post theo `mo_hinh_dau_tu` — TDT→1, LK/NQ/NQ_LK/trống→2
- `mo_hinh_dau_tu`: **4 giá trị** `NQ`/`TDT`/`LK`/`NQ_LK` (migration 76). Chọn `NQ_LK` → form hiện **tab lồng** "Nhượng quyền và Liên kết" gồm 2 tab con "Nhượng quyền"/"Liên kết" (xem mục 11 — `layout_config.type:'tabs'`). Mã đề xuất dạng `NQ_LK_HCM_0001` (regex mã cho phép prefix nhiều nhóm `_`)
- `submission_source`: `user` | `guest`; `tracking_code`, `submitter_ip`
- Sync 1Office: `contact_1office_id`, `contact_1office_code`, `sync_status`, `last_synced_at`, `last_synced_data`
- `ma_de_xuat_gen` là cột generated từ `custom_data`
- `land_type` (Loại đất) là field `fixed` type `select`, 6 lựa chọn (Đất thương mại dịch vụ / khu công nghiệp / giao thông-Bến bãi-Điểm dừng nghỉ / ở / nông nghiệp / khác-chưa xác định) — migration `75`
- Liên hệ chủ trạm: `chu_tram` (text/json) + `sdt_chu_tram` (phone/json) — migration `103`; map-mode + `GET /stations` trả khi đã đăng nhập (`optionalAuth`), ẩn khi public

### Dynamic config entities
- **Field Definition**: 13 types chuẩn (`text`, `textarea`, `number`, `email`, `phone`, `url`, `date`, `datetime`, `boolean`, `select`, `multiselect`, `file`, `formula`) + type `user`. `source` = `fixed` (cột DB) hoặc `json` (trong `custom_data`)
- **Form**: gắn 1 entity, có `purpose` (`all`/`create`/`view`), field theo `order_index`, section trong `layout_config`
- **View**: gắn 1 entity, columns có `width`, `sortable`, `filterable`, `visible`
- **Data List**: `columns_config` JSON `[{key,label,type}]`; rows `data` JSON `{column_key:value}`; hierarchy qua `parent_row_id`

**QUAN TRỌNG:**
- `Station` và `Station Proposal` là hai entity ĐỘC LẬP — KHÔNG merge, KHÔNG thêm status `PROPOSAL` vào Station
- `Station` là trạm đã có thật; `Station Proposal` là đề xuất chưa được duyệt

## 4. Business Rules

### 4.1. Permissions & Roles
1. CTV chỉ xem/sửa/xóa proposal của chính mình (theo `user_id`)
2. SUPER_ADMIN quản lý tất cả; ADMIN quản lý tất cả **trừ tài khoản `SUPER_ADMIN`** (list/get/update/delete/lock đều chặn ở API + ẩn ở UI)
3. CTV KHÔNG truy cập admin API (`/admin/*`); SALES chỉ vào 4 trang `/admin`, `/admin/users`, `/admin/stations`, `/admin/proposals`
4. Chỉ `SUPER_ADMIN` vào trang cấu hình: `/admin/fields`, `/admin/forms`, `/admin/views`, `/admin/data-lists`, `/admin/map-config`, `/admin/roles`, `/admin/api-configs`, `/admin/help` + tạo super admin
5. SALES chỉ xem trạm (không nút Sửa) dùng `allowEdit={!isSales}` trong `RecordDetailPopup`
6. SALES đổi trạng thái proposal qua `PUT /admin/proposals/:id/status`; `PUT /admin/proposals/:id` là `requireUserManager` (SALES sửa nội dung đề xuất trong nhánh, chặn ngoài nhánh qua `denyOutsideBranch`, cấm đổi `status`); `POST /admin/proposals/:id/convert-to-station` vẫn `requireAdmin`
7. Route `/admin/audit-log` cho `ADMIN` + `SALES` (sales chỉ thấy log của mình); `/admin/:entity/:id/files` bọc `RoleRoute` ADMIN_AND_SALES (chặn entity `users` với non-admin)
8. Nút Retry/Cancel queue chỉ render cho `SUPER_ADMIN`
9. Tạo trạm từ đề xuất `POST /admin/proposals/:id/convert-to-station` là `requireAdmin` (chỉ `ADMIN`/`SUPER_ADMIN`); tab "Hoạt động đề xuất" (`GET /api/admin/proposal-logs`) phân quyền y hệt lịch sử đồng bộ 1Office

### 4.2. Proposal Lifecycle & Notification
- Từ chối/hủy đề xuất: **bắt buộc** `reason` (`reject_reason`); lưu `reviewed_by`, `reviewed_at` (`proposalLifecycle.transition`)
- Duyệt + đẩy (`PENDING → REVIEWING`, lần đầu) → **tự tạo lệnh đẩy 1Office** (queue push, config contact active mặc định; vào lại `REVIEWING` không tạo lệnh mới). FE nút "Duyệt & đẩy" + toast lệnh chờ; push thủ công chỉ cho `PENDING`/`REVIEWING` (`syncService` gate). Được duyệt **chưa thành trạm thật**
- **`APPROVED` và `CONTRACT_*` tạm cho chỉnh tay** (nút demo, log `manual_override=1`); chính thức do webhook 1Office gọi `POST /api/webhooks/oneoffice/proposal-status` (secret `ONEOFFICE_WEBHOOK_SECRET`, idempotent `event_id`, response đóng băng cho BPA Success path, log inbound không qua worker)
- Auto vòng đời (`proposalLifecycleWorker`, cron `lifecycle_check_cron` mặc định `*/5 * * * *`): `CONTRACT_FAILED` quá 30 ngày → `CANCELLED`; `CONTRACT_SIGNED` quá 90 ngày + `station_id IS NULL` → tạo `stations` (`DEPLOYING`, tên `Trạm {mã đề xuất}`, mô hình 1:1). Thất bại → log `auto_failed`, retry tới `lifecycle_max_retries` (mặc định 5) rồi notify ADMIN/SUPER kiểm tra tay (config ở `proposal_lifecycle_configs`)
- Đổi status → tạo `notifications` cho chủ đề xuất (luôn tạo). **9 loại** + màu: `REJECTED` đỏ, `APPROVED` xanh lá, `PENDING` vàng, `REVIEWING` xanh lam, `RESUBMITTED` vàng, `CANCELLED` xám, `CONTRACT_SIGNED` teal, `CONTRACT_FAILED` cam, `ARCHIVED` tím.
- Nội dung thông báo rõ ràng: `notificationService.statusMessage` ghép `Mã đề xuất: {ma_de_xuat} · Người thực hiện/Người từ chối/Người hủy/Người tạo: {tên} · Lý do: ...`; tạo đề xuất → thông báo cho `parent_id` của người tạo; webhook → actor `1Office`; auto → `Hệ thống`
- **Chặn đẩy 1Office khi thiếu `nguoi_phu_trach`/`nguoi_giao_phu_trach`** (`syncService.getMissingPushUserFieldLabels`, dùng `label` từ `field_definitions`): duyệt bị chặn 400 + popup cảnh báo FE; push thủ công trả lỗi từng đề xuất. Cả 2 nút (Đẩy sang 1Office + Duyệt) đều có popup xác nhận
- CTV sửa được khi `PENDING`/`REJECTED`; khi `REJECTED` nút lưu đổi thành **"Gửi lại"** → lưu xong reset `REJECTED → PENDING` + notify `RESUBMITTED` cho người đã từ chối (`myProposalService`, kèm log activity; admin không resubmit hộ qua PUT generic)
- CTV/owner lưu sửa qua `myProposalService` (RecordDetailPopup `updateService`), KHÔNG dùng admin API
- `PUT /my-proposals/:id` gắn `validateUpdateProposal`; `PUT /admin/proposals/:id` merge giá trị cũ khi field vắng (chống ghi NULL) + từ chối đổi `status` (400, ép dùng `/status`)- Trang `/admin/proposals` có bộ lọc **trạng thái (nhãn tiếng Việt)** + **Loại ưu tiên Cấp 1/Cấp 2** (`GET /admin/proposals?status=&uu_tien=`); options nhãn trạng thái lưu ở `field_definitions.options` (migration 73)

### 4.3. Notification Bell
- `NotificationBell` ở header user + admin (polling 30s + sự kiện `notifications:refresh`; nhấp nháy + badge chưa đọc)
- Dropdown render qua `createPortal` ra `body` (`position:fixed`, `z-index:9999`) tránh `.drawer-side` che
- Badge/list chỉ tính thông báo trong `NOTIFICATION_RETENTION_DAYS` ngày gần nhất (mặc định 7)
- Tab user/SALES: "Của bạn"; admin + ADMIN/SUPER thêm tab "Tất cả" (`GET /api/notifications/all`, requireAdmin, chỉ đọc). Tab "Tất cả" **gộp 1 dòng/sự kiện** theo `(type, entity, title, message, ngày)` + trả `recipient_count`/`recipient_names` (FE hiện `→ tên +N`, hover xem danh sách) thay vì 1 dòng/người nhận
- Click item điều hướng theo `mode` trang: user → `/my-proposals/view=id`, admin → `/admin/proposals/view=id` (không theo role)

### 4.4. Guest Proposal (không cần đăng nhập)
- Form tại `/de-xuat` (`GuestProposalPage`, `GuestLayout`); submit `POST /api/proposals/guest` (`user_id` = NULL)
- CAPTCHA Turnstile **fail-closed**: chỉ bypass khi `CAPTCHA_ENABLED === 'false'`; thiếu token/secret → 400
- Tra cứu `GET /api/proposals/track/:code` (mask SĐT); check trùng công khai `POST /api/proposals/check-nearby-public`
- Rate limit riêng: guest submit 5/h, upload 10/h, track 30/h
- File guest dọn định kỳ qua `ORPHAN_FILE_TTL_HOURS` (mặc định 24h)

### 4.5. Map Marker & Page
- Marker màu theo trạng thái, **phân biệt theo entity** (`getMarkerColor(status, 'station'|'proposal')`; constants `utils/mapStatuses.js`): Station `PLANNING` tím `#a855f7`, `ACTIVE` xanh `#22c55e`, `DEPLOYING` vàng `#eab308`, `REJECTED` đỏ sẫm `#b91c1c`; Proposal `PENDING` cam, `REVIEWING` xanh dương, `APPROVED` xanh lá, `REJECTED` đỏ `#ef4444`
- **Icon marker trên bản đồ** (chỉ dùng trong map): cấu hình per-option trong field `status` của `stations`/`station_proposals` (`field_definitions.options[].icon`; bộ catalog `utils/mapMarkerIcons.js` — 42 icon dẹt SVG tự màu theo 4 nhóm `MARKER_ICON_GROUPS`). `getMarkerIcon(status, entity)` tra override từ field-def (load 1 lần qua `loadMarkerIconConfig`, cache module-level), fallback `STATUS_ICON_DEFAULTS`. UI chọn icon ở `FieldManager` (section "Options — Icon bản đồ", hiện cả khi field `is_locked`). Marker có icon = nền trắng + viền màu trạng thái + icon; Legend + `MapFilterPanel` chip cũng hiện badge icon. **Backend `updateFieldDefinition`**: field khóa vẫn CHO PHÉP cập nhật duy nhất key `icon` trong `options` (mọi thứ khác giữ nguyên). Lưu field → `notifyMarkerIconsChanged()` xóa cache module và phát sự kiện `markericons:refresh`; hook `useMarkerIcons` force-fetch khi mount nên điều hướng map → fields → map luôn thấy cấu hình mới. Leaflet `createCustomIcon(color, icon)` + MapLibre DOM-marker & symbol layer (`ensureGlyphImages` sinh `app-glyph-<id>`)
- Popup marker (`MapView`): link "Xem chi tiết" mở `/admin/stations|proposals/view=<id>` cho `SUPER_ADMIN|ADMIN|SALES` (dùng `canOpenAdminRecord`); render bằng thẻ `<a>` thuần (KHÔNG dùng `<Link>` vì popup ngoài React Router context → lỗi `basename`)
- Popup đề xuất gate sở hữu (`canViewProposal`): ADMIN/SUPER luôn xem; SALES chỉ đề xuất của mình (`user_id`) hoặc CTV thuộc nhánh (`owner_parent_id`); ngoài nhánh hiện dòng đỏ. `GET /proposals` trả thêm `user_id`, `owner_parent_id` (backend vẫn chặn thật qua `denyOutsideBranch`)
- Trang `/map` có bộ lọc `MapFilterPanel` (phạm vi "Của tôi"/"Tất cả", ẩn/hiện trạm & đề xuất, chip trạng thái trạm/đề xuất, chip **Loại ưu tiên Cấp 1/Cấp 2** áp cho cả trạm & đề xuất theo `loai_uu_tien`). Desktop = card nổi; mobile (<768px) = bottom sheet. **Legend cột Đề xuất 5**: Đang đề xuất / Đang xem xét / Đã duyệt BCĐX / Đã hủy / Đã lưu trữ (`show_in_legend`); filter đủ 8 theo `sort_order`, 3 chip ẩn-map (`REJECTED/CONTRACT_*`) gắn badge "không hiện bản đồ"; marker chỉ vẽ 5 trạng thái legend
- `MapView` nhận prop `filters`; lọc client-side bằng `useMemo` trước `MapLayerController`. Mặc định `EMPTY_MAP_FILTERS` = hiện tất cả
- `GET /stations` **không `limit`** → trả toàn bộ marker fields (map), kèm `loai_uu_tien`/`mo_hinh_tram` trích từ `custom_data`; có `limit` → phân trang. Proposals cap 20000, kèm `mo_hinh_dau_tu`/`loai_uu_tien`
- `RecordDetailPopup` nút "Xem bản đồ" mở `LocationMapModal` (chỉ khi có tọa độ): tâm tại record, vành nét đứt xoay (`location-point-ring`), bán kính **5/10/20/50/100 km** (`L.Circle`) + hiện trạm/đề xuất lân cận (`proximityService`)
- Trang `/map` (chỉ `ADMIN`/`SUPER_ADMIN`): FAB **"Tạo trạm nhanh"** (nằm trên FAB "Vị trí của tôi") mở **cùng menu 3 cách chọn toạ độ** như tạo đề xuất (`MapView.createTarget` = `proposal`/`station`; `onLocationSelected(lat,lng,mode,target)`); chọn xong mở modal `DynamicForm entity="stations" purpose="create"` với `latitude`/`longitude` + địa chỉ tự điền (reverse geocode). SALES/CTV không thấy nút. Menu có tiêu đề in đậm màu xanh đậm `Tạo trạm mới` (target `station`) / `Tạo đề xuất mới` (target `proposal`) ứng với từng chức năng
- Trang hướng dẫn (`/huong-dan` + `/admin/huong-dan`, cùng `frontend/src/pages/HelpPage.jsx`): **nguồn nội dung = DB** (`help_categories`/`help_articles`, migration `104`) qua `services/helpApi.js` (cache module-level 60s + dedupe in-flight), **fallback** `frontend/src/help/guideData.{start,groups,flows,integrations}.js` + banner offline khi API lỗi (cố ý giữ, xem `docs/8/53`). 3 tab — **I. Nhóm chức năng** (S01–S04 + G01–G42 + FAQ Q01–Q09), **II. Luồng thực hiện** (F1–F3), **III. Tích hợp** (F4). Public `GET /api/help/categories|articles|articles/:slug` + `POST /track-view` (`optionalAuth` lọc theo role, ẩn draft/archived); slug nhận cả `legacy_id` (`#G39` cũ vẫn mở đúng). `ArticleCard` render `content_html` sanitized + gallery nhiều ảnh + **video YouTube lazy-iframe** (thumb `i.ytimg.com`, iframe chỉ tải khi click) + **video nội bộ** `<video preload="none">` (`/api/files/:id/download?token=`), badge Mới/Cập nhật, `view_count` (IntersectionObserver), copy-link, highlight `<mark>` + snippet khi tìm kiếm, deep-link **`/huong-dan?s=<chuyên mục>#<slug>`** (thiếu `?s=` sẽ không mở đúng section vì trang chỉ render section active; điều hướng cùng trang cần cả `?s=` để đổi section và `#slug` để cuộn — `HelpPage` dùng `navigate({ search, hash })` để giữ hash). TOC nhóm (`TOC_GROUPS`) + mobile `<select>`.
- Trang cấu hình hướng dẫn `/admin/help` (`pages/admin/AdminHelpPage.jsx`, `RoleRoute SUPER_ONLY` + `requireSuperAdmin`): **2 chế độ xem** — (1) **Bảng** (DataTable + search/filter trạng thái & danh mục + **phân trang** 10/25/50/100 qua `components/Pagination.jsx`), (2) **Hướng dẫn** (`components/admin/HelpGuideBoard.jsx` — layout giống trang xem: TOC danh mục + tiêu đề mục + thẻ bài render nội dung, có nút thao tác ngay trong thẻ: Thêm chung/từng mục, Sửa, Xóa, Đổi trạng thái, Xem trước). Editor `components/admin/HelpEditor.jsx` dùng **TipTap 3.x** (starter-kit + link + image + youtube + placeholder + table) với toolbar 12 nút + undo/redo/preview, slug auto, tags/related/route/roles/status, upload ảnh qua `/api/files/upload`, upload video nội bộ qua `POST /api/admin/help/videos` (multer riêng **200MB**, mp4/webm/mov, subdir `help-videos/`). API admin: CRUD + `publish`/`archive` + `categories` + `import-legacy` (SUPER). Xóa bài hỏi `ConfirmDialog`. `DataTable` gọi `render(value, row)` — chú ý tham số.
- **Chatbot hướng dẫn** (nút **toàn cục góc dưới-phải** mọi trang qua `<GlobalAssistantChat />` trong `App.jsx`, ẩn ở `/login`/`/register`; riêng `/map` neo trong cụm FAB **trên nút "Tạo trạm nhanh"** qua `MapView` prop `fabSlot` + `<AssistantChat variant="inline" />`): `POST /api/assistant/ask` (rate-limit 30/h) → truy hồi `helpService.searchForAssistant` (tokenize bỏ dấu + chấm điểm title/tags/summary/content, top-5) + `knowledgeService.search` (tài liệu nội bộ, top-3, chỉ SUPER/ADMIN/SALES) → `services/assistantService.js` build prompt (PHẦN 1 bài help được trích dẫn / PHẦN 2 tài liệu nội bộ) + `services/assistant/router.js` chạy **Gemini (chính, 15s) → OpenRouter (dự phòng)**, circuit-breaker 5 phút/provider, cache `ttlCache` 1h, log `assistant_logs`, redact SĐT/email. `GET /api/assistant/status` cho FE ẩn nút khi chưa cấu hình. Trả lời render markdown (`components/help/MarkdownText.jsx`) + **card nguồn có thumbnail** (`sources[].images`). Provider/model cấu hình bằng env (`GEMINI_API_KEY`/`GEMINI_MODEL`/`OPENROUTER_API_KEY`/`OPENROUTER_MODEL`/`ASSISTANT_ENABLED`) — `OPENROUTER_MODEL` nhận **danh sách phân tách dấu phẩy**, thử lần lượt. **Không dùng Ollama** (xem `docs/8/53` §9, `docs/8/54`).
- **Kho tri thức tài liệu** (`assistant_knowledge`, migration `105`): index từ `AGENTS.md` + `docs/**/*.md` bằng `backend/scripts/index-knowledge.js` (allowlist, redact secret, loại `docs/0`/`docs/6`/`.env`/`docker-compose`). KHÔNG đọc bảng nghiệp vụ. Chạy lại script sau khi sửa docs.
- Trang `/map` có nút **chuyển Mode** (Đường phố/Vệ tinh/Vệ tinh + nhãn/Địa hình — `MAP_MODES`) và nút **bật/tắt 3D** khi renderer là MapLibre; thay đổi cục bộ theo phiên (không ghi `map_configs`), mobile ẩn 3D. Legend (`.map-legend`) ở **góc trên-phải** (`top:12; right:64px`) để không đè bộ lọc (`.map-filter` ở trên-trái); legend tách **2 cột Trạm / Đề xuất**, nút "Chú thích" (cụm controls) thu gọn/mở rộng — mobile (<768px) **mặc định đóng**

### 4.6. Map Tile & Renderer
9. Cấu hình `map_configs` áp dụng thật: `MapView` + `LocationMapModal` + mini map `MyProposalsPage` đọc qua `useMapConfig`/`utils/mapTile.js`
10. `tile_mode`: `proxy` (mặc định, `/tiles/{z}/{x}/{y}` — server giữ key) | `direct` (browser gọi provider, key client-side). `retina` bật `@2x`
11. Public `GET /api/map-configs` ẩn `api_key` khi proxy; admin đọc full qua `GET /api/map-configs/admin` (SUPER_ADMIN)
12. Tile lỗi liên tục → hiện **banner cảnh báo** (KHÔNG tự đổi provider/style để tránh "tự chuyển layer"). Geoapify là provider cần key chính (`maps.geoapify.com`, whitelist proxy)
13. **Provider miễn phí không cần key** (mặc định `map_configs` = `leaflet-osm`/`osm-de`): OSM mirror `tile.openstreetmap.de` (`osm-de`), `{s}.tile.openstreetmap.fr/osmfr` (`osm-fr`), `opentopo`, `esri-imagery`; `esri-basemap` (World_Street/Imagery/Topo). **CARTO nay cần key** (watermark "API KEY REQUIRED") → đã gỡ khỏi catalog. OSM gốc `tile.openstreetmap.org` bị chặn TLS → không dùng. Xem `docs/5/34`
14. Renderer seam: `frontend/src/components/map/renderers/` (`index.js` registry + `createRuntime`). Có 2 renderer: `leaflet` (`leafletRuntime.js`) và `maplibre` (`maplibreRuntime.js`, lazy import `maplibre-gl`). `MapCanvas.jsx` mount runtime + đẩy dữ liệu; `MapView` KHÔNG import Leaflet trực tiếp. Renderer lạ / thiếu WebGL → fallback Leaflet + banner cảnh báo. **Bắt buộc `vite.config.js` có `optimizeDeps.exclude: ['maplibre-gl']` + `worker.format: 'es'`** — nếu không, worker MapLibre không chạy, vector tile (.pbf) không tải (map trắng)
15. **Mode/Layer** (`utils/mapModes.js` + `utils/mapStyles.js`): `streets` (OpenFreeMap vector style liberty), `satellite` (Esri raster), `hybrid`, `terrain` (OpenTopoMap). Lưu ở `map_configs.default_mode` + `layers_config`; đổi mode/nguồn vector chỉ bằng cấu hình
    - **MapLibre `hybrid`** = Esri World_Imagery raster + nhãn/đường/POI **vector** OpenFreeMap: `buildHybridStyle()` lọc từ `/pmtiles/liberty-style.json` (giữ toàn bộ layer `symbol` + line `road_*`/`boundary_*`/`waterway_*`, bỏ `poi_r20`, `poi_transit` minzoom 12, text-field ưu tiên `name:vi`). `loadLibertyBaseStyle()` cache JSON 1 lần; `buildMapStyle('hybrid', { libertyBase })` mới ra bản chi tiết, thiếu `libertyBase` thì fallback raster Esri cũ
    - **Leaflet `hybrid`** = style `hybrid` thêm trong catalog provider `leaflet-osm`: base `World_Imagery` + `overlays[]` = `Reference/World_Transportation` + `Reference/World_Boundaries_and_Places`. `buildTileConfig` trả `overlays` (bỏ qua proxy), `leafletRuntime.setTileLayer` render thêm tile layer phủ (`zIndex` 2+)

16. **Self-host PMTiles** (provider `maplibre-self-hosted`): `maplibreRuntime` đăng ký protocol `pmtiles`; `loadPmtilesStyle(url)` dùng **style OpenFreeMap liberty** (`frontend/public/pmtiles/liberty-style.json`, 117 layer) và thay `sources.openmaptiles` → `pmtiles://<origin>/...pmtiles` (bỏ `ne2_shaded`) để có đủ nhãn địa danh; fallback style tối giản nếu fetch lỗi. File build từ OSM (Planetiler) đặt ở `frontend/public/pmtiles/vietnam.pmtiles` (gitignore). Hướng dẫn: `docs/5/37`. **3D**: terrain DEM chỉ bật khi `enabled3d && pitch > 10 && zoom ≥ 15`, `dem.maxzoom=11`, building `minzoom=15`; terrain **giữ nguyên khi pan/zoom** (chỉ sync ở `zoomend`/`moveend`/`pitchend`, KHÔNG tắt giữa chừng) để tránh map tự nhảy khi phóng to gần max
17. `/tiles` proxy validate z (0–22) + x/y trong khoảng, whitelist host, không có `?url=`, lỗi trả 502 + `X-Tile-Proxy-Status: fallback` (FE hiện banner). `tile_mode`: `proxy` (mặc định, `/tiles/{z}/{x}/{y}?style=...`) | `direct`
18. Geolocation: log `console.error('[MapView] Geolocation error:')`, user thấy alert. `mountedRef` phải set `true` trong effect (StrictMode chạy 2 lần)
19. MyProposalsPage mini map + `LocationMapModal` dùng chung `MapCanvas` adapter; click mini map → realtime sync lat/lng vào DynamicForm qua `initialData`
20. Admin `/admin/map-config`: chọn renderer/provider/mode, preview dùng đúng renderer (`MapCanvas`), test kết nối vector/raster/PMTiles, lưu `renderer`/`default_mode`/`layers_config` → phát `mapconfig:refresh`
21. **Nhãn hành chính sau sáp nhập** (`frontend/public/vn-provinces-labels.geojson` — 34 tỉnh; `vn-provinces-labels-old.geojson` — 63 tỉnh cũ; `vn-wards-labels.geojson` — 3321 xã; sinh bằng `frontend/scripts/gen-admin-labels.mjs` từ **Open Admin Data** + **viettrace** (CC-BY-4.0)): chọn ở **menu "Chuyển layer" nhóm "Nhãn hành chính"** — `Nhãn mới` (34 tỉnh + 3321 xã) / `Nhãn cũ` (63 tỉnh trước sáp nhập; chưa có xã cũ do thiếu dữ liệu toạ độ) / `Tắt nhãn`. Runtime `setWardLabels(points, show)` — **MapLibre**: source `app-ward-labels` + symbol layer minzoom 11 (tự `setGlyphs` nếu style thiếu, `applyAll` re-add sau đổi style); **Leaflet**: divIcon lọc theo viewport, chỉ zoom ≥ 12, tối đa 400 nhãn (`renderWardLabels`). Hybrid MapLibre bỏ `label_other` (OSM cấp phường/quận) tránh trùng. Mini map/`LocationMapModal`/`AdminMapConfigPage` mặc định tắt (`showWardLabels=false`)
22. **Giới hạn zoom theo provider** (tránh lỗi "Map data not yet available"/502 khi phóng to): mỗi `tile_url_styles[]` có `max_zoom` (osm-de/osm-fr/esri = 19, opentopo = 17); `buildTileConfig` trả `maxNativeZoom`; Leaflet `L.tileLayer({ maxNativeZoom, maxZoom: 22 })` scale tile thay vì gọi z cao hơn; MapLibre raster source `maxzoom` (`MAX_ZOOM_ESRI`/`MAX_ZOOM_OPENTOPO` trong `mapStyles.js`) overzoom. Proxy `/tiles` retry 1 lần khi lỗi mạng

### 4.7. Reverse Geocoding
- `geocodeService.reverse(lat,lng)` gọi Geoapify (`/v1/geocode/reverse`, `lang=vi`, `countrycodes=vn`) → chuẩn hóa + cache `geocode_cache` (4 chữ số thập phân). Trả kèm `admin` = kết quả khớp Data List
- **`address` dựng chuẩn**: `[số nhà] [tên đường], {xã/phường}, {tỉnh/thành}, Việt Nam` (tối thiểu xã + tỉnh + Việt Nam). Ưu tiên canonical từ Data List; KHÔNG dùng `formatted` thô
- `dataListService.matchAdministrative(geo)`: khớp tỉnh (`state→city→county`) với `dm_tinh`; khớp phường/xã (`suburb→city→district→quarter→county`) với list `Danh muc Phuong Xa`. Bỏ tiền tố qua `normalizeAdminName`
- `addressEnrichment.enrichDynamicData` tự điền `address`/`province`/`ma_tinh`/`vung_mien`/`xa_phuong` **chỉ khi ô trống**, gọi trước `applyDiaGioi` ở `proposalService`/`myProposalService`/`adminProposalService`/`stationService`/`excelService` (gate `GEOCODE_ON_IMPORT`)
- FE: `DynamicForm` watcher `latitude`/`longitude` (debounce 700ms) gọi `POST /api/geocode/reverse`
- Config `geocode_configs`; admin `GET/PUT /api/admin/geocode-config` + `POST /api/admin/geocode-config/test` (SUPER_ADMIN). Panel `GeocodeConfigPanel` cuối `/admin/map-config`

### 4.8. Create Form Modal
- Tất cả create form modal phải có nút X (icon lucide-react) góc phải title

### 4.9. Ownership
- Update/delete proposal phải check `user_id` khớp user đang login; admin bypass
- Sai chủ trả 403 (không trả 404 để tránh oracle IDOR)

### 4.10. Dynamic Field
- Field `source_type=fixed` không đổi key hoặc xóa
- Field `source_type=json` lưu cột `custom_data`
- Select/Multiselect 2 nguồn: manual options hoặc Data List
- Cascading select: child field có `parent_field` + `relation_key`
- Formula: pre-compute (trong form) / post-compute (sau tạo record)
- Type `user` lưu `{ id }`; `source_config.auto_user`: `current_user` | `parent_sales` | `owner_or_manager` | `area_director` (GĐKV: CTV→parent, GĐKV→mình, còn lại trống) | `center_director` (GĐTT cùng `department` với người phụ trách, còn lại trống) → **chỉ điền khi ô trống** (giữ giá trị sửa tay); FE khóa readonly với CTV/NPP, mở với SALES/ADMIN/SUPER

### 4.11. Data List
- Data List name unique
- Columns config `[{key,label,type}]`, type = `text` hoặc `number`
- Row data lưu JSON cột `data`
- Delete row → orphaned children set `parent_row_id = NULL`

### 4.12. Security & Rate Limiting
- Mật khẩu bcrypt; JWT 12h (`JWT_EXPIRES_IN`) + `token_version` revoke; FE `api.js` interceptor 401 → xóa token + về `/login`
- Đăng nhập bằng **email hoặc SĐT** (`authService.findByEmailOrPhone`, chuẩn hóa `0`/`84`/`+84`); tick "Ghi nhớ đăng nhập 30 ngày" → token `30d` (FE lưu `remember_until` = mốc hết hạn), không tick → `12h`. `AuthContext` lưu lựa chọn tick vào `remember_login` (LoginPage tự tick sẵn lần sau) và định kỳ 30s kiểm tra `remember_until` để **tự logout client-side đúng hạn**; `fetchUser` bỏ qua kết quả trả về nếu token đã bị xóa (chống race hồi sinh phiên)
- `helmet`, CORS theo `CORS_ORIGINS`, body limit 10MB, `compression`, `trust proxy 1`
- **Upload**: allowlist MIME/ext, chặn svg/html/js/exe/php (kể cả double-ext), tên random + ext ép từ MIME, verify chữ ký thật. KHÔNG serve static `/uploads`; tải qua `/files/:id/download|image` có auth + ownership (admin bypass, owner, guest cùng IP). `optionalAuth`/`requireAuth` hỗ trợ `?token=` cho `<img>`
- **Public proposals rút gọn**: `GET /api/proposals` / `:id` chỉ trả `id,latitude,longitude,address,status,created_at` (không PII)
- Rate limit (`middlewares/rateLimits.js`): auth 10–30/ph, admin 60–120/ph, excel 10–30/ph, guest submit 5/h, guest upload 10/h, guest track 30/h, public data 120/ph, geocode 30–60/ph, assistant 30/h

## 5. Coding Conventions

```
Frontend components:     PascalCase.jsx
Variables/functions:     camelCase
Constants:               UPPER_SNAKE_CASE
Database tables:         snake_case, plural
Database columns:        snake_case
API routes:              /api/[resource]
```

### General Rules
- JavaScript (không TypeScript); async/await; try-catch
- Không thêm comments trừ khi được yêu cầu
- **Backend test OK ≠ Frontend OK**: sau khi fix backend PHẢI kiểm tra frontend như mở trình duyệt — nút bấm, API gọi, dữ liệu hiển thị, ẩn/hiện đúng. Không chỉ test backend rồi kết luận.

## 6. Folder Responsibilities

### Frontend
```
frontend/src/
├── components/
│   ├── dynamic/    DynamicForm, DynamicTable, DynamicField, FieldRenderer, FileUpload,
│   │               FileViewer, FileListPopup, DynamicFilter, FormulaEditor, UserChip, UserField
│   ├── admin/      FieldManager, FormBuilder, ViewBuilder, DragDropList, DataListManager,
│   │               DataListEditor, RecordDetailPopup, FieldMappingPanel, TemplateEditor,
│   │               SyncPanel, GeocodeConfigPanel, PersonnelSyncPanel, UserExternalPanel,
│   │               UserTreeView, ProposalActivityPopup, ProposalFlowInfo,
│   │               HelpEditor (TipTap), HelpGuideBoard
│   ├── help/       HelpMedia (VideoBlock + Gallery), AssistantChat, MarkdownText
│   ├── layout/     AdminHeader, AdminSidebar, UserHeader, UserSidebar, NotificationBell
│   ├── map/        MapCanvas + renderers/ (index registry, leafletRuntime, maplibreRuntime,
│   │               leafletRenderer, maplibreRenderer, README)
│   ├── ui/         Button, Input, Select, Dialog, DataTable, FilterBar, Badge, PageHeader, ...
│   └── (common)    MapView, MapFilterPanel, LocationMapModal, Toast, Pagination, ErrorMessage,
│                   Loading, EmptyState, ConfirmDialog, FormInput, DuplicateCheckPanel, RoleRoute,
│                   RouteFallback
├── pages/
│   ├── auth/       LoginPage, RegisterPage
│   ├── user/       MapPage, MyProposalsPage, GuestProposalPage, ProfilePage
│   └── admin/      AdminDashboard, AdminUsersPage, AdminStationsPage, AdminProposalsPage,
│                   AdminFieldsPage, AdminFormsPage, AdminFormBuilderPage, AdminViewsPage,
│                   AdminViewBuilderPage, AdminDataListsPage, AdminRecordFilesPage,
│                   AdminMapConfigPage, AdminRolesPage, AdminApiConfigPage, AdminAuditLogPage,
│                   AdminHelpPage, RecordDetailPage
├── services/       api.js (all API calls), helpApi.js (help + adminHelpApi)
├── hooks/          useFieldOptions, useDataList, useDataListMap, useMapConfig,
│                   useDebouncedValue, useMediaQuery
├── layouts/        PublicLayout, GuestLayout, UserLayout, AdminLayout
├── contexts/       AuthContext
├── utils/          mapHelpers, mapStatuses, mapTile, mapStyles, mapModes, tileProviders,
│                   tileProviderCatalog, formatNumber, dataListCache, dataListLabel, provinceData
├── App.jsx         routes (pages import eager, chưa lazy)
└── main.jsx        entry point
```

### Backend
```
backend/src/
├── app.js              entry point + middleware stack
├── config/             swagger.js
├── middlewares/        auth.js (JWT), rateLimits.js, validators.js
├── routes/             auth, stations, proposals, myProposals, adminProposals, adminUsers,
│                       dashboard, excel, mapUtils, mapConfigs, tiles, geocode, adminGeocodeConfig,
│                       fieldDefinitions, forms, formFields, views, viewFields, dynamicEngine,
│                       files, dataLists, dataListsPublic, formulas, apiConfigs, fieldMappings,
│                       queueLogs, proposalActivity, webhooks, externalUsers, oneOfficeSync, notifications,
│                       helpPublic, adminHelp, adminHelpVideos, assistant
├── controllers/        (matching routes)
├── services/           auth, station, proposal, myProposal, adminProposal, adminUser, dashboard,
│                       map, mapConfig, proximity, fieldDefinition, form, formField, view,
│                       viewField, dynamicEngine, dynamicUtils, file, fileSync, excel, dataList,
│                       formula, apiConfig, fieldMapper, fieldMapping, oneOffice, sync,
│                       personnelSync, externalUser, externalEvent, proposalLifecycle, proposalActivity,
│                       notification, template, addressEnrichment,
│                       geocode, queue, help, knowledge, assistantService + assistant/{provider,gemini,openrouter,router}
├── workers/            queueWorker (push/pull), personnelSyncWorker (cron nhân sự), proposalLifecycleWorker (auto CANCELLED/tạo trạm)
└── utils/              db.js (MySQL pool), ttlCache.js, cronMatcher.js
```

## 7. API Conventions

- All routes start with `/api`
- Auth: JWT Bearer token (hỗ trợ `?token=` cho file/img)
- Response: `{ success, data, message, pagination? }`
- Validation trên backend (`middlewares/validators.js`)
- Body size limit 10MB
- Env chính (`.env.example`): `TZ=Asia/Ho_Chi_Minh`, `JWT_SECRET`/`JWT_EXPIRES_IN=12h`, `CORS_ORIGINS`, `BASE_URL`, `FRONTEND_URL`, `CAPTCHA_ENABLED`/`TURNSTILE_SECRET_KEY`, `ORPHAN_FILE_TTL_HOURS`, `ENABLE_SWAGGER`, `ONEOFFICE_WEBHOOK_SECRET` (webhook 1Office gọi sang), `VITE_API_URL=/api` (relative, không URL tuyệt đối), `GEMINI_API_KEY`/`GEMINI_MODEL`/`OPENROUTER_API_KEY`/`OPENROUTER_MODEL`/`ASSISTANT_ENABLED` (chatbot hướng dẫn — key để trong `.env` gitignored, compose truyền qua `${...}`)

## 8. Database Rules

- Không lưu mật khẩu plaintext (bcrypt)
- Mọi bảng có PK `id`; `created_at`/`updated_at`; FK nơi phù hợp
- **KHÔNG DROP TABLE rồi CREATE lại**; không modify schema mà không có migration plan
- Schema = file SQL thủ công trong `database/` (đánh số); áp dụng qua `scripts/migrate.sh` có tracking `schema_migrations`; chỉ viết script tiến tới, idempotent
- **DB mới**: dựng bằng datadir + dump chuẩn rồi `mark-all`; không chạy `01-create-tables.sql` tự động

### Database Tables (28 bảng)

| Bảng | Mô tả |
|------|-------|
| `users` | Tài khoản (`role`, `status`, `parent_id`, `external_id`, `token_version`, `custom_data`) |
| `stations` | Trạm sạc |
| `station_proposals` | Đề xuất (+ `reject_reason`, `reviewed_by/at`, `submission_source`, `tracking_code`, sync 1Office) |
| `proposal_sequences` | Sinh mã tuần tự theo prefix |
| `field_definitions` | Định nghĩa trường động (13 types + `user`) |
| `forms` / `form_fields` | Cấu hình form + field (`order_index`, `visible`, `purpose`, `layout_config`, `is_locked`, `is_default`) |
| `views` / `view_fields` | Cấu hình bảng + cột (`width`, `sortable`, `filterable`, `usage`, `is_locked`) |
| `files` | File uploaded (`storage_key`, `uploaded_by`, `submitter_ip`) |
| `data_lists` / `data_list_rows` | Danh mục dùng chung (`columns_config` / `data` JSON) |
| `map_configs` | Tile provider, center, zoom, renderer/tile_mode/retina |
| `geocode_configs` | Cấu hình reverse geocoding |
| `geocode_cache` | Cache reverse geocode (lat_key/lng_key → JSON) |
| `user_external_map` | Map user nội bộ ↔ ID hệ ngoài |
| `external_users` | Nhân sự 1Office (pull) — nguồn dropdown "Mã NS - Tên" |
| `notifications` | Thông báo trong app (chuông header) |
| `api_configs` | Cấu hình API ngoài (`system_key`, `api_type`, `auth_config`, `sync_*`) |
| `api_field_mappings` | Mapping field app ↔ 1Office (unique `target_field`) |
| `api_queue_logs` | Queue push/pull + inbound webhook + audit log |
| `proposal_activity_logs` | Log hoạt động đề xuất (created/updated/status_change/denied/station_created/auto_failed) |
| `proposal_lifecycle_configs` | Config auto vòng đời (90/30 ngày, max retries, cron) |
| `help_categories` / `help_articles` | Hướng dẫn (TIP `/admin/help`): bài viết TipTap (`content_json`/`content_html`), `videos`/`images` JSON, `roles`, `status` draft/published/archived, FULLTEXT tìm kiếm (migration `104`) |
| `assistant_logs` | Log chatbot hướng dẫn (`question`, `answer`, `sources`, `provider`, `latency_ms`, `fallback_reason`, `user_id`) — migration `104` |
| `assistant_knowledge` | Kho tri thức tài liệu nội bộ (`source_path`, `heading`, `content`, FULLTEXT) — index từ `AGENTS.md`+`docs/**/*.md`, migration `105` |
| `schema_migrations` | Tracking migration đã chạy |

Migrations nằm ở `database/` (01→105). Một số mốc quan trọng: Một số mốc quan trọng: `14` display_format/unit, `45–48` external user, `49` review fields, `50` notifications, `53` map renderer/tile_mode/retina, `54–55` geocode, `56` performance indexes, `59–64` chuẩn hóa field/form/view 3 entity + khóa field, `70` trạng thái trạm + mô hình + loại ưu tiên, `71` required single-source (kế hoạch 40), `72` loại ưu tiên cho proposals, `73` nhãn trạng thái proposal tiếng Việt, `74` options vùng miền, `75` Loại đất → select 6 lựa chọn, `76` mô hình `NQ_LK` + tab lồng form đề xuất, `77` role `NPP`, `78` metadata form/view (`usage`/`is_locked`/`is_default`), `79` seed 6 view Excel (`excel_full`/`excel_basic`), `80` desc template 1Office section lồng NQ_LK, `81` sửa off-by-one row tab của 76, `82` gộp 4 chi phí Liên kết thành table `chi_phi_lk` + datalist `dm_chi_phi_lk`, `83` form "Tạo nhanh" (`purpose='create'`, `is_default=0`, 7 field), `84` required ô bảng `chi_phi_lk`, `85` fix orphan form NQ, `86` vòng đời đề xuất (ENUM 7 + `station_id` + field trạm vùng miền + `mo_hinh_tram.NQ_LK`), `87` config vòng đời, `88` activity log + inbound, `90` options phòng ban/chức vụ users, `91` mode gán `area/center_director`, `92` gắn 2 field người vào form 14, `94` status `ARCHIVED` (Đã lưu trữ: ENUM 8, option tím + legend, ma trận REVIEWING→ARCHIVED→CONTRACT_SIGNED/CANCELLED), `104` hệ thống hướng dẫn mới (`help_categories`/`help_articles`/`assistant_logs` + FULLTEXT), `105` kho tri thức tài liệu (`assistant_knowledge` + FULLTEXT).

## 9. Swagger & Documentation

- Swagger UI: `http://localhost:3000/api-docs`; JSON: `/api-docs.json`
- Thêm endpoint mới → phải thêm `@swagger` JSDoc trong route file
- Docs folder:
  - `docs/0/` — Backup, tổng quan dự án ban đầu
  - `docs/1/` — Kế hoạch, đề xuất
  - `docs/2/` — Tài liệu tổng hợp (backend-features, field-configuration, ui-ux-features, bảo mật, swagger, tích hợp 1Office)
  - `docs/3/` — Bug fixes
  - `docs/4/` — Thiết kế tính năng (Formula Pre/Post, Excel theo View, Cascading Select, Dynamic Form/View)
   - `docs/5/` — Kế hoạch & triển khai các mốc lớn (tìm kiếm, stress test, guest form, RBAC, 1Office, bản đồ, reverse geocode, MapLibre 35–36, self-host PMTiles 37)
   - `docs/8/` — Kế hoạch 46 (quy chuẩn luồng trạng thái đề xuất 7 status + audit log hoạt động + webhook 1Office + worker vòng đời), 47 (nhân sự: role/cây 2 tầng, luật gán GĐKV/GĐTT, phân quyền 5 nhóm, kiểu cây phòng ban), 48–52 (webhook, ARCHIVED, cải tiến đề xuất, map/popup, nginx prod), **53 (hệ thống hướng dẫn mới: viewer DB + `/admin/help` + video + chatbot)**, **54 (nâng cấp chatbot: markdown/nguồn có ảnh, nút chat toàn cục, kho tri thức tài liệu, tối ưu Vite + fix lazy-load vỡ layout)**  - `docs/6/` — Hướng dẫn deploy và cập nhật VPS
  - `docs/7/` — Review toàn mã nguồn (P0/P1/P2 + chuẩn hóa UIUX + kế hoạch test frontend). Nguồn chính xác nhất về bug đã/chưa fix.

## 10. Docker & Deploy

- Compose dev: `docker-compose.yml`; prod: `docker-compose.simple.yml`; phpMyAdmin: `docker-compose.pma.yml`
- Services: Frontend `:5173`, Backend `:3000`, MySQL `:3306`
- Source code mount volumes (hot reload). **KHÔNG** xóa source volumes; **KHÔNG** `docker compose down -v` trừ khi được yêu cầu
- Named volume: `frontend_node_modules`, `backend_node_modules`. Cài package mới: `docker exec station-frontend npm install <pkg>` rồi rebuild
- **Bắt buộc `TZ=Asia/Ho_Chi_Minh`** cho `backend` + `mysql` (cả dev lẫn prod); `app.js` cũng set mặc định. Kiểm tra: `docker exec station-backend date` phải hiện `+07`
- Scripts: `deploy.sh` (deploy 1 lệnh), `update.sh` (cập nhật VPS), `scripts/migrate.sh`, `scripts/sync-data.sh`

## 11. Dynamic System Architecture

### Field Types
- 13 types chuẩn + `user`. Config riêng theo type: `number_format`, `decimal_places`, `display_format`, `unit`, `date_format`, `file_config`, `formula_config`, `option_style`, `source_config`
- Lưu ở `field_definitions`; code còn xử lý `password`/`table` (legacy, xem `docs/7/04`)
- **Table**: `source_config.columns[]` đặt `required: true` cho từng cột → FE (`DynamicForm.validate`) + BE (`dynamicUtils.validateField`) chặn ô rỗng (`"<label>: dòng N thiếu <cột>"`). Chỉ bảng có cột `required` mới bị chặn (hiện: `chi_phi_lk` — migration 84).

### User Field (type `user`)
- Lưu `{ id }`; hiển thị chip tên, click xem chi tiết (CTV ẩn)
- `source_config.auto_user`: `current_user` | `parent_sales` | `owner_or_manager`
- BE: `dynamicUtils.applyAutoUserFields` (create/update proposal). FE: `DynamicForm.resolveAutoUserId`

### Form/View Builder
- Tạo Forms/Views tại `/admin/forms`, `/admin/views`
- **`DynamicForm` resolve form theo `purpose`** (`getByEntityAndPurpose`, `ORDER BY is_default DESC, id ASC`); **`formId` được truyền thì THẮNG `purpose`** (migration 78/83 — dùng cho nút "Tạo nhanh"). `DynamicForm` có form `all`/`create`/`view` nên hardcode `formId` dễ trỏ nhầm → ưu tiên `purpose` khi không có `formId`
- **Nhiều bản form/view cho 1 entity** (migration 78): `views.usage` = `table` | `excel_full` | `excel_basic`; `views.is_locked` / `forms.is_locked` = 1 → **chặn xóa** (vẫn sửa + đổi `status`); `forms.is_default` = form dùng khi resolve theo `purpose`. UI `/admin/views` + `/admin/forms` liệt kê **tất cả** bản, có badge `usage`/`Mặc định`/`Khóa`, select `usage`, toggle `status`, disable nút Xóa khi `is_locked`
- **Nút "Tạo nhanh"** (`AdminProposalsPage` + `MyProposalsPage`): mở form `purpose='create'` & `is_default=0` (migration 83, 7 field) và gửi `POST /api/proposals?formId=<id>`; BE whitelist `formId` (đúng entity + `status='active'`, sai → dùng form mặc định, không 500)
- FormBuilder: drag & drop fields, visibility + colSpan; section có nút ▲▼ di chuyển + điều kiện hiển thị (`section.visibleWhen = { field, value }` trong `layout_config`)
- ViewBuilder: drag & drop columns, visibility + width + sortable + filterable
- **Bỏ hardcode `VIEW_ID`**: hook `useDefaultViewId(entity, fallbackId)` tra view `usage='table' & status='active'` (cache module-level + fallback hằng số) cho `AdminProposalsPage`/`AdminStationsPage`/`AdminUsersPage`/`MyProposalsPage`

### Tab lồng trong layout (`layout_config.type:'tabs'`) — migration 76
- `layout_config.sections[]` có 2 loại phần tử: section thường (`rows`) và **tab-group** (`type:'tabs'`, `tabs[]`, bắt buộc `rows: []`).
- Mỗi tab con `{id, title, sectionRefs:[sectionId]}` **tham chiếu** section có sẵn (không nhân bản field). Section được ref: **bỏ qua `visibleWhen` riêng** (tab cha là cổng duy nhất).
- Luật **"visible thắng"**: row hiển thị nếu tồn tại ≥1 nơi chứa nó đang hiển thị (chống bỏ qua `required` — R2). Engine render/validate/desc viết **đệ quy N cấp** (`MAX_TAB_DEPTH=5`, chống vòng bằng `visited/pathSet`).
- FormBuilder UI chỉ tạo **2 cấp** (chặn tạo tab trong tab con); mọi chỗ duyệt section phải guard `(section.rows || [])`.
- Render: `DynamicForm.renderTabGroup` (tab thật, `activeTabs` key theo path, render mọi tab + `display:none`), `RecordDetailPopup.renderTabGroup` (tab thật ở popup view/edit, `getLayoutSections` trả `{sections,sectionMap,cellMap}`), `templateService.renderSection` (desc 1Office section cha có `sections[]`).
- Seed form 13/14: tab-group `tai_chinh_nqlk` (`visibleWhen mo_hinh_dau_tu=NQ_LK`) ref `s6` (NQ) / `s5` (LK); field mới `chinh_sach_nq`/`loai_tru_nq`/`chinh_sach_lk`/`loai_tru_lk`/`dat_coc`/`ghi_chu_dat_coc`/`tong_chi_phi` + 1 field **table** `chi_phi_lk` (cột `loai_chi_phi` chọn từ datalist `dm_chi_phi_lk`, cột `so_tien` tự điền `gia` khi chọn loại) — mỗi field `conditions: mo_hinh_dau_tu = NQ_LK`. 4 field chi phí số cũ (`chi_phi_van_chuyen/tram_bien_ap/ha_tang/thue_vi_tri`) đã chuyển `status='inactive'` (migration 82).

### Select/Multiselect Data Sources
- **Manual options**: `[{label, value, color, borderRadius}]`
- **Data List**: `data_list_id` + `data_list_column`
- **Cascading**: child field `parent_field` + `relation_key`; API `GET /api/data-lists/:id/children?column&parent_column&parent_value`
- FE transform flat rows → tree map `{tree, unique}` cho O(1) lookup; `useFieldOptions` đọc data-list (manual ưu tiên)

### Formula System
- **Pre-compute**: tính trong form trước submit. **Post-compute**: sau INSERT/UPDATE, dùng metadata (id, entity, base_url, created_at)
- Config: `formula_config = { compute_mode, expression, referencedFields, outputType, outputFormat, decimalPlaces, unit }`
- Pre dùng mathjs v15.2.0; post metadata `user_name/user_role/sales_name` theo người tạo (`record.user_id`); scope nạp `''` cho field thiếu
- So sánh chuỗi dùng `equalText(a,b)` hoặc `compareText(a,b) == 0` (mathjs không hỗ trợ `==` với chuỗi)
- Sinh mã tuần tự: hàm `SEQ`/`setSeq` qua bảng `proposal_sequences`; `formulaService.reconcileSequences`/`parseCodeToSeq` đồng bộ sau import
- Recompute hàng loạt: `backend/scripts/recomputeFormulas.js` (exclude `ma_de_xuat`)
- 26+ hàm custom: ROUNDUP, ROUNDDOWN, MOD, IF, AND, OR, NOT, IFERROR, COUNT, COUNTA, COUNTIF, SUMIF, AVERAGE, CONCAT, LEN, LEFT, RIGHT, UPPER, LOWER, TRIM, DATE, TODAY, LPAD, RPAD, YEAR, MONTH, DAY, NOW, SEQ...

### Formula Visual Editor
- `FormulaEditor.jsx`: compute mode selector, field/operator/function buttons, autocomplete tại cursor (keyboard nav), output config (numberFormat/comma/dot/space, decimalPlaces, unit)
- API: `POST /api/formulas/validate`, `POST /api/formulas/preview`

### Number Formatting
- `frontend/src/utils/formatNumber.js`: `formatNumber(value, {format, decimalPlaces, unit})`, `parseFormattedNumber(str)`
- 4 formats: `plain` (1000), `comma` (1,000), `dot` (1.000), `space` (1 000)
- Áp dụng: FieldRenderer, FormulaEditor output, DynamicForm computeFormula, DataListEditor

### File Management
- Upload `POST /api/files/upload` (multer disk, 10MB); download `/files/:id/download` (auth-aware, Content-Disposition UTF-8, hỗ trợ `Range` → 206 để tua video)
- Video hướng dẫn nội bộ: `POST /api/admin/help/videos` (multer riêng **200MB**, mp4/webm/mov, subdir `help-videos/`, SUPER_ADMIN). Quyền tải video theo `roles` của bài viết chứa `file_id` (mở rộng `fileController.canAccessFile`)
- Types: image, video, audio, pdf, word (.docx → HTML via mammoth), excel (.xlsx → table via xlsx), text
- Viewer: zoom ảnh, play video/audio, render PDF/Word/Excel inline

### Excel Import/Export
- **Template/Export/Import theo view** (migration 79): `GET /admin/excel/template` + `/export/{entity}` nhận `viewId` | `viewIds` (phân tách dấu phẩy → **1 file nhiều sheet**) | `usage` (`table`|`excel_full`|`excel_basic`); không truyền → view `usage='table'` (giữ hành vi cũ). `excel_basic` = **chỉ cột trong view**; `table`/`excel_full` = cột view + nối các field còn lại. `viewService.resolveView` nội bộ `excelService`
- **Tên file** do backend đặt qua `Content-Disposition` (`buildFileName`): Template `template_<entity>_<usage>.xlsx` (nhiều view → `_all`); Export `<YYYYMMDD_HHmmss>_export_<entity>_<usage>.xlsx`; xuất trùng `<stamp>_duplicates_export.xlsx`; Data List `<stamp>_<tên>.xlsx`
- **FE tải file**: `excelService.downloadBlob` **fetch để kiểm tra** (chặn response non-Excel → báo lỗi rõ thay vì lưu file hỏng) rồi **tải qua URL kèm `?token=`** để browser dùng `Content-Disposition` (tránh blob + `revokeObjectURL` làm mất tên file → Chrome sinh tên UUID không đuôi). POST (xuất trùng) vẫn dùng blob nhưng revoke sau 30s
- **Nhận diện bộ cột tự động** khi import (`importPreviewDynamic`): Dice `score = 2·matched/(|view|+|file|)`, `confident = coverage ≥ 0.5`, trả `detection` (`detectedViewId/usage/score/candidates/unmatchedFileColumns/omittedFields`); FE cho **override** + cảnh báo vàng "cột bị bỏ qua"/"thiếu trường để trống", đỏ khi không nhận diện được
- **Import "một số trường"**: `validateHeaders` chỉ đòi `REQUIRED_HEADERS` (`station_proposals: latitude, longitude`; `stations: name, latitude, longitude`; `users: full_name, email`) + phải khớp ≥1 cột; `parseExcelRow` chỉ áp `required` cho **cột có trong file**. Nhánh Data List giữ chế độ chặt (đòi đủ cột)
- Export ExcelJS → .xlsx; Import: Preview → Validate → Confirm (transaction, all-or-nothing, re-validate lại khi confirm)
- Nút **Template/Export** ở 3 trang quản trị là **dropdown chọn bộ cột** (`ViewPickerMenu`); modal Import có select "Bộ cột" + banner nhận diện (`ImportViewPanel`)

## 12. 1Office Integration

- **Content-Type**: `application/x-www-form-urlencoded; charset=UTF-8` (thiếu charset gây mojibake tiếng Việt bên 1Office); **Auth**: `access_token` query param
- **9/14 source types hoạt động**: text, textarea, number, email, phone, date, select, boolean, file
- **5/14 chuyển text**: url, multiselect, datetime, formula, table
- 1Office select fields dùng ID (formal_name, scale_id); `cf2` dùng label ("VIP", "VVIP")
- **`user_ids`/`manager_user_ids` nhận CODE/TÊN, KHÔNG nhận ID**: string comma (vd `'NV06,NV08,Nguyễn Văn C'`). `user_external_map.external_id` lưu `personnel_id`. Push quy đổi `personnel_id` → `code` (ưu tiên) hoặc `fullname`; pull `field_raws=user_ids,manager_user_ids` trả `ID` liên hệ → quy đổi `ID` → `personnel_id`. Cần `admin_token` trong `api_configs.auth_config`. 3 ID khác nhau: `ID` (contact), `personnel_id`, `code`. Chỉ nhận người CÓ tài khoản 1Office (app gắn `warnings`; `UserExternalPanel` disable người `contact_id` rỗng)
- **File đính kèm**: field `files` = JSON string `[{name,file}]` trong body `contact/insert|update`; KHÔNG endpoint upload riêng; gửi tất cả file 1 request; `update` append (chỉ gửi file mới); tên file bỏ đuôi
- **Mapping đặc biệt**: `desc` (nguồn Desc Template, render lại tươi mỗi lần push + tự strip HTML cũ trong Mô tả chống lồng desc, cố định) + `files` luôn link sẵn; `api_field_mappings` unique `target_field` (1 nguồn → nhiều đích, 1 đích ← 1 nguồn). **`desc`/`files` KHÔNG dùng làm nguồn pull** (`syncService` tự loại) tránh desc lặp
- **Non-working fields**: gender, group_type_id, trade_ids, websites, status_id, source_id, region (khóa kéo–thả)
- **Non-working arrays**: contacts[] không parse; detail[] chỉ lưu department_id
- **Desc field HTML**: INSERT lưu HTML, GET strip → plain text, Web UI render HTML
- **FieldMappingPanel**: Contact Fields sửa Label + Ghi chú (nút bút chì) → `api_configs.field_metadata`; `getFieldTypes` ưu tiên `saved.label`; special `desc`/`files` không sửa. Proposal Fields chia Đã link / Chưa link, có tìm kiếm
- **Code**: `backend/src/services/fieldMapper.js` (ONE_OFFICE_FIELDS), `frontend/src/components/admin/FieldMappingPanel.jsx` (SOURCE_TYPES_FORCE_TEXT)
- **Phân loại config**: `api_configs.api_type` = `contact` | `personnel` (cùng `system_key='1office'`)
- **API nhân sự (personnel)**: chỉ **pull** — `personnelSyncService.syncFrom1Office` gọi `/api/personnel/profile/gets` (cần **token riêng cho object `personnel/profile`**; token khác → `"accesstoken not of object"`) → upsert `external_users`. Map: `ID`→`external_id`, `raw_user_id`→`contact_id`, `code`→`code`, `name`→`fullname`, `department_id`→`department_name`; bỏ header `code='STT'`. Sync tay `POST /api/admin/api-configs/:id/sync-personnel` + cron (`sync_cron`, `sync_enabled`, tick 20s qua `cronMatcher.js` + `personnelSyncWorker.js`, KHÔNG dùng node-cron v4)
- **Push/pull user dùng `external_users`** (không gọi API lúc push): `fieldMapper.getExternalUserMaps` (cache 30s), fallback API khi bảng trống. Dropdown `GET /api/admin/external-users`

## 13. Performance Optimizations

### Đã áp dụng
- **Route-level code splitting**: 21 page dùng `React.lazy` trong `App.jsx`; mỗi layout bọc `<Suspense fallback={<RouteFallback/>}>` **quanh `<Outlet />`** (KHÔNG bọc ngoài `<Routes>` — sẽ làm header/taskbar unmount khi tải chunk)
- **`vite.config.js` manualChunks** tách vendor (`react-vendor`/`leaflet`/`icons`/`mathjs`/`xlsx`/`mammoth`/`excel-io`); khớp chính xác `/node_modules/<pkg>/` (regex rộng kiểu `/react/` bắt nhầm `@tiptap/react`). Kết quả: entry 2.897 kB → **53 kB**; preload đầu chỉ `index + react-vendor + icons`; không còn cảnh báo bundle
- **`server.watch.ignored`** loại `public/pmtiles/**` + `*.pmtiles` (file 313MB) → tránh `[vite] page reload` mỗi lần file đổi/di chuyển; `optimizeDeps.include` dep nặng → hết `Re-optimizing dependencies` khi mở lazy page lần đầu
- Module-level caching `useFieldOptions`; `dataListCache.js` cache + dedupe in-flight; build tree O(n) bằng Set
- `useCallback`/`useMemo` cho load functions, filteredData, sortedData, parentFieldMap
- `React.lazy` + `Suspense` cho FileListPopup trong FieldRenderer
- Cancelled flag pattern; Object URL cleanup on unmount
- `Cache-Control: no-store` (Vite dev); manual chunks leaflet (`vite.config.js`); `maplibre-gl` lazy-load (dynamic import, chunk riêng ~1MB)
- Server-side TTL cache (`utils/ttlCache.js`) cho `getFieldDefinitionsByEntity`/`getFormConfig`/`getViewConfig`/`dataListService.getById` + xóa cache khi ghi (middleware `app.js`)
- Dedupe client: `dedupGet`/`dedupGetWithAuth` trong `services/api.js` (chống StrictMode)
- Nén `compression` (data list ~528KB → ~42KB brotli)
- Index migration 56 (`station_proposals(user_id,created_at)/(status,created_at)`, `stations(created_at)`, `data_list_rows(list_id,sort_order)`)
- Debounce search `hooks/useDebouncedValue.js` ở các trang danh sách
- Map endpoint: `GET /stations` không `limit` chỉ trả marker fields + `loai_uu_tien`/`mo_hinh_tram` (JSON_EXTRACT, bỏ merge `custom_data`); proposals cap 20000 + `mo_hinh_dau_tu`/`loai_uu_tien`

### Chưa có (cơ hội cải thiện)
- API response caching (không SWR/ETag)
- Context value memoization (`AuthProvider`)
- Skeleton loading states
- Hợp nhất 2 validator động (`dynamicUtils.validateField` vs `validators.validateDynamicFields`) — xem `docs/7/04`

## 14. Testing

Sau khi đổi code:
1. Frontend build (`npm run build` trong `frontend/`)
2. Backend khởi động không lỗi
3. Docker containers chạy
4. Verify thủ công feature + feature cũ
5. Swagger UI load đúng

### Playwright E2E (root)
```powershell
npm run test:e2e          # playwright test e2e/FE-01-smoke.spec.js
npm run test:e2e:headed
```
- Config `playwright.config.js`: `testDir=./e2e`, `baseURL=http://localhost:5173`, project chromium

### Playwright host (frontend)
- Test tại `frontend/test-*.cjs` (dùng `.cjs` vì package.json `"type":"module"`); chạy `node test-1office.cjs` từ `frontend/`
- `chromium.launch({ headless: true })`; login bằng `page.request.post(API + '/api/auth/login', ...)` → lưu token localStorage
- Sau mỗi hành động: `waitForLoadState('networkidle')` + `waitForTimeout(1000-2000)`
- Selectors: `button:has-text("Text")`, `span.font-medium`, `input[placeholder*="..."]`; KHÔNG dùng `text=...` trong `page.$()`
- Results lưu `test-1office-results.json`

```javascript
const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const res = await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } });
  const { data } = await res.json();
  await page.goto(`${BASE}/admin/api-configs`);
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);
  await page.reload();
  await page.waitForLoadState('networkidle');
  console.log('Mapping button:', (await page.$('button:has-text("Mapping")')) ? 'PASS' : 'FAIL');
  await browser.close();
}
main();
```

## 15. PowerShell UTF-8 Encoding

PowerShell 5.1 (Windows) mặc định Windows-1252 → tiếng Việt sai (mojibake). MUST set UTF-8 trước mọi command:
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```
Khi `docker exec` mysql thêm `--default-character-set=utf8mb4`:
```powershell
docker exec station-mysql mysql -u root -ppassword station_management --default-character-set=utf8mb4 -e "QUERY"
```
**KHÔNG dùng `Get-Content`/`Set-Content` của PowerShell để sửa file source** (double-encoding → mojibake). Luôn dùng công cụ `Edit`/`Write` (UTF-8). Nếu buộc phải thao tác file: `[System.IO.File]::ReadAllText/WriteAllText` với `[System.Text.UTF8Encoding]::new($false)`.

## 16. Known Issues

- Xem `docs/7/` (review toàn mã nguồn, cập nhật 10/09/2026): P0 đã fix hết; P1 đã fix; một số P2/P3 còn lại (validator động trùng, select import chưa validate, Swagger lệch role, `AdminMapConfigPage` dùng relative URL...)
- `AGENTS.md` mô tả 13 types nhưng code có thêm `user`/`password`/`table` — `table` chưa có cột DB tương ứng
- MapLibre + 4 mode + self-host PMTiles đã triển khai (kế hoạch 36, Phase 1–8). File `frontend/public/pmtiles/vietnam.pmtiles` (~299MB) **không commit** — cần build lại theo `docs/5/37`. Glyphs nhãn đang dùng remote OpenFreeMap; self-host offline hoàn toàn cần thêm glyphs.
- `/de-xuat` (guest) gọi `/api/field-definitions` bị **401 → redirect `/login`** ⇒ form đề xuất cho khách chưa đăng nhập bị chặn (cần nhường endpoint public). Phát hiện khi làm `docs/5/41`.
- Trang hướng dẫn đã chuyển nguồn sang DB (migration 104, kế hoạch 53). **Cố ý giữ fallback `guideData.*.js`** cho trường hợp API help lỗi (bundle +~50KB); muốn gỡ hẳn thì đổi `apiMode ? apiSections : legacySections` → `apiMode ? apiSections : []` ở `HelpPage.jsx` rồi bỏ import `GUIDE`/`resolveFlowStep`.
- Chatbot hướng dẫn **không dùng Ollama** (máy dev/VPS nhỏ không đủ RAM cho model 7B). Provider: Gemini chính + OpenRouter dự phòng (`OPENROUTER_MODEL` nhận danh sách model free, thử lần lượt — xem `docs/8/54`). Video hướng dẫn nội bộ giới hạn **200MB** (route riêng `POST /api/admin/help/videos`); cần thêm thì làm tus resumable (nấc 2).

## 17. Definition of Done

- [ ] Feature works end-to-end
- [ ] Frontend không lỗi runtime
- [ ] Backend API trả đúng
- [ ] Authorization được enforce
- [ ] Không phá feature cũ
- [ ] Docker hot reload vẫn chạy
- [ ] Không console error

## 18. Công cụ hỗ trợ: codebase-memory-mcp (MCP)

Đã cài **toàn cục** cho opencode (mọi dự án) — dùng để tra cứu cấu trúc code bằng knowledge graph (SQLite) thay vì grep/đọc file nhiều lần.

**Cài đặt (không cần làm lại)**
- Binary: `C:\Users\ADMIN\.local\bin\codebase-memory-mcp.exe` (v0.10.8), đã có trong PATH user
- Cache: `C:\Users\ADMIN\.cbm-cache` — **bắt buộc** vì mặc định `~/.cache/codebase-memory-mcp` nằm trên junction `→ F:\Moved` (DACL cấp quyền cho `Authenticated Users` → CBM từ chối vì lý do bảo mật)
- Env user `CBM_CACHE_DIR` đã set; entry MCP khai báo trong `~/.config/opencode/opencode.json` (`mcp.codebase-memory-mcp`, kèm `environment.CBM_CACHE_DIR`)
- Cài bằng `--skip-config` ⇒ **chỉ có MCP tools**, KHÔNG có skill/agents/plugin của CBM
- ⚠️ Chạy CLI ở shell không có `CBM_CACHE_DIR` sẽ lỗi `cache-private` → luôn set biến trước

```powershell
$env:CBM_CACHE_DIR = "C:\Users\ADMIN\.cbm-cache"
$exe = "$env:USERPROFILE\.local\bin\codebase-memory-mcp.exe"
& $exe cli index_repository --repo-path "<duong/dan/repo>" --mode moderate   # index lại khi code đổi nhiều
& $exe cli index_status
'{"name_pattern":".*AutoUser.*"}' | & $exe cli search_graph
```

**15 tool**: `index_repository`, `list_projects`, `delete_project`, `index_status`, `check_index_coverage`, `get_architecture`, `search_graph`, `search_code`, `trace_path`, `query_graph`, `get_code_snippet`, `get_graph_schema`, `detect_changes`, `manage_adr`, `ingest_traces`.

**Phạm vi hoạt động trên repo này** (index 15/09/2026: 2.423 nodes / 6.152 edges, ~5s)

| Dùng tốt | Ghi chú |
|---|---|
| `get_architecture` | 220 Route, hotspot (`useAuth` fan_in=42), 12 cluster (map renderers, DynamicForm, FormBuilder…) |
| `HTTP_CALLS` (111 edge) | Liên kết frontend → backend route: `delete` → `/stations/:id`, `/admin/proposals/:id`… |
| `search_graph` / `trace_path` cho **frontend** | 780 Function node (React component, hook, util) |
| `search_code` | Grep có gắn graph; **dùng cho backend** |
| `index_status` / `check_index_coverage` | Coverage + file `parse_partial` |
| `detect_changes` | Blast radius theo git diff (theo file) |

| Hạn chế (đã đo) | Chi tiết |
|---|---|
| **Backend mất ~377 hàm** | Extractor KHÔNG tạo Function node cho `exports.X = async () => {}` / `exports.X = function(){}` — backend dùng CommonJS pattern này gần như 100%. Chỉ còn **172** Function node backend (từ `function X()` / `const X = () =>`) |
| `search_graph("pushTo1Office")` | → **0 kết quả** (cùng `getMissingPushUserFieldLabels`, `autoPushOnApprove` thì CÓ vì là `async function` khai báo thường) |
| `trace_path` / `query_graph` cho backend | Không có `CALLS` edge với hàm `exports.X` |
| `database/*.sql`, `docs/`, `scripts/`, `frontend/public/`, `e2e/`, `tests/` | Không index (by design hoặc skip-list); 52 file `parse_partial` (hầu hết SQL) |

**Quy ước dùng (không sửa mã nguồn chỉ để phục vụ tool)**
1. Backend: tìm symbol / ai gọi ai → dùng `search_code` (grep) như trước, **đừng** dựa `search_graph`/`trace_path`.
2. Frontend: ưu tiên `search_graph` + `trace_path` (thay grep nhiều lần).
3. Câu hỏi kiến trúc / route / liên kết FE↔BE → `get_architecture` + `HTTP_CALLS`.
4. Trước commit/sửa nhiều file → `detect_changes` để xem blast radius.
5. Kết luận "không tồn tại code X" phải kiểm `check_index_coverage` trước, và grep lại file trong danh sách `parse_partial`.
6. Index lại khi code đổi nhiều; bật tự động: `& $exe config set auto_index true`.
