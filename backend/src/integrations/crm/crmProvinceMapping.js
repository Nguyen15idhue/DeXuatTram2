// backend/src/integrations/crm/crmProvinceMapping.js
// Mapping tên tỉnh TMT CRM -> tên tỉnh chuẩn của TMT-EGREEN (Data List 'Tỉnh'/'dm_tinh').
// Hệ thống dùng 34 tỉnh/thành sau sáp nhập 2025; CRM có thể gửi cả tên cũ (63 tỉnh)
// lẫn tên mới, kèm đủ kiểu tiền tố ('TP.', 'Tỉnh', 'Thành phố', viết tắt...).
// Sửa file này để cập nhật mapping mới — không cần thêm migration/sửa code khác.

'use strict';

// 34 tỉnh/thành chuẩn của hệ thống (đối chiếu Data List 'Tỉnh').
const CANONICAL_PROVINCES = [
  'Thành phố Huế',
  'Thành phố Hà Nội',
  'Tp Cần Thơ',
  'Tp Hải Phòng',
  'Tp Hồ Chí Minh',
  'Tỉnh An Giang',
  'Tỉnh Bắc Ninh',
  'Tỉnh Cao Bằng',
  'Tỉnh Cà Mau',
  'Tỉnh Gia Lai',
  'Tỉnh Hà Tĩnh',
  'Tỉnh Hưng Yên',
  'Tỉnh Khánh Hòa',
  'Tỉnh Lai Châu',
  'Tỉnh Lào Cai',
  'Tỉnh Lâm Đồng',
  'Tỉnh Lạng Sơn',
  'Tỉnh Nghệ An',
  'Tỉnh Ninh Bình',
  'Tỉnh Phú Thọ',
  'Tỉnh Quảng Ngãi',
  'Tỉnh Quảng Ninh',
  'Tỉnh Quảng Trị',
  'Tỉnh Sơn La',
  'Tỉnh Thanh Hóa',
  'Tỉnh Thái Nguyên',
  'Tỉnh Tuyên Quang',
  'Tỉnh Tây Ninh',
  'Tỉnh Vĩnh Long',
  'Tỉnh Điện Biên',
  'Tỉnh Đắk Lắk',
  'Tỉnh Đồng Nai',
  'Tỉnh Đồng Tháp',
  'Tỉnh Đà Nẵng',
];

