export const DEFAULT_GDTT = 'Giám đốc Trung tâm Kinh doanh';
export const DEFAULT_GDKV = 'Giám đốc Khu vực';

export const SALES_RANK_MAP = {
  'Kênh Nhà phân phối': {
    gdtt: ['Phó Tổng Giám đốc Quản lý và Phát triển Nhà phân phối'],
    gdkv: ['Trưởng phòng phụ trách kênh NPP'],
  },
  'Phòng Chính sách và Phát triển dự án': {
    gdtt: ['TP chính sách và phát triển dự án'],
    gdkv: ['Chuyên viên Phát triển Dự án'],
  },
};

const norm = (v) => (v === undefined || v === null ? '' : String(v).trim());

export function gdttTitlesFor(dept) {
  const d = norm(dept);
  const extra = (d && SALES_RANK_MAP[d] && SALES_RANK_MAP[d].gdtt) || [];
  return [...new Set([DEFAULT_GDTT, ...extra])];
}

export function gdkvTitlesFor(dept) {
  const d = norm(dept);
  const extra = (d && SALES_RANK_MAP[d] && SALES_RANK_MAP[d].gdkv) || [];
  return [...new Set([DEFAULT_GDKV, ...extra])];
}

export function isGdtt(chucVu, dept) {
  return gdttTitlesFor(dept).includes(norm(chucVu));
}

export function isGdkv(chucVu, dept) {
  return gdkvTitlesFor(dept).includes(norm(chucVu));
}
