# Chuẩn hóa UI/UX — Các bước cần làm

**Ngày tạo**: 02/09/2026
**Trạng thái**: Đang thực hiện

---

## TASK 1: Backup + Cài đặt

**Thời gian**: 1h
**Status**: ⬜ Chưa bắt đầu

### Bước 1.1: Tạo branch git
```bash
git checkout -b ui-redesign
```

### Bước 1.2: Cài dependencies
```bash
cd frontend
npm install -D tailwindcss @tailwindcss/vite
npm install daisyui lucide-react
```

### Bước 1.3: Cấu hình Tailwind
- Tạo `frontend/tailwind.config.js`
- Sửa `frontend/vite.config.js` — thêm Tailwind plugin
- Sửa `frontend/src/index.css` — thêm `@tailwind` directives

### Checklist test
- [ ] `npm run dev` chạy không lỗi
- [ ] Trang login hiển thị đúng (chưa thay style)

### Yêu cầu đạt
- Tailwind CSS hoạt động
- daisyUI hoạt động
- Lucide React hoạt động
- Hot reload hoạt động

### Ghi chú
- Không sửa App.jsx hay business logic

---

## TASK 2: Theme + Design Tokens

**Thời gian**: 2-3h
**Status**: ⬜ Chưa bắt đầu

### Bước 2.1: Định nghĩa color palette trong tailwind.config.js
```js
// Colors mới —urationination chuyên nghiệp
primary: '#1e40af'        // xanh đậm
secondary: '#64748b'      // xám
accent: '#0ea5e9'         // xanh dương nhạt
neutral: '#1e293b'        // xám đậm
'base-100': '#ffffff'     // background card
'base-200': '#f8fafc'    // background page
'base-300': '#e2e8f0'    // border
'base-content': '#334155' // text chính
info: '#0ea5e9'
success: '#22c55e'
warning: '#f59e0b'
error: '#ef4444'
```

### Bước 2.2: Xóa gradient trong App.css
- Xóa `.public-layout` gradient (line 25)
- Xóa `.import-icon` gradient (line 1240)

### Bước 2.3: Thay emoji bằng Lucide icons trong Layout/Navigation
- AdminLayout.jsx menu items
- UserLayout.jsx nav items
- Các page có emoji icons

### Bước 2.4: Thay hardcoded colors trong App.css
- Thay `#667eea` → Tailwind primary
- Thay `#764ba2` → secondary/neutral
- Thay `#2c3e50` → neutral dark
- Thay `#34495e` → neutral medium

### Checklist test
- [ ] Login page hiển thị đúng theme mới
- [ ] Admin sidebar hiển thị đúng màu mới
- [ ] User header hiển thị đúng
- [ ] Không còn gradient nào trong app
- [ ] Icons hiển thị đúng (không còn emoji)

### Yêu cầu đạt
- Tất cả màu sắc dùng Tailwind/daisyUI tokens
- Không còn hardcoded hex colors
- Lucide icons thay thế tất cả emoji
- Không còn gradient, glass, neon effects

### Ghi chú
- Theme mới cần test contrast ratio cho accessibility

---

## TASK 3: Tạo Shared Components

**Thời gian**: 3-5h
**Status**: ⬜ Chưa bắt đầu

### Thư mục: `frontend/src/components/ui/`

#### 3a. Button.jsx
- Variants: primary, secondary, accent, ghost, link, error, warning, info, success
- Sizes: xs, sm, md, lg
- Thay thế: tất cả `.btn`, `.btn-primary`, `.btn-delete`, `.btn-edit...`
- Props: variant, size, loading, disabled, children, onClick

#### 3b. Input.jsx
- Thay thế: `.form-group` + `.form-control`
- Props: label, error, helperText, type, disabled, readOnly
- Tích niệm error state với daisyUI input-error

#### 3c. Select.jsx
- Thay thế: native `<select>` + `.filter-select`
- Props: label, options, value, onChange, placeholder
- Dùng daisyUI select component

#### 3d. Dialog.jsx
- Thay thế: `.modal-overlay` + `.modal` + `.confirm-dialog`
- Props: isOpen, onClose, title, size (sm/md/lg), children
- Dùng daisyUI modal component

#### 3e. Badge.jsx
- Variants: primary, secondary, success, warning, error, info, neutral
- Thay thế: `.badge-active`, `.badge-pending`, `.badge-rejected...`
- Dùng daisyUI badge component

