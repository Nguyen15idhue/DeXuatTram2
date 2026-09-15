export const adminDataGuide = {
  title: 'Quản lý dữ liệu',
  sections: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      steps: [
        { id: 'B01', title: 'Thống kê tổng quan', text: 'Xem số user/trạm/đề xuất và tỉ lệ duyệt.', image: '/help/admin-data/b01_dashboard.jpg' },
      ],
    },
    {
      id: 'users',
      title: 'Quản lý Users',
      steps: [
        { id: 'B02', title: 'Danh sách & cây phân cấp', text: 'Tìm kiếm, lọc role/status; xem cây SALES → CTV.', image: '/help/admin-data/b02_users.jpg' },
        { id: 'B03', title: 'Tạo user', text: 'Bấm "Tạo user", nhập thông tin, chọn role rồi Lưu.', image: '/help/admin-data/b03_tao-user.jpg' },
        { id: 'B04', title: 'Import / Export', text: 'Tải Template, Import (Xem trước → Xác nhận) hoặc Export.', image: '/help/admin-data/b04_import-export.jpg' },
      ],
    },
    {
      id: 'stations',
      title: 'Quản lý Trạm',
      steps: [
        { id: 'B05', title: 'Danh sách & lọc', text: 'Tìm kiếm, lọc trạng thái / loại ưu tiên / mô hình.', image: '/help/admin-data/b05_stations.jpg' },
        { id: 'B06', title: 'Thêm trạm', text: 'Bấm "Thêm trạm", nhập form (có kiểm tra trùng khoảng cách) rồi Lưu.', image: '/help/admin-data/b06-them-tram.jpg' },
      ],
    },
    {
      id: 'proposals',
      title: 'Quản lý Đề xuất',
      steps: [
        { id: 'B07', title: 'Danh sách & lọc', text: 'Lọc theo trạng thái (nhãn tiếng Việt) và loại ưu tiên.', image: '/help/admin-data/b07_proposals.jpg' },
        { id: 'B08', title: 'Đổi trạng thái / Từ chối', text: 'Chọn trạng thái ở cột; chọn "Từ chối" phải nhập lý do.', image: '/help/admin-data/b08_trang-thai.jpg' },
        { id: 'B09', title: 'Đẩy/Lấy/Link 1Office', text: 'Dùng menu để "Đẩy sang 1Office", "Lấy về từ 1Office", "Link"/"Hủy link".', image: '/help/admin-data/b09_1office.jpg' },
      ],
    },
    {
      id: 'audit',
      title: 'Audit Log & File',
      steps: [
        { id: 'B10', title: 'Audit Log', text: 'Lọc, xem chi tiết, Retry/Cancel (chỉ SUPER_ADMIN).', image: '/help/admin-data/b10_audit.jpg' },
        { id: 'B11', title: 'File bản ghi', text: 'Mở danh sách file của một bản ghi để Xem/Tải.', image: '/help/admin-data/b11_files.jpg' },
      ],
    },
  ],
};
