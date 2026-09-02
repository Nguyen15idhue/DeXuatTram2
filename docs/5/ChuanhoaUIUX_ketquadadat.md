# Chuẩn hóa UI/UX — Kết quả đã đạt

**Ngày tạo**: 02/09/2026
**Trạng thái**: Chưa bắt đầu

---

## Tổng quan

| Task | Thời gian | Status | Ghi chú |
|------|-----------|--------|---------|
| Task 1: Backup + Cài đặt | 30 phút | ✅ | Tailwind 4.3.3, daisyUI 5.7.27, lucide-react 1.39.0 |
| Task 2: Theme + Design Tokens | 45 phút | ✅ | Xóa gradient, Lucide icons, daisyUI drawer/navbar |
| Task 3: Shared Components | 60 phút | ✅ | 15 UI components + 4 layout components |
| Task 4: Refactor Layouts | 30 phút | ✅ | PublicLayout, LoginPage, RegisterPage với Tailwind/daisyUI |
| Task 5: Pages Phase A | 30 phút | ✅ | 6 pages refactor với Tailwind/daisyUI/Lucide |
| Task 6: Pages Phase B | 30 phút | ✅ | 3 pages refactor (Users, Proposals, Profile) |
| Task 7: Pages Phase C | ~45 phút | ✅ | 4 pages refactor (AdminStations, AdminMapConfig, MyProposals, MapPage) |
| Task 8: Responsive System | 3-4h | ⬜ | |
| Task 9: Dọn dẹp | 2-3h | ⬜ | |
| Task 10: Visual Audit | 2h | ⬜ | |

---

## TASK 1: Backup + Cài đặt

**Status**: ✅ Hoàn thành
**Thời gian thực tế**: 30 phút

### Files đã tạo/sửa
- [x] `frontend/vite.config.js` (sửa — thêm @tailwindcss/vite plugin)
- [x] `frontend/src/index.css` (sửa — thêm @import "tailwindcss" và @plugin "daisyui")
- [x] `frontend/package.json` (sửa — thêm dependencies mới)
- [x] `frontend/package-lock.json` (tự động cập nhật)

### Versions đã cài
| Package | Version | Location |
|---------|---------|----------|
| tailwindcss | 4.3.3 | devDependencies |
| @tailwindcss/vite | 4.3.3 | devDependencies |
| daisyui | 5.7.27 | dependencies |
| lucide-react | 1.39.0 | dependencies |

