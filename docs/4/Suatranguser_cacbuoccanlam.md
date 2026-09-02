# Các bước cụ thể: Sửa giao diện các trang User

---

## Phase 1: Map — Ranh giới + Tên tỉnh

### Bước 1.1: Convert KML → Province Data

**Files tạo:**
- `frontend/src/utils/provinceData.js`

**Nội dung:**
- Parse file `test_files/Ranh giới và tên tỉnh1.kml`
- Extract Point Placemarks → array `{ name, lat, lng }` (34 tỉnh)
- Extract LineString Placemarks → GeoJSON LineStrings (ranh giới)
- Hardcode data vào `provinceData.js` vì KML đã ổn định
- Export: `PROVINCES`, `PROVINCE_BOUNDARIES`

**Checklist test:**
- [ ] File `provinceData.js` tồn tại
- [ ] `PROVINCES` có đủ 34 tỉnh
- [ ] Mỗi province có `name`, `lat`, `lng` hợp lệ
- [ ] `PROVINCE_BOUNDARIES` là array GeoJSON LineStrings
- [ ] Import vào MapView không lỗi

---

### Bước 1.2: Install leaflet.markercluster

**Thực thi:**
```bash
docker exec station-frontend npm install leaflet.markercluster
```

**Files sửa:**
- `frontend/src/components/MapView.jsx` — import CSS + JS

**Nội dung:**
- Import `leaflet.markercluster/dist/MarkerCluster.css`
- Import `leaflet.markercluster/dist/MarkerCluster.Default.css`
- Import `leaflet.markercluster/src/MarkerCluster`
- Import `leaflet.markercluster/src/MarkerClusterGroup`
- Wrap markers trong `<MarkerClusterGroup>`

**Checklist test:**
- [ ] `npm install` thành công
- [ ] Import không lỗi trong MapView
- [ ] `npm run build` pass

---

### Bước 1.3: MapView.jsx — Cluster + Boundary

**Files sửa:**
- `frontend/src/components/MapView.jsx`
- `frontend/src/App.css` (thêm cluster + boundary styles)

**Nội dung:**

Cluster logic — dùng state `zoom` để track zoom level:
```
Zoom < 8:  3 markers (Bắc [21.0, 106.0], Trung [16.0, 108.0], Nam [11.0, 107.0])
Zoom 8-10: 34 province label markers (từ PROVINCES array)
Zoom > 10: individual station/proposal markers
```

Boundary layers:
```jsx
<GeoJSON data={PROVINCE_BOUNDARIES} style={{color: '#999', weight: 1, dashArray: '3'}} />
```

Province name labels: dùng `L.divIcon` với text hiển thị tên tỉnh.

**Files tạo:**
- `frontend/src/App.css` — thêm styles cho province labels, cluster

**Checklist test:**
- [ ] Cluster 3 miền hiển thị khi zoom-out
- [ ] Cluster 34 tỉnh hiển thị khi zoom level 8-10
- [ ] Individual markers hiển thị khi zoom > 10
- [ ] Ranh giới tỉnh hiển thị dạng đường nét đứt
- [ ] Tên tỉnh hiển thị trên bản đồ
- [ ] `npm run build` pass

---

### Bước 1.4: MapView.jsx — Remove click-to-open-form

**Files sửa:**
- `frontend/src/components/MapView.jsx`
- `frontend/src/pages/user/MapPage.jsx`

**Nội dung:**
- Xoá `MapClickHandler` component (xoá useMapEvents click handler trong MapView)
- MapView: chỉ render markers, popup, controls — KHÔNG handle click
- MapPage: bỏ logic `handleMapClick` mở form trực tiếp
- FAB "+" button giữ nguyên trong MapView

**Checklist test:**
- [ ] Click trên bản đồ KHÔNG mở form
- [ ] FAB "+" vẫn hoạt động bình thường
- [ ] Station markers vẫn click được (mở popup)
- [ ] `npm run build` pass

---

### Bước 1.5: MapView.jsx — Popup admin button

**Files sửa:**
- `frontend/src/components/MapView.jsx`

