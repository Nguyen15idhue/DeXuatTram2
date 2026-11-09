// backend/src/integrations/crm/crmStatusMapping.js
// Mapping file chung cho tích hợp TMT CRM <-> TMT-EGREEN.
// Chỉnh sửa file này (không cần rebuild) để cập nhật mapping mới.
// Các trạng thái chưa có mapping sẽ được lưu raw + flag needs_review.

'use strict';

// ---------- Inbound: CRM -> TMT-EGREEN ----------

// CRM classify values -> TMT-EGREEN customer_classification (identity)
const CRM_CLASSIFY_TO_TMT = {
  'Quan tâm': 'Quan tâm',
  'Tiềm năng': 'Tiềm năng',
  'Theo dõi thêm': 'Theo dõi thêm',
  'Không chất lượng': 'Không chất lượng',
};

// CRM status values -> TMT-EGREEN lead stage
const CRM_STATUS_TO_STAGE = {
  'Đã chuyển đối tác': 'NEW',
  // Thêm mapping mới ở đây khi CRM gửi thêm status
};

// ---------- Outbound: TMT-EGREEN -> CRM ----------

// TMT-EGREEN lead stage -> CRM status code
const TMT_STAGE_TO_CRM = {
  'NEW': 'received',
  'ASSIGNED': 'received',
  'CSKH': 'contacted',
  'QUALIFIED': 'interested',
  'TVBH': 'interested',
  // 'test_drive' và 'deposit' chưa có stage tương ứng trong TMT-EGREEN — cập nhật sau nếu thêm stage
};

// TMT-EGREEN sales_outcome -> CRM status code
const TMT_OUTCOME_TO_CRM = {
  'SUCCESS': 'won',
  'FAILED': 'lost',
  'CANCELLED': 'lost',
};

// TMT-EGREEN customer_classification -> CRM status code (cho lead.result khi bad_quality)
const TMT_CLASSIFICATION_TO_CRM = {
  'KHONG_CHAT_LUONG': 'bad_quality',
  'Không chất lượng': 'bad_quality',
};

// ---------- lead.care valid values (CRM form "Ghi nhận liên hệ") ----------

// Giá trị đã biết từ spec CRM + TMT-EGREEN. Mảng rỗng = chưa có danh sách → chấp nhận mọi giá trị.
const CRM_CARE_VALUES = {
  channel: ['Gọi điện'],                          // known (CRM sample)
  contact: ['Liên hệ thành công', 'Không liên lạc được'],  // known (spec CRM)
  classify: ['Quan tâm', 'Tiềm năng', 'Theo dõi thêm', 'Không chất lượng'],  // identity with TMT-EGREEN
  saleResult: [],  // TODO: chưa có danh sách từ CRM — user cập nhật sau
  reason: []       // TODO: chưa có danh sách từ CRM — user cập nhật sau
};

// Giá trị mặc định khi không có giá trị hợp lệ (user cập nhật sau)
const CRM_CARE_DEFAULTS = {
  channel: 'Gọi điện',            // default
  contact: 'Liên hệ thành công',  // default
  classify: 'Tiềm năng',          // default
  saleResult: '',                 // default empty (ít nhất 1 trong contact/classify/saleResult)
  reason: ''
};

// Chuẩn hóa nhãn: bỏ dấu tiếng Việt, bỏ ký tự đặc biệt, lowercase — CRM chấp nhận
// "giá trị hoặc nhãn, không phân biệt hoa thường / dấu".
const normalizeLabel = (value) => String(value || '')
  .replace(/[\u0111\u0110]/g, (c) => (c === '\u0111' ? 'd' : 'D'))
  .replace(/[\u01A1\u01A0]/g, (c) => (c === '\u01A1' ? 'o' : 'O'))
  .replace(/[\u01B0\u01AF]/g, (c) => (c === '\u01B0' ? 'u' : 'U'))
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

// Map giá trị care field sang giá trị hợp lệ CRM. So khớp không phân biệt hoa thường/dấu;
// khớp → trả đúng giá trị canonical trong danh sách; unknown → default (tránh gửi giá trị CRM không nhận).
function mapCareValue(field, value) {
  const raw = String(value || '').trim();
  if (!raw) return CRM_CARE_DEFAULTS[field] || '';
  const known = CRM_CARE_VALUES[field] || [];
  if (known.length === 0) return raw;  // chưa có danh sách → chấp nhận as-is
  const key = normalizeLabel(raw);
  const hit = known.find((k) => normalizeLabel(k) === key);
  if (hit) return hit;
  return CRM_CARE_DEFAULTS[field] || '';  // unknown → default
}

// ---------- Milestone note templates ----------

const MILESTONE_NOTES = {
  assignGdttkd: (name) => `Giao cho GĐTTKD ${name || ''}`.trim(),
  assignGdkv: (name) => `Giao cho GĐKV ${name || ''}`.trim(),
  proposalCreated: (code) => `Đã tạo đề xuất ${code || ''}`.trim(),
  signedFileUploaded: 'Đã upload BCĐX được chủ tịch ký',
  contractSigned: 'Đã ký hợp đồng',
  stationOn: 'Trạm đã ON',
  proposalCancelled: 'Đề xuất đã bị hủy',
  proposalRejected: 'Đề xuất bị từ chối'
};

// ---------- Helpers ----------

function mapCrmClassifyToTmt(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return CRM_CLASSIFY_TO_TMT[v] || v; // unknown -> keep raw + needs_review
}

function mapCrmStatusToStage(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return CRM_STATUS_TO_STAGE[v] || null;
}

function mapTmtStageToCrm(stage) {
  const s = String(stage || '').trim().toUpperCase();
  return TMT_STAGE_TO_CRM[s] || 'received';
}

function mapTmtOutcomeToCrm(outcome) {
  const o = String(outcome || '').trim().toUpperCase();
  return TMT_OUTCOME_TO_CRM[o] || null;
}

function mapTmtClassificationToCrm(classification) {
  const c = String(classification || '').trim();
  return TMT_CLASSIFICATION_TO_CRM[c] || null;
}

function isKnownCrmClassify(value) {
  return Object.prototype.hasOwnProperty.call(CRM_CLASSIFY_TO_TMT, String(value || '').trim());
}

function isKnownCrmStatus(value) {
  return Object.prototype.hasOwnProperty.call(CRM_STATUS_TO_STAGE, String(value || '').trim());
}

module.exports = {
  CRM_CLASSIFY_TO_TMT,
  CRM_STATUS_TO_STAGE,
  CRM_CARE_VALUES,
  CRM_CARE_DEFAULTS,
  TMT_STAGE_TO_CRM,
  TMT_OUTCOME_TO_CRM,
  TMT_CLASSIFICATION_TO_CRM,
  MILESTONE_NOTES,
  mapCrmClassifyToTmt,
  mapCrmStatusToStage,
  mapTmtStageToCrm,
  mapTmtOutcomeToCrm,
  mapTmtClassificationToCrm,
  mapCareValue,
  normalizeLabel,
  isKnownCrmClassify,
  isKnownCrmStatus
};
