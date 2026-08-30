# CẬP NHẬT THAY ĐỔI NGOÀI KẾ HOẠCH

> **Ngày cập nhật:** 28/08/2026
> **Ghi chú:** Các thay đổi bổ sung ngoài kế hoạch 16 bước ban đầu

---

## 1. Menu Chuyển Hướng Admin/User + Hamburger Menu

### Mục đích
- Admin có thể dễ dàng chuyển sang trang User (xem bản đồ) mà không cần logout
- User có quyền Admin có thể truy cập Admin Panel từ menu
- Mobile cần hamburger menu để navigation gọn gàng

### Thay đổi

**AdminLayout.jsx:**
- Thêm link "Xem bản đồ (User)" trong sidebar
- Thêm hamburger button trên mobile
- Sidebar trượt từ trái sang phải khi mở (mobile)
- Overlay backdrop khi sidebar mở

**UserLayout.jsx:**
- Thêm link "Admin Panel" cho user có role ADMIN
- Thêm hamburger button trên mobile
- Nav hiển thị dạng danh sách trên mobile
- Overlay backdrop khi menu mở

**CSS Responsive:**
- Mobile (≤768px): Hamburger button hiển thị
- Sidebar/Admin: trượt từ trái, có overlay
- User Nav: hiển thị full-screen trên mobile

---

## 2. Chỉnh Sửa Proposals và Profile

### 2.1. User Chỉnh Sửa Proposals

**API mới:**
```
PUT /api/my-proposals/:id
  Body: { owner_name, owner_phone, address, area, land_type, description }
  Response: { success, data, message }
```

**Quy tắc:**
- Chỉ chỉnh sửa được đề xuất có status = `PENDING`
- Phải là chủ sở hữu proposal (check user_id)
- Các trường bắt buộc: owner_name, owner_phone, address

**Frontend:**
- Thêm cột "Thao tác" với nút "Sửa" (chỉ hiển thị khi PENDING)
- Modal form chỉnh sửa với dữ liệu đã có
- Toast thông báo thành công

### 2.2. User Chỉnh Sửa Profile

**API mới:**
```
PUT /api/auth/profile
  Body: { full_name, phone, current_password?, new_password? }
  Response: { success, data, message }
```

**Quy tắc:**
- `full_name` là bắt buộc
- Nếu đổi mật khẩu: phải nhập `current_password` đúng
- `new_password` phải có ít nhất 6 ký tự

**Frontend:**
- Nút "Chỉnh sửa" trên trang Profile
- Form inline với các trường: Họ tên, SĐT, Đổi mật khẩu
- Hiển thị email (readonly)
- Cập nhật AuthContext sau khi sửa thành công

---

## 3. Đổi Cột ID Thành STT

### Mục đích
- STT trực quan hơn ID cho người dùng cuối
- ID là technical detail, không cần hiển thị

### Các bảng áp dụng

| Bảng | File | Cột thay đổi |
|------|------|-------------|
| Users | AdminUsersPage.jsx | ID → STT |
| Stations | AdminStationsPage.jsx | ID → STT |
| Proposals (Admin) | AdminProposalsPage.jsx | ID → STT |
| My Proposals | MyProposalsPage.jsx | ID → STT |

### Cách tính STT
```jsx
// STT = index + 1 (dựa trên thứ tự hiển thị)
{proposals.map((p, idx) => (
  <tr key={p.id}>
    <td>{idx + 1}</td>
    ...
  </tr>
))}
```

**Lưu ý:**
- STT thay đổi khi filter/phân trang
- ID vẫn được giữ trong data (dùng cho edit/delete)

---

## 4. AuthContext - updateUser

**Thêm function:**
```js
const updateUser = (userData) => {
  setUser(prev => ({ ...prev, ...userData }));
};
```

**Sử dụng:**
- Sau khi cập nhật profile → gọi `updateUser(res.data)` để sync state

---

## Tóm Tắt Files Đã Sửa

| File | Thay đổi |
|------|----------|
| `backend/src/routes/myProposals.js` | Thêm `PUT /:id` |
| `backend/src/routes/auth.js` | Thêm `PUT /profile` |
| `frontend/src/contexts/AuthContext.jsx` | Thêm `updateUser()` |
| `frontend/src/layouts/AdminLayout.jsx` | Hamburger + link User |
| `frontend/src/layouts/UserLayout.jsx` | Hamburger + link Admin |
| `frontend/src/pages/user/MyProposalsPage.jsx` | Form sửa proposal |
| `frontend/src/pages/user/ProfilePage.jsx` | Form sửa profile |
| `frontend/src/pages/admin/AdminUsersPage.jsx` | ID → STT |
| `frontend/src/pages/admin/AdminStationsPage.jsx` | ID → STT |
| `frontend/src/pages/admin/AdminProposalsPage.jsx` | ID → STT |
| `frontend/src/App.css` | CSS responsive mobile |