**Nội dung:**
- MapView nhận prop `user` (từ MapPage → AuthContext)
- Trong Popup station markers:
```jsx
{user?.role === 'ADMIN' && (
  <button onClick={() => navigate(`/admin/stations/view=${station.id}`)}>
    Xem chi tiết
  </button>
)}
```
- User thường: không hiển thị nút

**Checklist test:**
- [ ] Admin login → click marker → popup có nút "Xem chi tiết"
- [ ] Click "Xem chi tiết" → navigate đến `/admin/stations/view={id}`
- [ ] User login → click marker → popup KHÔNG có nút
- [ ] `npm run build` pass

---

## Phase 2: Map — Config + Tile Providers + Mobile Flow

### Bước 2.1: DB Migration — map_configs

**Files tạo:**
- `database/16-create-map-configs.sql`

**Nội dung:**
```sql
CREATE TABLE IF NOT EXISTS map_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL DEFAULT 'default',
  entity VARCHAR(50) NOT NULL,
  label_field VARCHAR(100) DEFAULT 'name',
  -- Tile config
  tile_provider VARCHAR(50) DEFAULT 'osm',
  tile_url VARCHAR(500) DEFAULT 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tile_attribution VARCHAR(500) DEFAULT '&copy; OpenStreetMap contributors',
  tile_subdomains VARCHAR(100) DEFAULT 'a,b,c',
  -- Display config
  show_boundaries TINYINT(1) DEFAULT 1,
  show_cluster TINYINT(1) DEFAULT 1,
  show_province_labels TINYINT(1) DEFAULT 1,
  center_lat DECIMAL(10,7) DEFAULT 14.0583,
  center_lng DECIMAL(10,7) DEFAULT 108.2772,
  default_zoom INT DEFAULT 6,
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_name_entity (name, entity)
);

INSERT INTO map_configs (name, entity, tile_provider, tile_url, tile_attribution, tile_subdomains)
VALUES ('default', 'stations', 'osm', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap contributors', 'a,b,c');
```

**Checklist test:**
- [ ] File SQL tồn tại
- [ ] Chạy trên Docker MySQL không lỗi
- [ ] Table `map_configs` có đủ columns
- [ ] Default record cho `stations` đã insert
- [ ] `tile_url` có giá trị OSM mặc định

---

### Bước 2.2: Backend — Map Config API

**Files tạo:**
- `backend/src/services/mapConfigService.js`
- `backend/src/controllers/mapConfigController.js`
- `backend/src/routes/mapConfigs.js`

**Endpoints:**
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/map-configs?entity=stations` | Lấy config |
| POST | `/api/map-configs` | Tạo config mới |
| PUT | `/api/map-configs/:id` | Cập nhật config |
| DELETE | `/api/map-configs/:id` | Xoá config |
| GET | `/api/map-configs/tile-providers` | Danh sách built-in tile providers |

**Checklist test:**
- [ ] GET trả về config mặc định với tile_provider='osm'
- [ ] PUT update tile_provider thành công
- [ ] GET /tile-providers trả về 6 built-in providers
- [ ] Response format `{ success, data, message }`
- [ ] Swagger UI hiển thị endpoint mới
- [ ] Backend restart không lỗi

---

### Bước 2.3: Backend — Register routes

**Files sửa:**
- `backend/src/app.js`

**Nội dung:**
```js
const mapConfigsRoutes = require('./routes/mapConfigs');
app.use('/api/map-configs', mapConfigsRoutes);
```

**Checklist test:**
- [ ] `GET /api/map-configs?entity=stations` trả 200
- [ ] Backend start không lỗi
- [ ] Swagger docs có endpoint mới

---

### Bước 2.4: Frontend — Built-in Tile Providers

**Files tạo:**
- `frontend/src/utils/tileProviders.js`

**Nội dung:**
```js
export const TILE_PROVIDERS = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    subdomains: 'a,b,c',
    category: 'road',
    description: 'Bản đồ đường phố miễn phí, phổ biến nhất'
  },
  {
    id: 'carto-light',
    name: 'CARTO Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    subdomains: 'a,b,c,d',
    category: 'road',
    description: 'Bản đồ đường phố gọn nhẹ, màu sáng'
  },
  {
    id: 'carto-dark',
    name: 'CARTO Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    subdomains: 'a,b,c,d',
    category: 'road',
    description: 'Bản đồ đường phố màu tối'
  },
  {
    id: 'opentopo',
    name: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap contributors',
    subdomains: 'a,b,c',
    category: 'topo',
    description: 'Bản đồ địa hình, hiển thị đường cao độ'
  },
  {
    id: 'esri-satellite',
    name: 'ESRI World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    subdomains: '',
    category: 'satellite',
    description: 'Ảnh vệ tinh toàn cầu'
  },
  {
    id: 'stamen-terrain',
    name: 'Stamen Terrain',
    url: 'https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
    attribution: '&copy; Stamen Design',
    subdomains: 'a,b,c',
    category: 'terrain',
    description: 'Bản đồ địa hình với đổ bóng'
  }
];

