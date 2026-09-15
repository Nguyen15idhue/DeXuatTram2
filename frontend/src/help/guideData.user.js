export const userGuide = {
  title: 'Hướng dẫn cho người dùng',
  sections: [
    {
      id: 'tai-khoan',
      title: 'Tài khoản',
      steps: [
        { id: 'A01', title: 'Đăng nhập', text: 'Mở trang Đăng nhập, nhập email + mật khẩu rồi bấm nút Đăng nhập.', image: '/help/user/a01_dang-nhap.jpg' },
        { id: 'A02', title: 'Đăng ký', text: 'Mở /register, điền thông tin và bấm Đăng ký.', image: '/help/user/a02_dang-ky.jpg' },
        { id: 'A03', title: 'Hồ sơ & đổi mật khẩu', text: 'Vào Hồ sơ để cập nhật thông tin hoặc đổi mật khẩu.', image: '/help/user/a03_ho-so.jpg' },
      ],
    },
    {
      id: 'ban-do',
      title: 'Bản đồ',
      steps: [
        { id: 'A04', title: 'Xem marker & chú thích', text: 'Mở Bản đồ; marker màu theo trạng thái trạm/đề xuất; xem bảng Chú thích.', image: '/help/user/a04-ban-do.jpg' },
        { id: 'A05', title: 'Bộ lọc bản đồ', text: 'Mở "Bộ lọc bản đồ" để chọn phạm vi, ẩn/hiện trạm & đề xuất, lọc trạng thái và loại ưu tiên.', image: '/help/user/a05-bo-loc.jpg' },
        { id: 'A06', title: 'Chuyển nền bản đồ', text: 'Bấm "Chuyển layer" → chọn Đường phố / Vệ tinh / Vệ tinh + nhãn / Địa hình.', image: '/help/user/a06-chuyen-layer.jpg' },
        { id: 'A07', title: 'Nhãn hành chính mới/cũ', text: 'Trong "Chuyển layer" → nhóm "Nhãn hành chính" → chọn Nhãn mới / Nhãn cũ / Tắt nhãn.', image: '/help/user/a07-nhan-hanh-chinh.jpg' },
        { id: 'A08', title: 'Bật/tắt 3D', text: 'Bấm nút 3D (chỉ khi renderer MapLibre) để xem nhà nổi + địa hình.', image: '/help/user/a08-3d.jpg' },
        { id: 'A09', title: 'Tạo đề xuất: chọn toạ độ', text: 'Bấm nút "+" để mở menu 3 cách chọn toạ độ: Vị trí của tôi / Chọn trên bản đồ / Dán link Google Map.', image: '/help/user/a09-menu-tao-de-xuat.jpg' },
        { id: 'A10', title: 'Form đề xuất', text: 'Sau khi chọn toạ độ, form đề xuất mở ra với toạ độ và địa chỉ tự điền.', image: '/help/user/a10-form-de-xuat.jpg' },
        { id: 'A11', title: 'Tạo trạm nhanh (ADMIN+)', text: 'ADMIN/SUPER_ADMIN có nút "Tạo trạm nhanh" ở trên nút "Vị trí của tôi"; cùng 3 cách chọn toạ độ nhưng mở form trạm.', image: '/help/user/a11-tao-tram-nhanh.jpg' },
      ],
    },
    {
      id: 'de-xuat-cua-toi',
      title: 'Đề xuất của tôi',
      steps: [
        { id: 'A12', title: 'Danh sách đề xuất', text: 'Xem danh sách + mini map; mở chi tiết để xem/sửa; đề xuất bị từ chối có nút "Gửi lại".', image: '/help/user/a12-de-xuat-cua-toi.jpg' },
      ],
    },
    {
      id: 'khach',
      title: 'Khách (không đăng nhập)',
      steps: [
        { id: 'A13', title: 'Gửi & tra cứu đề xuất', text: 'Vào /de-xuat, điền form + CAPTCHA rồi gửi; tra cứu bằng mã tracking.', image: '/help/user/a13-guest.jpg' },
      ],
    },
    {
      id: 'thong-bao',
      title: 'Thông báo',
      steps: [
        { id: 'A14', title: 'Chuông thông báo', text: 'Bấm chuông ở header để xem thông báo (khi đề xuất đổi trạng thái).', image: '/help/user/a14-thong-bao.jpg' },
      ],
    },
  ],
};
