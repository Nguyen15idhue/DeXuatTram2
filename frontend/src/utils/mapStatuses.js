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