export const TILE_CATEGORIES = [
  { id: 'road', label: 'Đường phố' },
  { id: 'satellite', label: 'Vệ tinh' },
  { id: 'topo', label: 'Địa hình' },
  { id: 'terrain', label: 'Địa hình (đổ bóng)' }
];
```

**Checklist test:**
- [ ] File `tileProviders.js` tồn tại
- [ ] Có đủ 6 providers
- [ ] Mỗi provider có id, name, url, attribution, subdomains, category
- [ ] Import vào MapView không lỗi

---

### Bước 2.5: Frontend — AdminMapConfigPage

**Files tạo:**
- `frontend/src/pages/admin/AdminMapConfigPage.jsx`

**Nội dung:**
- Form cấu hình gồm 2 section:

**Section 1: Tile Layer**
- Dropdown chọn built-in provider (từ TILE_PROVIDERS)
- Khi chọn → auto-fill URL, attribution, subdomains
- RadioButton: Built-in / Custom
- Custom: nhập thủ công tile URL, attribution, subdomains
- Preview map realtime (Leaflet mini render với tile đang chọn)

**Section 2: Hiển thị**
- Label field (select từ field definitions stations)
- Toggle: show boundaries, show cluster, show province labels
- Centre map + default zoom

- Save → `PUT /api/map-configs/:id`
- Load → `GET /api/map-configs?entity=stations`

**Checklist test:**
- [ ] Page load không lỗi
- [ ] Dropdown 6 providers hiển thị
- [ ] Chọn provider → preview map thay đổi tile
- [ ] Chọn Custom → hiện input fields
- [ ] Nhập custom URL → preview map thay đổi
- [ ] Toggle boundaries → save → reload giữ nguyên
- [ ] Save thành công
- [ ] `npm run build` pass

---

### Bước 2.6: Frontend — Sidebar + Route

**Files sửa:**
- `frontend/src/components/admin/Sidebar.jsx` — thêm menu item "Map Config"
- `frontend/src/App.jsx` — thêm route `/admin/map-config`

**Checklist test:**
- [ ] Sidebar có menu "Map Config"
- [ ] Click → navigate đến `/admin/map-config`
- [ ] Route hoạt động
- [ ] `npm run build` pass

---

### Bước 2.7: MapView.jsx — Configurable Tile Layer

**Files sửa:**
- `frontend/src/components/MapView.jsx`

**Nội dung:**
- MapView fetch config từ API khi mount
- Dùng `tile_url`, `tile_attribution`, `tile_subdomains` từ config
- Render TileLayer với config:
```jsx
<TileLayer
  attribution={config.tile_attribution}
  url={config.tile_url}
  subdomains={config.tile_subdomains ? config.tile_subdomains.split(',') : []}
