import { getStatusOptions } from './mapMarkerIcons';

export const STATION_STATUSES = [
  { value: 'PLANNING', label: 'Quy hoạch', color: '#a855f7' },
  { value: 'ACTIVE', label: 'Hoạt động', color: '#22c55e' },
  { value: 'DEPLOYING', label: 'Triển khai', color: '#eab308' },
  { value: 'REJECTED', label: 'Từ chối/Hủy', color: '#b91c1c' }
];

export const PROPOSAL_STATUSES = [
  { value: 'PENDING', label: 'Đang đề xuất', color: '#f97316' },
  { value: 'REVIEWING', label: 'Đang xem xét', color: '#3b82f6' },
  { value: 'APPROVED', label: 'Đã duyệt', color: '#22c55e' },
  { value: 'REJECTED', label: 'Từ chối', color: '#ef4444' }
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
    color: o.color || fallbackByValue[o.value]?.color || '#6b7280'
  }));
};

export const getStationStatuses = () => withDynamicFallback('station', STATION_STATUSES);
export const getProposalStatuses = () => withDynamicFallback('proposal', PROPOSAL_STATUSES);

export const getStatusLabel = (value, entity) => {
  const list = entity === 'station' ? getStationStatuses() : getProposalStatuses();
  return list.find((s) => s.value === value)?.label || value;
};

export const getStatusColor = (value, entity) => {
  const list = entity === 'station' ? getStationStatuses() : getProposalStatuses();
  return list.find((s) => s.value === value)?.color || '';
};
