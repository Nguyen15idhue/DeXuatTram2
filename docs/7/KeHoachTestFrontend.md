# Kế hoạch Test Frontend (Playwright MCP)

## 0. Thông tin chung

- Mục đích: kiểm tra toàn diện frontend React + Vite theo 5 nhóm yêu cầu, thực thi chuẩn bằng Playwright MCP (AI điều khiển trình duyệt) + Playwright Test (script lưu lại, chạy lặp).
- Phạm vi: tất cả routes trong `frontend/src/App.jsx`, forms/views dynamic của 3 entity, `/map`, buttons + phân quyền hiển thị.
- Môi trường:
  - Docker Compose đang chạy: frontend `http://localhost:5173`, backend `http://localhost:3000`, MySQL `localhost:3306`.
  - Swagger: `http://localhost:3000/api-docs` để đối chiếu API khi test fail.
  - Trình duyệt test: Chromium (Playwright mặc định, headed khi debug map).
- Tài khoản test cần seed sẵn (không dùng acc thật):

| Role | Email đề xuất | Quyền kỳ vọng |
|---|---|---|
| SUPER_ADMIN | super@test.local / 123456 | Thấy hết mọi trang, gồm cấu hình |
| ADMIN | admin@test.local / 123456 | Quản lý proposals + stations + users, không vào trang cấu hình SUPER_ONLY |
| SALES | sales@test.local / 123456 | Chỉ 4 trang `/admin`, `/admin/users`, `/admin/stations`, `/admin/proposals`; xem trạm, không nút Sửa |
| CTV | ctv@test.local / 123456 | Chỉ proposal của chính mình, không vào `/admin/*` |
| Guest | không login | Chỉ `/de-xuat`, `/login`, `/register` |

- Ghi chú type: `AGENTS.md` ghi 13 types là cũ. Code hiện tại là **15 types** (`FieldManager.jsx:14`, `fieldMapper.js:1`, `validators.js:25-56`): `text, textarea, number, email, phone, url, date, datetime, boolean, select, multiselect, file, formula, password, table`. Toàn bộ kế hoạch dưới dùng 15 types này.

### Ma trận 15 types + kỳ vọng

| # | Type | Nhập hợp lệ | Nhập lỗi phải báo | Hiển thị table kỳ vọng |
|---|---|---|---|---|
| 1 | text | chuỗi thường | required rỗng | text thô |
| 2 | textarea | nhiều dòng | required rỗng | giữ xuống dòng / tooltip |
| 3 | number | số, đúng decimal_places + display_format (plain/comma/dot/space) + unit | chữ, sai range | format theo `formatNumber.js` + unit |
| 4 | email | `a@b.com` | thiếu @/. | link/text, sai thì báo `không hợp lệ` |
| 5 | phone | đúng 10 chữ số (`validators.js:33`) | 9/11 số, chữ | text, sai thì báo |
| 6 | url | `https://...` | chuỗi không URL | link clickable |
| 7 | date | DD/MM/YYYY (hoặc theo date_format) | ngày không tồn tại | đúng date_format cấu hình |
| 8 | datetime | ngày + giờ | giờ thiếu/sai | đúng format datetime |
| 9 | boolean | check/uncheck | — | badge/checkbox, không hiện rỗng |
| 10 | select | 1 option (manual hoặc Data List, có thể cascading) | giá trị ngoài options | badge màu + borderRadius |
| 11 | multiselect | nhiều options, mảng | 1 phần tử sai → báo `chứa giá trị không hợp lệ` | nhiều badge |
| 12 | file | upload <=10MB, preview/download đúng loại (img/video/audio/pdf/docx/xlsx/txt) | >10MB, loại cấm | link + count, không vỡ layout |
| 13 | formula | pre-compute trong form + post-compute sau tạo record, đúng outputFormat/unit | formula lỗi → báo validate `/api/formulas/validate` | số đã tính + format |
| 14 | password | >=6 ký tự, `type=password`, autocomplete new-password, loại khỏi formula/Excel | <6 ký tự | luôn `********`, không lộ (`excelService.js:312`) |
| 15 | table | mảng rows, thêm/xóa dòng, từng cột con đúng column_type | không phải mảng → báo `phải là mảng` | count/summary, không vỡ table cha |