// Tham chiếu: tên cũ (63 tỉnh, không tiền tố) -> tên tỉnh mới (không tiền tố).
// Cả các tỉnh được giữ nguyên cũng liệt kê để CRM gửi tên nào cũng map được
// và người review đối chiếu nghị quyết sáp nhập 2025 dễ dàng.
const OLD_BARE_TO_NEW_BARE = {
  'An Giang': 'An Giang',
  'Bà Rịa - Vũng Tàu': 'Hồ Chí Minh',
  'Bà Rịa Vũng Tàu': 'Hồ Chí Minh',
  'Bạc Liêu': 'Cà Mau',
  'Bắc Kạn': 'Thái Nguyên',
  'Bắc Giang': 'Bắc Ninh',
  'Bắc Ninh': 'Bắc Ninh',
  'Bến Tre': 'Vĩnh Long',
  'Bình Định': 'Gia Lai',
  'Bình Dương': 'Hồ Chí Minh',
  'Bình Phước': 'Đồng Nai',
  'Bình Thuận': 'Lâm Đồng',
  'Cà Mau': 'Cà Mau',
  'Cần Thơ': 'Cần Thơ',
  'Cao Bằng': 'Cao Bằng',
  'Đà Nẵng': 'Đà Nẵng',
  'Đắk Lắk': 'Đắk Lắk',
  'Đắc Lắk': 'Đắk Lắk',
  'Đắk Nông': 'Lâm Đồng',
  'Đắc Nông': 'Lâm Đồng',
  'Điện Biên': 'Điện Biên',
  'Gia Lai': 'Gia Lai',
  'Hà Giang': 'Tuyên Quang',
  'Hà Nam': 'Ninh Bình',
  'Hà Nội': 'Hà Nội',
  'Hà Tĩnh': 'Hà Tĩnh',
  'Hải Dương': 'Hải Phòng',
  'Hải Phòng': 'Hải Phòng',
  'Hậu Giang': 'Cần Thơ',
  'Hòa Bình': 'Phú Thọ',
  'Hoà Bình': 'Phú Thọ',
  'Hồ Chí Minh': 'Hồ Chí Minh',
  'Hưng Yên': 'Hưng Yên',
  'Khánh Hòa': 'Khánh Hòa',
  'Khanh Hoa': 'Khánh Hòa',
  'Kiên Giang': 'An Giang',
  'Kon Tum': 'Quảng Ngãi',
  'Lai Châu': 'Lai Châu',
  'Lâm Đồng': 'Lâm Đồng',
  'Lạng Sơn': 'Lạng Sơn',
  'Lào Cai': 'Lào Cai',
  'Long An': 'Tây Ninh',
  'Nam Định': 'Ninh Bình',
  'Nghệ An': 'Nghệ An',
  'Ninh Bình': 'Ninh Bình',
  'Ninh Thuận': 'Khánh Hòa',
  'Phú Thọ': 'Phú Thọ',
  'Phú Yên': 'Đắk Lắk',
  'Quảng Bình': 'Quảng Trị',
  'Quảng Nam': 'Đà Nẵng',
  'Quảng Ngãi': 'Quảng Ngãi',
  'Quảng Ninh': 'Quảng Ninh',
  'Quảng Trị': 'Quảng Trị',
  'Sóc Trăng': 'Cần Thơ',
  'Sơn La': 'Sơn La',
  'Tây Ninh': 'Tây Ninh',
  'Thái Bình': 'Hưng Yên',
  'Thái Nguyên': 'Thái Nguyên',
  'Thanh Hóa': 'Thanh Hóa',
  'Thanh Hoá': 'Thanh Hóa',
  'Thừa Thiên Huế': 'Huế',
  'Thừa Thiên - Huế': 'Huế',
  'Huế': 'Huế',
  'Tiền Giang': 'Đồng Tháp',
  'Trà Vinh': 'Vĩnh Long',
  'Tuyên Quang': 'Tuyên Quang',
  'Vĩnh Long': 'Vĩnh Long',
  'Vĩnh Phúc': 'Phú Thọ',
  'Yên Bái': 'Lào Cai',
  // Alias viết tắt / dạng ngắn CRM hay gửi kèm tiền tố TP.
  'HCM': 'Hồ Chí Minh',
  'TP HCM': 'Hồ Chí Minh',
  'TP.HCM': 'Hồ Chí Minh',
  'T.P. HCM': 'Hồ Chí Minh',
  'HP': 'Hải Phòng',
  'CT': 'Cần Thơ',
  'DN': 'Đà Nẵng',
  'HN': 'Hà Nội',
  'HUE': 'Huế',
};

// Tên tỉnh mới (bare) -> tên chuẩn hệ thống (giữ đúng tiền tố trong Data List 'Tỉnh').
const BARE_TO_CANONICAL = {
  'Huế': 'Thành phố Huế',
  'Hà Nội': 'Thành phố Hà Nội',
  'Cần Thơ': 'Tp Cần Thơ',
  'Hải Phòng': 'Tp Hải Phòng',
  'Hồ Chí Minh': 'Tp Hồ Chí Minh',
  'An Giang': 'Tỉnh An Giang',
  'Bắc Ninh': 'Tỉnh Bắc Ninh',
  'Cao Bằng': 'Tỉnh Cao Bằng',
  'Cà Mau': 'Tỉnh Cà Mau',
  'Gia Lai': 'Tỉnh Gia Lai',
  'Hà Tĩnh': 'Tỉnh Hà Tĩnh',
  'Hưng Yên': 'Tỉnh Hưng Yên',
  'Khánh Hòa': 'Tỉnh Khánh Hòa',
  'Lai Châu': 'Tỉnh Lai Châu',
  'Lào Cai': 'Tỉnh Lào Cai',
  'Lâm Đồng': 'Tỉnh Lâm Đồng',
  'Lạng Sơn': 'Tỉnh Lạng Sơn',
  'Nghệ An': 'Tỉnh Nghệ An',
  'Ninh Bình': 'Tỉnh Ninh Bình',
  'Phú Thọ': 'Tỉnh Phú Thọ',
  'Quảng Ngãi': 'Tỉnh Quảng Ngãi',
  'Quảng Ninh': 'Tỉnh Quảng Ninh',
  'Quảng Trị': 'Tỉnh Quảng Trị',
  'Sơn La': 'Tỉnh Sơn La',
  'Thanh Hóa': 'Tỉnh Thanh Hóa',
  'Thái Nguyên': 'Tỉnh Thái Nguyên',
  'Tuyên Quang': 'Tỉnh Tuyên Quang',
  'Tây Ninh': 'Tỉnh Tây Ninh',
  'Vĩnh Long': 'Tỉnh Vĩnh Long',
  'Điện Biên': 'Tỉnh Điện Biên',
  'Đắk Lắk': 'Tỉnh Đắk Lắk',
  'Đồng Nai': 'Tỉnh Đồng Nai',
  'Đồng Tháp': 'Tỉnh Đồng Tháp',
  'Đà Nẵng': 'Tỉnh Đà Nẵng',
};