#### 3f. PageHeader.jsx
- Thay thế: `.page-header` + `.page-header-actions`
- Props: title, subtitle, actions (ReactNode)
- Layout responsive: title trên, actions dưới (mobile)

#### 3g. DataTable.jsx
- Bọc DynamicTable hoặc tạo mới
- Props: columns, data, loading, emptyMessage, pagination, onSort
- Responsive: horizontal scroll (tablet), card view (mobile)

#### 3h. FilterBar.jsx
- Thay thế: `.filter-bar`
- Props: children (các filter items)
- Responsive: horizontal (desktop), vertical stack (mobile)

#### 3i. ConfirmDialog.jsx
- Refactor ConfirmDialog hiện tại
- Dùng daisyUI modal + AlertDialog pattern
- Props: isOpen, title, message, onConfirm, onCancel, variant

#### 3j. Pagination.jsx
- Refactor Pagination hiện tại
- Dùng daisyUI pagination component
- Props: page, totalPages, total, onPageChange

#### 3k. ImportExcelDialog.jsx
- Gộp logic import từ AdminStationsPage, AdminProposalsPage, AdminUsersPage
- Props: isOpen, onClose, entityType, onImportComplete
- Thay thế: tất cả `.import-* classes`

### Thư mục: `frontend/src/components/layout/`

#### 3l. AdminSidebar.jsx
- Tách sidebar từ AdminLayout
- Responsive: desktop (fixed sidebar), mobile (overlay sidebar)
- Dùng Lucide icons thay emoji

#### 3m. AdminHeader.jsx
- Mobile header với hamburger menu
- User info + logout
- Dùng daisyUI navbar component

### Checklist test
- [ ] Button render đúng tất cả variants
- [ ] Input hiển thị label, error correctly
- [ ] Select hoạt động đúng
- [ ] Dialog mở/đóng đúng
- [ ] Badge hiển thị đúng màu
- [ ] PageHeader hiển thị title + actions
- [ ] DataTable render data đúng
- [ ] FilterBar responsive
- [ ] ConfirmDialog hoạt động đúng
- [ ] Pagination hoạt động đúng
- [ ] ImportExcelDialog upload/preview/confirm hoạt động
- [ ] AdminSidebar responsive
- [ ] AdminHeader mobile hoạt động

### Yêu cầu đạt
- Tất cả components hoạt động độc lập
- PropTypes hoặc JSDoc đầy đủ
- Không có runtime errors
- Responsive đúng breakpoints

### Ghi chú
- Components mới chỉ thay presentation, không đụng logic

---

## TASK 4: Refactor Layouts

**Thời gian**: 2-3h
**Status**: ⬜ Chưa bắt đầu

### Bước 4.1: Refactor AdminLayout.jsx
- Import AdminSidebar, AdminHeader mới
- Responsive:
  - Desktop (>1024px): Sidebar 250px fixed + Content
  - Tablet (768-1024px): Sidebar collapsed 60px (icons only) + Content
  - Mobile (<768px): Overlay sidebar + Hamburger menu

### Bước 4.2: Refactor UserLayout.jsx
- Responsive header: desktop nav inline, mobile hamburger
- Mobile: full-width content, no padding

### Bước 4.3: Refactor PublicLayout.jsx
- Login/Register: responsive card centered
- Mobile: full-width card, smaller padding

### Checklist test
- [ ] AdminLayout: desktop sidebar hiển thị đúng
- [ ] AdminLayout: tablet sidebar collapsed đúng
- [ ] AdminLayout: mobile hamburger menu hoạt động
- [ ] AdminLayout: sidebar overlay hoạt động
- [ ] UserLayout: desktop header hiển thị đúng
- [ ] UserLayout: mobile header hoạt động
- [ ] PublicLayout: desktop card centered
- [ ] PublicLayout: mobile card full-width

### Yêu cầu đạt
- Tất cả layouts responsive đúng breakpoints
- Sidebar animation mượt
- Không có horizontal scroll unwanted
- Touch-friendly trên mobile

### Ghi chú
- Test trên Chrome DevTools device toolbar

---

## TASK 5: Refactor Pages Phase A — Đơn giản

**Thời gian**: 3-4h
**Status**: ⬜ Chưa bắt đầu

### Danh sách pages:
1. AdminDashboard (57 dòng)
2. AdminFieldsPage (8 dòng)
3. AdminFormsPage (153 dòng)
4. AdminViewsPage (153 dòng)
5. AdminFormBuilderPage (19 dòng)
6. AdminViewBuilderPage (19 dòng)
7. AdminDataListsPage (11 dòng)
8. RecordDetailPage (38 dòng)