## 1. FE-01 — Smoke tất cả trang tồn tại trong mã nguồn

Nguồn đối chiếu: `App.jsx:42-77` + `pages/` (22 files).

| ID | Route | Role test | Bước (MCP) | Kết quả mong đợi |
|---|---|---|---|---|
| FE-01-01 | `/login` | guest | `browser_navigate` → snapshot | Form email/password + nút Đăng nhập, không console error |
| FE-01-02 | `/register` | guest | navigate → fill full_name/email/phone/password → submit | Validate full_name>=2, email regex, phone 10 số, password>=6 (`validators.js:62-86`); thành công thì chuyển login |
| FE-01-03 | `/de-xuat` | guest | navigate → điền DynamicForm proposal guest | Guest tạo được proposal không cần login (`user_id` NULL), tọa độ nhập tay được |
| FE-01-04 | `/map` | user đã login | navigate → snapshot | Xem FE-04 |
| FE-01-05 | `/my-proposals` + `/my-proposals/*` | CTV | navigate | Chỉ thấy proposal của mình, mini map click → sync lat/lng vào form qua `initialData` |
| FE-01-06 | `/profile` | user | navigate → đổi tên/phone + đổi password | Đổi pass sai current → báo lỗi; đúng thì success |
| FE-01-07 | `/admin` | SALES+ | navigate | Dashboard load, SALES thấy được |
| FE-01-08 | `/admin/users` + `/admin/users/*` | SALES+ | navigate | Table users load (RecordDetailPage cho `/*`) |
| FE-01-09 | `/admin/stations` + `/admin/stations/*` | SALES+ | navigate | Table stations load, SALES không có nút Sửa |
| FE-01-10 | `/admin/proposals` + `/admin/proposals/*` | SALES+ | navigate | Table proposals load |
| FE-01-11 | `/admin/fields` | SUPER_ONLY | SALES navigate → bị chặn; SUPER navigate → pass | `RoleRoute allowed=SUPER_ONLY` (`App.jsx:66`) |
| FE-01-12 | `/admin/forms` + `/admin/forms/:id/edit` | SUPER_ONLY | tương tự | FormBuilder drag&drop load |
| FE-01-13 | `/admin/views` + `/admin/views/:id/edit` | SUPER_ONLY | tương tự | ViewBuilder load |
| FE-01-14 | `/admin/:entity/:id/files` | ADMIN+ | navigate với id thật | List file theo record, download auth-aware |
| FE-01-15 | `/admin/data-lists` + `/admin/data-lists/:id` | SUPER_ONLY | navigate | DataListManager/Editor load |
| FE-01-16 | `/admin/map-config` | SUPER_ONLY | navigate | Config tile/center/zoom load |
| FE-01-17 | `/admin/roles` | SUPER_ONLY | navigate | Phân quyền roles load |
| FE-01-18 | `/admin/api-configs` | SUPER_ONLY | navigate | Api config load, password input masked |
| FE-01-19 | `/` + `*` | guest | navigate | Redirect về `/login` |

Tiêu chí pass chung: HTTP 200, không trắng trang, không lỗi console đỏ, không gọi sai API (check Network trong MCP trace), loading → empty/error state hiển thị đúng.

Playwright mapping: `e2e/FE-01-smoke.spec.js` — loop mảng routes, `await page.goto(route)`, `expect(page.locator('body')).not.toBeEmpty()`, gom `page.on('console'/'pageerror')` fail nếu có exception. Role thì dùng `storageState` riêng từng role (xem §6).

## 2. FE-02 — Forms chi tiết (3 entity x create/view x 15 types)

Entity: `stations`, `station_proposals`, `users` (`FieldManager.jsx:15`).

### 2.1 Cấu hình có hiển thị được không (`/admin/forms`)

