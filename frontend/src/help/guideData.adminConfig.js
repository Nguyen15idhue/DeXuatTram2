export const adminConfigGuide = {
  title: 'Cấu hình hệ thống',
  sections: [
    {
      id: 'fields',
      title: 'Field Definitions',
      steps: [
        { id: 'C01', title: 'Quản lý trường động', text: 'Bấm "+ Thêm field", chọn type/source/options/formula; có Khóa/Mở khóa/Xóa.', image: '/help/admin-config/c01_fields.jpg' },
      ],
    },
    {
      id: 'forms',
      title: 'Forms Manager & Builder',
      steps: [
        { id: 'C02', title: 'Danh sách form', text: 'Tạo/sửa form "Nhập liệu" hoặc "Xem/sửa".', image: '/help/admin-config/c02_forms.jpg' },
        { id: 'C03', title: 'Form Builder', text: 'Kéo-thả field vào section, đặt colSpan/điều kiện hiển thị rồi "Lưu form".', image: '/help/admin-config/c03_form-builder.jpg' },
      ],
    },
    {
      id: 'views',
      title: 'Views Manager & Builder',
      steps: [
        { id: 'C04', title: 'Danh sách view', text: 'Tạo/sửa view bảng cho từng entity.', image: '/help/admin-config/c04_views.jpg' },
        { id: 'C05', title: 'View Builder', text: 'Kéo-thả cột, chỉnh width/sortable/filterable/visible rồi "Lưu view".', image: '/help/admin-config/c05_view-builder.jpg' },
      ],
    },
    {
      id: 'data-lists',
      title: 'Data Lists',
      steps: [
        { id: 'C06', title: 'Danh mục dùng chung', text: 'Tạo data list, định nghĩa cột; "Dữ liệu" để thêm dòng; Import/Export; phân cấp parent.', image: '/help/admin-config/c06_data-lists.jpg' },
      ],
    },
    {
      id: 'map-config',
      title: 'Map Config & Geocode',
      steps: [
        { id: 'C07', title: 'Cấu hình bản đồ', text: 'Chọn Renderer/Provider/Mode, "Test kết nối", rồi "Lưu cấu hình".', image: '/help/admin-config/c07_map-config.jpg' },
        { id: 'C08', title: 'Cấu hình địa chỉ', text: 'Nhập Geoapify key, Test rồi "Lưu cấu hình địa chỉ".', image: '/help/admin-config/c08_geocode.jpg' },
      ],
    },
    {
      id: 'roles-api',
      title: 'Phân quyền & API Configs',
      steps: [
        { id: 'C09', title: 'Phân quyền', text: 'Xem ma trận phân quyền giữa các role.', image: '/help/admin-config/c09_roles.jpg' },
        { id: 'C10', title: 'API Configs (1Office)', text: 'Bấm "Thêm API", Test, Sync nhân sự, Template.', image: '/help/admin-config/c10_api-configs.jpg' },
        { id: 'C11', title: 'Field Mapping', text: 'Gán field app ↔ field 1Office rồi lưu.', image: '/help/admin-config/c11_mapping.jpg' },
        { id: 'C12', title: 'Swagger API Docs', text: 'Mở /api-docs để tra cứu toàn bộ API.', image: '/help/admin-config/c12_swagger.jpg' },
      ],
    },
  ],
};