/>
```

**Checklist test:**
- [ ] Map load với tile OSM mặc định
- [ ] Thay tile trong admin → map page cập nhật
- [ ] Custom tile URL hoạt động
- [ ] Attribution hiển thị đúng

---

### Bước 2.8: MapPage.jsx — Mobile draggable marker flow

**Files sửa:**
- `frontend/src/pages/user/MapPage.jsx`

**Nội dung:**
- State: `selectingMode` (false/true)
- FAB click → `selectingMode = true` → hiện draggable marker
- Draggable marker: `eventHandlers={{ dragend: (e) => updateCoords(e) }}`
- "Xác nhận" button → save coords → open form modal
- "Hủy" button → exit selecting mode

**Checklist test:**
- [ ] FAB "+" click → enters selecting mode
- [ ] Draggable marker xuất hiện
- [ ] Kéo marker → coords cập nhật
- [ ] "Xác nhận" → form modal mở
- [ ] "Hủy" → exit selecting mode
- [ ] Mobile responsive
- [ ] `npm run build` pass

---

## Phase 3: MyProposalsPage — Compact Filter

### Bước 3.1: Redesign header layout

**Files sửa:**
- `frontend/src/pages/user/MyProposalsPage.jsx`

**Nội dung:**

Thay thế header cũ:
```jsx
<div className="page-header">
  <h1>Đề xuất của tôi</h1>
  <select ...>
  <div className="page-header-actions">
    // buttons
  </div>
</div>
```

Bằng toolbar mới:
```jsx
<div className="proposals-toolbar">
  <div className="toolbar-left">
    <h1>Đề xuất của tôi</h1>
  </div>
  <div className="toolbar-right">
    <input placeholder="Tìm kiếm..." />
    <select ...>  // status filter
    <button>+ Tạo đề xuất</button>
    <button>Template</button>
    <button>Export</button>
    <button>Import</button>
  </div>
</div>
```

**Checklist test:**
- [ ] Toolbar hiển thị đúng layout
- [ ] Search input hoạt động
- [ ] Status filter hoạt động
- [ ] Các nút thẳng hàng
- [ ] `npm run build` pass

---

### Bước 3.2: CSS responsive

**Files sửa:**
- `frontend/src/App.css`

**Nội dung:**
```css
.proposals-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
@media (max-width: 768px) {
  .proposals-toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-right { flex-direction: column; }
  .toolbar-right > * { width: 100%; }
}
```

**Checklist test:**
- [ ] Desktop (1200px): toolbar ngang, buttons aligned
- [ ] Tablet (768px): wrap gọn
- [ ] Mobile (375px): stack dọc, full width
- [ ] Không có horizontal overflow
- [ ] `npm run build` pass

---

## Phase 4: ProfilePage — DynamicForm + Portfolio Layout

### Bước 4.1: Rewrite ProfilePage.jsx

**Files sửa:**
- `frontend/src/pages/user/ProfilePage.jsx`

**Nội dung:**

View mode — Portfolio layout:
- Header: Avatar circle (nếu có) + tên + email + role badge
- Body: 2 cards — "Thông tin cá nhân" + "Bảo mật"
- Fields render từ `user` object
- Nút "Chỉnh sửa"

Edit mode — DynamicForm:
```jsx
<DynamicForm
  entity="users"
  formId={USERS_FORM_ID}
  onSubmit={handleSubmit}
  initialData={user}
  mode="edit"
