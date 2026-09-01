# UI/UX Features & Optimizations

## Tổng quan

Frontend React 18 + React Router v6, sử dụng Leaflet cho bản đồ, cấu hình trường/form/view động từ server. 47 source files, 3 layout tiers (Public, User, Admin).

---

## 1. Layout System

### PublicLayout (Unauthenticated)
- Hiển thị khi chưa đăng nhập
- Card container centered trên gradient background
- Tự redirect nếu đã đăng nhập → `/admin` (admin) hoặc `/map` (user)

### UserLayout (Authenticated User)
- Sidebar navigation: Bản đồ, Đề xuất của tôi, Profile
- Hamburger menu trên mobile với overlay
- Header hiển thị tên user + logout button
- Link "Admin Panel" chỉ hiện khi user là admin
- Active route highlight qua `useLocation()`

### AdminLayout (Admin Only)
- Sidebar 250px fixed với grouped navigation
- Sections: Dashboard, Management (Users/Stations/Proposals), Configuration (Fields/Forms/Views/Data Lists)
- Mobile: Sidebar slide-in từ trái với overlay
- Footer: User info (name, role) + logout
- Triple guard: loading check → auth check → admin role check

---

## 2. Authentication Pages

### Login
- Email + password form với HTML5 validation
- Loading state trên submit button
- Error display qua ErrorMessage component
- Link sang register page

### Register
- Form: full_name, email, phone, password, confirmPassword
- Client-side password match validation
- Loading state trên submit
- Tự login sau khi register thành công

---

## 3. User Features

### Map (MapPage)
**Bản đồ tương tác chính:**
- Leaflet với CARTO light basemap, centered trên Vietnam
- Hiển thị markers cho stations và proposals
- Marker colors theo status:
  - Stations: `ACTIVE` = xanh, `DEPLOYING` = vàng
  - Proposals: `PENDING` = cam, `REVIEWING` = xanh dương, `APPROVED` = xanh lá, `REJECTED` = đỏ

**Tạo đề xuất mới (3 cách):**
1. **My Location**: Dùng `navigator.geolocation.getCurrentPosition()` với high accuracy
2. **Pick on map**: Click vào map để chọn vị trí, có marker đỏ + flyTo animation
3. **Google Maps link**: Dán URL, parse tọa độ client-side hoặc resolve short URL server-side

**Workflow:**
1. User chọn vị trí → tọa độ hiển thị trong blue info box
2. Dynamic form (form ID 9) render cho `station_proposals`
3. Submit → tạo proposal qua API
4. Toast notification thành công
5. Map refresh qua `key` increment (force remount)
6. Highlight vị trí mới tạo với flyTo animation 1.5s

**Legend:** Floating panel top-left với 6 status colors + labels tiếng Việt

### My Proposals (MyProposalsPage)
- DynamicTable với view ID 8
- Status filter dropdown
- Phân trang server-side
- CRUD actions:
  - **View**: Mở RecordDetailPopup (bất kỳ status nào)
  - **Edit**: Chỉ khi status = PENDING
  - **Delete**: Chỉ khi status = PENDING, xác nhận trước khi xóa
- Deep-link: `/my-proposals/view=5` hoặc `/my-proposals/edit=5`

### Profile (ProfilePage)
- View mode: Hiển thị full_name, email (read-only), phone, role, status
- Edit mode: Toggle edit button
  - Email hiển thị read-only (greyed out)
  - Phone editable
  - Password change section: current password required, min 6 chars, confirm match
- Update qua API → cập nhật AuthContext

---

## 4. Admin Features

### Dashboard (AdminDashboard)
- 3 stat cards: Users (total/active/locked), Stations (total/active/deploying), Proposals (total/pending/approved/rejected)
- Loading state với "..." placeholders

### Users Management (AdminUsersPage)
- DynamicTable với view ID 7
- Search: text input (tìm name, email, phone)
- Status filter dropdown
- Actions:
  - View/Edit → RecordDetailPopup
  - Lock/Unlock toggle
  - Delete (chỉ non-admin, không xóa chính mình)
- Deep-link: `/admin/users/view=5`

### Stations Management (AdminStationsPage)
**Tính năng phong phú nhất:**
- DynamicTable với view ID 6
- Search + filter theo status
- **Tạo trạm mới:**
  - Text inputs: name, address, description
  - Embedded Leaflet map picker — click để set lat/lng
  - Status dropdown
  - Validate required fields trước khi submit