### Nguyên tắc refactor:
- Chỉ thay presentation layer (className → Tailwind/daisyUI)
- Không đụng useState, useEffect, API calls, handlers
- Thay emoji icons bằng Lucide
- Responsive cho page layout

### Checklist test cho mỗi page:
- [ ] Page load không lỗi
- [ ] Data hiển thị đúng
- [ ] Buttons hoạt động đúng
- [ ] Forms hoạt động đúng (nếu có)
- [ ] Responsive trên mobile
- [ ] Responsive trên tablet

### Yêu cầu đạt
- Tất cả pagesใช้ shared components mới
- Không còn CSS class cũ
- Responsive đúng

### Ghi chú
- Pages đơn giản, refactor nhanh

---

## TASK 6: Refactor Pages Phase B — Trung bình

**Thời gian**: 4-5h
**Status**: ⬜ Chưa bắt đầu

### Danh sách pages:
1. AdminUsersPage (370 dòng)
2. AdminProposalsPage (196 dòng)
3. AdminRecordFilesPage (221 dòng)
4. LoginPage (66 dòng)
5. RegisterPage (111 dòng)
6. ProfilePage (269 dòng)

### Checklist test cho mỗi page:
- [ ] Page load không lỗi
- [ ] CRUD operations hoạt động đúng
- [ ] Search/filter hoạt động đúng
- [ ] Pagination hoạt động đúng
- [ ] Import Excel hoạt động (nếu có)
- [ ] Responsive trên mobile
- [ ] Responsive trên tablet

### Yêu cầu đạt
- Tất cả pages dùng shared components mới
- Không còn inline styles
- Responsive đúng

### Ghi chú
- AdminUsersPage có status toggle → test kỹ
- ProfilePage có avatar popup → responsive popup

---

## TASK 7: Refactor Pages Phase C — Phức tạp

**Thời gian**: 5-6h
**Status**: ⬜ Chưa bắt đầu

### Danh sách pages:
1. AdminStationsPage (382 dòng)
2. AdminMapConfigPage (420 dòng)
3. MyProposalsPage (393 dòng)
4. MapPage (152 dòng)

### Bước refactor:
1. Tách ImportExcelDialog ra component chung (nếu chưa có)
2. Tách filter/search logic
3. Refactor presentation layer
4. Responsive cho map pages

### Checklist test cho mỗi page:
- [ ] Page load không lỗi
- [ ] CRUD operations hoạt động đúng
- [ ] Map interactions hoạt động đúng
- [ ] Import Excel hoạt động đúng
- [ ] Search/filter hoạt động đúng
- [ ] Pagination hoạt động đúng
- [ ] Responsive trên mobile
- [ ] Responsive trên tablet

### Yêu cầu đạt
- Map pages responsive (map full-width mobile)
- Import dialog dùng chung
- Không còn code trùng lặp

### Ghi chú
- AdminStationsPage phức tạp nhất — refactor cẩn thận
- Map interactions cần test kỹ trên touch devices

---

## TASK 8: Responsive System

**Thời gian**: 3-4h
**Status**: ⬜ Chưa bắt đầu

### Bước 8.1: Định nghĩa breakpoints
```css
sm: 640px    /* Mobile landscape */
md: 768px    /* Tablet */
lg: 1024px   /* Desktop */
xl: 1280px   /* Large desktop */
```

### Bước 8.2: Responsive patterns

#### Admin Layout
- Desktop: Sidebar (250px) | Content
- Tablet: Sidebar (60px icons only) | Content
- Mobile: Overlay sidebar + hamburger

#### Tables
- Desktop: Full table
- Tablet: Horizontal scroll
- Mobile: Card view (each row = card)

#### Forms
- Desktop: 2 columns
- Tablet: 2 columns (smaller)
- Mobile: 1 column

#### Dashboard Stats
- Desktop: 3 columns
- Tablet: 2 columns
- Mobile: 1 column

#### Filter Bar
- Desktop: Horizontal inline
- Mobile: Vertical stack / collapsible

#### Page Header
- Desktop: Title + actions inline
- Mobile: Title on top, actions below

### Checklist test
- [ ] Desktop layout hiển thị đúng
- [ ] Tablet layout hiển thị đúng
- [ ] Mobile layout hiển thị đúng
- [ ] Tables responsive (scroll hoặc card view)
- [ ] Forms responsive (1-2 columns)
- [ ] Stats grid responsive
- [ ] Filter bar responsive
- [ ] Page header responsive

