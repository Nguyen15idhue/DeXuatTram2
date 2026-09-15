export const flowsGuide = {
  title: 'Luồng thực hiện — làm từ đầu đến cuối theo từng việc',
  flows: [
    {
      id: 'F1',
      title: 'Tạo đề xuất mới — 2 cách',
      desc: 'Cách 1 tại trang Bản đồ, Cách 2 tại trang Đề xuất của tôi. Kết quả giống nhau.',
      steps: [
        { ref: 'G06', note: 'Cách 1 — tại trang Bản đồ: bấm nút + để mở menu 3 cách chọn tọa độ (Vị trí của tôi / Chọn trên bản đồ / Dán link Google Map). Dùng khi bạn đang xem bản đồ và chấm được vị trí ưng ý.', image: '/help/user/a09-menu-tao-de-xuat.jpg' },
        { ref: 'G06', note: 'Điền form đề xuất: tọa độ và địa chỉ tự điền sẵn từ điểm bạn chọn, chỉ cần bổ sung thông tin còn thiếu rồi gửi. Ghi lại mã tracking.', image: '/help/user/a10-form-de-xuat.jpg' },
        { ref: 'G12', note: 'Cách 2 — tại trang Đề xuất của tôi: bấm Tạo đề xuất, click lên bản đồ mini để ghim tọa độ rồi điền form. Tiện khi bạn đang quản lý danh sách và muốn thêm mới.', image: '/help/user/f13_tao-tu-my-proposals.jpg' },
        { ref: 'G12', note: 'Cả 2 cách đều kiểm tra trùng khoảng cách trước khi lưu; gửi xong marker mới xuất hiện trên bản đồ và vào trạng thái chờ duyệt.' },
      ],
    },
    {
      id: 'F2',
      title: 'Vòng đời đề xuất: xem → sửa → duyệt',
      desc: 'Người dùng quản lý đề xuất của mình; admin/SALES duyệt ở trang quản trị.',
      steps: [
        { ref: 'G13', note: 'Mở chi tiết để xem đầy đủ nội dung, file và trạng thái hiện tại.' },
        { ref: 'G14', note: 'Còn sửa được khi chờ duyệt; bị từ chối thì sửa rồi bấm Gửi lại để quay về chờ duyệt.' },
        { ref: 'G15', note: 'Tạo nhầm thì xóa (chỉ của chính mình, có xác nhận, mất hẳn).' },
        { ref: 'G25', note: 'Phía người duyệt (SALES/ADMIN): lọc đề xuất theo trạng thái + Cấp 1/Cấp 2 để xử lý hàng loạt.', image: '/help/admin-data/b07_proposals.jpg' },
        { ref: 'G26', note: 'Duyệt (popup xác nhận, không hoàn tác): hệ thống tự tạo lệnh gửi sang 1Office. Từ chối thì bắt buộc ghi lý do.', image: '/help/admin-data/b08_trang-thai.jpg' },
        { ref: 'G16', note: 'Chủ đề xuất nhận thông báo ở chuông header sau mỗi lần đổi trạng thái.', image: '/help/user/a14-thong-bao.jpg' },
      ],
    },
    {
      id: 'F3',
      title: 'Tạo trạm mới — 2 cách',
      desc: 'Cách 1 tạo nhanh trên bản đồ (ADMIN+), Cách 2 tạo tại trang Quản lý Trạm.',
      steps: [
        { ref: 'G06', note: 'Cách 1 — tạo nhanh trên bản đồ (ADMIN/SUPER_ADMIN): bấm Tạo trạm nhanh phía trên nút Vị trí của tôi, chọn tọa độ theo 3 cách rồi điền form trạm.', image: '/help/user/a11-tao-tram-nhanh.jpg' },
        { ref: 'G24', note: 'Cách 2 — tại trang Quản lý Trạm: bấm Thêm trạm, nhập form rồi Lưu. Hợp khi cần nhập liệu kỹ, không cần bản đồ.', image: '/help/admin-data/b06-them-tram.jpg' },
        { ref: 'G23', note: 'Cả 2 cách đều kiểm tra trùng khoảng cách; mô hình trạm (TDT/LK/NQ) quyết định Loại ưu tiên Cấp 1/Cấp 2 (xem S03).' },
      ],
    },
  ],
};