| ID | Bước | Mong đợi |
|---|---|---|
| FE-02-CFG-01 | SUPER login → `/admin/forms` → snapshot | List đủ 3 entity, mỗi form có fields + order |
| FE-02-CFG-02 | Vào `/admin/forms/:id/edit` | FormBuilder hiện available fields + assigned fields, drag&drop đổi order_index, sửa visible/colSpan/required, save persist (reload vẫn giữ) |
| FE-02-CFG-03 | Check field `source_type=fixed` | Không cho đổi key/xóa (rule 15) |
| FE-02-CFG-04 | Check select/multiselect nguồn Data List + cascading (`parent_field` + `relation_key`) + formula (compute_mode pre/post, expression, referencedFields) | Config lưu được, load lại còn nguyên |

### 2.2 Form thực tế có dùng đúng dynamic config không

| ID | Form thực tế | Check |
|---|---|---|
| FE-02-USE-01 | `/de-xuat` (guest create proposal) | Dùng `DynamicForm`, nhập tay lat/lng được |
| FE-02-USE-02 | `/map` popup đề xuất | Cùng config proposal nhưng click bản đồ → fill tọa độ |
| FE-02-USE-03 | `/my-proposals` create/edit | Dùng `DynamicForm`, mini map click → sync `initialData` |
| FE-02-USE-04 | `/admin/stations` create/edit | Dùng `DynamicForm` theo `/admin/forms` entity stations |
| FE-02-USE-05 | `/admin/proposals` create/edit + duyệt | Dùng `DynamicForm` entity station_proposals; check ownership (CTV chỉ sửa của mình, admin bypass) |
| FE-02-USE-06 | `/admin/users` create/edit + đổi password | Dùng dynamic entity users; password masked, >=6 ký tự |
| FE-02-USE-07 | View detail (`RecordDetailPopup` / `RecordDetailPage` + `FieldRenderer`) | Hiển thị đủ field theo form view, `allowEdit={!isSales}` — Sales không thấy nút Sửa trạm |

Cách verify "dùng đúng dynamic": so field list render ra với `GET /api/forms?entity=` (hoặc `getFormConfig`): đủ trường visible, đúng `order_index`, đúng `colSpan` layout, không hardcode field lẻ. Nếu form nào render field không có trong config → fail.

### 2.3 Nhập 15 types có lỗi không (lặp cho create + view của 3 entity)

Mỗi type chạy 3 case: (a) hợp lệ → submit pass, (b) rỗng khi required → báo `là bắt buộc`, (c) sai định dạng → báo đúng message `validators.js`.

Case đặc biệt:
- number: đổi `number_format/display_format/decimal_places/unit`, nhập `1000` → hiển thị `1,000`/`1.000`/`1 000` đúng + parse ngược khi submit (`parseFormattedNumber`).
- select cascading: chọn parent → child filter đúng (`tree[relationKey][parentVal]`), đổi parent thì reset child.
- file: upload ảnh + pdf + xlsx, check FileViewer zoom/play/render inline, xóa + download lại được.
- formula pre: đổi referencedFields → output recompute realtime; post: tạo record → reload → giá trị post-compute đã update.
- password: nhập `123` → báo `ít nhất 6 ký tự`; nhập đúng → lưu hash, reload không hiện lại plaintext.
- table: thêm 2 dòng, nhập cột con number/select, xóa 1 dòng, submit → reload còn nguyên; submit mảng sai → báo `phải là mảng`.

Playwright mapping: `e2e/FE-02-forms.spec.js` — `browser_fill` từng `DynamicField` theo `data-testid`/label, `browser_snapshot` check order/layout, intercept `POST /api/*` check payload `custom_data` cho `source_type=json`. Formula thì gọi thêm `POST /api/formulas/validate` để đối chiếu.

## 3. FE-03 — Views chi tiết (3 entity)

### 3.1 Cấu hình có được không (`/admin/views`)

