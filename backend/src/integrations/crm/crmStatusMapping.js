// backend/src/integrations/crm/crmStatusMapping.js
// Mapping file chung cho tích hợp TMT CRM <-> TMT-EGREEN.
// Chỉnh sửa file này (không cần rebuild) để cập nhật mapping mới.
// Các trạng thái chưa có mapping sẽ được lưu raw + flag needs_review.

'use strict';

// ---------- Inbound: CRM -> TMT-EGREEN ----------

// CRM classify values -> TMT-EGREEN customer_classification
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

// CRM channel/contact/classify/saleResult valid values (form "Ghi nhận liên hệ" của CRM).
// Hiện chưa có danh sách chính thức -> để rỗng, user cập nhật sau.
const CRM_CARE_VALUES = {
  channel: [],   // vd: ['Gọi điện', 'Zalo', 'SMS']
  contact: [],   // vd: ['Liên hệ thành công', 'Không liên lạc được']
  classify: [],  // vd: ['Quan tâm', 'Tiềm năng', ...]
  saleResult: [],// vd: ['Đặt cọc', 'Mua xe', 'Không mua']
  reason: []     // vd: ['Sai số điện thoại', 'Chọn hãng khác']
};

// ---------- Outbound: TMT-EGREEN -> CRM ----------

// TMT-EGREEN lead stage -> CRM status code
const TMT_STAGE_TO_CRM = {
  'NEW': 'received',
  'ASSIGNED': 'received',
  'CSKH': 'contacted',
  'QUALIFIED': 'interested',
  'TVBH': 'interested',
};

// TMT-EGREEN sales_outcome -> CRM status code
const TMT_OUTCOME_TO_CRM = {
  'SUCCESS': 'won',
  'FAILED': 'lost',
  'CANCELLED': 'lost',
};

// Milestone note templates (used in lead.care events)
const MILESTONE_NOTES = {
  assignGdttkd: (name) => `Giao cho GĐTTKD ${name || ''}`.trim(),
  assignGdkv: (name) => `Giao cho GĐKV ${name || ''}`.trim(),
  proposalCreated: (code) => `Đã tạo đề xuất ${code || ''}`.trim(),
  signedFileUploaded: 'Đã upload BCĐX được chủ tịch ký',
  contractSigned: 'Đã ký hợp đồng',
  stationOn: 'Trạm đã ON'
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
  return CRM_STATUS_TO_STAGE[v] || null; // unknown -> null (caller decides)
}

function mapTmtStageToCrm(stage) {
  const s = String(stage || '').trim().toUpperCase();
  return TMT_STAGE_TO_CRM[s] || 'received';
}

function mapTmtOutcomeToCrm(outcome) {
  const o = String(outcome || '').trim().toUpperCase();
  return TMT_OUTCOME_TO_CRM[o] || null;
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
  TMT_STAGE_TO_CRM,
  TMT_OUTCOME_TO_CRM,
  MILESTONE_NOTES,
  mapCrmClassifyToTmt,
  mapCrmStatusToStage,
  mapTmtStageToCrm,
  mapTmtOutcomeToCrm,
  isKnownCrmClassify,
  isKnownCrmStatus
};
