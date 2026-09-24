const helpService = require('../helpService');

const SCOPE_IN = 'in';
const SCOPE_OUT = 'out';
const SCOPE_FORBIDDEN = 'forbidden';

const FORBIDDEN_MESSAGE = 'Mình không thể giúp nội dung này. Nếu bạn cần thao tác trong hệ thống Quản lý Trạm (đề xuất, trạm, bản đồ, tài khoản…), bạn cứ hỏi nhé.';
const OUT_OF_SCOPE_MESSAGE = 'Câu này nằm ngoài phạm vi hệ thống Quản lý Trạm nên mình không trả lời được. Bạn hỏi mình về cách dùng hệ thống (đề xuất, trạm, bản đồ, tài khoản…) nhé.';

const FORBIDDEN_RES = [
  /(api[\s_-]?key|jwt[_-]?secret|webhook[_-]?secret|turnstile[_-]?secret|access[_-]?token|connection[_-]?string|chuoi ket noi).{0,30}(cho|dua|la gi|bao nhieu|in ra|hien|tiet lo|gui|ghi ra)/,
  /(cho|dua|in|hien|tiet lo|gui|ghi).{0,30}(api[\s_-]?key|jwt[_-]?secret|webhook[_-]?secret|mat khau (root|he thong|database|db)|password (root|he thong|database|db))/,
  /(mat khau|password).{0,20}(mac dinh|default).{0,30}(admin|root|super)/,
  /(admin|root|super).{0,20}(mat khau|password).{0,20}(mac dinh|default|la gi)/,
  /(cho|dua|in|hien|liet ke|xem|trich xuat|trich).{0,30}(toan bo|tat ca|danh sach).{0,40}(mat khau|password|sdt|so dien thoai|email|thong tin ca nhan).{0,30}(user|nguoi dung|tai khoan|nhan vien|khach hang|chu tram)/,
  /(cho|dua|in|hien|liet ke|xem|trich xuat|trich).{0,30}(toan bo|tat ca|danh sach).{0,40}(user|nguoi dung|tai khoan|nhan vien|khach hang|chu tram).{0,40}(mat khau|password|sdt|so dien thoai|email|thong tin ca nhan)/,
  /(liet ke|in|hien|cho|dua|trich xuat).{0,30}(toan bo|tat ca).{0,30}(tram|de xuat).{0,30}(toa do|kinh do|vi do|toa do)/,
  /(bo qua|bat chap|quen di|ghi de|pha vo).{0,20}(huong dan|chi dan|quy tac|nguyen tac|gioi han)/,
  /(so dien thoai|email|dia chi).{0,20}(cua|chu tram|nguoi dung|user|admin|khach).{0,30}(la gi|bao nhieu|cho|dua|in ra|hien)/,
  /\b(select|union|insert|update|delete|drop)\b.{0,60}\bfrom\b|\bdrop\s+table\b|;\s*(drop|delete|truncate)\b/,
  /(hack|ddos|tan cong mang|ransomware|keylog|keylogger|lua dao|lam gia (giay to|bang cap|con dau|hop dong)|che tao vu khi|ma tuy|thuoc doc|danh cap du lieu|trom (cap )?du lieu|pha khoa|be khoa|vuot (tinh nang|kiem soat)|thoat kiem soat)/,
  /(dump|export).{0,30}(database|db|co so du lieu|toan bo du lieu)/,
];

const OUT_RES = [
  /(chatgpt|openai|Muse|grok|deepseek|copilot|llama|qwen).{0,30}(tot hon|hay hon|nen dung|so sanh|vs\b|versus|tot nhat|manh hon|hon)/,
  /(gemini).{0,30}(tot hon|hay hon|so sanh|vs\b|versus|tot nhat|manh hon)/,
  /(ai nao|con ai nao).{0,20}(tot|manh|nen dung|tot nhat)/,
  /(thoi tiet|du bao thoi tiet|nhiet do (hom nay|ha noi|hcm|sai gon)|mua (hom nay|o dau|bao))|(bao so may)/,
  /(gia (vang|usd|dola|euro|bitcoin|eth|xang|dau|dien|ga)|ty gia|chung khoan|co phieu|vn-?index|xo so|xsmb|ket qua xo so|lo de)/,
  /(bitcoin|tien ao|tien dien tu|forex|chung khoan|dau tu (co phieu|vang|tien ao)|choi coin)/,
  /^(dich|translate)\b/,
  /(dich (ho|dum|giup)|dich sang|dich ra).{0,20}(tieng anh|tieng viet|tieng trung|tieng nhat|tieng han)/,
  /(viet (ho|dum|giup).{0,20}(tho|truyen|bai van|essay|don|tieu luan)|lam (ho|dum|giup).{0,20}(bai tap|bai kiem tra|bai thi)|giai (ho|dum|giup).{0,20}(toan|phuong trinh|bai tap|hoa|ly))/,
  /(nau (an|mon)|cong thuc (nau|mon an|lam banh)|cach nau)/,
  /(phim (hay|moi)|nhac hay|nghe nhac|truyen cuoi|game hay|choi game)/,
  /(bau cu|tong thong|thu tuong|bo truong|chinh tri|dang phai|bieu tinh)/,
  /(hoc|day|tu hoc|khoa hoc).{0,25}(python|java\b|c\+\+|golang|rust|php\b|flutter|swift|kotlin)/,
  /(lap trinh|viet code|viet chuong trinh).{0,25}(python|java\b|c\+\+|golang|rust|php\b|game|app mobile)/,
  /(chua benh|trieu chung|don thuoc|uong thuoc|benh (tieu duong|tim|ung thu|huyet ap)|tu van luat|luat su|kien tung|ly hon)/,
  /\d\s*[+\-*/×÷^%]\s*\d/,
  /(giai (phuong trinh|bai toan)|tinh (nham|toan)|can bac|logarit|tich phan|dao ham)/,
];

const TECH_TOKENS = new Set(['https', 'http', 'xlsx', 'xls', 'docx', 'postgresql', 'mysql', 'javascript', 'typescript']);

function looksGibberish(nq) {
  const toks = String(nq || '')
    .split(/\s+/)
    .map((t) => t.replace(/[_-]/g, ''))
    .filter((t) => t.length >= 5 && !TECH_TOKENS.has(t));
  return toks.some((t) => /[^aeiouy\s]{5,}/.test(t));
}

function classify(question) {
  const nq = helpService.normalizeText(question).replace(/\s+/g, ' ').trim();
  if (!nq) return { scope: SCOPE_IN, reason: null };
  for (const re of FORBIDDEN_RES) {
    if (re.test(nq)) return { scope: SCOPE_FORBIDDEN, reason: 'forbidden_pattern' };
  }
  for (const re of OUT_RES) {
    if (re.test(nq)) return { scope: SCOPE_OUT, reason: 'out_of_scope_pattern' };
  }
  if (looksGibberish(nq)) return { scope: SCOPE_OUT, reason: 'gibberish' };
  return { scope: SCOPE_IN, reason: null };
}

function refusalText(scope) {
  if (scope === SCOPE_FORBIDDEN) return FORBIDDEN_MESSAGE;
  if (scope === SCOPE_OUT) return OUT_OF_SCOPE_MESSAGE;
  return null;
}

module.exports = {
  classify,
  refusalText,
  FORBIDDEN_MESSAGE,
  OUT_OF_SCOPE_MESSAGE,
  SCOPE_IN,
  SCOPE_OUT,
  SCOPE_FORBIDDEN,
};