| ID | Bước | Mong đợi |
|---|---|---|
| FE-03-CFG-01 | SUPER → `/admin/views` | List views theo 3 entity |
| FE-03-CFG-02 | `/admin/views/:id/edit` | ViewBuilder drag&drop columns, sửa width/sortable/filterable/visible, save + reload giữ nguyên |
| FE-03-CFG-03 | Ẩn 1 cột → save | Table thực tế mất cột đó; hiện lại thì có |

### 3.2 Table thực tế

| ID | Table | Check |
|---|---|---|
| FE-03-USE-01 | `/admin/users` | Dùng `DynamicTable`, đúng columns view users, password không lộ |
| FE-03-USE-02 | `/admin/stations` | Đúng columns view stations, sort theo cột sortable, filter theo cột filterable |
| FE-03-USE-03 | `/admin/proposals` | Tương tự + badge status PENDING/REVIEWING/APPROVED/REJECTED |
| FE-03-USE-04 | `/my-proposals` table | Dùng view/config rút gọn, chỉ rows của mình |
| FE-03-COL-01..15 | 15 types trên table | Đối chiếu bảng §0: number có format+unit, date/datetime đúng format, select/multiselect badge màu, file hiện link/count, formula hiện giá trị đã tính, password `********`, table hiện count không vỡ layout |
| FE-03-SORT-01 | Click header sortable 2 lần | ASC → DESC, thứ tự rows đổi đúng |
| FE-03-FILTER-01 | Nhập DynamicFilter theo từng type | Lọc đúng (number range, date range, select exact, text contains) |
| FE-03-PAGE-01 | Pagination + page-size | Chuyển trang giữ sort/filter |

Verify "dùng đúng dynamic": so columns render với `GET /api/views?entity=`: đủ cột visible, đúng order + width, không hardcode cột.

Playwright mapping: `e2e/FE-03-views.spec.js` — `browser_click` header sort, `browser_fill` filter, `expect(columnHeaders).toEqual(viewConfigOrder)`, screenshot full table để check format 15 types.

## 4. FE-04 — `/map`

| ID | Bước (MCP) | Mong đợi |
|---|---|---|
| FE-04-01 | Login → `browser_navigate /map` → snapshot | Tile `<img.leaflet-tile>` load, không hiện warning khi tile lỗi (tự fallback `/tiles/{z}/{x}/{y}`) |
| FE-04-02 | Check markers | Station ACTIVE → marker xanh, DEPLOYING → marker vàng, proposal → màu theo status; đếm markers == số records API trả |
| FE-04-03 | Zoom/pan + bật/tắt layer điểm + layer ranh giới tỉnh | Layer ẩn/hiện đúng, ranh giới tỉnh vẽ được (polygon/geojson) |
| FE-04-04 | Click bản đồ → mở form đề xuất | lat/lng click-to-fill vào DynamicForm, submit tạo proposal có tọa độ đó |
| FE-04-05 | Geolocation | Từ chối/quá hạn → console `console.error('[MapView] Geolocation error:')` + user thấy alert; cho phép → center về vị trí mình |
| FE-04-06 | Tile server lỗi (block `*.tile.*` trong Playwright route) | Bản đồ vẫn hiện qua proxy, không warning cho user |

Playwright mapping: `e2e/FE-04-map.spec.js` — `page.route('**tile**', abort)` cho fallback case, `expect(page.locator('.leaflet-marker-icon')).toHaveCount(n)`, check `getComputedStyle(marker).backgroundColor` hoặc class màu, screenshot `map.png`.

## 5. FE-05 — Buttons + phân quyền hiển thị frontend

### 5.1 Ma trận hiển thị (snapshot menu + nút theo role)

| Trang | SUPER_ADMIN | ADMIN | SALES | CTV | Guest |
|---|---|---|---|---|---|
| `/map`, `/profile` | x | x | x | x | `/map` cần login, guest không |
| `/my-proposals` | x | x | x | x (chỉ của mình) | — |
| `/de-xuat` | x | x | x | x | x |
| `/admin` | x | x | x | — | — |
| `/admin/users`, `/admin/stations`, `/admin/proposals` | x | x | x | — | — |
| `/admin/fields`, `/admin/forms`, `/admin/views`, `/admin/data-lists`, `/admin/map-config`, `/admin/roles`, `/admin/api-configs` | x | — (redirect/chặn) | — | — | — |
| Nút Sửa trạm (`RecordDetailPopup allowEdit`) | x | x | — (ẩn) | — | — |
| Nút Sửa/xóa proposal | x (all) | x (all) | x (theo quyền xem?) | chỉ của mình | — |
| Nút X (X icon lucide) trên mọi create modal | x | x | x | x | x |

