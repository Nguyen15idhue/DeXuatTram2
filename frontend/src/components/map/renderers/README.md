# Map Renderer Seam

Lớp trừu tượng renderer để cắm MapLibre/Google Maps mà không đụng logic dữ liệu
(stations/proposals/filter/duplicate lines).

## Kiến trúc

- `leafletRenderer.js` — metadata renderer (`id`, `name`, `supports`).
- `leafletRuntime.js` — `createLeafletRuntime({ container, center, zoom })` trả runtime thao tác map.
- `index.js` — registry: `resolveRenderer(id)` (metadata + fallback), `createRuntime(id, args)` (tạo runtime), `listRenderers()`.
- `MapCanvas.jsx` (`components/map/`) — component React mount runtime + đẩy dữ liệu vào runtime. `MapView` dùng `MapCanvas`, KHÔNG import Leaflet trực tiếp.

## Adapter interface (`createRuntime`)

Runtime trả về các hàm/thuộc tính:

| Hàm | Mô tả |
|---|---|
| `supports` | `{ raster, vector, terrain, cluster, labels, polylines }` |
| `setView(center, zoom)` | Đặt tâm/zoom |
| `flyTo(position, zoom)` | Bay tới vị trí |
| `getCenter()`, `getZoom()` | Đọc trạng thái |
| `setTileLayer({ url, attribution, subdomains, maxZoom, onTileError })` | Tile base; đếm lỗi → gọi `onTileError` sau 6 lần |
| `setMarkers(items, { cluster, clusterOptions, showLabels, onMarkerClick, renderPopup })` | Marker + cluster + tooltip + popup (`clusterOptions = { radius: 20-150px, maxZoom: 8-20 }` từ `map_configs`) |
| `setPolylines(pairs, { renderPopup, showLabels })` | Đường trùng lặp + nhãn khoảng cách + popup |
| `setProvinceLabels(points, show)` | Nhãn tỉnh (divIcon) |
| `setBoundaries(geojson, show)` | Ranh giới tỉnh (GeoJSON) |
| `setPoints(points)` | Marker phụ ({ position, color, renderPopup }) |
| `on(event, handler)` / `off(...)` | Sự kiện map (`click`, `zoomend`...) |
| `remove()` | Dọn map |

Renderer chưa hỗ trợ → `createRuntime`/`resolveRenderer` fallback Leaflet kèm cảnh báo, **không vỡ map**.

## Thêm renderer mới (MapLibre — Phase 4)

1. Thêm `create<X>Runtime` vào `renderers/`.
2. Đăng ký trong `index.js` (`RUNTIMES`/`RENDERERS`).
3. MapCanvas giữ nguyên interface → chỉ đổi `renderer` trong `map_configs`.

Popup phải dựng DOM thuần (KHÔNG dùng `<Link>` — popup tạo ngoài React Router context → lỗi `basename`; xem `AGENTS.md` mục Map Marker Rules).
