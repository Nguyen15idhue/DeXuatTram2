import { getStatusOptions, PRIORITY_MARKER_COLORS } from './mapMarkerIcons';

export const STATION_STATUSES = [
  { value: 'PLANNING', label: 'Quy hoạch', color: '#a855f7' },
  { value: 'ACTIVE', label: 'Hoạt động', color: '#22c55e' },
  { value: 'DEPLOYING', label: 'Triển khai', color: '#eab308' },
  { value: 'REJECTED', label: 'Từ chối/Hủy', color: '#b91c1c' }
];

export const PROPOSAL_STATUSES = [
  { value: 'PENDING', label: 'Mới đề xuất', color: '#f97316', show_in_legend: true, sort_order: 1 },
  { value: 'REVIEWING', label: 'Đang xem xét', color: '#3b82f6', show_in_legend: true, sort_order: 2 },
  // { value: 'PRINCIPLE_APPROVED', label: 'Duyệt chủ trương', color: '#6366f1', show_in_legend: true, sort_order: 3 },
  { value: 'APPROVED', label: 'Đã duyệt BCĐX', color: '#22c55e', show_in_legend: true, sort_order: 4 },
  { value: 'CANCELLED', label: 'Đã hủy', color: '#6b7280', show_in_legend: true, sort_order: 5 },
  { value: 'ARCHIVED', label: 'Đã lưu trữ', color: '#8b5cf6', show_in_legend: true, sort_order: 6 },
  { value: 'REJECTED', label: 'Từ chối', color: '#ef4444', show_in_legend: false, sort_order: 7 },
  { value: 'CONTRACT_SIGNED', label: 'Ký thành công', color: '#0d9488', show_in_legend: false, sort_order: 8 },
  { value: 'CONTRACT_FAILED', label: 'Ký thất bại', color: '#f59e0b', show_in_legend: false, sort_order: 9 },
  { value: 'GRADING', label: 'Đang đánh giá quy hoạch và pháp lý', color: '#f59e0b', show_in_legend: false, sort_order: 10 },
  { value: 'GDTTKD_EVALUATING', label: 'GĐTTKD đánh giá', color: '#7c3aed', show_in_legend: false, sort_order: 11 },
  { value: 'RE_GRADING', label: 'GĐTTKD yêu cầu chấm lại', color: '#6366f1', show_in_legend: false, sort_order: 12 },
  { value: 'RE_GDTTKD_EVALUATING', label: 'GĐTTKD xem xét lại', color: '#8b5cf6', show_in_legend: false, sort_order: 12.5 },
  { value: 'TGD_REVIEW', label: 'Đang trình Tổng giám đốc', color: '#be123c', show_in_legend: false, sort_order: 13 },
  { value: 'DESIGNING', label: 'Đang vẽ Layout', color: '#0891b2', show_in_legend: false, sort_order: 14 },
  { value: 'INFOR_WAITING', label: 'Chờ bổ sung thông tin', color: '#f97316', show_in_legend: false, sort_order: 14.5 },
  { value: 'PROPOSAL_REPORT_CREATING', label: 'Đang lập tờ trình BCĐX', color: '#0d9488', show_in_legend: false, sort_order: 15 },
  { value: 'PROPOSAL_REPORT_RE_CREATING', label: 'Yêu cầu tạo lại BCĐX', color: '#f59e0b', show_in_legend: false, sort_order: 15.5 },
  { value: 'PROPOSAL_REPORT_REVIEWING', label: 'Đang duyệt BCĐX', color: '#2563eb', show_in_legend: false, sort_order: 16 },
  { value: 'PROPOSAL_REPORT_UPDATING', label: 'Chờ cập nhật lại BCĐX', color: '#f97316', show_in_legend: false, sort_order: 16.5 },
  { value: 'SIGNATURE_PENDING', label: 'Đang trình ký', color: '#9333ea', show_in_legend: false, sort_order: 17 },
  { value: 'COMPLETED', label: 'Đã phê duyệt', color: '#16a34a', show_in_legend: false, sort_order: 18 },
  { value: 'PAUSED', label: 'Tạm dừng', color: '#64748b', show_in_legend: false, sort_order: 19 }
];

export const EV_REPORT_STATUSES = [
  { value: 'ACTIVE', label: 'Đang hoạt động', color: '#0d9488', show_in_legend: true, sort_order: 1 },
  { value: 'INACTIVE', label: 'Ngưng hoạt động', color: '#9ca3af', show_in_legend: true, sort_order: 2 }
];

