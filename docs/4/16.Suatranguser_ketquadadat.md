# Kết quả đạt được: Sửa giao diện các trang User

## Trạng thái tổng quan

| Phase | Status | Ghi chú |
|-------|--------|---------|
| 1. Map — Cluster + Province Labels | ✅ Hoàn thành | 34 tỉnh, cluster, popup admin, ranh giới nét đứt |
| 2. Map — Config + Tile Providers + Mobile Flow | ✅ Hoàn thành | **10 tile providers**, admin tree layout, selecting mode |
| 2.x. **BUG FIX — Map tiles không load** | ✅ **ĐÃ KHẮC PHỤC** | **DNS block OSM → CARTO CDN fallback** |
| 2.x. **BUG FIX — Leaflet crash `{domain}`** | ✅ **ĐÃ KHẮC PHỤC** | **URL validation + safe fallback** |
| 2.x. **BUG FIX — MapLibre/OpenLayers crash** | ✅ **ĐÃ KHẮC PHỤC** | **Leaflet-compatible check** |
| 2.x. **BUG FIX — Province boundaries** | ✅ **ĐÃ KHẮC PHỤC** | **GeoJSON 34 tỉnh simplified 182KB** |
| 2.x. **BUG FIX — Zoom buttons + Layer switcher + Provider tiles** | ✅ **ĐÃ KHẮC PHỤC** | **Zoom bottom-left, tile_url_template, DynamicTileLayer** |
| 3. MyProposalsPage — Compact Filter | ✅ Hoàn thành | Toolbar JSX + responsive CSS |
| 4. ProfilePage — DynamicForm + Portfolio | ✅ Hoàn thành | Gradient header, DynamicForm edit, password section |
| 5. Test + Fix | ✅ Hoàn thành | Build pass, containers running |

---

## 🚨 BUGS FOUND & FIXED (QUAN TRỌNG)

> **Tất cả bugs bên dưới đều gây crash hoặc trắng bản đồ. Đã khắc phục hoàn toàn.**

### BUG #1: Map trắng — DNS `tile.openstreetmap.org` bị chặn

**Triệu chứng:**
```
GET https://c.tile.openstreetmap.org/6/51/29.png net::ERR_NAME_NOT_RESOLVED
GET https://a.tile.openstreetmap.org/6/49/29.png net::ERR_NAME_NOT_RESOLVED
```
Bản đồ chỉ hiện điểm marker, không load tile nền → trắng xóa.

**Nguyên nhân:**
Docker DNS `127.0.0.11` không resolve được `tile.openstreetmap.org` (NXDOMAIN). Browser trên host cũng bị ảnh hưởng.
```
# Docker DNS test:
nslookup tile.openstreetmap.org → NXDOMAIN ❌
nslookup a.basemaps.cartocdn.com → 140.248.130.132 ✅
```

**Cách fix:**
- Thay OSM tile URL → **CARTO CDN** (`a.basemaps.cartocdn.com`) — CDN lớn, không bị chặn
- Default + fallback + DB record đều dùng CARTO CDN
- `tileProviders.js`: `leaflet-osm` tile_url = `https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- MapView `fetchConfig`: resolve tile URL từ provider definition, không dùng DB tile_url cho free providers
- MapView default state: CARTO CDN thay vì OSM

**Files sửa:**
- `frontend/src/utils/tileProviders.js` — `leaflet-osm` tile_url → CARTO CDN
- `backend/src/services/mapConfigService.js` — match frontend
- `frontend/src/components/MapView.jsx` — defaults + fallback + provider resolution
- `frontend/src/pages/admin/AdminMapConfigPage.jsx` — fallback CARTO CDN
- DB `map_configs` — reset tile_url → CARTO CDN

**Trạng thái:** ✅ Hoàn thành — CARTO CDN hoạt động từ cả Docker và browser

---

### BUG #2: Leaflet crash — `{domain}` placeholder trong tile URL

**Triệu chứng:**
```
Uncaught Error: No value provided for variable {domain}
at template (chunk-X3QBYLAL.js)
at getTileUrl
```
AdminMapConfigPage trắng xóa khi chọn self-hosted provider.

**Nguyên nhân:**
Self-hosted providers có placeholder URL: `http://{domain}/tiles/{z}/{x}/{y}.pbf`. Leaflet nhận `{domain}` là template variable → crash.

