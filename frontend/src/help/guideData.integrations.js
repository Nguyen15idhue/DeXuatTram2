export const integrationsGuide = {
  title: 'Tích hợp đặc biệt — Đề xuất ↔ 1Office',
  flows: [
    {
      id: 'F4',
      title: 'Đẩy 1Office → kiểm tra → mở 1Office',
      desc: 'Luồng xuyên 3 màn hình: Quản lý Đề xuất → Audit Log → 1Office.',
      steps: [
        { ref: 'G25', note: 'F4.1 Đẩy: có 2 cách — (1) tự động khi Duyệt đề xuất (popup xác nhận, không hoàn tác); (2) thủ công: chọn đề xuất chưa liên kết rồi Đẩy sang 1Office. Cả 2 đều tạo lệnh chờ, theo dõi ở Audit Log.', image: '/help/admin-data/b09_1office.jpg' },
        { ref: 'G25', note: 'F4.2 Lấy về / Link tay: "Lấy về từ 1Office", "Link" bằng mã contact, "Hủy link" khi cần.' },
        { ref: 'G25', note: 'F4.3 Ô ID 1Office: field formula {id_1office} tự điền sau khi đẩy; click vào mã để mở contact bên 1Office.', image: '/help/admin-data/f43_id-1office.jpg' },
        { ref: 'G38', note: 'F4.4 Audit log: vào Audit Log lọc push/pull, xem chi tiết, Retry/Cancel (chỉ SUPER_ADMIN).', image: '/help/admin-data/b10_audit.jpg' },
        { ref: 'G37', note: 'F4.5 Mapping: gán field app ↔ 1Office, Desc Template, Sync nhân sự trong API Configs.', image: '/help/admin-config/c11_mapping.jpg' },
      ],
    },
  ],
};
