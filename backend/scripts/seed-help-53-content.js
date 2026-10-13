const pool = require('../src/utils/db');

const CAT = {
  'tai-khoan': 2,
  'ban-do': 3,
  'de-xuat-cua-toi': 4,
  khach: 5,
  users: 7,
  proposals: 9,
};

const ALL = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP'];
const PANEL = ['SUPER_ADMIN', 'ADMIN', 'SALES'];

const ARTICLES = [
  {
    slug: 'huy-de-xuat-cancelled',
    legacy_id: null,
    category: 'de-xuat-cua-toi',
    title: 'Hủy đề xuất (trạng thái Đã hủy)',
    summary: 'Hủy một đề xuất không còn nhu cầu. Có thể hủy từ mọi trạng thái chưa kết thúc và bắt buộc nhập lý do.',
    roles: ALL,
    route: '/my-proposals',
    tags: ['hủy đề xuất', 'cancelled', 'đã hủy'],
    images: ['/help/user/g15_xoa-de-xuat.jpg'],
    related: ['de-xuat-luu-tru-archived', 's04-vong-doi-mot-de-xuat'],
    blocks: [
      ['p', 'Trạng thái Đã hủy (CANCELLED) dùng khi đề xuất không còn nhu cầu triển khai. Đây là trạng thái kết thúc (terminal) — đề xuất sẽ dừng mọi bước xử lý tiếp theo.'],
      ['h2', 'Ai được hủy'],
      ['ul', ['Chủ đề xuất (CTV/NPP) hủy đề xuất của chính mình.', 'SALES/ADMIN/SUPER_ADMIN hủy đề xuất trong phạm vi quản lý.']],
      ['h2', 'Cách hủy'],
      ['ol', [
        'Mở danh sách đề xuất, tìm đề xuất cần hủy.',
        'Bấm menu 3 chấm ở cuối dòng và chọn Hủy đề xuất.',
        'Nhập lý do hủy (bắt buộc), rồi xác nhận.',
      ]],
      ['h2', 'Lưu ý quan trọng'],
      ['ul', [
        'Có thể hủy từ mọi trạng thái chưa kết thúc: Chờ duyệt, Đang xem xét, Đã duyệt, Đã lưu trữ, Ký thành công, Ký thất bại, Từ chối.',
        'Đề xuất đã ở trạng thái Đã hủy thì không hủy lại được; chỉ SUPER_ADMIN có thể Mở lại khẩn cấp.',
        'Hệ thống gửi thông báo kèm lý do hủy tới chủ đề xuất.',
      ]],
      ['note', 'Khác với Xóa: Hủy giữ lại hồ sơ để tra cứu, còn Xóa là bỏ hẳn và không hoàn tác.'],
    ],
  },
  {
    slug: 'de-xuat-luu-tru-archived',
    legacy_id: null,
    category: 'de-xuat-cua-toi',
    title: 'Lưu trữ đề xuất (Đã lưu trữ)',
    summary: 'Cất một đề xuất đã duyệt vào kho vì ưu tiên thấp, vẫn có thể chuyển sang Ký hợp đồng hoặc Hủy sau đó.',
    roles: PANEL,
    route: '/admin/proposals',
    tags: ['lưu trữ', 'archived'],
    images: ['/help/admin-data/b08_trang-thai.jpg'],
    related: ['huy-de-xuat-cancelled'],
    blocks: [
      ['p', 'Đã lưu trữ (ARCHIVED) dành cho đề xuất đã được duyệt nhưng chưa ưu tiên triển khai ngay — cất vào kho để theo dõi sau.'],
      ['h2', 'Đường đi của trạng thái'],
      ['ul', [
        'Vào từ Đang xem xét.',
        'Ra bằng Ký thành công hoặc Đã hủy.',
      ]],
      ['h2', 'Khi nào dùng'],
      ['ul', [
        'Đề xuất hợp lệ nhưng chưa nằm trong kế hoạch triển khai gần.',
        'Cần giữ hồ sơ để đối chiếu, không muốn hiển thị như đề xuất đang hoạt động.',
      ]],
      ['algorithm', 'Đã lưu trữ ngang hàng với Đã duyệt về ý nghĩa: đã được duyệt, chỉ khác thứ tự ưu tiên và cách hiển thị (màu tím trên bản đồ/chú thích, có trong bộ lọc).'],
    ],
  },
  {
    slug: 'tao-nhanh-de-xuat',
    legacy_id: null,
    category: 'de-xuat-cua-toi',
    title: 'Tạo nhanh đề xuất',
    summary: 'Mở form rút gọn chỉ gồm các thông tin cơ bản để gửi vội, bổ sung sau.',
    roles: ALL,
    route: '/my-proposals',
    tags: ['tạo nhanh', 'quick create'],
    images: ['/help/user/f13_tao-tu-my-proposals.jpg'],
    related: ['f1-tao-de-xuat-moi-2-cach'],
    blocks: [
      ['p', 'Nút Tạo nhanh mở một form gọn (chỉ 7 trường cơ bản) thay vì toàn bộ form đề xuất. Phù hợp khi cần ghi nhận vị trí gấp rồi hoàn thiện sau.'],
      ['h2', 'Cách dùng'],
      ['ol', [
        'Ở trang Đề xuất của tôi (hoặc Quản lý Đề xuất), bấm Tạo nhanh.',
        'Chọn vị trí và điền các thông tin cơ bản.',
        'Lưu đề xuất. Marker xuất hiện ở trạng thái Chờ duyệt.',
      ]],
      ['h2', 'Sau khi tạo nhanh'],
      ['p', 'Mở lại đề xuất và bổ sung các thông tin còn thiếu (chi phí, pháp lý, người phụ trách...) trước khi gửi duyệt chính thức.'],
      ['note', 'Vẫn áp dụng kiểm tra trùng khoảng cách như tạo đề xuất thường.'],
    ],
  },
  {
    slug: 'mo-hinh-nq-lk',
    legacy_id: null,
    category: 'de-xuat-cua-toi',
    title: 'Mô hình Nhượng quyền + Liên kết (NQ_LK)',
    summary: 'Khi chọn mô hình NQ_LK, form đề xuất hiện thêm 2 tab con để nhập riêng phần Nhượng quyền và phần Liên kết.',
    roles: ALL,
    route: '/my-proposals',
    tags: ['NQ_LK', 'nhượng quyền', 'liên kết', 'tab'],
    images: ['/help/user/g39_nqlk.jpg'],
    related: ['bang-chi-phi-lk'],
    blocks: [
      ['p', 'Hệ thống có 4 mô hình đầu tư: Nhượng quyền (NQ), Trạm đối tác/TDT, Liên kết (LK) và Nhượng quyền + Liên kết (NQ_LK).'],
      ['h2', 'NQ_LK khác gì'],
      ['p', 'Khi chọn NQ_LK, form hiện thêm một nhóm tab tên Nhượng quyền và Liên kết. Mỗi tab chứa các trường riêng của phần đó.'],
      ['h2', 'Cách nhập'],
      ['ol', [
        'Ở trường Mô hình đầu tư, chọn Nhượng quyền + Liên kết.',
        'Chuyển sang tab Nhượng quyền, nhập chính sách và loại trừ của phần nhượng quyền.',
        'Chuyển sang tab Liên kết, nhập chính sách, loại trừ và các chi phí liên kết.',
        'Kiểm tra cả 2 tab đều đã nhập đủ trước khi lưu.',
      ]],
      ['note', 'Mã đề xuất của mô hình này có dạng NQ_LK_HCM_0001.'],
    ],
  },
  {
    slug: 'bang-chi-phi-lk',
    legacy_id: null,
    category: 'de-xuat-cua-toi',
    title: 'Bảng chi phí Liên kết (chi_phi_lk)',
    summary: 'Nhập nhiều dòng chi phí liên kết dạng bảng; chọn loại chi phí thì đơn giá tự điền, số tiền bắt buộc.',
    roles: ALL,
    route: '/my-proposals',
    tags: ['chi phí liên kết', 'bảng'],
    images: [],
    related: ['mo-hinh-nq-lk'],
    blocks: [
      ['p', 'Phần Liên kết dùng một bảng chi phí thay cho các ô số rời, giúp nhập nhiều khoản chi phí linh hoạt.'],
      ['h2', 'Cách nhập'],
      ['ol', [
        'Vào tab Liên kết của đề xuất mô hình NQ_LK.',
        'Bấm thêm dòng trong bảng Chi phí liên kết.',
        'Chọn Loại chi phí từ danh mục; cột đơn giá tự điền theo loại đã chọn.',
        'Nhập số tiền. Cả loại chi phí và số tiền đều bắt buộc, không được để trống.',
      ]],
      ['h2', 'Tổng chi phí'],
      ['p', 'Hệ thống tự cộng tổng chi phí từ các dòng trong bảng để dùng cho các bước tính toán tiếp theo.'],
      ['errors', ['Dòng thiếu loại chi phí hoặc số tiền sẽ bị chặn khi lưu.', 'Loại chi phí lấy từ danh mục dùng chung — liên hệ quản trị nếu thiếu loại cần dùng.']],
    ],
  },
  {
    slug: 'loai-dat',
    legacy_id: null,
    category: 'de-xuat-cua-toi',
    title: 'Loại đất',
    summary: 'Chọn loại đất của vị trí đặt trạm trong 6 nhóm có sẵn.',
    roles: ALL,
    route: '/my-proposals',
    tags: ['loại đất', 'land type'],
    images: [],
    related: ['mo-hinh-nq-lk'],
    blocks: [
      ['p', 'Trường Loại đất phân loại khu đất của vị trí đề xuất, giúp đánh giá nhanh mức độ phù hợp.'],
      ['h2', '6 lựa chọn'],
      ['ul', [
        'Đất thương mại dịch vụ',
        'Đất khu công nghiệp',
        'Đất giao thông — Bến bãi — Điểm dừng nghỉ',
        'Đất ở',
        'Đất nông nghiệp',
        'Khác / chưa xác định',
      ]],
      ['note', 'Chưa xác định được thì chọn Khác / chưa xác định, không để trống.'],
    ],
  },
  {
    slug: 'loai-uu-tien-cap-1-2',
    legacy_id: null,
    category: 'de-xuat-cua-toi',
    title: 'Loại ưu tiên Cấp 1 / Cấp 2',
    summary: 'Hệ thống tự xếp Cấp 1 cho mô hình TDT và Cấp 2 cho các mô hình còn lại; dùng để lọc nhanh trên bản đồ và danh sách.',
    roles: ALL,
    route: '/map',
    tags: ['cấp 1', 'cấp 2', 'ưu tiên'],
    images: ['/help/user/a05-bo-loc.jpg'],
    related: ['nen-ban-do-che-do-3d'],
    blocks: [
      ['p', 'Loại ưu tiên là chỉ số do hệ thống tự tính, không nhập tay:'],
      ['ul', [
        'Cấp 1: mô hình TDT.',
        'Cấp 2: các mô hình LK, NQ, NQ_LK hoặc để trống.',
      ]],
      ['h2', 'Dùng ở đâu'],
      ['ul', [
        'Bộ lọc bản đồ có chip Cấp 1 / Cấp 2 áp cho cả trạm và đề xuất.',
        'Trang Quản lý Đề xuất có bộ lọc theo Loại ưu tiên.',
        'Chú thích bản đồ hiển thị theo nhóm này.',
      ]],
    ],
  },
  {
    slug: 'cay-nhan-su-gdkv-gdtt',
    legacy_id: null,
    category: 'users',
    title: 'Cây nhân sự 2 tầng: GĐTT — GĐKV — CTV/NPP',
    summary: 'Hiểu cây quản lý để thấy đúng người trong nhánh mình; biết cách gán nhánh khi tạo hoặc sửa tài khoản.',
    roles: PANEL,
    route: '/admin/users',
    tags: ['cây nhân sự', 'GĐKV', 'GĐTT', 'nhánh', 'user', 'tài khoản', 'gán nhánh'],
    images: ['/help/admin-data/b03_tao-user.jpg', '/help/admin-data/b02_users.jpg'],
    related: ['s02-ban-la-ai-trong-he-thong'],
    blocks: [
      ['p', 'Tài khoản SALES và CTV/NPP được xếp thành cây 2 tầng để phân quyền theo nhánh.'],
      ['h2', 'Cấu trúc'],
      ['ul', [
        'CTV / NPP thuộc về một Giám đốc Kinh doanh (SALES) gọi là cấp trên trực tiếp.',
        'Giám đốc Kinh doanh (GĐKV) thuộc về Giám đốc Trung tâm (GĐTT) cùng trung tâm.',
      ]],
      ['h2', 'Phạm vi nhìn thấy'],
      ['ul', [
        'GĐTT thấy chính mình, các GĐKV và toàn bộ CTV/NPP bên dưới.',
        'GĐKV thấy chính mình và các CTV/NPP trực tiếp.',
        'SALES còn xem được thông tin cấp trên của mình (chỉ xem, không sửa).',
      ]],
      ['h2', 'Gán nhánh khi tạo tài khoản'],
      ['p', 'Form tạo tài khoản tự gợi ý cấp trên theo Phòng ban và Chức vụ: GĐKV mới gợi ý GĐTT cùng trung tâm; CTV/NPP gợi ý GĐKV cùng phòng ban. Vẫn có thể chọn tay.'],
      ['errors', ['Sửa/xóa tài khoản ngoài nhánh sẽ bị chặn (403).', 'Không thể tác động lên tài khoản SUPER_ADMIN.']],
    ],
  },
  {
    slug: 'ghi-nho-dang-nhap-30-ngay',
    legacy_id: null,
    category: 'tai-khoan',
    title: 'Ghi nhớ đăng nhập 30 ngày',
    summary: 'Đăng nhập bằng email hoặc số điện thoại; tick Ghi nhớ để không phải đăng nhập lại trong 30 ngày.',
    roles: ALL,
    route: '/login',
    tags: ['đăng nhập', 'ghi nhớ', '30 ngày'],
    images: ['/help/user/a01_dang-nhap.jpg'],
    related: ['g05-doi-mat-khau'],
    blocks: [
      ['p', 'Ô đăng nhập nhận cả email và số điện thoại (tự chuẩn hóa 0 / 84 / +84).'],
      ['h2', 'Ghi nhớ đăng nhập'],
      ['ul', [
        'Tick Ghi nhớ đăng nhập: phiên đăng nhập giữ 30 ngày trên thiết bị này.',
        'Không tick: phiên giữ 12 giờ như mặc định.',
      ]],
      ['h2', 'Bảo mật'],
      ['p', 'Khi đổi mật khẩu, mọi phiên đăng nhập cũ trên thiết bị khác sẽ bị đăng xuất để bảo vệ tài khoản.'],
      ['note', 'Máy dùng chung nên bỏ tick Ghi nhớ và đăng xuất khi xong việc.'],
    ],
  },
  {
    slug: 'de-xuat-khach-guest',
    legacy_id: null,
    category: 'khach',
    title: 'Gửi đề xuất khi chưa có tài khoản (khách)',
    summary: 'Khách gửi đề xuất không cần đăng nhập, có mã tra cứu để theo dõi tiến độ.',
    roles: ALL,
    route: '/de-xuat',
    tags: ['khách', 'guest', 'tra cứu'],
    images: ['/help/user/a13-guest.jpg', '/help/user/g18_tra-cuu-tracking.jpg'],
    related: ['s01-he-thong-nay-de-lam-gi'],
    blocks: [
      ['p', 'Người chưa có tài khoản vẫn gửi được đề xuất tại trang Đề xuất dành cho khách.'],
      ['h2', 'Các bước'],
      ['ol', [
        'Mở trang đề xuất dành cho khách.',
        'Điền thông tin và chọn vị trí trên bản đồ.',
        'Vượt qua bước kiểm tra chống spam rồi gửi.',
        'Lưu lại mã tra cứu hiển thị sau khi gửi thành công.',
      ]],
      ['h2', 'Tra cứu tiến độ'],
      ['p', 'Dùng mã tra cứu ở mục tra cứu công khai để xem trạng thái đề xuất. Số điện thoại trong kết quả tra cứu được ẩn một phần để bảo mật.'],
      ['errors', ['Gửi quá nhanh/nhiều lần sẽ bị tạm chặn.', 'Mất mã tra cứu thì liên hệ quản trị để hỗ trợ.']],
      ['note', 'File khách tải lên được dọn dẹp tự động sau một khoảng thời gian nếu đề xuất không hoàn tất.'],
    ],
  },
  {
    slug: 'chuong-thong-bao-gop',
    legacy_id: null,
    category: 'dash',
    title: 'Chuông thông báo và tab Tất cả',
    summary: 'Nhận thông báo khi trạng thái đề xuất đổi; quản trị xem thêm tab Tất cả gộp theo sự kiện.',
    roles: PANEL,
    route: '/admin',
    tags: ['thông báo', 'chuông'],
    images: ['/help/user/a14-thong-bao.jpg'],
    related: ['s04-vong-doi-mot-de-xuat', 'huy-de-xuat-cancelled'],
    blocks: [
      ['p', 'Chuông ở góc phải header báo mỗi khi có sự kiện liên quan tới bạn.'],
      ['h2', 'Cách hoạt động'],
      ['ul', [
        'Tự cập nhật định kỳ; có badge số chưa đọc và hiệu ứng nhấp nháy khi có thông báo mới.',
        'Chỉ tính các thông báo trong số ngày lưu gần nhất (mặc định 7 ngày).',
      ]],
      ['h2', 'Tab Tất cả (ADMIN / SUPER_ADMIN)'],
      ['p', 'Quản trị xem thêm tab Tất cả, mỗi sự kiện gộp thành một dòng kèm số người nhận và danh sách tên khi rê chuột.'],
      ['h2', 'Bấm vào thông báo'],
      ['p', 'Mở thẳng đề xuất tương ứng: ở khu người dùng mở trang đề xuất của tôi, ở khu quản trị mở trang quản lý đề xuất.'],
    ],
  },
  {
    slug: 'nen-ban-do-che-do-3d',
    legacy_id: null,
    category: 'ban-do',
    title: 'Nền bản đồ, chế độ xem và nhãn hành chính',
    summary: 'Đổi nền Đường phố / Vệ tinh / Vệ tinh + nhãn / Địa hình, bật 3D, chọn nhãn tỉnh xã mới hoặc cũ.',
    roles: ALL,
    route: '/map',
    tags: ['nền bản đồ', '3D', 'vệ tinh', 'nhãn hành chính'],
    images: ['/help/user/a06-chuyen-layer.jpg', '/help/user/a07-nhan-hanh-chinh.jpg', '/help/user/a08-3d.jpg'],
    related: ['g07-bo-loc-ban-do'],
    blocks: [
      ['p', 'Nút Chuyển layer cho phép đổi kiểu nền để dễ nhìn theo từng tình huống.'],
      ['h2', 'Các chế độ'],
      ['ul', [
        'Đường phố: phù hợp xem tên đường, địa chỉ.',
        'Vệ tinh: xem địa hình thực tế.',
        'Vệ tinh + nhãn: ảnh vệ tinh kèm tên đường, địa danh.',
        'Địa hình: xem độ cao, địa hình đồi núi.',
      ]],
      ['h2', 'Chế độ 3D'],
      ['p', 'Khi bản đồ hỗ trợ 3D, có nút bật/tắt 3D để xem công trình và địa hình nổi khối. Trên điện thoại, nút 3D được ẩn.'],
      ['h2', 'Nhãn hành chính'],
      ['ul', [
        'Nhãn mới: 34 tỉnh và các phường/xã sau sáp nhập.',
        'Nhãn cũ: 63 tỉnh trước sáp nhập.',
        'Tắt nhãn: ẩn toàn bộ nhãn.',
      ]],
      ['note', 'Nền bản đồ, chế độ và nhãn chỉ đổi trong phiên làm việc hiện tại, không ảnh hưởng người khác.'],
    ],
  },
  {
    slug: 'tao-tram-nhanh-tu-ban-do',
    legacy_id: null,
    category: 'ban-do',
    title: 'Tạo trạm nhanh từ bản đồ',
    summary: 'ADMIN/SUPER_ADMIN tạo trạm mới ngay trên bản đồ với 3 cách chọn toạ độ, địa chỉ tự điền.',
    roles: PANEL,
    route: '/map',
    tags: ['tạo trạm', 'tạo nhanh', 'bản đồ'],
    images: ['/help/user/a11-tao-tram-nhanh.jpg', '/help/user/a09-menu-tao-de-xuat.jpg'],
    related: ['f3-tao-tram-moi-2-cach'],
    blocks: [
      ['p', 'Trên trang Bản đồ, quản trị có nút Tạo trạm nhanh nằm phía trên nút Vị trí của tôi.'],
      ['h2', 'Các bước'],
      ['ol', [
        'Bấm Tạo trạm nhanh.',
        'Chọn toạ độ theo 1 trong 3 cách: Vị trí của tôi, Chọn trên bản đồ, hoặc Dán link Google Map.',
        'Form tạo trạm mở ra với toạ độ và địa chỉ đã tự điền.',
        'Bổ sung thông tin còn thiếu rồi lưu.',
      ]],
      ['note', 'Hệ thống vẫn kiểm tra trùng khoảng cách với trạm/đề xuất lân cận trước khi lưu.'],
      ['algorithm', 'Chỉ ADMIN và SUPER_ADMIN thấy nút này; SALES và CTV không thấy.'],
    ],
  },
];

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blockToDoc(block) {
  const [kind, value] = block;
  switch (kind) {
    case 'p':
      return { type: 'paragraph', content: [{ type: 'text', text: value }] };
    case 'note':
      return { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: value }] };
    case 'algorithm':
      return { type: 'paragraph', content: [{ type: 'text', text: value }] };
    case 'h2':
      return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: value }] };
    case 'h3':
      return { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: value }] };
    case 'ul':
      return { type: 'bulletList', content: value.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) };
    case 'ol':
      return { type: 'orderedList', content: value.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) };
    case 'errors':
      return { type: 'bulletList', content: value.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) };
    default:
      return { type: 'paragraph', content: [{ type: 'text', text: String(value) }] };
  }
}

