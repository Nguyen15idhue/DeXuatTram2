import { getStatusOptions } from './mapMarkerIcons';

export const STATION_STATUSES = [
  { value: 'PLANNING', label: 'Quy hoạch', color: '#a855f7' },
  { value: 'ACTIVE', label: 'Hoạt động', color: '#22c55e' },
  { value: 'DEPLOYING', label: 'Triển khai', color: '#eab308' },
  { value: 'REJECTED', label: 'Từ chối/Hủy', color: '#b91c1c' }
];

export const PROPOSAL_STATUSES = [
  { value: 'PENDING', label: 'Đang đề xuất', color: '#f97316', show_in_legend: true, sort_order: 1 },
  { value: 'REVIEWING', label: 'Đang xem xét', color: '#3b82f6', show_in_legend: true, sort_order: 2 },
  { value: 'APPROVED', label: 'Đã duyệt BCĐX', color: '#22c55e', show_in_legend: true, sort_order: 3 },
  { value: 'CANCELLED', label: 'Đã hủy', color: '#6b7280', show_in_legend: true, sort_order: 4 },
  { value: 'ARCHIVED', label: 'Đã lưu trữ', color: '#8b5cf6', show_in_legend: true, sort_order: 5 },
  { value: 'REJECTED', label: 'Từ chối', color: '#ef4444', show_in_legend: false, sort_order: 5 },
  { value: 'CONTRACT_SIGNED', label: 'Ký thành công', color: '#0d9488', show_in_legend: false, sort_order: 6 },
  { value: 'CONTRACT_FAILED', label: 'Ký thất bại', color: '#f59e0b', show_in_legend: false, sort_order: 7 }
];

export const PRIORITY_OPTIONS = [
  { value: '1', label: 'Cấp 1' },
  { value: '2', label: 'Cấp 2' }
];

export const STATION_STATUS_MAP = STATION_STATUSES.reduce((acc, s) => { acc[s.value] = s; return acc; }, {});
export const PROPOSAL_STATUS_MAP = PROPOSAL_STATUSES.reduce((acc, s) => { acc[s.value] = s; return acc; }, {});

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
export const getProposalLegendStatuses = () => getProposalStatuses().filter((s) => s.show_in_legend !== false);

export const getStatusLabel = (value, entity) => {
  const list = entity === 'station' ? getStationStatuses() : getProposalStatuses();
  return list.find((s) => s.value === value)?.label || value;
};

export const getStatusColor = (value, entity) => {
  const list = entity === 'station' ? getStationStatuses() : getProposalStatuses();
  return list.find((s) => s.value === value)?.color || '';
};