export const PRIORITY_OPTIONS = [
  { value: '1', label: 'Cấp 1' },
  { value: '2', label: 'Cấp 2' },
  { value: '3', label: 'Cấp 3' },
];

export const PLANNING_PRIORITY_COLORS = PRIORITY_MARKER_COLORS;

export const STATION_STATUS_MAP = STATION_STATUSES.reduce((acc, s) => { acc[s.value] = s; return acc; }, {});
export const PROPOSAL_STATUS_MAP = PROPOSAL_STATUSES.reduce((acc, s) => { acc[s.value] = s; return acc; }, {});
export const EV_REPORT_STATUS_MAP = EV_REPORT_STATUSES.reduce((acc, s) => { acc[s.value] = s; return acc; }, {});

const withDynamicFallback = (entity, defaults) => {
  const opts = getStatusOptions(entity);
  if (!Array.isArray(opts) || opts.length === 0) return defaults;
  const fallbackByValue = {};
  defaults.forEach((d) => { fallbackByValue[d.value] = d; });
  return opts.map((o) => ({
    value: o.value,
    label: o.label || fallbackByValue[o.value]?.label || o.value,
    color: o.color || fallbackByValue[o.value]?.color || '#6b7280',
    show_in_legend: o.show_in_legend === undefined ? (fallbackByValue[o.value]?.show_in_legend ?? true) : o.show_in_legend,
    sort_order: o.sort_order ?? fallbackByValue[o.value]?.sort_order ?? 999
  })).sort((a, b) => a.sort_order - b.sort_order);
};

export const getStationStatuses = () => withDynamicFallback('station', STATION_STATUSES);
export const getProposalStatuses = () => withDynamicFallback('proposal', PROPOSAL_STATUSES);
export const getProposalLegendStatuses = () => getProposalStatuses().filter((s) => s.show_in_legend !== false && s.show_in_legend !== 0);

// Quy trình v2: các trạng thái trung gian hiển thị trên bản đồ như "Đang xem xét"
// (gộp nhóm để không sinh thêm legend/chip trùng lặp).
export const PROPOSAL_MAP_STATUS_ALIAS = {
  GRADING: 'REVIEWING',
  GDTTKD_EVALUATING: 'REVIEWING',
  RE_GRADING: 'REVIEWING',
  RE_GDTTKD_EVALUATING: 'REVIEWING',
  TGD_REVIEW: 'REVIEWING',
  DESIGNING: 'REVIEWING',
  INFOR_WAITING: 'REVIEWING',
  PROPOSAL_REPORT_CREATING: 'REVIEWING',
  PROPOSAL_REPORT_RE_CREATING: 'REVIEWING',
  PROPOSAL_REPORT_REVIEWING: 'REVIEWING',
  PROPOSAL_REPORT_UPDATING: 'REVIEWING',
  SIGNATURE_PENDING: 'REVIEWING'
};

const HIDDEN_PROPOSAL_MAP_STATUSES = new Set(['PRINCIPLE_APPROVED', 'PAUSED']);

export const getProposalMapStatus = (value) => PROPOSAL_MAP_STATUS_ALIAS[value] || value;

export const getProposalMapStatuses = () => {
  const all = getProposalStatuses();
  const byValue = new Map(all.map((s) => [s.value, s]));
  const seen = new Set();
  const result = [];
  all.forEach((s) => {
    if (HIDDEN_PROPOSAL_MAP_STATUSES.has(s.value)) return;
    const value = getProposalMapStatus(s.value);
    if (seen.has(value)) return;
    seen.add(value);
    const mapStatus = byValue.get(value) || { ...s, value };
    result.push(value === 'PENDING'
      ? { ...mapStatus, label: 'Mới đề xuất' }
      : mapStatus);
  });
  return result;
};

export const getProposalMapLegendStatuses = () => getProposalMapStatuses().filter((s) => s.show_in_legend !== false && s.show_in_legend !== 0);
export const getEvReportStatuses = () => withDynamicFallback('ev_report', EV_REPORT_STATUSES);
export const getEvReportLegendStatuses = () => getEvReportStatuses().filter((s) => s.show_in_legend !== false && s.show_in_legend !== 0);

export const getStatusLabel = (value, entity) => {
  const list = entity === 'station' ? getStationStatuses() : entity === 'ev_report' ? getEvReportStatuses() : getProposalStatuses();
  return list.find((s) => s.value === value)?.label || value;
};

export const getStatusColor = (value, entity) => {
  const list = entity === 'station' ? getStationStatuses() : entity === 'ev_report' ? getEvReportStatuses() : getProposalStatuses();
  return list.find((s) => s.value === value)?.color || '';
};