function blockToHtml(block) {
  const [kind, value] = block;
  const li = (items, ordered) => `<${ordered ? 'ol' : 'ul'}>` + items.map((t) => `<li>${escapeHtml(t)}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`;
  switch (kind) {
    case 'p':
    case 'algorithm':
      return `<p>${escapeHtml(value)}</p>`;
    case 'note':
      return `<p><em>${escapeHtml(value)}</em></p>`;
    case 'h2':
      return `<h2>${escapeHtml(value)}</h2>`;
    case 'h3':
      return `<h3>${escapeHtml(value)}</h3>`;
    case 'ul':
      return li(value, false);
    case 'ol':
      return li(value, true);
    case 'errors':
      return `<p><strong>Lỗi thường gặp</strong></p>` + li(value, false);
    default:
      return `<p>${escapeHtml(String(value))}</p>`;
  }
}

async function upsert(article, order) {
  const catId = CAT[article.category];
  const doc = { type: 'doc', content: article.blocks.map(blockToDoc) };
  const html = article.blocks.map(blockToHtml).join('\n');
  const [rows] = await pool.query('SELECT id FROM help_articles WHERE slug = ?', [article.slug]);
  const payload = [
    catId, article.title, article.summary || null,
    JSON.stringify(doc), html,
    JSON.stringify([]), JSON.stringify(article.images || []),
    article.route || null, JSON.stringify(article.tags || []),
    JSON.stringify(article.related || []), JSON.stringify(article.roles),
  ];
  if (rows.length > 0) {
    await pool.query(
      'UPDATE help_articles SET category_id=?, title=?, summary=?, content_json=CAST(? AS JSON), content_html=?, videos=CAST(? AS JSON), images=CAST(? AS JSON), route=?, tags=CAST(? AS JSON), related=CAST(? AS JSON), roles=CAST(? AS JSON), status=\'published\' WHERE id=?',
      [...payload, rows[0].id]
    );
    return { action: 'updated', slug: article.slug, id: rows[0].id };
  }
  const [res] = await pool.query(
    'INSERT INTO help_articles (slug, category_id, title, summary, content_json, content_html, videos, images, route, tags, related, roles, status, sort_order, published_at) VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), \'published\', ?, NOW())',
    [article.slug, ...payload, 1000 + order]
  );
  return { action: 'inserted', slug: article.slug, id: res.insertId };
}

async function main() {
  let order = 0;
  const out = [];
  for (const a of ARTICLES) {
    out.push(await upsert(a, order++));
  }
  const [cnt] = await pool.query('SELECT COUNT(*) AS n FROM help_articles');
  console.log('[seed-help-53] ' + out.map((o) => `${o.action}:${o.slug}`).join(' '));
  console.log('[seed-help-53] total_articles=' + cnt[0].n);
  await pool.end();
}

main().catch((e) => { console.error('[seed-help-53] LOI:', e.message); process.exit(1); });