// ---------- Helpers ----------

// Bỏ dấu tiếng Việt, bỏ tiền tố, giữ chữ cái/số — dùng làm key tra không phân biệt cách viết.
function normalizeProvinceName(name) {
  let s = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Bỏ tiền tố lồng nhau (Tỉnh/Thành phố/TP./T.P./TP/T/P ...) cho đến khi không còn thay đổi.
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/^(tinh|thanh pho|t\.?\s*p\.?|tp|t\/p\.?)\s*/i, '');
  }
  return s
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

// Map key chuẩn hóa -> tên chuẩn 34 tỉnh.
let CANONICAL_KEY_MAP = null;
function getCanonicalKeyMap() {
  if (!CANONICAL_KEY_MAP) {
    CANONICAL_KEY_MAP = new Map();
    CANONICAL_PROVINCES.forEach((name) => {
      CANONICAL_KEY_MAP.set(normalizeProvinceName(name), name);
    });
  }
  return CANONICAL_KEY_MAP;
}

// Map key chuẩn hóa (bỏ dấu, bỏ tiền tố) bảng tên cũ -> tên mới.
let OLD_PROVINCE_KEY_MAP = null;
function getOldProvinceKeyMap() {
  if (!OLD_PROVINCE_KEY_MAP) {
    OLD_PROVINCE_KEY_MAP = new Map();
    Object.keys(OLD_BARE_TO_NEW_BARE).forEach((name) => {
      OLD_PROVINCE_KEY_MAP.set(normalizeProvinceName(name), OLD_BARE_TO_NEW_BARE[name]);
    });
  }
  return OLD_PROVINCE_KEY_MAP;
}

/**
 * Map tên tỉnh/thành từ CRM sang tên chuẩn của hệ thống.
 * Hỗ trợ duy nhất cả tên mới 34 tỉnh (tiền tố tùy ý: 'Tỉnh', 'Thành phố', 'Tp', 'TP.')
 * lẫn tên cũ 63 tỉnh trước sáp nhập.
 * Trả về tên chuẩn hoàn chỉnh ('Tp Hồ Chí Minh', 'Thành phố Hà Nội', ...) hoặc
 * null nếu không nhận diện được (caller xử lý fallback + flag needs_review).
 */
function mapCrmProvinceToTmt(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const key = normalizeProvinceName(raw);

  // 1. khớp trực tiếp 34 tỉnh (bắt được 'TP. Hồ Chí Minh' vs 'Tp Hồ Chí Minh', 'Thành phố Hà Nội'...)
  const direct = getCanonicalKeyMap().get(key);
  if (direct) return direct;

  // 2. tỉnh cũ 63 tỉnh -> tên mới -> tên chuẩn
  const newBare = getOldProvinceKeyMap().get(key);
  if (newBare) {
    return getCanonicalKeyMap().get(normalizeProvinceName(newBare)) || null;
  }

  return null;
}

module.exports = {
  CANONICAL_PROVINCES,
  OLD_BARE_TO_NEW_BARE,
  BARE_TO_CANONICAL,
  normalizeProvinceName,
  mapCrmProvinceToTmt,
};