/>
```
- Password fields riêng (DynamicForm không có password input)
- `handleSubmit`: tách password fields ra, gọi `profileService.update`

**Checklist test:**
- [ ] View mode: hiển thị avatar, tên, email, role
- [ ] View mode: 2 cards "Thông tin" + "Bảo mật"
- [ ] Edit mode: DynamicForm hiển thị đúng fields
- [ ] Edit mode: save thành công
- [ ] Password section hoạt động
- [ ] `npm run build` pass

---

### Bước 4.2: CSS Portfolio Layout

**Files sửa:**
- `frontend/src/App.css`

**Nội dung:**
```css
.profile-page { max-width: 800px; margin: 0 auto; }
.profile-header {
  display: flex; align-items: center; gap: 20px;
  padding: 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px; color: white; margin-bottom: 24px;
}
.profile-avatar {
  width: 80px; height: 80px; border-radius: 50%;
  border: 3px solid white; object-fit: cover;
}
.profile-info h2 { margin: 0; font-size: 22px; }
.profile-info p { margin: 4px 0 0; opacity: 0.85; }
.profile-role-badge {
  display: inline-block; padding: 3px 12px; border-radius: 12px;
  background: rgba(255,255,255,0.2); font-size: 13px; margin-top: 6px;
}
.profile-card {
  background: white; border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  padding: 24px; margin-bottom: 16px;
}
.profile-card h3 { margin: 0 0 16px; font-size: 16px; color: #333; }
.profile-field-row {
  display: flex; justify-content: space-between; padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}
.profile-field-label { color: #888; font-size: 14px; }
.profile-field-value { font-weight: 500; font-size: 14px; }
@media (max-width: 640px) {
  .profile-header { flex-direction: column; text-align: center; }
  .profile-field-row { flex-direction: column; gap: 4px; }
}
```

**Checklist test:**
- [ ] Desktop: header ngang, cards 2 columns
- [ ] Mobile: header dọc, cards 1 column
- [ ] Avatar hiển thị đúng
- [ ] Gradient header đẹp
- [ ] Không overflow
- [ ] `npm run build` pass

---

### Bước 4.3: Password section

**Files sửa:**
- `frontend/src/pages/user/ProfilePage.jsx`

**Nội dung:**
- Giữ nguyên section "Đổi mật khẩu" (không dùng DynamicForm cho password)
- Hiện khi user click "Đổi mật khẩu" button
- Validate: current_password, new_password, confirm_password
- Gọi `profileService.update` với password fields

**Checklist test:**
- [ ] Click "Đổi mật khẩu" → hiện form password
- [ ] Validate: password < 6 ký tự → lỗi
- [ ] Validate: confirm không khớp → lỗi
- [ ] Change password thành công
- [ ] `npm run build` pass

---

## Phase 5: Test + Fix

### Bước 5.1: Build test

**Thực thi:**
```bash
docker exec station-frontend npm run build
```

**Checklist test:**
- [ ] Frontend build passes (0 errors)
- [ ] Backend starts không lỗi
- [ ] Docker containers running

---

### Bước 5.2: Manual test — Map

**Checklist test:**
- [ ] Click trên bản đồ KHÔNG mở form
- [ ] FAB "+" hoạt động
- [ ] Tile mặc định là OSM (miễn phí)
- [ ] Thay tile trong admin → map page cập nhật
- [ ] Cluster hiển thị đúng 3 miền → 34 tỉnh → markers
- [ ] Ranh giới tỉnh hiển thị
- [ ] Tên tỉnh hiển thị
- [ ] Admin popup có nút "Xem chi tiết"
- [ ] User popup KHÔNG có nút
- [ ] Admin stations popup có nút "Xem map"
- [ ] Mobile: draggable marker flow hoạt động

---

### Bước 5.3: Manual test — Map Config Admin

**Checklist test:**
- [ ] Page `/admin/map-config` load
- [ ] Dropdown 6 built-in providers
- [ ] Chọn từng provider → preview map thay đổi
- [ ] Chọn Custom → nhập URL → preview thay đổi
- [ ] Save config → reload giữ nguyên
- [ ] Toggle boundaries/cluster/labels → save → reload giữ nguyên

---

### Bước 5.4: Manual test — MyProposalsPage

**Checklist test:**
- [ ] Toolbar compact, thẳng hàng
- [ ] Search hoạt động
- [ ] Status filter hoạt động
- [ ] Desktop: toolbar ngang
- [ ] Mobile: stack dọc, full width
- [ ] Không horizontal overflow
- [ ] Create proposal modal hoạt động

---

### Bước 5.5: Manual test — ProfilePage

**Checklist test:**
- [ ] View mode: portfolio layout hiển thị
- [ ] Avatar circle hiển thị
- [ ] Cards responsive
- [ ] Edit mode: DynamicForm hoạt động
- [ ] Save profile thành công
- [ ] Password change hoạt động
- [ ] Mobile responsive

---

### Bước 5.6: Regression test

**Checklist test:**
- [ ] Admin pages vẫn hoạt động
- [ ] Login/Logout vẫn OK
- [ ] Existing features không bị broken
- [ ] No console errors
