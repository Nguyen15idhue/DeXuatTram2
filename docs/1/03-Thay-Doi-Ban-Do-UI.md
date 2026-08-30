# CẬP NHẬT TÍNH NĂNG BẢN ĐỒ

> **Ngày cập nhật:** 28/08/2026
> **Ghi chú:** Cải thiện UI/UX bản đồ - Legend, Tạo đề xuất, Vị trí của tôi, Google Maps Parser

---

## 1. Legend (Chú Thích Trạng Thái)

### Mục đích
- Hiển thị ý nghĩa màu sắc marker trên bản đồ
- Giúp người dùng phân biệt trạm Active, Deploying, Proposals

### Chi tiết
- Vị trí: Góc trên trái bản đồ
- Kiểu: Box nhỏ gọn, bo tròn 8px
- Nền trắng, shadow nhẹ

### Các trạng thái hiển thị

| Màu | Trạng thái | Ý nghĩa |
|------|-----------|----------|
| 🟢 `#22c55e` | ACTIVE | Trạm hoạt động |
| 🟡 `#eab308` | DEPLOYING | Đang triển khai |
| 🟠 `#f97316` | PENDING | Đề xuất chờ duyệt |
| 🔵 `#3b82f6` | REVIEWING | Đang xem xét |
| 🟢 `#22c55e` | APPROVED | Đề xuất đã duyệt |
| 🔴 `#ef4444` | REJECTED | Đề xuất bị từ chối |

---

## 2. Nút Tạo Đề Xuất (FAB +)

### Mục đích
- Cho phép user tạo đề xuất trạm mới từ bản đồ
- Thao tác nhanh, không cần rời trang

### Vị trí
- Góc dưới phải bản đồ
- Nằm trong FAB group (2 nút liền kề)

### Kích thước & Style
```
Kích thước: 48px × 48px
Border-radius: 50% (tròn hoàn toàn)
Nền: #4285f4 (xanh Google)
Icon: SVG dấu cộng (+), stroke trắng
Shadow: 0 2px 8px rgba(0,0,0,0.25)
```

### Hover & Active
```
Hover: nền #3367d6, shadow lớn hơn
Active: nền #ea4335 (đỏ), xoay 45° thành × (close)
```

### Menu tạo đề xuất
Khi click nút +, mở popup 3 lựa chọn:

| Lựa chọn | Icon | Mô tả |
|----------|------|-------|
| Vị trí của tôi | SVG GPS pin | Geolocation API → lấy tọa độ |
| Chọn trên bản đồ | SVG pin marker | Click bản đồ để chọn |
| Dán link Google Map | SVG bookmark | Paste link → parse tọa độ |

### Animation
```
@keyframes fabMenuIn {
  from: opacity 0, translateY 8px, scale 0.95
  to: opacity 1, translateY 0, scale 1
}
```

---

## 3. Nút Vị Trí Của Tôi (FAB ⊕)

### Mục đích
- Lấy vị trí GPS hiện tại của user
- Di chuyển bản đồ đến vị trí đó
- Mở form tạo đề xuất

### Vị trí
- Góc dưới phải, phía trên nút Tạo đề xuất
- FAB group: 2 nút liền kề, khoảng cách 12px

### Kích thước & Style
```
Kích thước: 48px × 48px
Border-radius: 50% (tròn hoàn toàn)
Nền: white
Icon: SVG crosshair/GPS, stroke #4285f4 (xanh Google)
Shadow: 0 2px 8px rgba(0,0,0,0.25)
```

### Hover
```
Hover: nền #f0f4ff (xanh nhạt)
```

### Icon SVG (Google Maps style)
```svg
<circle cx="12" cy="12" r="4"/>        <!-- chấm giữa -->
<path d="M12 2v4M12 18v4"/>           <!-- vertical line -->
<path d="M2 12h4M18 12h4"/>           <!-- horizontal line -->
```

### Flow hoạt động
```
Click nút ⊕
  → navigator.geolocation.getCurrentPosition()
  → Nếu thành công: flyTo(lat, lng, zoom=16)
  → Mở form tạo đề xuất với tọa độ đã lấy
  → Hiển thị marker tạm thời
```

### Xử lý lỗi
| Lỗi | Thông báo |
|------|-----------|
| Trình duyệt không hỗ trợ | "Trình duyệt không hỗ trợ định vị" |
| User từ chối quyền | "Bạn đã từ chối quyền truy cập vị trí" |
| Timeout / không xác định | "Không thể lấy vị trí" |

---

## 4. Google Maps Link Parser

### Mục đích
- Parse tọa độ từ link Google Maps
- Hỗ trợ nhiều định dạng URL phổ biến

### Link formats được hỗ trợ

| Định dạng | Ví dụ | Pattern regex |
|-----------|-------|---------------|
| `@lat,lng` | `maps/@10.7626,106.6601,17z` | `/@(-?\d+\.?\d*),(-?\d+\.?\d*)/` |
| `?q=lat,lng` | `maps?q=10.7626,106.6601` | `/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/` |
| `/maps/place/` | `maps/place/.../@lat,lng` | `/\/maps\/place\/[^/]*\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/` |
| `?ll=lat,lng` | `maps?ll=10.7626,106.6601` | `/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/` |
| `center=lat,lng` | `maps?center=10.7626,106.6601` | `/\/maps\?.*center=(-?\d+\.?\d*),(-?\d+\.?\d*)/` |
| `maps?x=lat,lng` | `google.com/maps?q=10.7626,106.6601` | `/google\.com\/maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)/` |