- **Excel Import (3 bước):**
  1. Upload: Chọn file .xlsx/.xls, hiển thị file info
  2. Preview: Tổng rows, valid rows, error rows
  3. Confirm: Gọi confirm API, refresh list
- **Excel Export:** Download `stations.xlsx`
- **Download Template:** Download template import
- Actions: View, Edit, Delete (xác nhận)
- Deep-link: `/admin/stations/view=5`

### Proposals Management (AdminProposalsPage)
- DynamicTable với view ID 8
- Status filter dropdown
- **Inline status change:** `<select>` trong mỗi row để cập nhật nhanh
- Export Excel
- Actions: View, Edit, inline status, Delete (xác nhận)
- Deep-link: `/admin/proposals/view=5`

### Fields Management (AdminFieldsPage)
- CRUD field definitions
- Form modal với cấu hình chi tiết theo loại
- Filter theo entity và status
- Status toggle (click badge)
- Fixed fields (`source_type=fixed`) không sửa/xóa được

### Forms Builder (AdminFormsPage → AdminFormBuilderPage)
- Entity grid: 3 entity cards với form status
- Tạo form mới → FormBuilder
- **FormBuilder:**
  - Two-panel layout: Available Fields (trái) + Form Fields (phải)
  - Entity selector để chuyển đổi available fields
  - Click để thêm field
  - HTML5 drag & drop để sắp xếp lại
  - Per-field config: Visible toggle, Col span (1-4)
  - Save: sync form fields (add/update/remove)

### Views Builder (AdminViewsPage → AdminViewBuilderPage)
- Tương tự Forms Builder nhưng cho tables
- Per-column config: Visible toggle, Width (px), Sortable, Filterable

### Data Lists Management (AdminDataListsPage)
- **DataListManager:** CRUD data lists
  - Name, description, columns_config (dynamic add/remove columns)
  - Navigate to editor
- **DataListEditor:** Inline data editing
  - Double-click cell để edit
  - Enter để save, Escape để cancel
  - Thêm row mới tại bottom
  - Delete row
  - Visual cues: green border (new row), blue border (editing cell)

### Record Files (AdminRecordFilesPage)
- Browse tất cả files uploaded cho 1 record
- File grid: Cards với icon, name, MIME type
- Select all / individual selection checkboxes
- Batch download
- Per-file actions: View, Download, Open in new tab

---

## 5. Dynamic Components System

### DynamicField (Form Input)
- 13 field types với rendering phù hợp
- Custom select dropdown với badge màu
- Multiselect với checkbox group + badge styling
- File upload delegation
- Formula read-only computed field

### DynamicForm (Form Engine)
- Server-driven: Load config từ API
- Default values: `initialData` hoặc field `default_value`
- Data list integration: Tree-structured option filtering
- Parent-child cascading: Auto-filter options
- Formula computation: Auto-compute khi form data thay đổi (mathjs v15.2.0)
- Layout: Configurable colSpan (1-4 columns CSS grid)
- Validation: Required field validation, inline errors
- Children slot: Custom action buttons

### DynamicTable (Data Table)
- Server-driven columns từ view config
- **Client-side sorting:** Click column header, cycles asc→desc→none, `localeCompare` với Vietnamese locale
- **Client-side filtering:** Filter row với text inputs
- **STT column:** Auto-numbered row index
- Field rendering qua FieldRenderer
- Custom actions render prop
- Column visibility control

### FieldRenderer (Read-only Display)
- Type-aware display: badge cho select, ✓ cho boolean, formatNumber() cho number, select number options
- File: "Xem file (N)" → FileListPopup
- React.lazy + Suspense cho FileListPopup
- Formula: formatNumber() với output config (URL → link)

### FormulaEditor (Visual Formula Builder)
- Inline editor với compute mode selector (pre/post)
- Field buttons: danh sách fields của entity
- Operator buttons: 9 operators trong operators-grid-3 (3 columns)
- Function buttons: 26 custom functions với hints tiếng Việt
- Autocomplete dropdown: detect word at cursor, keyboard navigation (Arrow/Enter/Escape)
- Collapsible sections: "Phép toán & Hàm", "Fields", "Metadata"
- Output config: numberFormat selector (plain/comma/dot/space), decimalPlaces, unit
- Real-time validation (debounce 300ms) + preview

