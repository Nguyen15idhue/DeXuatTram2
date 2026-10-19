# Fix: đổi nền bản đồ (Đường phố → Vệ tinh) làm mất marker trạm/đề xuất

## 1. Hiện tượng

Ở trang `/map` (và mọi nơi dùng `MapCanvas` với renderer `maplibre`: modal bản đồ
lân cận, `LocationMapModal`, preview ở `/admin/map-config`), khi đổi **Mode** từ
"Đường phố" sang "Vệ tinh" (hoặc "Địa hình", "Vệ tinh + nhãn") thì **mất toàn bộ
đối tượng do app vẽ**: icon trạm sạc, marker đề xuất, nhu cầu sạc xe, cluster,
polyline khoảng cách, ranh giới, nhãn tỉnh/xã. Ảnh nền vệ tinh vẫn hiển thị bình
thường nên rất dễ tưởng là "không có dữ liệu".

## 2. Nguyên nhân

`frontend/src/components/map/renderers/maplibreRuntime.js` → `runtime.setStyle()`:

```js
map.setStyle(resolved);              // (1) xoá toàn bộ source/layer của app
map.once('style.load', () => {       // (2) đăng ký listener SAU khi setStyle
  applyAll();                        //     → vẽ lại marker/overlay
});
```

`map.setStyle()` gỡ **tất cả** source + layer do app thêm (`app-markers`,
`app-clustered`, `app-polylines`, `app-boundaries`, `app-circle-*`, nhãn…), nên
việc vẽ lại phụ thuộc hoàn toàn vào `applyAll()` trong callback `style.load`.

Vấn đề: **MapLibre bắn `style.load` đồng bộ ngay bên trong `map.setStyle()`** khi
style truyền vào là **object** (đúng trường hợp `rasterStyle()` của Vệ tinh/Địa
hình và style PMTiles/hybrid). Listener đăng ký ở (2) vì thế **không bao giờ
được gọi** → `applyAll()` không chạy → không có layer nào được thêm lại.

Với "Đường phố" style là **URL** (`https://tiles.openfreemap.org/styles/liberty`)
nên MapLibre phải fetch rồi mới load → `style.load` bắn **bất đồng bộ** → listener
kịp đăng ký → vẫn hoạt động. Đây chính là lý do lỗi chỉ xuất hiện khi chuyển sang
các mode dùng style object.

Bằng chứng đo được trên trình duyệt (MapLibre 6.9.0):

| Phép đo | Kết quả |
|---|---|
| `map.once('style.load')` đăng ký trước `setStyle(object)` | callback chạy ✔ |
| `map.setStyle(object)` rồi mới `map.once('style.load')` | callback **không chạy** ✘ |
| Sau khi sang Vệ tinh (trước fix) | `style.layers` không còn layer `app-*` nào, `sources = ['satellite']` |
| Sau khi sang Vệ tinh (trước fix) | hook `addLayer`/`addSource` **không được gọi lần nào** |

## 3. Cách xử lý

Đăng ký listener **trước** `map.setStyle()` và gỡ listener nếu `setStyle` ném lỗi;
đồng thời giữ tham chiếu listener đang chờ để đổi mode liên tiếp không chồng
listener.

```js
if (pendingStyleLoad) {
  map.off('style.load', pendingStyleLoad);
  pendingStyleLoad = null;
}
const onStyleLoad = () => {
  pendingStyleLoad = null;
  _3dApplied = false;
  applyAll();
};
pendingStyleLoad = onStyleLoad;
map.once('style.load', onStyleLoad);
try {
  map.setStyle(resolved);
} catch (err) {
  map.off('style.load', onStyleLoad);
  pendingStyleLoad = null;
  console.error('[MapLibre] setStyle error:', err.message);
}
```

Cách này đúng cho **cả hai** trường hợp (style object bắn đồng bộ, style URL bắn
bất đồng bộ) nên không cần phân nhánh theo kiểu style.

## 4. Phạm vi ảnh hưởng (đã kiểm chứng)

Sửa 1 chỗ trong runtime nên tất cả nơi dùng `MapCanvas` + MapLibre đều được:

| Màn hình | Trước fix | Sau fix |
|---|---|---|
| `/map` — Đường phố → Vệ tinh | 0 layer app | 9 layer app, 2 marker trạm render đủ |
| `/map` — Vệ tinh + nhãn / Địa hình | 0 layer app | đủ layer app |
| `/map` — quay lại Đường phố | 0 layer app | đủ layer app |
| Modal "Trạm sạc lân cận 20 km" (form khách) | mất marker | đủ `app-unclustered` + icon + `app-circle-*` |
| `LocationMapModal` (nút "Xem bản đồ" ở popup trạm) | mất marker | đủ 10 layer app |
| Preview `/admin/map-config` | mất marker | đủ layer app |

## 5. Test chống hồi quy

`e2e/FE-08-map-mode-switch.spec.js` — xoay vòng 4 mode (Vệ tinh → Vệ tinh + nhãn
→ Địa hình → Đường phố), mỗi bước khẳng định:

1. Nền bản đồ **thực sự đã đổi** (Vệ tinh/Địa hình: không còn source vector;
   Vệ tinh + nhãn/Đường phố: có source vector) — tránh test "pass giả" khi click
   không ăn.
2. Còn đủ 3 layer marker: `app-unclustered`, `app-marker-glyphs-circle`,
   `app-marker-glyphs-flat`.
3. Tập layer `app-*` sau khi xoay vòng **bằng đúng** tập ban đầu.
4. Không có `pageerror`.

Đã xác nhận test **bắt được lỗi thật**: tạm hoàn nguyên fix → test fail với
`Expected: 3, Received: 0` ở bước "Vệ tinh"; khôi phục fix → pass.

## 6. Ghi chú

- `applyAll()` sau `style.load` vẫn là đường duy nhất vẽ lại overlay; mọi thay đổi
  style khác trong tương lai phải đi qua `runtime.setStyle()` để dùng chung cơ chế
  này.
- Ảnh glyph (`map.addImage`) cũng bị xoá khi `setStyle`; `applyMarkers()` gọi
  `ensureGlyphImages()` để nạp lại nên icon hiện đúng ngay sau khi đổi mode.
- 3 test FE-03/FE-04/FE-05 fail khi chạy cả bộ là do **thiếu user seed** trong DB
  local (`mkt.test@station.com`, `taild.egreen@tmt-vietnam.com` không tồn tại —
  DB chỉ có 4 user, 0 role MKT), không liên quan thay đổi này. Chạy riêng
  FE-06/FE-07/FE-08: 15/15 pass.