### 5.2 Buttons hoạt động không (click hết)

FE-05-BTN-01..n cho mỗi trang: Create → mở modal có nút X góc phải title → submit/đóng; Edit → save đổi dữ liệu; Delete → ConfirmDialog → xóa; Upload/Download/Export/Import Excel → file về đúng; Pagination/Filter/Sort → đổi dữ liệu; Login/Logout/Register → chuyển route + clear token.

Playwright mapping: `e2e/FE-05-rbac-buttons.spec.js` — matrix login từng role (storageState), `expect(menuItem).toBeVisible()/toBeHidden()`, loop `page.getByRole('button')` click + assert không `pageerror`. Sales vào `/admin/fields` → `expect(page).toHaveURL(/login|admin$/)` hoặc thông báo chặn.

## 6. Setup Playwright MCP + Playwright Test từ đầu

### 6.1 Cài đặt (Windows PowerShell 5.1, UTF-8)

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm install -D @playwright/test
npx playwright install chromium
npx @playwright/mcp@latest --help
```

`opencode.json` ở root (đã tạo sẵn trong task này):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest"],
      "enabled": true
    }
  }
}
```

Restart OpenCode → có tools `playwright_browser_navigate/snapshot/click/fill/screenshot/trace`.

### 6.2 Cấu trúc test

```
e2e/
  playwright.config.js      # baseURL http://localhost:5173, trace on-fail, screenshot only-on-failure
  auth.setup.js             # login 4 role → lưu storageState/*.json
  FE-01-smoke.spec.js
  FE-02-forms.spec.js
  FE-03-views.spec.js
  FE-04-map.spec.js
  FE-05-rbac-buttons.spec.js
```

`playwright.config.js` mẫu:

```js
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

Chạy:

```powershell
npx playwright test --list
npx playwright test e2e/FE-01-smoke.spec.js --headed
npx playwright test --reporter=html; npx playwright show-report
```

### 6.3 Quy ước pass/fail + báo cáo

- Pass: đúng mong đợi từng ID + không console error + không request 4xx/5xx ngoài case cố ý test lỗi.
- Fail: chụp screenshot + trace + ghi `expected vs actual` + API response (`/api-docs` để đối chiếu).
- Report: `playwright-report/` + bảng tổng hợp trong file này (cột Result: Pass/Fail/Skip + ghi chú).
- Definition of Done: FE-01..FE-05 pass trên Chromium headed, Sales/CTV matrix đúng, không vỡ hot-reload Docker, Swagger vẫn load.

## 7. Bảng tổng hợp kết quả (điền khi chạy)

| ID | Mô tả | Role | Result | Ghi chú / link trace |
|---|---|---|---|---|
| FE-01-01..19 | Smoke pages | guest+4 roles | Pass 18/18 (09/09/2026, Chromium, `e2e/FE-01-smoke.spec.js`) | Lưu ý: `baseURL` phải nằm trong `use`, không để top-level nếu không `goto('/login')` báo invalid URL |
| FE-02-CFG-01..04 | Form config | SUPER |  |  |
| FE-02-USE-01..07 | Form dùng đúng dynamic | all |  |  |
| type-01..15 x3 entity | Nhập 15 types | all |  |  |
| FE-03-CFG-01..03 | View config | SUPER |  |  |
| FE-03-USE-01..04, COL, SORT, FILTER, PAGE | Table thực tế | all |  |  |
| FE-04-01..06 | Map | user |  |  |
| FE-05 matrix + BTN | Buttons + RBAC | all |  |  |
