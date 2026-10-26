import { getLayoutFiles } from './proposalDesign';
import { getReportFiles } from './proposalReport';

export const PROPOSAL_PROCESS_STEPS = [
  { id: 1, key: 'grading', label: 'Quy hoạch & Pháp lý' },
  { id: 2, key: 'review', label: 'GĐTTKD / TGĐ' },
  { id: 3, key: 'layout', label: 'Đánh giá layout' },
  { id: 4, key: 'report', label: 'Lập BCĐX' },
  { id: 5, key: 'approval', label: 'Duyệt BCĐX' },
  { id: 6, key: 'signature', label: 'Trình ký' }
];

export const PROPOSAL_STATUS_LABELS = {
  PENDING: 'Chờ xác nhận thông tin',
  REVIEWING: 'Đang xem xét',
  PRINCIPLE_APPROVED: 'Đã duyệt chủ trương',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  ARCHIVED: 'Đã lưu trữ',
  CONTRACT_SIGNED: 'Ký thành công',
  CONTRACT_FAILED: 'Ký thất bại',
  GRADING: 'Đang chấm điểm',
  GDTTKD_EVALUATING: 'GĐTTKD đang xem xét',
  RE_GRADING: 'Đang chấm điểm lại',
  RE_GDTTKD_EVALUATING: 'GĐTTKD xem xét lại',
  TGD_REVIEW: 'TGĐ đang xem xét',
  DESIGNING: 'Đang đánh giá layout',
  INFOR_WAITING: 'Chờ bổ sung thông tin',
  PROPOSAL_REPORT_CREATING: 'Đang lập BCĐX',
  PROPOSAL_REPORT_RE_CREATING: 'Yêu cầu tạo lại BCĐX',
  PROPOSAL_REPORT_REVIEWING: 'Đang duyệt BCĐX',
  PROPOSAL_REPORT_UPDATING: 'Chờ cập nhật BCĐX',
  SIGNATURE_PENDING: 'Đang trình ký',
  COMPLETED: 'Đã hoàn thành',
  PAUSED: 'Đang tạm dừng'
};

const STATUS_STEP = {
  GRADING: 1,
  RE_GRADING: 1,
  GDTTKD_EVALUATING: 2,
  RE_GDTTKD_EVALUATING: 2,
  TGD_REVIEW: 2,
  DESIGNING: 3,
  INFOR_WAITING: 3,
  PROPOSAL_REPORT_CREATING: 4,
  PROPOSAL_REPORT_RE_CREATING: 4,
  PROPOSAL_REPORT_REVIEWING: 5,
  PROPOSAL_REPORT_UPDATING: 5,
  SIGNATURE_PENDING: 6,
  COMPLETED: 6
};

const ACTION_STEP = {
  grading_updated: 1,
  review_regrade_requested: 2,
  review_to_tgd: 2,
  review_cancelled: 2,
  review_approved: 2,
  review_rejected: 2,
  layout_updated: 3,
  layout_approved: 3,
  layout_supplement_requested: 3,
  report_uploaded: 4,
  report_revision_requested: 4,
  report_update_requested: 5,
  report_tgd_rejected: 5,
  signature_configured: 5,
  signature_signed: 6,
  signed_file_uploaded: 6
};

const PROCESS_FIELDS_BY_STEP = [
  { step: 1, keys: ['quy_hoach_score', 'quy_hoach_note', 'phap_ly_score', 'phap_ly_note'] },
  { step: 2, keys: ['review_level'] },
  { step: 3, keys: ['ban_ve_layout'] },
  { step: 4, keys: ['chot_so_luong_tru', 'tong_gia_tri_chot', 'file_bc_dx'] },
  { step: 6, keys: ['signed_file_id'] }
];

export const PROPOSAL_PROCESS_FIELD_KEYS = PROCESS_FIELDS_BY_STEP.flatMap(({ keys }) => keys);

