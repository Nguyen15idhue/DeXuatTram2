export const RETIRED_PROPOSAL_STATUS = 'PRINCIPLE_APPROVED';

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