### Number Formatting (formatNumber utility)
- 4 display formats: `plain` (1000), `comma` (1,000), `dot` (1.000), `space` (1 000)
- Configurable unit display (VD: "1.000 m", "1,000 kW")
- parseFormattedNumber(): parse formatted string về number
- Applied in: FieldRenderer, FormulaEditor output, DynamicForm computeFormula, DataListEditor cells
- DB: `display_format` VARCHAR(20) DEFAULT 'plain', `unit` VARCHAR(50) trong `field_definitions`

### FileUpload
- Drag & drop zone với visual feedback
- Click to select fallback
- Multi-file support
- File size validation
- Image preview thumbnail

### FileViewer
- 8 file types: image, video, audio, pdf, word, excel, text, unknown
- Image: Zoomable 25%-400%
- Word: mammoth.js → HTML
- Excel: xlsx → table rendering
- Auth-aware fetch với Bearer token
- Object URL cleanup on unmount

### FileListPopup
- Select all / individual selection
- Batch download: Single file hoặc multi-file ZIP (JSZip + file-saver)
- Open in new tab: Word/Excel → HTML → `window.open()`

---

## 6. Responsive Design

### Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| `> 1024px` | Full sidebar 250px, 3-column stats |
| `≤ 1024px` | Narrower sidebar 200px, 2-column stats |
| `≤ 768px` | Sidebar → slide-in drawer, hamburger menu, stacked layout, single-column stats |
| `≤ 480px` | Smaller fonts, tighter spacing, wrapped pagination |

### Mobile Features
- Hamburger menu (UserLayout): Full-screen overlay navigation
- Slide-in sidebar (AdminLayout): Fixed sidebar with left transition
- Overlay backdrop cho cả 2 mobile menus
- Touch-friendly: Larger tap targets

---

## 7. Animations

| Animation | Nơi dùng |
|-----------|-----------|
| `fadeIn` | Toast slide-in |
| `toastIn` | Toast entrance |
| `modalIn` | Confirm dialog scale-in |
| `fabMenuIn` | FAB menu slide-up |
| `spin` | Loading spinner rotation |

---

## 8. Optimizations Đã Áp Dụng

| Optimization | Chi tiết |
|--------------|----------|
| **Module-level caching** | `useFieldOptions` cache field definitions per entity — fetch 1 lần, dùng lại |
| **useCallback** | `loadUsers`, `loadStations`, `loadProposals`, `loadFields`, `loadLists` trong admin pages; `handleCellEdit` trong DataListEditor |
| **useMemo** | `filteredData` và `sortedData` trong DynamicTable; `parentFieldMap` trong DynamicForm |
| **React.lazy + Suspense** | `FileListPopup` lazy load trong FieldRenderer |
| **Abort/cancel pattern** | `useFieldOptions` và `useDataList` dùng cancelled flag |
| **Object URL cleanup** | FileViewer và FileListPopup revoke blob URLs on unmount |
| **Blob URL cleanup** | Excel export service revoke sau khi download |
| **Cache-Control: no-store** | Vite dev server config để tránh browser cache cũ |
| **Manual chunks** | Vite config: leaflet tách ra chunk riêng |

---

## 9. Optimizations Chưa Có (Cơ Hội Cải Thiện)

| Area | Observation |
|------|-------------|
| Route-level code splitting | Tất cả pages eagerly imported; có thể dùng `React.lazy()` |
| API response caching | Không có HTTP caching layer, ETag, hoặc SWR pattern |
| Context value memoization | `AuthProvider` value object recreated mỗi render |
| Debounced search | Search inputs trigger API calls ngay (trừ Enter key) |
| Infinite scroll | Tất cả lists dùng pagination buttons |
| Skeleton loading | Chỉ có text-based loading states, không có skeleton UI |
| Image lazy loading | File previews load eagerly |
| Bundle analysis | Không có monitoring bundle size |

---

## 10. Libraries Bên Ngoài

| Library | Purpose |
|---------|---------|
| `react-router-dom` | Client-side routing |
| `leaflet` / `react-leaflet` | Interactive map |
| `mammoth` | Word (.docx) → HTML conversion |
| `xlsx` | Excel file parsing + rendering |
| `jszip` | ZIP file creation (batch download) |
| `file-saver` | Browser file save utility |
