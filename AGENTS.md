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
/docs        Tài liệu theo mốc (0–7)
Swagger UI:  http://localhost:3000/api-docs
```

## 3. Business Entities

### User
- Roles: `SUPER_ADMIN`, `ADMIN`, `SALES`, `CTV` (file 25, thay `USER`/`ADMIN` cũ)
- `CTV.parent_id` trỏ `SALES` quản lý; `external_id` map hệ ngoài (unique)
- `token_version` tăng khi đổi mật khẩu → revoke JWT cũ
- Status: `ACTIVE`, `LOCKED`

### Station (trạm đã có thật)
- Status: `PLANNING`, `ACTIVE`, `DEPLOYING`, `REJECTED` (`REJECTED` của trạm **tách biệt** `REJECTED` của proposal)
- `mo_hinh_tram`: select TDT/LK/NQ (label đầy đủ, value viết tắt)
- `loai_uu_tien`: formula post — TDT→1 (Cấp 1), LK/NQ/trống→2 (Cấp 2)

### Station Proposal (đề xuất trạm mới)
- Status: `PENDING`, `REVIEWING`, `APPROVED`, `REJECTED`
- `loai_uu_tien`: formula post theo `mo_hinh_dau_tu` — TDT→1, LK/NQ/trống→2
- `submission_source`: `user` | `guest`; `tracking_code`, `submitter_ip`
- Sync 1Office: `contact_1office_id`, `contact_1office_code`, `sync_status`, `last_synced_at`, `last_synced_data`
- `ma_de_xuat_gen` là cột generated từ `custom_data`

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
2. SUPER_ADMIN/ADMIN quản lý tất cả proposals và stations
3. CTV KHÔNG truy cập admin API (`/admin/*`); SALES chỉ vào 4 trang `/admin`, `/admin/users`, `/admin/stations`, `/admin/proposals`
4. Chỉ `SUPER_ADMIN` vào trang cấu hình: `/admin/fields`, `/admin/forms`, `/admin/views`, `/admin/data-lists`, `/admin/map-config`, `/admin/roles`, `/admin/api-configs` + tạo super admin
5. SALES chỉ xem trạm (không nút Sửa) dùng `allowEdit={!isSales}` trong `RecordDetailPopup`
6. SALES đổi trạng thái proposal qua `PUT /admin/proposals/:id/status`; `PUT /admin/proposals/:id` là `requireAdmin`
7. Route `/admin/audit-log` cho `ADMIN` + `SALES` (sales chỉ thấy log của mình); `/admin/:entity/:id/files` bọc `RoleRoute` ADMIN_AND_SALES (chặn entity `users` với non-admin)
8. Nút Retry/Cancel queue chỉ render cho `SUPER_ADMIN`

### 4.2. Proposal Lifecycle & Notification
- Từ chối đề xuất: **bắt buộc** `reject_reason`; lưu `reviewed_by`, `reviewed_at` (`adminProposalService.updateStatus`)
- Đổi status → tạo `notifications` cho chủ đề xuất (luôn tạo). **5 loại** + màu: `REJECTED` đỏ, `APPROVED` xanh lá, `PENDING` vàng, `REVIEWING` xanh lam, `RESUBMITTED` vàng
- CTV sửa được khi `PENDING`/`REJECTED`; khi `REJECTED` nút lưu đổi thành **"Gửi lại"** → lưu xong reset `REJECTED → PENDING` + notify `RESUBMITTED` cho người đã từ chối (cả `myProposalService` và `adminProposalService.updateProposal`)
- CTV/owner lưu sửa qua `myProposalService` (RecordDetailPopup `updateService`), KHÔNG dùng admin API
- `PUT /my-proposals/:id` gắn `validateUpdateProposal`; `PUT /admin/proposals/:id` merge giá trị cũ khi field vắng (chống ghi NULL)
- Trang `/admin/proposals` có bộ lọc **trạng thái (nhãn tiếng Việt)** + **Loại ưu tiên Cấp 1/Cấp 2** (`GET /admin/proposals?status=&uu_tien=`); options nhãn trạng thái lưu ở `field_definitions.options` (migration 73)

### 4.3. Notification Bell
- `NotificationBell` ở header user + admin (polling 30s + sự kiện `notifications:refresh`; nhấp nháy + badge chưa đọc)
- Dropdown render qua `createPortal` ra `body` (`position:fixed`, `z-index:9999`) tránh `.drawer-side` che
- Badge/list chỉ tính thông báo trong `NOTIFICATION_RETENTION_DAYS` ngày gần nhất (mặc định 7)
- Tab user/SALES: "Của bạn"; admin + ADMIN/SUPER thêm tab "Tất cả" (`GET /api/notifications/all`, requireAdmin, chỉ đọc)
- Click item điều hướng theo `mode` trang: user → `/my-proposals/view=id`, admin → `/admin/proposals/view=id` (không theo role)

### 4.4. Guest Proposal (không cần đăng nhập)
- Form tại `/de-xuat` (`GuestProposalPage`, `GuestLayout`); submit `POST /api/proposals/guest` (`user_id` = NULL)
- CAPTCHA Turnstile **fail-closed**: chỉ bypass khi `CAPTCHA_ENABLED === 'false'`; thiếu token/secret → 400
- Tra cứu `GET /api/proposals/track/:code` (mask SĐT); check trùng công khai `POST /api/proposals/check-nearby-public`
- Rate limit riêng: guest submit 5/h, upload 10/h, track 30/h
- File guest dọn định kỳ qua `ORPHAN_FILE_TTL_HOURS` (mặc định 24h)

### 4.5. Map Marker & Page
- Marker màu theo trạng thái, **phân biệt theo entity** (`getMarkerColor(status, 'station'|'proposal')`; constants `utils/mapStatuses.js`): Station `PLANNING` tím `#a855f7`, `ACTIVE` xanh `#22c55e`, `DEPLOYING` vàng `#eab308`, `REJECTED` đỏ sẫm `#b91c1c`; Proposal `PENDING` cam, `REVIEWING` xanh dương, `APPROVED` xanh lá, `REJECTED` đỏ `#ef4444`
- Popup marker (`MapView`): link "Xem chi tiết" mở `/admin/stations|proposals/view=<id>` cho `SUPER_ADMIN|ADMIN|SALES` (dùng `canOpenAdminRecord`); render bằng thẻ `<a>` thuần (KHÔNG dùng `<Link>` vì popup ngoài React Router context → lỗi `basename`)
- Popup đề xuất gate sở hữu (`canViewProposal`): ADMIN/SUPER luôn xem; SALES chỉ đề xuất của mình (`user_id`) hoặc CTV thuộc nhánh (`owner_parent_id`); ngoài nhánh hiện dòng đỏ. `GET /proposals` trả thêm `user_id`, `owner_parent_id` (backend vẫn chặn thật qua `denyOutsideBranch`)
- Trang `/map` có bộ lọc `MapFilterPanel` (phạm vi "Của tôi"/"Tất cả", ẩn/hiện trạm & đề xuất, chip trạng thái trạm/đề xuất, chip **Loại ưu tiên Cấp 1/Cấp 2** áp cho cả trạm & đề xuất theo `loai_uu_tien`). Desktop = card nổi; mobile (<768px) = bottom sheet
- `MapView` nhận prop `filters`; lọc client-side bằng `useMemo` trước `MapLayerController`. Mặc định `EMPTY_MAP_FILTERS` = hiện tất cả
- `GET /stations` **không `limit`** → trả toàn bộ marker fields (map), kèm `loai_uu_tien`/`mo_hinh_tram` trích từ `custom_data`; có `limit` → phân trang. Proposals cap 20000, kèm `mo_hinh_dau_tu`/`loai_uu_tien`
- `RecordDetailPopup` nút "Xem bản đồ" mở `LocationMapModal` (chỉ khi có tọa độ): tâm tại record, vành nét đứt xoay (`location-point-ring`), bán kính **5/10/20/50 km** (`L.Circle`) + hiện trạm/đề xuất lân cận (`proximityService`)
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

16. **Self-host PMTiles** (provider `maplibre-self-hosted`): `maplibreRuntime` đăng ký protocol `pmtiles`; `loadPmtilesStyle(url)` dùng **style OpenFreeMap liberty** (`frontend/public/pmtiles/liberty-style.json`, 117 layer) và thay `sources.openmaptiles` → `pmtiles://<origin>/...pmtiles` (bỏ `ne2_shaded`) để có đủ nhãn địa danh; fallback style tối giản nếu fetch lỗi. File build từ OSM (Planetiler) đặt ở `frontend/public/pmtiles/vietnam.pmtiles` (gitignore). Hướng dẫn: `docs/5/37`. **3D**: terrain DEM chỉ bật khi zoom ≥ 12, `dem.maxzoom=11`, building `minzoom=14` (tối ưu lag)
17. `/tiles` proxy validate z (0–22) + x/y trong khoảng, whitelist host, không có `?url=`, lỗi trả 502 + `X-Tile-Proxy-Status: fallback` (FE hiện banner). `tile_mode`: `proxy` (mặc định, `/tiles/{z}/{x}/{y}?style=...`) | `direct`
18. Geolocation: log `console.error('[MapView] Geolocation error:')`, user thấy alert. `mountedRef` phải set `true` trong effect (StrictMode chạy 2 lần)
19. MyProposalsPage mini map + `LocationMapModal` dùng chung `MapCanvas` adapter; click mini map → realtime sync lat/lng vào DynamicForm qua `initialData`
20. Admin `/admin/map-config`: chọn renderer/provider/mode, preview dùng đúng renderer (`MapCanvas`), test kết nối vector/raster/PMTiles, lưu `renderer`/`default_mode`/`layers_config` → phát `mapconfig:refresh`
21. **Nhãn hành chính sau sáp nhập** (`frontend/public/vn-provinces-labels.geojson` — 34 tỉnh; `vn-provinces-labels-old.geojson` — 63 tỉnh cũ; `vn-wards-labels.geojson` — 3321 xã; sinh bằng `frontend/scripts/gen-admin-labels.mjs` từ **Open Admin Data** + **viettrace** (CC-BY-4.0)): chọn ở **menu "Chuyển layer" nhóm "Nhãn hành chính"** — `Nhãn mới` (34 tỉnh + 3321 xã) / `Nhãn cũ` (63 tỉnh trước sáp nhập; chưa có xã cũ do thiếu dữ liệu toạ độ) / `Tắt nhãn`. Runtime `setWardLabels(points, show)` — **MapLibre**: source `app-ward-labels` + symbol layer minzoom 11 (tự `setGlyphs` nếu style thiếu, `applyAll` re-add sau đổi style); **Leaflet**: divIcon lọc theo viewport, chỉ zoom ≥ 12, tối đa 400 nhãn (`renderWardLabels`). Hybrid MapLibre bỏ `label_other` (OSM cấp phường/quận) tránh trùng. Mini map/`LocationMapModal`/`AdminMapConfigPage` mặc định tắt (`showWardLabels=false`)

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
- Type `user` lưu `{ id }`; `source_config.auto_user`: `current_user` | `parent_sales` | `owner_or_manager` → tự điền + khóa readonly

### 4.11. Data List
- Data List name unique
- Columns config `[{key,label,type}]`, type = `text` hoặc `number`
- Row data lưu JSON cột `data`
- Delete row → orphaned children set `parent_row_id = NULL`

### 4.12. Security & Rate Limiting
- Mật khẩu bcrypt; JWT 12h (`JWT_EXPIRES_IN`) + `token_version` revoke; FE `api.js` interceptor 401 → xóa token + về `/login`
- `helmet`, CORS theo `CORS_ORIGINS`, body limit 10MB, `compression`, `trust proxy 1`
- **Upload**: allowlist MIME/ext, chặn svg/html/js/exe/php (kể cả double-ext), tên random + ext ép từ MIME, verify chữ ký thật. KHÔNG serve static `/uploads`; tải qua `/files/:id/download|image` có auth + ownership (admin bypass, owner, guest cùng IP). `optionalAuth`/`requireAuth` hỗ trợ `?token=` cho `<img>`
- **Public proposals rút gọn**: `GET /api/proposals` / `:id` chỉ trả `id,latitude,longitude,address,status,created_at` (không PII)
- Rate limit (`middlewares/rateLimits.js`): auth 10–30/ph, admin 60–120/ph, excel 10–30/ph, guest submit 5/h, guest upload 10/h, guest track 30/h, public data 120/ph, geocode 30–60/ph

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
│   │               SyncPanel, GeocodeConfigPanel, PersonnelSyncPanel, UserExternalPanel
│   ├── layout/     AdminHeader, AdminSidebar, UserHeader, UserSidebar, NotificationBell
│   ├── map/        MapCanvas + renderers/ (index registry, leafletRuntime, maplibreRuntime,
│   │               leafletRenderer, maplibreRenderer, README)
│   ├── ui/         Button, Input, Select, Dialog, DataTable, FilterBar, Badge, PageHeader, ...
│   └── (common)    MapView, MapFilterPanel, LocationMapModal, Toast, Pagination, ErrorMessage,
│                   Loading, EmptyState, ConfirmDialog, FormInput, DuplicateCheckPanel, RoleRoute
├── pages/
│   ├── auth/       LoginPage, RegisterPage
│   ├── user/       MapPage, MyProposalsPage, GuestProposalPage, ProfilePage
│   └── admin/      AdminDashboard, AdminUsersPage, AdminStationsPage, AdminProposalsPage,
│                   AdminFieldsPage, AdminFormsPage, AdminFormBuilderPage, AdminViewsPage,
│                   AdminViewBuilderPage, AdminDataListsPage, AdminRecordFilesPage,
│                   AdminMapConfigPage, AdminRolesPage, AdminApiConfigPage, AdminAuditLogPage,
│                   RecordDetailPage
├── services/       api.js (all API calls)
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
│                       queueLogs, externalUsers, oneOfficeSync, notifications
├── controllers/        (matching routes)
├── services/           auth, station, proposal, myProposal, adminProposal, adminUser, dashboard,
│                       map, mapConfig, proximity, fieldDefinition, form, formField, view,
│                       viewField, dynamicEngine, dynamicUtils, file, fileSync, excel, dataList,
│                       formula, apiConfig, fieldMapper, fieldMapping, oneOffice, sync,
│                       personnelSync, externalUser, notification, template, addressEnrichment,
│                       geocode, queue
├── workers/            queueWorker (push/pull), personnelSyncWorker (cron nhân sự)
└── utils/              db.js (MySQL pool), ttlCache.js, cronMatcher.js
```

## 7. API Conventions

- All routes start with `/api`
- Auth: JWT Bearer token (hỗ trợ `?token=` cho file/img)
- Response: `{ success, data, message, pagination? }`
- Validation trên backend (`middlewares/validators.js`)
- Body size limit 10MB
- Env chính (`.env.example`): `TZ=Asia/Ho_Chi_Minh`, `JWT_SECRET`/`JWT_EXPIRES_IN=12h`, `CORS_ORIGINS`, `BASE_URL`, `FRONTEND_URL`, `CAPTCHA_ENABLED`/`TURNSTILE_SECRET_KEY`, `ORPHAN_FILE_TTL_HOURS`, `ENABLE_SWAGGER`, `VITE_API_URL=/api` (relative, không URL tuyệt đối)

## 8. Database Rules

- Không lưu mật khẩu plaintext (bcrypt)
- Mọi bảng có PK `id`; `created_at`/`updated_at`; FK nơi phù hợp
- **KHÔNG DROP TABLE rồi CREATE lại**; không modify schema mà không có migration plan
- Schema = file SQL thủ công trong `database/` (đánh số); áp dụng qua `scripts/migrate.sh` có tracking `schema_migrations`; chỉ viết script tiến tới, idempotent
- **DB mới**: dựng bằng datadir + dump chuẩn rồi `mark-all`; không chạy `01-create-tables.sql` tự động

### Database Tables (22 bảng)

| Bảng | Mô tả |
|------|-------|
| `users` | Tài khoản (`role`, `status`, `parent_id`, `external_id`, `token_version`, `custom_data`) |
| `stations` | Trạm sạc |
| `station_proposals` | Đề xuất (+ `reject_reason`, `reviewed_by/at`, `submission_source`, `tracking_code`, sync 1Office) |
| `proposal_sequences` | Sinh mã tuần tự theo prefix |
| `field_definitions` | Định nghĩa trường động (13 types + `user`) |
| `forms` / `form_fields` | Cấu hình form + field (`order_index`, `visible`, `purpose`, `layout_config`) |
| `views` / `view_fields` | Cấu hình bảng + cột (`width`, `sortable`, `filterable`) |
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
| `api_queue_logs` | Queue push/pull + audit log |
| `schema_migrations` | Tracking migration đã chạy |

Migrations nằm ở `database/` (01→73). Một số mốc quan trọng: `14` display_format/unit, `45–48` external user, `49` review fields, `50` notifications, `53` map renderer/tile_mode/retina, `54–55` geocode, `56` performance indexes, `59–64` chuẩn hóa field/form/view 3 entity + khóa field, `70` trạng thái trạm + mô hình + loại ưu tiên, `71` required single-source (kế hoạch 40), `72` loại ưu tiên cho proposals, `73` nhãn trạng thái proposal tiếng Việt.

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
  - `docs/6/` — Hướng dẫn deploy và cập nhật VPS
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

### User Field (type `user`)
- Lưu `{ id }`; hiển thị chip tên, click xem chi tiết (CTV ẩn)
- `source_config.auto_user`: `current_user` | `parent_sales` | `owner_or_manager`
- BE: `dynamicUtils.applyAutoUserFields` (create/update proposal). FE: `DynamicForm.resolveAutoUserId`

### Form/View Builder
- Tạo Forms/Views tại `/admin/forms`, `/admin/views`
- **`DynamicForm` resolve form theo `purpose` (ưu tiên)** (`getByEntityAndPurpose`), `formId` chỉ fallback. Lý do: cùng entity có form `all`/`create`/`view`; hardcode `formId` dễ trỏ nhầm
- FormBuilder: drag & drop fields, visibility + colSpan; section có nút ▲▼ di chuyển + điều kiện hiển thị (`section.visibleWhen = { field, value }` trong `layout_config`)
- ViewBuilder: drag & drop columns, visibility + width + sortable + filterable

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
- Upload `POST /api/files/upload` (multer disk, 10MB); download `/files/:id/download` (auth-aware, Content-Disposition UTF-8)
- Types: image, video, audio, pdf, word (.docx → HTML via mammoth), excel (.xlsx → table via xlsx), text
- Viewer: zoom ảnh, play video/audio, render PDF/Word/Excel inline

### Excel Import/Export
- Hiện tại: cột hardcode cho stations/proposals; **planned**: dùng View Columns + Available Fields
- Export ExcelJS → .xlsx; Import: Preview → Validate → Confirm (transaction, all-or-nothing, re-validate lại khi confirm)

## 12. 1Office Integration

- **Content-Type**: `application/x-www-form-urlencoded`; **Auth**: `access_token` query param
- **9/14 source types hoạt động**: text, textarea, number, email, phone, date, select, boolean, file
- **5/14 chuyển text**: url, multiselect, datetime, formula, table
- 1Office select fields dùng ID (formal_name, scale_id); `cf2` dùng label ("VIP", "VVIP")
- **`user_ids`/`manager_user_ids` nhận CODE/TÊN, KHÔNG nhận ID**: string comma (vd `'NV06,NV08,Nguyễn Văn C'`). `user_external_map.external_id` lưu `personnel_id`. Push quy đổi `personnel_id` → `code` (ưu tiên) hoặc `fullname`; pull `field_raws=user_ids,manager_user_ids` trả `ID` liên hệ → quy đổi `ID` → `personnel_id`. Cần `admin_token` trong `api_configs.auth_config`. 3 ID khác nhau: `ID` (contact), `personnel_id`, `code`. Chỉ nhận người CÓ tài khoản 1Office (app gắn `warnings`; `UserExternalPanel` disable người `contact_id` rỗng)
- **File đính kèm**: field `files` = JSON string `[{name,file}]` trong body `contact/insert|update`; KHÔNG endpoint upload riêng; gửi tất cả file 1 request; `update` append (chỉ gửi file mới); tên file bỏ đuôi
- **Mapping đặc biệt**: `desc` (nguồn Desc Template, cố định) + `files` luôn link sẵn; `api_field_mappings` unique `target_field` (1 nguồn → nhiều đích, 1 đích ← 1 nguồn). **`desc`/`files` KHÔNG dùng làm nguồn pull** (`syncService` tự loại) tránh desc lặp
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
- Route-level code splitting (pages import eager trong `App.jsx`)
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

## 17. Definition of Done

- [ ] Feature works end-to-end
- [ ] Frontend không lỗi runtime
- [ ] Backend API trả đúng
- [ ] Authorization được enforce
- [ ] Không phá feature cũ
- [ ] Docker hot reload vẫn chạy
- [ ] Không console error
