# Map Renderer Seam

Lớp trừu tượng renderer để sau này cắm Google Maps / MapLibre mà không đụng logic dữ liệu
(stations/proposals/filter/duplicate lines).

## Hiện trạng

- Chỉ hỗ trợ `leaflet` (đang dùng trực tiếp trong `MapView.jsx`).
- `map_configs.renderer` quyết định renderer. Giá trị chưa hỗ trợ → `resolveRenderer()`
  trả về Leaflet kèm cờ `fallback=true` để UI cảnh báo, KHÔNG vỡ map.

## Interface đề xuất khi thêm renderer mới

Một renderer cần cung cấp:

| Thuộc tính / hàm | Mô tả |
|---|---|
| `id`, `name` | Định danh renderer |
| `supportsRasterTiles` | Có hiển thị tile raster XYZ (png) không |
| `supportsVectorTiles` | Có hiển thị vector tile/style.json không |
| `supportsClustering` | Có gom cụm marker không |

Khi triển khai đầy đủ (Google/Maplibre), bổ sung các hàm thao tác map:
`mount(container, options)`, `setView(center, zoom)`, `setTileLayer(tileConfig)`,
`addMarkers(points, { cluster, onMarkerClick, renderPopup })`, `addPolylines(lines)`,
`on(event, cb)`, `destroy()`.

## Google Maps (kế hoạch)

- Thư viện: `@vis.gl/react-google-maps` hoặc load Google Maps JS API động.
- Cluster: `@googlemaps/markerclusterer`.
- Popup: render HTML bằng DOM thuần (KHÔNG dùng `<Link>` vì popup tạo ngoài React Router
  context → lỗi `basename`; xem `AGENTS.md` mục Map Marker Rules 8b).
- Key: nhập qua Admin → Map Config (`tile_provider_id='google-maps'`, `renderer='google'`).