### Short URL Resolution
- Hỗ trợ `maps.app.goo.gl` và `goo.gl/maps`
- Thực hiện fetch với `redirect: 'follow'`
- Lấy final URL → parse lại

### Flow hoạt động
```
User dán link vào input
  → onClick nút ✓ hoặc Enter
  → parseGoogleMapsLink(url)
  → Nếu có tọa độ trực tiếp: { lat, lng }
  → Nếu là short URL: resolveGoogleMapsShortUrl(url)
    → fetch redirect → parse lại
  → Fly to tọa độ
  → Mở form tạo đề xuất
```

### Validation
```
Kiểm tra lat: -90 ≤ lat ≤ 90
Kiểm tra lng: -180 ≤ lng ≤ 180
Link rỗng hoặc không hợp lệ → báo lỗi
```

---

## 5. Fly To Location

### Mục đích
- Di chuyển mượt mà đến tọa độ được chọn
- Dùng Leaflet flyTo animation

### FlyTo params
```js
map.flyTo(position, 16, {
  duration: 1.5,  // 1.5 giây animation
})
```

### Khi nào trigger flyTo
1. Click nút "Vị trí của tôi" → flyTo GPS position
2. Click nút "Chọn trên bản đồ" → không flyTo (user tự di chuyển)
3. Dán Google Maps link hợp lệ → flyTo tọa độ parse được
4. Tạo proposal thành công → flyTo vị trí mới

---

## 6. Map Refresh Sau Khi Tạo Proposal

### Flow
```
User tạo proposal mới thành công
  → setMapKey(prev => prev + 1)
  → MapView nhận key mới → React re-mount component
  → fetchStations() + fetchProposals() được gọi lại
  → Marker mới xuất hiện trên bản đồ
```

### Props mới của MapView
```jsx
MapView({
  onMapClick,          // callback khi click map
  selectingLocation,   // boolean: đang trong chế độ chọn vị trí
  onLocationSelected,  // callback khi chọn được vị trí
  highlightPosition,   // [lat, lng] marker tạm thời
  refreshKey,          // number: key để force re-fetch data
})
```

---

## 7. MapPage Updates

### Flow 3 chế độ tạo đề xuất

#### Mode 1: Vị trí của tôi
```
Click nút FAB GPS ⊕
  → navigator.geolocation.getCurrentPosition()
  → flyTo(lat, lng, zoom=16)
  → setHighlightPosition([lat, lng])
  → openProposalForm(lat, lng)
  → Modal form mở với tọa độ
```

#### Mode 2: Chọn trên bản đồ
```
Click "Chọn trên bản đồ" trong menu
  → setSelectingLocation(true)
  → Hiển thị hint: "Di chuyển bản đồ đến vị trí cần chọn"
  → User click trên bản đồ
  → onMapClick(lat, lng, 'confirm')
  → openProposalForm(lat, lng)
  → Modal form mở với tọa độ
```

#### Mode 3: Google Maps Link
```
Dán link vào input
  → Enter hoặc click ✓
  → parseGoogleMapsLink(url)
  → flyTo(lat, lng)
  → setHighlightPosition([lat, lng])
  → openProposalForm(lat, lng)
  → Modal form mở với tọa độ
```

---

## 8. Files Đã Sửa

| File | Thay đổi |
|------|----------|
| `frontend/src/utils/mapHelpers.js` | Thêm `parseGoogleMapsLink`, `resolveGoogleMapsShortUrl`, `MARKER_COLORS` |
| `frontend/src/components/MapView.jsx` | Legend, FAB group (2 nút), SVG icons, Google Maps parser, FlyToLocation |
| `frontend/src/pages/user/MapPage.jsx` | Bỏ top bar, 3 mode tạo đề xuất, highlight marker |
| `frontend/src/App.css` | CSS mới: legend, FAB group, create menu, responsive |

---

## 9. CSS Classes Mới

### Map Legend
```css
.map-legend          /* Box chú thích góc trên trái */
.map-legend-title    /* Tiêu đề "Chú thích" */
.map-legend-item     /* Mỗi dòng trạng thái */
.map-legend-dot      /* Dot màu trạng thái */
.map-legend-label    /* Label tên trạng thái */
```

### Floating Action Buttons
```css
.map-fab-group       /* Container 2 nút FAB */
.map-fab             /* Base style nút tròn */
.map-fab-location    /* Nút GPS (trắng + icon xanh) */
.map-fab-create      /* Nút tạo đề xuất (xanh + icon trắng) */
.map-fab-active      /* Active state (đỏ, xoay 45°) */
```

### Create Menu
```css
.map-create-menu           /* Popup menu 3 lựa chọn */
.map-create-option         /* Mỗi option trong menu */
.map-create-option-input   /* Option dán link (có input) */
.map-google-confirm        /* Nút ✓ xác nhận link */
```

---

## 10. Google Maps Style Colors

```
Primary Blue:    #4285f4
Hover Blue:      #3367d6
Success Green:   #34a853
Hover Green:     #2d9249
Error Red:       #ea4335
Hover Red:       #d33426
Text Dark:       #333
Text Gray:       #5f6368
Border Light:    #dadce0
Background:      #f1f3f4
```