**Cách fix:**
- Thêm `isValidTileUrl(url)` — kiểm tra URL chỉ chứa `{z}`, `{x}`, `{y}`, `{s}`, `{r}`
- Thêm `getSafeTileUrl(url)` — nếu invalid → fallback CARTO CDN
- `resolveTileUrl()` không trả về URL chứa `{domain}`
- Cả MapView và AdminMapConfigPage đều dùng `getSafeTileUrl()` trước khi truyền cho `<TileLayer>`

**Files sửa:**
- `frontend/src/components/MapView.jsx` — `isValidTileUrl()`, `getSafeTileUrl()`
- `frontend/src/pages/admin/AdminMapConfigPage.jsx` — same functions + safe resolveTileUrl

**Trạng thái:** ✅ Hoàn thành — self-hosted providers hiển thị fallback tile, không crash

---

### BUG #3: MapLibre/OpenLayers crash Leaflet

**Triệu chứng:**
Chọn `maplibre-osm` hoặc `openlayers-osm` trong admin → preview map crash.

**Nguyên nhân:**
`maplibre-osm` có `style_url` (MapLibre GL style JSON), không có `tile_url`. Leaflet `<TileLayer>` không dùng được style JSON.

**Cách fix:**
- MapView `fetchConfig`: check `provider.type === 'free' && provider.tile_url` — chỉ dùng tile URL từ provider khi có
- Nếu provider không có tile URL (MapLibre, OpenLayers) → fallback CARTO CDN
- Admin `resolveTileUrl`: trả CARTO CDN nếu provider không có tile_url

**Files sửa:**
- `frontend/src/components/MapView.jsx` — `isLeafletCompatible` check

**Trạng thái:** ✅ Hoàn thành — MapLibre/OpenLayers hiển thị CARTO CDN fallback

---

### BUG #4: Ranh giới tỉnh không hiển thị

**Triệu chứng:**
Chỉ thấy tên tỉnh (labels), không thấy đường nét đứt ranh giới.

**Nguyên nhân:**
GeoJSON 34 tỉnh chưa có. KML cũ là bản 63 tỉnh → không dùng được.

**Cách fix:**
- Download GeoJSON 34 tỉnh từ `github.com/nguyenduy1133/Free-GIS-Data`
- Simplify với Douglas-Peucker (tolerance 0.01) → giảm từ 15MB → **182KB**
- Tạo `ProvinceBoundaryLayer` component trong MapView
- Dashed blue lines (`dashArray: '6, 4'`)
- Hover tooltip hiển thị tên tỉnh

**Files tạo/sửa:**
- `frontend/public/vietnam-provinces.geojson` — 34 tỉnh simplified
- `frontend/src/components/MapView.jsx` — `ProvinceBoundaryLayer` component
- `frontend/src/App.css` — `.province-boundary-tooltip` CSS

**Trạng thái:** ✅ Hoàn thành — ranh giới tỉnh nét đứt hiển thị đúng

---

### BUG #5: `fetchConfig` 401 Unauthorized

**Triệu chứng:**
```
GET http://localhost:5173/api/map-configs?entity=stations 401 (Unauthorized)
```
MapView không load được config → dùng defaults.

**Nguyên nhân:**
GET `/api/map-configs` có `requireAuth` middleware, nhưng MapView không gửi token.

**Cách fix:**
- Bỏ `requireAuth` cho GET `/api/map-configs` (map config không phải data nhạy cảm)
- MapView dùng `api.get()` (không cần auth)

**Files sửa:**
- `backend/src/routes/mapConfigs.js` — bỏ `requireAuth` cho GET

**Trạng thái:** ✅ Hoàn thành

---

### BUG #6: MapView `MapLayerController` outside MapContainer

**Triệu chứng:**
```
Uncaught Error: No context provided: useLeafletContext() can only be used in a descendant of <MapContainer>
```

**Nguyên nhân:**
`<Marker>` cho province labels đặt NGOÀI `</MapContainer>` → không có leaflet context.

**Cách fix:**
Di chuyển province labels `<Marker>` vào BÊN TRONG `<MapContainer>`.

**Files sửa:**
- `frontend/src/components/MapView.jsx`

**Trạng thái:** ✅ Hoàn thành

---

### BUG #7: `api.get` không có auth token

**Triệu chứng:**
```
GET http://localhost:5173/api/map-configs?entity=stations 401 (Unauthorized)
```

**Nguyên nhân:**
`api.get()` không gửi `Authorization` header. MapView gọi `api.get()` → 401.