export const PROPOSAL_ACTION_LABELS = {
  created: 'Tạo đề xuất',
  updated: 'Cập nhật thông tin đề xuất',
  status_change: 'Chuyển trạng thái',
  grading_updated: 'Cập nhật kết quả chấm điểm',
  review_regrade_requested: 'Yêu cầu đánh giá lại',
  review_to_tgd: 'Trình Tổng Giám đốc xem xét',
  review_cancelled: 'GĐTTKD xác nhận hủy',
  review_approved: 'Tổng Giám đốc duyệt',
  review_rejected: 'Tổng Giám đốc không duyệt',
  layout_updated: 'Cập nhật bản vẽ layout',
  layout_approved: 'Duyệt bản vẽ layout',
  layout_supplement_requested: 'Yêu cầu bổ sung layout',
  report_uploaded: 'Cập nhật tờ trình BCĐX',
  report_revision_requested: 'Yêu cầu tạo lại BCĐX',
  report_update_requested: 'Yêu cầu cập nhật BCĐX',
  report_tgd_rejected: 'Tổng Giám đốc từ chối duyệt BCĐX',
  signature_configured: 'Cấu hình trình ký',
  signature_signed: 'Ký BCĐX',
  signed_file_uploaded: 'Tải lên BCĐX đã ký',
  paused: 'Tạm dừng đề xuất',
  resumed: 'Tiếp tục đề xuất',
  request_completed: 'Hoàn thành yêu cầu'
};

export const PROPOSAL_REQUEST_LABELS = {
  UPDATE_INFO: 'Bổ sung thông tin',
  SUPPLEMENT: 'Bổ sung thông tin',
  LAYOUT_SUPPLEMENT: 'Bổ sung bản vẽ layout',
  RE_GRADE: 'Chấm điểm lại',
  REVISE_BCDX: 'Cập nhật / tạo lại BCĐX',
  TGD_REVIEW: 'Tổng Giám đốc xem xét',
  OTHER: 'Yêu cầu khác'
};

export const getProposalStatusLabel = (status) => PROPOSAL_STATUS_LABELS[status] || status || '—';

export const getProposalStatusStep = (status) => STATUS_STEP[status] || 0;

export const getProposalEventStep = (event) => (
  ACTION_STEP[event?.action] || Math.max(
    getProposalStatusStep(event?.from_status),
    getProposalStatusStep(event?.to_status)
  )
);

export const getProposalRequestStep = (request) => {
  if (request?.request_type === 'RE_GRADE' || request?.request_type === 'TGD_REVIEW') return 2;
  if (request?.request_type === 'LAYOUT_SUPPLEMENT') return 3;
  return Math.max(
    getProposalStatusStep(request?.previous_status),
    getProposalStatusStep(request?.current_status)
  );
};

const parseRows = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getProposalCurrentStep = (proposal, activity = []) => {
  const status = proposal?.status === 'PAUSED'
    ? proposal?.paused_from_status
    : proposal?.status === 'CANCELLED'
      ? [...activity].reverse().find((event) => event?.to_status === 'CANCELLED')?.from_status
      : proposal?.status;
  return getProposalStatusStep(status);
};

export const getProposalReachedStep = (proposal, progress = {}) => {
  const activity = Array.isArray(progress.activity) ? progress.activity : [];
  const requests = Array.isArray(progress.requests) ? progress.requests : [];
  const statusCandidates = [
    proposal?.status,
    proposal?.status === 'PAUSED' ? proposal?.paused_from_status : null,
    proposal?.status === 'CANCELLED'
      ? [...activity].reverse().find((event) => event?.to_status === 'CANCELLED')?.from_status
      : null
  ];
  const statusStep = statusCandidates.reduce(
    (max, status) => Math.max(max, getProposalStatusStep(status)),
    0
  );
  const activityStep = activity.reduce((max, event) => Math.max(max, getProposalEventStep(event)), 0);
  const requestStep = requests.reduce((max, request) => Math.max(max, getProposalRequestStep(request)), 0);
  const dataStep = Math.max(
    proposal?.quy_hoach_score !== null && proposal?.quy_hoach_score !== undefined
      || proposal?.phap_ly_score !== null && proposal?.phap_ly_score !== undefined
      ? 1 : 0,
    Number(proposal?.review_level) > 0 ? 2 : 0,
    getLayoutFiles(proposal).length > 0 ? 3 : 0,
    getReportFiles(proposal).length > 0
      || parseRows(proposal?.chot_so_luong_tru).length > 0 ? 4 : 0,
    Number(proposal?.signer_count || proposal?.signer_total) > 0
      || Number(proposal?.signed_file_id) > 0 ? 6 : 0
  );
  return Math.max(statusStep, activityStep, requestStep, dataStep);
};
