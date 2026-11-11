export const RETIRED_PROPOSAL_STATUS = 'PRINCIPLE_APPROVED';

export const NUMBERED_PROPOSAL_STATUSES = [
  ['PENDING', 'Mới đề xuất'],
  ['GRADING', 'Đang đánh giá quy hoạch và pháp lý'],
  ['GDTTKD_EVALUATING', 'GĐTTKD đánh giá'],
  ['RE_GRADING', 'GĐTTKD yêu cầu chấm lại'],
  ['RE_GDTTKD_EVALUATING', 'GĐTTKD xem xét lại'],
  ['TGD_REVIEW', 'Đang trình Tổng giám đốc'],
  ['DESIGNING', 'Đang vẽ Layout'],
  ['INFOR_WAITING', 'Chờ bổ sung thông tin'],
  ['PROPOSAL_REPORT_CREATING', 'Đang lập tờ trình BCĐX'],
  ['PROPOSAL_REPORT_RE_CREATING', 'Yêu cầu tạo lại BCĐX'],
  ['PROPOSAL_REPORT_REVIEWING', 'Đang duyệt BCĐX'],
  ['PROPOSAL_REPORT_UPDATING', 'Chờ cập nhật lại BCĐX'],
  ['SIGNATURE_PENDING', 'Đang trình ký'],
  ['APPROVED', 'Đã duyệt BCĐX'],
  ['DEPLOYING', 'Đang triển khai'],
  ['ACTIVE', 'Hoạt động']
].map(([value, label], index) => ({ value, label: `${index + 1}. ${label}`, sort_order: index + 1 }));

const EXCEPTION_STATUSES = [
  ['PAUSED', 'Tạm dừng'], ['CANCELLED', 'Đã hủy'], ['ARCHIVED', 'Đã lưu trữ'],
  ['REVIEWING', 'Đang xem xét'], ['PRINCIPLE_APPROVED', 'Duyệt chủ trương'],
  ['REJECTED', 'Từ chối'], ['CONTRACT_SIGNED', 'Ký thành công'], ['CONTRACT_FAILED', 'Ký thất bại']
].map(([value, label], index) => ({ value, label, sort_order: 17 + index }));

const PAGE_STATUS_MAP = new Map(
  [...NUMBERED_PROPOSAL_STATUSES, ...EXCEPTION_STATUSES].map((option) => [option.value, option])
);

export const getNumberedProposalStatusLabel = (value, fallback = value) => (
  PAGE_STATUS_MAP.get(value)?.label || fallback
);

export const getNumberedProposalStatusOptions = (options = [], includeMissing = false) => {
  const source = new Map(options.filter((option) => option.value !== 'COMPLETED')
    .map((option) => [option.value, option]));
  if (includeMissing) PAGE_STATUS_MAP.forEach((option, value) => {
    if (!source.has(value)) source.set(value, option);
  });
  return [...source.values()].map((option) => ({
    ...option,
    ...(PAGE_STATUS_MAP.get(option.value) || { sort_order: 9999 })
  })).sort((a, b) => a.sort_order - b.sort_order);
};

export const isRetiredProposalStatusOption = (entity, key, value) => (
  entity === 'station_proposals'
  && key === 'status'
  && value === RETIRED_PROPOSAL_STATUS
);

const LEGACY_PROPOSAL_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Đang đề xuất', sort_order: 1 },
  { value: 'REVIEWING', label: 'Đang xem xét', sort_order: 2 },
  { value: RETIRED_PROPOSAL_STATUS, label: 'Duyệt chủ trương', sort_order: 3 },
  { value: 'APPROVED', label: 'Đã duyệt', sort_order: 4 },
  { value: 'CANCELLED', label: 'Đã hủy', sort_order: 5 },
  { value: 'ARCHIVED', label: 'Đã lưu trữ', sort_order: 6 },
  { value: 'REJECTED', label: 'Từ chối', sort_order: 7 },
  { value: 'CONTRACT_SIGNED', label: 'Ký thành công', sort_order: 8 },
  { value: 'CONTRACT_FAILED', label: 'Ký thất bại', sort_order: 9 }
];

export const getProposalStatusFilterOptions = (options = []) => {
  const optionMap = new Map((options || []).map((option) => [option.value, option]));

  LEGACY_PROPOSAL_STATUS_OPTIONS.forEach((option) => {
    if (!optionMap.has(option.value)) optionMap.set(option.value, option);
  });

  return [...optionMap.values()]
    .map((option, index) => ({ option, index }))
    .sort((a, b) => {
      const orderA = a.option.sort_order === undefined ? 9999 : Number(a.option.sort_order);
      const orderB = b.option.sort_order === undefined ? 9999 : Number(b.option.sort_order);
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    })
    .map(({ option }) => option);
};