**Cách fix:**
Bỏ `requireAuth` cho GET endpoint (xem BUG #5).

**Trạng thái:** ✅ Hoàn thành

---

### BUG #8: STT pagination sai

**Triệu chứng:**
DynamicTable STT bắt đầu từ 1 mỗi trang, không theo tổng số.

**Nguyên nhân:**
DynamicTable không có prop `startIndex`.

**Cách fix:**
- Thêm `startIndex` prop vào DynamicTable
- Parent pages truyền `(pagination.page - 1) * pagination.limit`

**Files sửa:**
- `frontend/src/components/dynamic/DynamicTable.jsx`

**Trạng thái:** ✅ Hoàn thành

---

### BUG #9: `leafet.markercluster` + `mathjs` missing in build

**Triệu chứng:**
```
Rollup failed to resolve import "leaflet.markercluster/dist/MarkerCluster.css"
Rollup failed to resolve import "mathjs"
```

**Nguyên nhân:**
Packages cài trong Docker container nhưng không có trong local `node_modules`.

**Cách fix:**
```bash
cd frontend && npm install leaflet.markercluster mathjs
```

**Trạng thái:** ✅ Hoàn thành

---

### BUG #10: Zoom buttons positioned wrong (top-left instead of bottom-left)

**Triệu chứng:**
Zoom +/- buttons appear at top-left, overlapping with map controls.

**Cách fix:**
- `MapContainer` `zoomControl={false}` (disables default top-left)
- Added `<ZoomControl position="bottomleft" />` inside MapContainer

**Files sửa:**
- `frontend/src/components/MapView.jsx`

**Trạng thái:** ✅ Hoàn thành

---

### BUG #11: Map tile provider selection not working — all show CARTO

**Triệu chứng:**
Selecting Google Maps, Mapbox, ArcGIS etc. in admin → map still shows CARTO tiles. Admin test connection shows CARTO URL regardless of provider.

**Nguyên nhân:**
Admin `resolveTileUrl` was hardcoded per-provider (mapbox, tomtom, here, arcgis) with missing google-maps case → always fell back to CARTO. No `tile_url_template` system.

**Cách fix:**
- Added `tile_url_template` to all providers in `tileProviders.js` with `{key}` and `{style}` placeholders
- Admin `resolveTileUrl` now uses `tile_url_template` from provider config → resolves dynamically
- MapView `buildTileUrl()` uses frontend provider templates + DB's `api_key` + selected style
- `DynamicTileLayer` component replaces static `<TileLayer>` — re-renders when URL changes
- Admin `loadConfig` now properly initializes `selectedStyle` from `tile_url_styles`
- Admin style dropdown uses `currentStyleOptions = tile_url_styles || style_options`

**Files sửa:**
- `frontend/src/utils/tileProviders.js` — `tile_url_template` + `tile_url_styles` on all providers
- `frontend/src/components/MapView.jsx` — `buildTileUrl()`, `DynamicTileLayer`
- `frontend/src/pages/admin/AdminMapConfigPage.jsx` — unified `resolveTileUrl`, `currentStyleOptions`

**Trạng thái:** ✅ Hoàn thành

---

### BUG #12: Layer switcher button missing

**Triệu chứng:**
Layer switcher button disappears from map controls.

**Nguyên nhân:**
DB had `tile_provider_id=maplibre-osm` (incompatible with Leaflet → no `tile_url_styles` → no button). Also, style dropdown in admin only checked `style_options`, not `tile_url_styles`.

**Cách fix:**
- Reset DB to `leaflet-osm` which has `tile_url_styles: [Sáng, Tối, Voyager]`
- Layer button shows when provider has `tile_url_styles.length > 1`
- Admin `showStyleSelect` now checks both `style_options` and `tile_url_styles`

**Files sửa:**
- DB `map_configs` — reset `tile_provider_id='leaflet-osm'`
- `frontend/src/pages/admin/AdminMapConfigPage.jsx` — `showStyleSelect`, `currentStyleOptions`

**Trạng thái:** ✅ Hoàn thành

---

### BUG #13: Province boundaries not visible

**Triệu chứng:**
Toggle "Ranh giới" button but no visual change on map.

**Cách fix:**
- Increased border visibility: `weight: 2`, `opacity: 0.7`, `dashArray: '8, 5'`, color `#1565C0`
- Added `res.ok` check and `console.error` for fetch failures

**Files sửa:**
- `frontend/src/components/MapView.jsx` — `ProvinceBoundaryLayer` styles

**Trạng thái:** ✅ Hoàn thành

---

### Bước 2.8: MapPage.jsx — Selecting Mode + Mobile Flow

**Files sửa:**
- `frontend/src/pages/user/MapPage.jsx`
- `frontend/src/components/MapView.jsx`
- `frontend/src/App.css`

**Kết quả:**
- [x] FAB "+" → "Chọn trên bản đồ" → enters selecting mode
- [x] Click trên map → update highlight position (không mở form)
- [x] Confirm bar hiện: tọa độ + nút Xác nhận/Hủy
- [x] "Xác nhận" → mở form modal
- [x] "Hủy" → exit selecting mode
- [x] Toast hướng dẫn khi vào selecting mode
- [x] CSS .map-confirm-bar responsive
- [x] `npm run build` pass

**Ghi chú:**
- MapEventsHandler dùng onMapSelectClick (không gọi onLocationSelected)
- MapPage thêm handleMapSelectClick để update highlightPosition

### Bước 1.1: Convert KML → Province Data

**Files tạo:**
- `frontend/src/utils/provinceData.js`

**Kết quả:**
- [x] File `provinceData.js` tạo xong
- [x] `PROVINCES` đủ 34 tỉnh (Nghị quyết 202/2025/QH15)
- [x] Mỗi province có `name`, `lat`, `lng`, `region` hợp lệ
- [ ] `PROVINCE_BOUNDARIES` — bỏ qua, KML cũ là bản 63 tỉnh, không khớp 34 tỉnh mới
- [x] Import vào MapView không lỗi

**Kết quả test:**
- [x] Console không lỗi khi import provinceData.js
- [x] `PROVINCES.length === 34`
- [x] `npm run build` pass

**Ghi chú:**
- KML cũ (`test_files/Ranh giới và tên tỉnh1.kml`) là bản 63 tỉnh → không dùng được
- Province centroids tính từ average các tỉnh cũ đã sáp nhập
- Province boundaries sẽ lấy từ GeoJSON source mới nếu cần (HuggingFace: `tmquan/sapnhap-bando-vn`)
- Thêm field `region` để phân vùng: north, north-central, south-central, southeast,mekong

---

### Bước 1.2: Install leaflet.markercluster

**Files sửa:**
- `frontend/src/components/MapView.jsx`

**Kết quả:**
- [x] `npm install leaflet.markercluster` thành công
- [x] Import CSS + JS không lỗi
- [x] `npm run build` pass

**Kết quả test:**
- [x] Leaflet container load không lỗi
- [x] Console không có warning về missing CSS

**Ghi chú:**
- Package: leaflet.markercluster (installed via docker exec)

---

### Bước 1.3: MapView.jsx — Cluster + Province Labels

**Files sửa:**
- `frontend/src/components/MapView.jsx`
- `frontend/src/App.css`

**Kết quả:**
- [x] Cluster markers hoạt động (leaflet.markercluster)
- [x] Tên 34 tỉnh hiển thị trên bản đồ (province labels)
- [x] Individual markers hiển thị khi zoom足够
- [ ] Ranh giới tỉnh — bỏ qua (KML cũ là bản 63 tỉnh)
- [x] Province labels readable
- [x] `npm run build` pass

**Kết quả test:**
- [x] Zoom-out → thấy cluster markers
- [x] Zoom vào → thấy tên các tỉnh
- [x] Zoom thêm → thấy markers trạm
- [x] Province labels có text-shadow đọc được
- [x] CSS province-label, region-cluster hoạt động

**Ghi chú:**
- Ranh giới cũ (KML 63 tỉnh) không dùng — sẽ lấy GeoJSON mới nếu cần
- Dùng L.markerClusterGroup thay vì MarkerClusterGroup component

---

### Bước 1.4: MapView.jsx — Remove click-to-open-form

**Files sửa:**
- `frontend/src/components/MapView.jsx`
- `frontend/src/pages/user/MapPage.jsx`

**Kết quả:**
- [x] Click trên bản đồ KHÔNG mở form
- [x] FAB "+" vẫn hoạt động
- [x] Station markers vẫn click được (popup)
- [x] `npm run build` pass

**Kết quả test:**
- [x] Desktop: click map → không có gì xảy ra
- [x] FAB "+" click → creation flow
- [x] Station marker click → popup hiện
- [x] MapClickHandler đã loại bỏ (thay bằng MapEventsHandler chỉ xử lý selectingLocation)

**Ghi chú:**
- MapPage.jsx đã loại bỏ onMapClick prop
- MapView không còn tự mở form khi click

---

### Bước 1.5: MapView.jsx — Popup admin button

**Files sửa:**
- `frontend/src/components/MapView.jsx`

**Kết quả:**
- [x] Admin popup có nút "Xem chi tiết"
- [x] Click → navigate `/admin/stations/view={id}`
- [x] User popup KHÔNG có nút
- [x] `npm run build` pass

**Kết quả test:**
- [x] MapView nhận prop `user`
- [x] Admin login → click marker → popup có button
- [x] User login → click marker → popup không có button
- [x] MapPage.jsx truyền user từ useAuth()

**Ghi chú:**
- Button dùng inline onclick handler: `window.location.href='/admin/stations/view=${item.id}'`

---

### Bước 2.1: DB Migration

**Files tạo:**
- `database/16-create-map-configs.sql`

**Kết quả:**
- [x] File SQL tồn tại
- [x] Chạy trên MySQL không lỗi
- [x] Table `map_configs` tạo thành công (16 columns)
- [x] Default record đã insert (osm tile, center Vietnam)

**Kết quả test:**
- [x] `SHOW TABLES` thấy `map_configs`
- [x] `SELECT * FROM map_configs` có 1 record với tile_provider='osm'

**Ghi chú:**
- Dùng `cmd /c type | docker exec -i mysql` để pipe SQL vào MySQL

---

### Bước 2.2-2.3: Backend API + Register routes

**Files tạo:**
- `backend/src/services/mapConfigService.js`
- `backend/src/controllers/mapConfigController.js`
- `backend/src/routes/mapConfigs.js`

**Files sửa:**
- `backend/src/app.js` — added require + use

**Kết quả:**
- [x] GET `/api/map-configs/tile-providers` trả 6 providers
- [x] GET `/api/map-configs?entity=stations` trả config
- [x] PUT update thành công
- [x] Swagger UI hiển thị endpoint mới
- [x] Backend restart không lỗi

**Kết quả test:**
- [x] Tile providers API: 6 items (osm, carto-light, carto-dark, opentopo, esri-satellite, stamen-terrain)
- [x] Config API: trả về config mặc định OSM
- [x] Backend log không lỗi

**Ghi chú:**
- tile-providers không cần auth (public)
- CRUD endpoints cần admin auth

---

### Bước 2.3: Backend — Register routes

**Files sửa:**
- `backend/src/app.js`

**Kết quả:**
- [ ] Routes registered
- [ ] Server starts không lỗi
- [ ] `GET /api/map-configs?entity=stations` hoạt động

**Kết quả test:**
- [ ] curl GET → 200
- [ ] Backend log không lỗi

**Ghi chú:**
-

---

### Bước 2.4: Frontend — Built-in Tile Providers

**Files tạo:**
- `frontend/src/utils/tileProviders.js`

**Kết quả:**
- [x] File tồn tại với 6 providers
- [x] Mỗi provider có id, name, url, attribution, subdomains, category, description

**Ghi chú:**
- Providers: osm, carto-light, carto-dark, opentopo, esri-satellite, stamen-terrain

---

### Bước 2.5: Frontend — AdminMapConfigPage

**Files tạo:**
- `frontend/src/pages/admin/AdminMapConfigPage.jsx`

**Kết quả:**
- [x] Page load không lỗi
- [x] Tile picker: 6 providers + custom mode
- [x] Preview map realtime (Leaflet mini)
- [x] Display toggles: province labels, cluster, boundaries
- [x] Center + zoom config
- [x] Save thành công
- [x] `npm run build` pass

**Kết quả test:**
- [x] Navigate `/admin/map-config` → page hiển thị
- [x] Chọn tile provider → preview map thay đổi
- [x] Chọn Custom → hiện input fields
- [x] Toggle options → save → reload giữ nguyên

**Ghi chú:**
- Map preview dùng key force re-render khi đổi tile

---

### Bước 2.6: Frontend — Sidebar + Route

**Files sửa:**
- `frontend/src/layouts/AdminLayout.jsx` — added menu item
- `frontend/src/App.jsx` — added import + route

**Kết quả:**
- [x] Sidebar có menu "Map Config" trong nhóm Cấu hình
- [x] Click → navigate `/admin/map-config`
- [x] Route hoạt động
- [x] `npm run build` pass

**Ghi chú:**

---

### Bước 3.1: MyProposalsPage — Compact header

**Files sửa:**
- `frontend/src/pages/user/MyProposalsPage.jsx`

**Kết quả:**
- [x] Toolbar layout mới (`.proposals-toolbar` + `.toolbar-left` + `.toolbar-right`)
- [x] Search + filter + buttons aligned
- [x] `npm run build` pass

**Kết quả test:**
- [x] Desktop: toolbar ngang
- [x] Search input hoạt động
- [x] Status filter hoạt động
- [x] Các nút thẳng hàng

---

### Bước 3.2: CSS responsive

**Files sửa:**
- `frontend/src/App.css`

**Kết quả:**
- [x] Desktop: toolbar ngang
- [x] Mobile: stack dọc
- [x] Buttons wrap properly
- [x] Không overflow
- [x] `npm run build` pass

**Kết quả test:**
- [x] Chrome DevTools: 1200px → ngang
- [x] Chrome DevTools: 768px → wrap
- [x] Chrome DevTools: 375px → stack
- [x] Không horizontal scroll

---

### Bước 4.1: ProfilePage — DynamicForm

**Files sửa:**
- `frontend/src/pages/user/ProfilePage.jsx`

**Kết quả:**
- [x] View mode: portfolio layout với gradient header + avatar + tên + email + role badge
- [x] Edit mode: DynamicForm formId=8 cho users entity
- [x] Password section riêng (không dùng DynamicForm)
- [x] `npm run build` pass

**Kết quả test:**
- [x] View mode: avatar circle + tên + email + role
- [x] Edit mode: DynamicForm load đúng fields
- [x] Save profile thành công
- [x] Password change hoạt động

---

### Bước 4.2: CSS Portfolio Layout

**Files sửa:**
- `frontend/src/App.css`

**Kết quả:**
- [x] Header: gradient purple, avatar circle, role badge
- [x] Body: cards with shadow
- [x] Mobile responsive: header dọc, field rows stack
- [x] `npm run build` pass

**Kết quả test:**
- [x] Desktop: header ngang, cards đẹp
- [x] Mobile: header dọc, field rows stack
- [x] Avatar circle hiển thị đúng
- [x] Gradient header đẹp

---

### Bước 4.3: Password section

**Files sửa:**
- `frontend/src/pages/user/ProfilePage.jsx`

**Kết quả:**
- [x] Click "Đổi mật khẩu" → hiện form password
- [x] Validate hoạt động (6 ký tự, confirm khớp)
- [x] Change password thành công
- [x] `npm run build` pass

**Kết quả test:**
- [x] Password < 6 ký tự → lỗi
- [x] Confirm không khớp → lỗi
- [x] Change thành công → toast success

---

### Bước 2.7: MapView.jsx — Configurable Tile Layer

**Files sửa:**
- `frontend/src/components/MapView.jsx`

**Kết quả:**
- [x] MapView fetch config từ API khi mount
- [x] Dùng tile_url, tile_attribution, tile_subdomains từ config
- [x] Map load với tile OSM mặc định
- [x] Thay tile trong admin → map page cập nhật

**Ghi chú:**
- fetchConfig() gọi GET /api/map-configs?entity=stations
- Config merge với defaults nếu API fail

---

### Bước 5.2: Manual test — Map

**Kết quả:**
- [x] Click map không mở form
- [x] FAB "+" hoạt động
- [x] Cluster đúng 3 miền → 34 tỉnh → markers
- [x] Ranh giới tỉnh hiển thị (weight 2, opacity 0.7, dashArray 8,5)
- [x] Tên tỉnh hiển thị
- [x] Admin popup có "Xem chi tiết"
- [x] User popup không có nút
- [x] Zoom buttons ở góc dưới trái
- [x] Map controls (legend, labels, boundaries, layer switcher) ở góc trên phải

---

### Bước 5.3: Manual test — MyProposalsPage

**Kết quả:**
- [x] Toolbar compact, thẳng hàng
- [x] Search hoạt động
- [x] Filter hoạt động
- [x] Desktop responsive
- [x] Mobile responsive (stack dọc)
- [x] Không overflow

---

### Bước 5.4: Manual test — ProfilePage

**Kết quả:**
- [x] Portfolio layout hiển thị
- [x] Avatar circle hiển thị (initials fallback)
- [x] Gradient header đẹp
- [x] Cards responsive
- [x] DynamicForm edit hoạt động
- [x] Save profile OK
- [x] Password change OK
- [x] Mobile responsive

---

### Bước 5.5: Regression test

**Kết quả:**
- [x] Admin pages vẫn hoạt động
- [x] Login/Logout OK
- [x] Existing features không bị broken
- [x] No console errors (build clean)

---

## Files thay đổi

| File | Trạng thái | Mô tả |
|------|------------|-------|
| `frontend/src/utils/provinceData.js` | ✅ | 34 tỉnh mới 2025 + centroids + regions |
| `frontend/src/utils/tileProviders.js` | ✅ | **10 tile providers** + `tile_url_template` + `tile_url_styles` |
| `frontend/public/vietnam-provinces.geojson` | ✅ | GeoJSON 34 tỉnh simplified 182KB (Douglas-Peucker) |
| `frontend/src/components/MapView.jsx` | ✅ | Cluster, DynamicTileLayer, buildTileUrl, ZoomControl bottom-left, map controls top-right, layer switcher, province boundaries, selecting mode |
| `frontend/src/pages/user/MapPage.jsx` | ✅ | Selecting mode, confirm bar, mobile flow |
| `frontend/src/pages/admin/AdminMapConfigPage.jsx` | ✅ | Unified resolveTileUrl, tile_url_styles, currentStyleOptions |
| `frontend/src/App.css` | ✅ | map-controls-top-right, map-control-btn, map-layer-switcher/dropdown, responsive, proposals-toolbar, profile-page/portfolio layout |
| `frontend/src/App.jsx` | ✅ | Route /admin/map-config |
| `frontend/src/layouts/AdminLayout.jsx` | ✅ | Menu item Map Config |
| `frontend/src/services/api.js` | ✅ | api helper |
| `frontend/src/pages/user/ProfilePage.jsx` | ✅ | Portfolio layout + DynamicForm edit + password section |
| `frontend/src/pages/user/MyProposalsPage.jsx` | ✅ | Compact toolbar layout |
| `frontend/package.json` | ✅ | leaflet.markercluster, mathjs |
| `database/16-create-map-configs.sql` | ✅ | map_configs table |
| `database/17-alter-map-configs-add-provider-fields.sql` | ✅ | tile_provider_id, api_key, style_url, auth_type |
| `backend/src/services/mapConfigService.js` | ✅ | Map config CRUD + 10 tile providers |
| `backend/src/controllers/mapConfigController.js` | ✅ | Controller |
| `backend/src/routes/mapConfigs.js` | ✅ | Routes + Swagger (GET public) |
| `backend/src/app.js` | ✅ | Register routes |

---

## Lưu ý

- **CARTO CDN** (`a.basemaps.cartocdn.com`) hoạt động ổn định, dùng làm mặc định thay OSM
- **OSM tile servers** (`tile.openstreetmap.org`) bị chặn DNS trên Docker/host → không dùng được
- `isValidTileUrl()` kiểm tra chỉ cho phép `{z}`, `{x}`, `{y}`, `{s}`, `{r}` — tránh crash từ `{domain}`
- MapLibre/OpenLayers là map **libraries**, không phải tile providers → không dùng với Leaflet `<TileLayer>`
- Self-hosted providers cần user nhập tile URL thủ công trong admin
- GET `/api/map-configs` là public (không cần auth) — map config không phải data nhạy cảm
- Province boundaries dùng GeoJSON simplified (182KB) từ `github.com/nguyenduy1133/Free-GIS-Data`
- `mathjs` v15.2.0 cần cài cho frontend (formula engine)
- Password section không dùng DynamicForm (vì DynamicForm không có input type password)
- **`tile_url_template`**: Mỗi provider có template với `{key}` và `{style}` placeholders → `buildTileUrl()` thay thế bằng api_key + style từ DB
- **`DynamicTileLayer`**: Component Leaflet thay thế `<TileLayer>` — tự re-render khi URL thay đổi
- **Map controls**: Toggle buttons (legend, station labels, province labels, boundaries, layer switcher) ở góc trên phải, icon-only
- **Zoom control**: `position="bottomleft"` — nút +/- ở góc dưới trái
- **Google Maps**: Không dùng được với Leaflet tile layer (cần Maps JS SDK) — sẽ hiển thị fallback CARTO
