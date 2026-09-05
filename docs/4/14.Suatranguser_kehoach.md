# Kế hoạch: Sửa giao diện các trang User

## Tổng quan

Sửa 3 trang user-facing: Map, My Proposals, Profile. Tập trung vào UX, responsive, và hiển thị bản đồ chuyên nghiệp với map free/open-source.

---

## 1. Map Page

### 1.1 Map tiles free / open-source

**Hiện tại:** CARTO light tiles (free nhưng không có nhiều option, không cấu hình được).

**Kế hoạch:** Thay bằng hệ thống tile linh hoạt, hoàn toàn free:

**Built-in free tile providers (đã tích hợp sẵn):**

| Tên | URL | Loại |
|-----|-----|------|
| OpenStreetMap | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Road |
| CARTO Light | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` | Road |
| CARTO Dark | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` | Road |
| OpenTopoMap | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` | Topo |
| ESRI World Imagery | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Satellite |
| Stamen Terrain | `https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg` | Terrain |

**Custom tile support:**
- Admin nhập tile URL template: `https://{s}.example.com/{z}/{x}/{y}.png`
- Nhập attribution: `© Example`
- Nhập tile server subdomains: `a,b,c` (nếu có)
- Preview ngay trên admin page

**Tất cả đều FREE, không cần API key, không license.**

### 1.2 Loại bỏ click chuột mở form

**Hiện tại:** Click bất kỳ đâu trên bản đồ → mở form đề xuất ngay → gây spam.

**Sửa:**
- Desktop: Click trên bản đồ → KHÔNG mở form. Chỉ nút FAB "+" mới bắt đầu tạo đề xuất.
- Mobile: Nút "+" → enters selection mode → hiện marker có thể kéo → ấn "Xác nhận" → mới mở form. (2 bước vì mobile không có chuột)

### 1.3 Cluster map + ranh giới tỉnh

**Hiện tại:** Mỗi marker render riêng, không cluster. Không có ranh giới.

**Kế hoạch:**
- Install `leaflet.markercluster`
- Zoom level 6: hiển thị 3 cluster (Bắc/Trung/Nam)
- Zoom level 8: hiển thị 34 tỉnh
- Zoom level 10+: hiển thị marker riêng từng trạm
- Import KML → GeoJSON → hiển thị ranh giới quốc gia + ranh giới tỉnh + tên tỉnh
- KML file: `test_files/Ranh giới và tên tỉnh1.kml` (Point markers cho tên, LineString cho ranh giới)

### 1.4 Tên điểm hiển thị trên map + Map Config Admin

**Hiện tại:** Marker hiển thị color theo status, không có tên. Không cấu hình được.

**Kế hoạch:** Tạo admin page `/admin/map-config` trong mục Cấu hình:

**Cấu hình tile layer:**
- Chọn từ danh sách built-in free tiles (dropdown)
- Hoặc chọn "Custom" → nhập tile URL, attribution, subdomains
- Preview map realtime khi thay đổi tile

**Cấu hình hiển thị:**
- Trường nào trong stations dùng làm tên marker label
- Bật/tắt province boundaries
- Bật/tắt cluster mode
- Bật/tắt province name labels
- Centre map + default zoom

**Lưu config trong `map_configs` table.**

### 1.5 Popup chi tiết

**Hiện tại:** Popup hiển thị tên, địa chỉ, status. Không có nút chuyển trang.

**Kế hoạch:**
- Admin: thêm nút "Xem chi tiết" → `/admin/stations/view={id}`
- User: không có nút (chỉ xem thông tin)

### 1.6 AdminStations: thêm nút "Xem map"

**Hiện tại:** RecordDetailPopup khi view station chỉ có nút Đóng.

**Kế hoạch:** Thêm nút "Xem map" bên trái nút Sửa, click → mở map centered tại vị trí station.

---

## 2. My Proposals Page

### 2.1 Bộ lọc compact

**Hiện tại:** Filter spread across header, không aligned trên mobile.

**Kế hoạch:**
- Single-row filter bar: search input + status dropdown + button actions
- Mobile: stack vertically, full width

### 2.2 Nút chức năng thẳng hàng

**Hiện tại:** Các nút Template, Export, Import, Tạo đề xuất trong `page-header-actions` có thể bị vỡ layout.

**Kế hoạch:**
- Wrap properly trên mobile (flex-wrap)
- Nút "Tạo đề xuất" nổi bật hơn (primary), còn lại secondary
- Responsive: mobile scroll ngang hoặc stack

### 2.3 Tạo đề xuất

**Hiện tại:** Modal có Leaflet map nhỏ, click để chọn toạ độ.

**Kế hoạch:** Giữ nguyên logic, chỉ đảm bảo responsive modal trên mobile.

---

## 3. Profile Page

### 3.1 Dùng DynamicForm

**Hiện tại:** Hardcoded form với 5 field cố định.

**Kế hoạch:**
- Dùng DynamicForm với form config của entity `users` (form ID 8)
- Tự động hiển thị tất cả fields: full_name, email, phone, role, status, department, avatar, employee_code
- Field nào read-only thì set trong form config

### 3.2 Portfolio-style layout

**Hiện tại:** Simple card layout, không có avatar, không responsive.

**Kế hoạch:**
- Header: Avatar circle + tên + email + role badge
- Body: Card-based sections (Thông tin cá nhân, Bảo mật)
- Responsive grid: Desktop 2 columns, mobile 1 column

---

## Files thay đổi

| File | Thay đổi |
|------|----------|
| `frontend/src/utils/provinceData.js` | Tạo mới: Parsed KML province data |
| `frontend/src/components/MapView.jsx` | Cluster, boundary, popup admin, remove click-to-open, configurable tile layer |
| `frontend/src/pages/user/MapPage.jsx` | New creation flow (FAB → select → confirm → form) |
| `frontend/src/pages/user/MyProposalsPage.jsx` | Compact filter, responsive buttons |
| `frontend/src/pages/user/ProfilePage.jsx` | DynamicForm + portfolio layout |
| `frontend/src/App.css` | New styles for cluster, boundary, profile portfolio |
| `frontend/package.json` | Install leaflet.markercluster |
| `database/16-create-map-configs.sql` | New table map_configs (tile config, display config) |
| `backend/src/services/mapConfigService.js` | CRUD API for map config |
| `backend/src/controllers/mapConfigController.js` | Controller |
| `backend/src/routes/mapConfigs.js` | Routes + Swagger |
| `backend/src/app.js` | Register new routes |
| `frontend/src/pages/admin/AdminMapConfigPage.jsx` | Admin page: tile picker + preview + display config |
| `frontend/src/components/admin/Sidebar.jsx` | Add menu item "Map Config" |
| `frontend/src/App.jsx` | New route /admin/map-config |

---

## Thứ tự thực hiện

1. Convert KML → GeoJSON + tạo provinceData.js
2. MapConfig: DB migration + Backend API + built-in tile providers
3. AdminMapConfigPage: tile picker + preview + display config
4. MapView: Cluster + boundary + configurable tile layer + popup admin
5. MapPage: New creation flow (remove click-to-open)
6. MyProposalsPage: compact filter + responsive
7. ProfilePage: DynamicForm + portfolio layout
8. CSS responsive cho tất cả
9. Test + fix
