const helpService = require('./src/services/helpService');
const pool = require('./src/utils/db');

const ROLES_ALL = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP', 'guest'];

const ARTICLES = [
  {
    slug: 'so-sanh-4-mo-hinh-dau-tu',
    title: 'So sánh nhanh 4 mô hình đầu tư TDT / NQ / LK / NQ_LK',
    summary: 'Phân biệt Tự đầu tư, Nhượng quyền, Liên kết và mô hình hỗn hợp Nhượng quyền + Liên kết.',
    tags: ['mo hinh', 'tdt', 'nq', 'lk', 'nq_lk', 'so sanh', 'tu dau tu', 'nhuong quyen', 'lien ket'],
    route: '/admin/proposals',
    content_html: '<h2>4 mô hình đầu tư</h2><ul><li><strong>TDT (Tự đầu tư):</strong> công ty tự bỏ vốn làm trạm. Loại ưu tiên <strong>Cấp 1</strong>.</li><li><strong>NQ (Nhượng quyền):</strong> đối tác bỏ vốn, dùng thương hiệu và quy trình của công ty.</li><li><strong>LK (Liên kết):</strong> hợp tác chia sẻ mặt bằng, hạ tầng với đối tác.</li><li><strong>NQ_LK (Nhượng quyền + Liên kết):</strong> mô hình hỗn hợp; form hiện tab lồng gồm 2 tab con Nhượng quyền và Liên kết.</li></ul><p>NQ, LK, NQ_LK thuộc loại ưu tiên <strong>Cấp 2</strong>. Khi tạo đề xuất, chọn đúng mô hình để form hiện đúng trường cần nhập.</p>',
  },
  {
    slug: 'xu-ly-loi-thuong-gap',
    title: 'Xử lý nhanh các lỗi thường gặp',
    summary: 'Bản đồ trắng, tệp không tải lên được, bấm Duyệt bị chặn, mất mã tracking.',
    tags: ['loi', 'xu ly', 'su co', 'ban do trang', 'tile', 'upload', 'duyet', 'tracking'],
    route: '/huong-dan',
    content_html: '<h2>Lỗi thường gặp và cách xử lý</h2><ul><li><strong>Bản đồ trắng hoặc báo lỗi tile:</strong> kiểm tra kết nối mạng, thử đổi chế độ nền bản đồ, xem banner cảnh báo cấu hình.</li><li><strong>Tệp đính kèm không tải lên được:</strong> kiểm tra định dạng cho phép (ảnh, PDF, Word, Excel, text) và dung lượng tối đa 10MB.</li><li><strong>Bấm Duyệt bị chặn, báo thiếu nhân sự:</strong> bổ sung người phụ trách / người giao phụ trách rồi duyệt lại.</li><li><strong>Mất mã tracking đề xuất khách:</strong> dùng trang tra cứu với số điện thoại đã gửi.</li></ul>',
  },
  {
    slug: 'tong-quan-he-thong-5-phut',
    title: 'Tổng quan hệ thống trong 5 phút',
    summary: 'Trạm, đề xuất, bản đồ, tài khoản và luồng làm việc chính.',
    tags: ['tong quan', 'bat dau', 'gioi thieu', 'tram', 'de xuat', 'ban do', 'tai khoan'],
    route: '/map',
    content_html: '<h2>Hệ thống gồm 4 mảng chính</h2><ol><li><strong>Bản đồ:</strong> xem toàn bộ trạm và đề xuất theo vị trí, lọc theo trạng thái và loại ưu tiên.</li><li><strong>Đề xuất:</strong> tạo mới, theo dõi vòng đời (đề xuất, xem xét, duyệt, ký hợp đồng), sửa và gửi lại khi bị từ chối.</li><li><strong>Trạm:</strong> danh sách trạm đã có thật, tạo từ đề xuất đã ký thành công.</li><li><strong>Tài khoản & phân quyền:</strong> đăng nhập bằng email hoặc số điện thoại; mỗi vai trò thấy đúng phần việc của mình.</li></ol><p>Người mới nên đọc 3 luồng F1, F2, F3 ở tab Luồng thực hiện.</p>',
  },
];

async function main() {
  const [cats] = await pool.query("SELECT id FROM help_categories WHERE slug = 'faq' LIMIT 1");
  const categoryId = cats.length > 0 ? cats[0].id : null;
  for (const a of ARTICLES) {
    const [dup] = await pool.query('SELECT id FROM help_articles WHERE slug = ?', [a.slug]);
    if (dup.length > 0) {
      console.log('exists:', a.slug);
      continue;
    }
    const created = await helpService.createArticle({
      slug: a.slug,
      category_id: categoryId,
      title: a.title,
      summary: a.summary,
      content_html: a.content_html,
      tags: a.tags,
      roles: ROLES_ALL,
      route: a.route || null,
      status: 'published',
      sort_order: 900,
    }, 1);
    console.log('created:', created.slug);
  }
  await pool.end();
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
