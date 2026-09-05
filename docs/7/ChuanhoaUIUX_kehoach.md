# Kế hoạch chuẩn hóa UI/UX — Station Management System

**Ngày tạo**: 02/09/2026
**Thời gian dự kiến**: 3-5 ngày làm tập trung (27-38h)
**Trạng thái**: Đang thực hiện

---

## 1. Mục tiêu

- Responsive tốt cho desktop, tablet, mobile
- Bỏ code trùng lặp, thừa
- Chuẩn hóa UI/UX toàn hệ thống
- Loại bỏ phong cách AI code (gradient, emoji icons, random colors)
- Giữ nguyên business logic, API, routing, state management

## 2. Nguyên tắc

```
KHÔNG đụng: Backend, API, Database, Business logic, Routing, State management
CHỈ sửa: Theme, Component UI, Layout, Responsive, CSS
```

## 3. Tech Stack mới

| Cũ | Mới |
|-----|------|
| Vanilla CSS (4,119 dòng) | Tailwind CSS v3 |
| Không có UI library | daisyUI v4 |
| Emoji icons (47 chỗ) | Lucide React icons |
| CSS class naming thủ công | Tailwind utility classes + daisyUI components |

---

## 4. Phân chia Task

### TASK 1: Backup + Cài đặt (1h)
- Tạo branch git `ui-redesign`
- Cài Tailwind CSS, daisyUI, Lucide React
- Cấu hình Tailwind, Vite, index.css

### TASK 2: Theme + Design Tokens (2-3h)
- Định nghĩa color palette mới trong tailwind.config.js
- Thay thế gradient, hardcoded colors
- Thay emoji bằng Lucide icons

### TASK 3: Tạo Shared Components (3-5h)
- Tạo thư mục `components/ui/`: Button, Input, Select, Dialog, Badge, PageHeader, DataTable, FilterBar, ConfirmDialog, Pagination, ImportExcelDialog
- Tạo thư mục `components/layout/`: AdminSidebar, AdminHeader

### TASK 4: Refactor Layouts (2-3h)
- AdminLayout: responsive sidebar
- UserLayout: responsive header
- PublicLayout: responsive auth card

### TASK 5: Refactor Pages Phase A — Đơn giản (3-4h)
- AdminDashboard, AdminFieldsPage, AdminFormsPage, AdminViewsPage, AdminFormBuilderPage, AdminViewBuilderPage, AdminDataListsPage, RecordDetailPage

### TASK 6: Refactor Pages Phase B — Trung bình (4-5h)
- AdminUsersPage, AdminProposalsPage, AdminRecordFilesPage, LoginPage, RegisterPage, ProfilePage

### TASK 7: Refactor Pages Phase C — Phức tạp (5-6h)
- AdminStationsPage, AdminMapConfigPage, MyProposalsPage, MapPage

### TASK 8: Responsive System (3-4h)
- Breakpoints: sm(640), md(768), lg(1024), xl(1280)
- Responsive patterns cho layout, table, form, filter, page header

### TASK 9: Dọn dẹp (2-3h)
- Xóa App.css (4,119 dòng)
- Xóa inline styles, unused CSS classes
- Clean up emoji, gradient, AI style

### TASK 10: Visual Audit + Test (2h)
- Test responsive trên nhiều thiết bị
- Test CRUD operations
- Test import Excel
- Test map interactions

---

## 5. Tổng kết thời gian

| Phase | Thời gian | Task |
|-------|-----------|------|
| Setup | 1h | Backup + cài Tailwind/daisyUI |
| Theme | 2-3h | Design tokens + colors + icons |
| Components | 3-5h | 11 shared components |
| Layouts | 2-3h | Responsive layouts |
| Pages A | 3-4h | 8 pages đơn giản |
| Pages B | 4-5h | 6 pages trung bình |
| Pages C | 5-6h | 4 pages phức tạp |
| Responsive | 3-4h | System responsive |
| Cleanup | 2-3h | Xóa code thừa |
| Audit | 2h | Test + visual check |
| **Tổng** | **27-38h** | **~3-5 ngày** |

---

## 6. Files sẽ sửa

```
frontend/
├── tailwind.config.js          (tạo mới)
├── vite.config.js              (sửa)
├── src/
│   ├── index.css               (sửa — thêm @tailwind)
│   ├── App.css                 (xóa dần)
│   ├── components/
│   │   ├── ui/                 (tạo mới — 11 components)
│   │   ├── layout/             (tạo mới — 2 components)
│   │   ├── dynamic/            (sửa presentation)
│   │   ├── admin/              (sửa presentation)
│   │   └── ...                 (sửa presentation)
│   ├── layouts/
│   │   ├── AdminLayout.jsx     (sửa — responsive)
│   │   ├── UserLayout.jsx      (sửa — responsive)
│   │   └── PublicLayout.jsx    (sửa — responsive)
│   └── pages/
│       ├── admin/              (sửa presentation)
│       ├── user/               (sửa presentation)
│       └── auth/               (sửa presentation)
```

## 7. Files KHÔNG đụng

```
frontend/src/
├── contexts/AuthContext.jsx     (giữ nguyên)
├── hooks/                       (giữ nguyên)
├── services/api.js              (giữ nguyên)
├── utils/                       (giữ nguyên)

backend/                         (KHÔNG ĐỤNG)
database/                        (KHÔNG ĐỤNG)
```