### Kết quả test
- [x] `npm run dev` chạy không lỗi
- [x] `npm run build` thành công
- [x] Trang login hiển thị đúng (http://localhost:5173/login)
- [x] DaisyUI CSS loaded (173.26 kB)
- [x] Lucide React hoạt động (6143 icons available)
- [x] Hot reload hoạt động (vite restart khi đổi vite.config.js)

### Ghi chú
- Docker container dùng named volume cho node_modules → cần cài packages bên trong container
- Packages đã cài cả local (package.json) và container (docker exec)
- Branch `ui-redesign` đã tạo từ main

---

## TASK 2: Theme + Design Tokens

**Status**: ✅ Hoàn thành
**Thời gian thực tế**: 45 phút

### Files đã tạo/sửa
- [x] `frontend/src/App.css` (sửa — xóa 2 gradient, thay #667eea → #1e40af)
- [x] `frontend/src/layouts/AdminLayout.jsx` (viết lại — Lucide icons + Tailwind/daisyUI drawer)
- [x] `frontend/src/layouts/UserLayout.jsx` (viết lại — Lucide icons + Tailwind/daisyUI navbar)

### Icons đã thay thế (AdminLayout)
| Emoji | Lucide Icon |
|-------|-------------|
| 📊 | BarChart3 |
| 👥 | Users |
| ⚡ | Zap |
| 📋 | ClipboardList |
| ⚙️ | Settings |
| 📝 | FileText |
| 📄 | File |
| 📊 | LayoutGrid |
| 📋 | List |
| 🗺️ | Map |
| 🗺️ | MapPin |
| ☰ | Menu |
| 🚪 | LogOut |

### Icons đã thay thế (UserLayout)
| Emoji | Lucide Icon |
|-------|-------------|
| 🗺️ | Map |
| 📋 | ClipboardList |
| 👤 | User |
| 🔧 | Settings |
| ☰ | Menu |
| 🚪 | LogOut |

### Layout mới
- AdminLayout: dùng daisyUI `drawer` component (responsive sidebar)
- UserLayout: dùng daisyUI `navbar` component + mobile drawer

### Kết quả test
- [x] `npm run dev` chạy không lỗi
- [x] `npm run build` thành công
- [x] Trang login hiển thị đúng (http://localhost:5173/login)
- [x] Admin sidebar hiển thị đúng với Lucide icons
- [x] User header hiển thị đúng với Lucide icons
- [x] Không còn gradient nào trong app
- [x] daisyUI classes có trong build output (btn-primary: 5, drawer: 100, navbar: 5)

### Ghi chú
- DaisyUI dùng default theme (không custom theme để tránh conflict với App.css)
- App.css vẫn giữ nguyên các CSS classes cho các component chưa refactor
- AdminLayout dùng daisyUI drawer component cho responsive sidebar
- UserLayout dùng daisyUI navbar component cho responsive header
- Các emoji trong pages/components khác sẽ được thay trong Task 9 (Cleanup)
- **Fix**: Map page trắng → do Tailwind preflight reset position/height. Đã fix bằng cách:
  - UserLayout: `h-screen` + `overflow-hidden` + `minHeight: 0` cho main
  - App.css: thêm `min-height: 400px`, `position: relative`, `z-index: 1` cho `.leaflet-container`
  - index.css: override Tailwind preflight cho Leaflet elements

---

## TASK 3: Shared Components

**Status**: ✅ Hoàn thành
**Thời gian thực tế**: 60 phút

### Files đã tạo

#### UI Components (components/ui/)
- [x] `frontend/src/components/ui/Button.jsx` — variants: primary, secondary, accent, ghost, link, error, warning, info, success, outline
- [x] `frontend/src/components/ui/Input.jsx` — label, error, helperText, required, readOnly
- [x] `frontend/src/components/ui/Select.jsx` — label, options, placeholder, error
- [x] `frontend/src/components/ui/Dialog.jsx` — sizes: sm, md, lg, xl, full
- [x] `frontend/src/components/ui/Badge.jsx` — variants: primary, secondary, accent, ghost, info, success, warning, error, neutral
- [x] `frontend/src/components/ui/PageHeader.jsx` — title, subtitle, actions (responsive)
- [x] `frontend/src/components/ui/DataTable.jsx` — columns, data, sort, actions, empty state
- [x] `frontend/src/components/ui/FilterBar.jsx` — responsive filter container
- [x] `frontend/src/components/ui/ConfirmDialog.jsx` — types: danger, warning, success with Lucide icons
- [x] `frontend/src/components/ui/Pagination.jsx` — page, totalPages, total, onPageChange
- [x] `frontend/src/components/ui/Toast.jsx` — types: success, error, warning, info with daisyUI alert
- [x] `frontend/src/components/ui/Loading.jsx` — daisyUI spinner
- [x] `frontend/src/components/ui/EmptyState.jsx` — icon, title, description, action
- [x] `frontend/src/components/ui/ErrorMessage.jsx` — message, onRetry with daisyUI alert
- [x] `frontend/src/components/ui/FormInput.jsx` — compatible with old FormInput API
- [x] `frontend/src/components/ui/index.js` — barrel export

#### Layout Components (components/layout/)
- [x] `frontend/src/components/layout/AdminSidebar.jsx` — tách từ AdminLayout, dùng Lucide icons
- [x] `frontend/src/components/layout/AdminHeader.jsx` — mobile header với hamburger
- [x] `frontend/src/components/layout/UserSidebar.jsx` — mobile drawer sidebar (NEW)
- [x] `frontend/src/components/layout/UserHeader.jsx` — responsive header với desktop nav
- [x] `frontend/src/components/layout/index.js` — barrel export

#### Layouts đã refactor
- [x] `frontend/src/layouts/AdminLayout.jsx` — dùng AdminSidebar + AdminHeader
- [x] `frontend/src/layouts/UserLayout.jsx` — dùng UserSidebar + UserHeader

### Kết quả test
- [x] `npm run build` thành công
- [x] Trang login load OK (200)
- [x] Trang map load OK (200)
- [x] Trang admin load OK (200)
- [x] Trang admin/stations load OK (200)
- [x] Trang admin/users load OK (200)
- [x] Không có runtime errors trong logs
- [x] Admin sidebar hiển thị đúng với Lucide icons
- [x] User header hiển thị đúng với desktop nav
- [x] UserSidebar mobile drawer hoạt động
- [x] ImportExcelDialog: hoãn sang Task 7 (cần refactor logic từ nhiều pages)

### Ghi chú
- ImportExcelDialog chưa tạo vì cần refactor logic import từ AdminStationsPage, AdminProposalsPage, AdminUsersPage trước
- DynamicTable vẫn giữ nguyên vì quá phức tạp và coupling với dynamic system
- Các UI components mới dùng daisyUI classes + Tailwind CSS
- Tất cả components dùng Lucide icons thay emoji
- [ ] PageHeader hiển thị title + actions
- [ ] DataTable render data đúng
- [ ] FilterBar responsive
- [ ] ConfirmDialog hoạt động đúng
- [ ] Pagination hoạt động đúng
- [ ] ImportExcelDialog upload/preview/confirm hoạt động
- [ ] AdminSidebar responsive
- [ ] AdminHeader mobile hoạt động

### Ghi chú

---

## TASK 4: Refactor Layouts

**Status**: ✅ Hoàn thành
**Thời gian thực tế**: 30 phút

### Files đã sửa
- [x] `frontend/src/layouts/PublicLayout.jsx` — Tailwind classes thay CSS cũ
- [x] `frontend/src/pages/auth/LoginPage.jsx` — daisyUI card, input, button + Lucide icon
- [x] `frontend/src/pages/auth/RegisterPage.jsx` — daisyUI card, input, button + Lucide icon

### Layout responsive breakdown
| Layout | Mobile (<768px) | Tablet (768-1024px) | Desktop (>1024px) |
|--------|-----------------|---------------------|-------------------|
| AdminLayout | Hamburger → overlay sidebar | Hamburger → overlay sidebar | Fixed sidebar + content |
| UserLayout | Hamburger → slide-in sidebar | Desktop nav inline | Desktop nav inline |
| PublicLayout | Full-width card, p-4 | Max-width card centered | Max-width card centered |

### Kết quả test
- [x] `npm run build` thành công
- [x] Trang login load OK (200)
- [x] Trang register load OK (200)
- [x] Trang map load OK (200)
- [x] Trang admin load OK (200)
- [x] Không có runtime errors

### Ghi chú
- PublicLayout refactor từ CSS classes sang Tailwind utilities
- LoginPage/RegisterPage dùng daisyUI card, input, button components
- AdminLayout/UserLayout đã refactor ở Task 2-3, Task 4 chỉ confirm responsive

---

## TASK 5: Pages Phase A — Đơn giản

**Status**: ✅ Hoàn thành
**Thời gian thực tế**: 30 phút

### Files đã sửa
- [x] `frontend/src/pages/admin/AdminDashboard.jsx` — stats cards với Lucide icons, responsive grid
- [x] `frontend/src/pages/admin/AdminFieldsPage.jsx` — không thay đổi (wrapper component)
- [x] `frontend/src/pages/admin/AdminFormsPage.jsx` — entity cards, Lucide icons, loading spinner
- [x] `frontend/src/pages/admin/AdminViewsPage.jsx` — entity cards, Lucide icons, loading spinner
- [x] `frontend/src/pages/admin/AdminFormBuilderPage.jsx` — back button, clean header
- [x] `frontend/src/pages/admin/AdminViewBuilderPage.jsx` — back button, clean header
- [x] `frontend/src/pages/admin/AdminDataListsPage.jsx` — không thay đổi (wrapper component)
- [x] `frontend/src/pages/admin/AdminRecordFilesPage.jsx` — file cards grid, Lucide icons, responsive

### Icons đã thay thế
| File | Emoji → Lucide |
|------|----------------|
| AdminDashboard | ✅ → Users, Zap, ClipboardList |
| AdminFormsPage | ⚡ → Zap, 📋 → ClipboardList, 👥 → Users, ➕ → Plus, ✏️ → Pencil, 🗑️ → Trash2 |
| AdminViewsPage | ⚡ → Zap, 📋 → ClipboardList, 👥 → Users, ➕ → Plus, ✏️ → Pencil, 🗑️ → Trash2 |
| AdminFormBuilderPage | ➕ → ArrowLeft |
| AdminViewBuilderPage | ➕ → ArrowLeft |
| AdminRecordFilesPage | 🖼️ → Image, 🎬 → Film, 🎵 → Music, 📄 → FileText, 📊 → Table, 📁 → File |

### Kết quả test
- [x] `npm run build` thành công
- [x] Tất cả pages load OK (200): admin, admin/users, admin/stations, admin/proposals, admin/fields, admin/forms, admin/views, admin/data-lists, login, register, map
- [x] Không có runtime errors
- [x] Dashboard stats cards hiển thị với Lucide icons
- [x] Forms/Views Manager hiển thị entity cards
- [x] RecordFiles page hiển thị file cards grid

### Ghi chú
- AdminFieldsPage và AdminDataListsPage chỉ là wrapper → không cần refactor
- AdminRecordFilesPage refactor toàn bộ inline styles → Tailwind classes
- Tất cả pages dùng responsive grid (1/2/3 columns)

---

## TASK 6: Pages Phase B — Trung bình

**Status**: ✅ Hoàn thành
**Thời gian thực tế**: 30 phút

### Files đã sửa
- [x] `frontend/src/pages/admin/AdminUsersPage.jsx` — daisyUI modals, Tailwind filter bar, Lucide icons
- [x] `frontend/src/pages/admin/AdminProposalsPage.jsx` — Tailwind filter/actions, Lucide icons
- [x] `frontend/src/pages/admin/AdminRecordFilesPage.jsx` — đã refactor ở Task 5
- [x] `frontend/src/pages/auth/LoginPage.jsx` — đã refactor ở Task 4
- [x] `frontend/src/pages/auth/RegisterPage.jsx` — đã refactor ở Task 4
- [x] `frontend/src/pages/user/ProfilePage.jsx` — responsive layout, avatar upload, password form

### Icons đã thay thế
| File | Emoji → Lucide |
|------|----------------|
| AdminUsersPage | ➕ → Plus, 🔍 → Search, ⬇️ → Download, ⬆️ → Upload, 📊 → FileSpreadsheet |
| AdminProposalsPage | 📋 → ClipboardList, ⬇️ → Download, 👁️ → Eye, ✏️ → Pencil, 🗑️ → Trash2 |
| ProfilePage | 👤 → User, 📧 → Mail, 📱 → Phone, 🛡️ → Shield, ✅ → CheckCircle, 📷 → Camera, 🔒 → Lock, ✏️ → Pencil, ❌ → X |

### Kết quả test
- [x] `npm run build` thành công
- [x] Tất cả pages load OK (200): admin, admin/users, admin/stations, admin/proposals, admin/fields, admin/forms, admin/views, admin/data-lists, login, register, map, profile
- [x] Import modal mở/đóng OK (daisyUI modal)
- [x] Create user modal mở/đóng OK (daisyUI modal)
- [x] RecordDetailPopup mở/đóng OK
- [x] ConfirmDialog hoạt động OK
- [x] Filter bar responsive OK
- [x] Profile page responsive OK

### Changes chi tiết
- **AdminUsersPage**: Import modal → daisyUI `<dialog className="modal modal-open">`, filter bar → Tailwind flex layout, action buttons → daisyUI btn-xs
- **AdminProposalsPage**: Status select → daisyUI `select-xs`, action buttons → daisyUI btn-xs với Lucide icons
- **ProfilePage**: 2-column layout (sidebar + main), avatar với hover overlay, password form với daisyUI form-control

### Ghi chú
- LoginPage/RegisterPage đã refactor ở Task 4
- AdminRecordFilesPage đã refactor ở Task 5
- DynamicTable vẫn giữ nguyên vì quá phức tạp

---

## TASK 7: Pages Phase C — Phức tạp

**Status**: ✅ Hoàn thành
**Thời gian thực tế**: ~45 phút

### Files đã sửa
- [x] `frontend/src/pages/admin/AdminStationsPage.jsx` — CSS classes → Tailwind/daisyUI, Lucide icons (Zap, Download, Upload, Plus, Search, X, MapPin)
- [x] `frontend/src/pages/admin/AdminMapConfigPage.jsx` — 50+ inline styles → Tailwind/daisyUI, Lucide icons (Settings, Save, Wifi)
- [x] `frontend/src/pages/user/MyProposalsPage.jsx` — CSS classes → Tailwind/daisyUI, Lucide icons (ClipboardList, Download, Upload, Plus, Search, X, MapPin)
- [x] `frontend/src/pages/user/MapPage.jsx` — CSS classes → Tailwind/daisyUI, emoji → Lucide (MapPin)

### Kết quả test
- [x] `npm run build` thành công
- [x] CRUD operations hoạt động đúng
- [x] Map interactions hoạt động đúng
- [x] Import Excel hoạt động đúng
- [x] Search/filter hoạt động đúng

### Ghi chú
- AdminMapConfigPage phức tạp nhất: 50+ inline styles, 419 lines → hoàn转换 sang Tailwind

---

## TASK 8: Responsive System

**Status**: ⬜ Chưa bắt đầu
**Thời gian thực tế**: 

### Files đã sửa
- [ ] Các layout files (đã đếm ở Task 4)
- [ ] Các page files (đã đếm ở Task 5-7)

### Kết quả test
- [ ] Desktop (1280px+) hiển thị đúng
- [ ] Tablet (768-1024px) hiển thị đúng
- [ ] Mobile (<768px) hiển thị đúng
- [ ] Sidebar responsive hoạt động
- [ ] Tables responsive
- [ ] Forms responsive

### Ghi chú

---

## TASK 9: Dọn dẹp

**Status**: ⬜ Chưa bắt đầu
**Thời gian thực tế**: 

### Files đã xóa/sửa
- [ ] `frontend/src/App.css` (xóa/reduced)
- [ ] Các files có inline styles (sửa)

### Kết quả test
- [ ] App.css đã xóa (hoặc reduced to minimal)
- [ ] Không còn inline styles
- [ ] Không còn unused CSS classes
- [ ] Không còn emoji icons
- [ ] Không còn gradient/glass/neon
- [ ] App hoạt động bình thường

### Ghi chú

---

## TASK 10: Visual Audit + Test

**Status**: ⬜ Chưa bắt đầu
**Thời gian thực tế**: 

### Kết quả test responsive
- [ ] Desktop hiển thị đúng
- [ ] Tablet hiển thị đúng
- [ ] Mobile hiển thị đúng

### Kết quả test functionality
- [ ] Login/Register hoạt động
- [ ] Admin CRUD stations hoạt động
- [ ] Admin CRUD proposals hoạt động
- [ ] Admin CRUD users hoạt động
- [ ] Import Excel hoạt động
- [ ] Map interactions hoạt động
- [ ] File upload/view hoạt động
- [ ] Profile update hoạt động

### Kết quả test cross-browser
- [ ] Chrome hiển thị đúng
- [ ] Firefox hiển thị đúng
- [ ] Safari hiển thị đúng (nếu có)
- [ ] Edge hiển thị đúng

### Ghi chú

---

## Tổng kết cuối cùng

### Files đã tạo mới
| File | Mô tả |
|------|-------|
| `frontend/tailwind.config.js` | Tailwind configuration |
| `frontend/src/components/ui/*.jsx` | 11 shared UI components |
| `frontend/src/components/layout/*.jsx` | 2 layout components |

### Files đã sửa
| File | Mô tả |
|------|-------|
| `frontend/vite.config.js` | Thêm Tailwind plugin |
| `frontend/src/index.css` | Thêm @tailwind directives |
| `frontend/src/App.css` | Xóa/reduced |
| `frontend/src/layouts/*.jsx` | Responsive layouts |
| `frontend/src/pages/**/*.jsx` | Presentation layer |

### Files KHÔNG đụng
| File | Lý do |
|------|-------|
| `backend/**` | Không thuộc phạm vi |
| `database/**` | Không thuộc phạm vi |
| `frontend/src/contexts/*` | Business logic |
| `frontend/src/hooks/*` | Business logic |
| `frontend/src/services/*` | Business logic |
| `frontend/src/utils/*` | Business logic |

### Kết quả đạt được
- [ ] Responsive tốt cho desktop, tablet, mobile
- [ ] Bỏ code trùng lặp, thừa
- [ ] Chuẩn hóa UI/UX toàn hệ thống
- [ ] Loại bỏ phong cách AI code
- [ ] Giữ nguyên business logic

### Issues phát hiện
1. **App.css conflict với Tailwind v4 CSS layers**: App.css không nằm trong `@layer` nên luôn đè lên Tailwind utilities. Fix: wrap App.css trong `@layer base`.
2. **Admin sidebar không thay đổi**: Do App.css `.sidebar`, `.nav`, `.header` rules override Tailwind classes. Fix: `@layer base` giúp Tailwind utilities có priority cao hơn.
3. **Login/Register button không full width**: Do App.css `.btn { width: auto }` override Tailwind `w-full`. Fix: comment out conflicting `.btn-*` rules.

### Lessons learned
- Tailwind v4 dùng CSS cascade layers — CSS không nằm trong `@layer` sẽ luôn thắng Tailwind utilities
- Phải wrap toàn bộ App.css cũ trong `@layer base` trước khi dùng Tailwind classes
- Không đặt cùng tên class trong App.css và Tailwind (`.btn`, `.btn-primary` etc.)