### Yêu cầu đạt
- Tất cả pages responsive đúng 3 breakpoints
- Không có horizontal scroll unwanted
- Touch-friendly trên mobile
- Navigation hoạt động tốt trên mọi thiết bị

### Ghi chú
- Test trên Chrome DevTools device toolbar
- Test trên thiết bị thật nếu có

---

## TASK 9: Dọn dẹp

**Thời gian**: 2-3h
**Status**: ⬜ Chưa bắt đầu

### Bước 9.1: Xóa App.css
- Sau khi migrate xong tất cả CSS → xóa App.css (4,119 dòng)
- Hoặc giữ lại phần nhỏ nếu cần cho Leaflet/custom styles

### Bước 9.2: Xóa inline styles
- Tìm tất cả `style={{ }}` trong JSX
- Thay bằng Tailwind classes

### Bước 9.3: Xóa unused CSS classes
- Tìm tất cả CSS classes không còn dùng
- Xóa khỏi App.css

### Bước 9.4: Xóa emoji icons
- Đảm bảo tất cả emoji đã thay Lucide icons

### Bước 9.5: Clean up
- Không còn gradient, glass, neon effects
- Không còn hardcoded hex colors
- Code sạch, dễ đọc

### Checklist test
- [ ] App.css đã xóa (hoặc reduced to minimal)
- [ ] Không còn inline styles
- [ ] Không còn unused CSS classes
- [ ] Không còn emoji icons
- [ ] Không còn gradient/glass/neon
- [ ] App hoạt động bình thường

### Yêu cầu đạt
- Codebase sạch, dễ maintain
- Không có code thừa

### Ghi chú
- Xóa từ từ, test sau mỗi lần xóa

---

## TASK 10: Visual Audit + Test

**Thời gian**: 2h
**Status**: ⬜ Chưa bắt đầu

### Bước 10.1: Visual audit
- Check responsive trên Chrome DevTools (mobile/tablet/desktop)
- Check tất cả pages hiển thị đúng
- Check color contrast accessibility

### Bước 10.2: Functional test
- Test tất cả CRUD operations
- Test import Excel
- Test map interactions
- Test search/filter
- Test pagination
- Test file upload/view

### Bước 10.3: Cross-browser test
- Chrome
- Firefox
- Safari (nếu có)
- Edge

### Checklist test

#### Responsive
- [ ] Desktop (1280px+) hiển thị đúng
- [ ] Tablet (768-1024px) hiển thị đúng
- [ ] Mobile (<768px) hiển thị đúng
- [ ] Sidebar responsive hoạt động
- [ ] Tables responsive
- [ ] Forms responsive

#### Functionality
- [ ] Login/Register hoạt động
- [ ] Admin CRUD stations hoạt động
- [ ] Admin CRUD proposals hoạt động
- [ ] Admin CRUD users hoạt động
- [ ] Import Excel hoạt động
- [ ] Map interactions hoạt động
- [ ] File upload/view hoạt động
- [ ] Profile update hoạt động

#### Cross-browser
- [ ] Chrome hiển thị đúng
- [ ] Firefox hiển thị đúng
- [ ] Safari hiển thị đúng (nếu có)
- [ ] Edge hiển thị đúng

### Yêu cầu đạt
- Tất cả pages responsive đúng
- Tất cả functionality hoạt động
- Không có visual bugs
- Không có console errors

### Ghi chú
- Nếu có bugs → fix ngay trước khi merge

---

## Tổng kết

| Task | Thời gian | Status |
|------|-----------|--------|
| Task 1: Backup + Cài đặt | 30 phút | ✅ |
| Task 2: Theme + Design Tokens | 45 phút | ✅ |
| Task 3: Shared Components | 60 phút | ✅ |
| Task 4: Refactor Layouts | 30 phút | ✅ |
| Task 5: Pages Phase A | 30 phút | ✅ |
| Task 6: Pages Phase B | 30 phút | ✅ |
| Task 7: Pages Phase C | ~45 phút | ✅ |
| Task 8: Responsive System | ~30 phút | ✅ |
| Task 9: Dọn dẹp | ~30 phút | ✅ |
| Task 10: Visual Audit | ~20 phút | ✅ |
| **Tổng** | **~5.5h** | **✅ ALL DONE** |
