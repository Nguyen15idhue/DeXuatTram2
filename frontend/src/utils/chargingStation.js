export const CS_STATUS = {
  ONBOARDING: 'ONBOARDING',
  DELIVERING: 'DELIVERING',
  INSTALLING: 'INSTALLING',
  ACCEPTANCE: 'ACCEPTANCE',
  OPERATING: 'OPERATING'
};

export const CS_STATUS_ORDER = [
  CS_STATUS.ONBOARDING,
  CS_STATUS.DELIVERING,
  CS_STATUS.INSTALLING,
  CS_STATUS.ACCEPTANCE,
  CS_STATUS.OPERATING
];

export const CS_STATUS_LABELS = {
  ONBOARDING: 'Đang hoàn thiện thủ tục',
  DELIVERING: 'Đang giao hàng',
  INSTALLING: 'Đang lắp đặt',
  ACCEPTANCE: 'Đang nghiệm thu',
  OPERATING: 'Đang hoạt động'
};

export const CS_STATUS_VARIANT = {
  ONBOARDING: 'warning',
  DELIVERING: 'info',
  INSTALLING: 'secondary',
  ACCEPTANCE: 'accent',
  OPERATING: 'success'
};

export const CS_SUB_STATUS_BY_STATUS = {
  ONBOARDING: [],
  DELIVERING: ['NOT_DELIVERED', 'DELIVERING', 'DELIVERED'],
  INSTALLING: ['NOT_INSTALLED', 'INSTALLING', 'INSTALLED'],
  ACCEPTANCE: ['NOT_ACCEPTED', 'ACCEPT_FAILED', 'ACCEPT_PASSED'],
  OPERATING: ['CONFIGURING', 'ACTIVE']
};

export const CS_SUB_STATUS_LABELS = {
  NOT_DELIVERED: 'Chưa giao trụ',
  DELIVERING: 'Đang giao trụ',
  DELIVERED: 'Đã giao trụ',
  NOT_INSTALLED: 'Chưa lắp đặt',
  INSTALLING: 'Đang lắp đặt',
  INSTALLED: 'Đã lắp đặt',
  NOT_ACCEPTED: 'Chưa nghiệm thu',
  ACCEPT_FAILED: 'Nghiệm thu không đạt',
  ACCEPT_PASSED: 'Nghiệm thu đạt',
  CONFIGURING: 'Đang cấu hình',
  ACTIVE: 'Đã hoạt động'
};

export const CS_NEXT_STATUS = {
  ONBOARDING: CS_STATUS.DELIVERING,
  DELIVERING: CS_STATUS.INSTALLING,
  INSTALLING: CS_STATUS.ACCEPTANCE,
  ACCEPTANCE: CS_STATUS.OPERATING,
  OPERATING: null
};

export const CS_ROLLBACK_STATUS = {
  ACCEPTANCE: CS_STATUS.INSTALLING
};

export const CS_CONTRACT_LABELS = {
  NOT: 'Chưa ký hợp đồng',
  DOING: 'Đang ký hợp đồng',
  DONE: 'Đã ký hợp đồng',
  CANCELLED: 'Đã hủy'
};

export const CS_CONTRACT_VARIANT = {
  NOT: 'ghost',
  DOING: 'warning',
  DONE: 'success',
  CANCELLED: 'error'
};

export const CS_FLOW_LABELS = {
  NOT: 'Chưa làm',
  DOING: 'Đang làm',
  DONE: 'Đã làm'
};

export const CS_PAYMENT_LABELS = {
  NOT: 'Chưa thanh toán',
  DOING: 'Đã thanh toán 1 phần',
  DONE: 'Đã thanh toán toàn bộ'
};

export const CS_FLOW_VARIANT = {
  NOT: 'ghost',
  DOING: 'warning',
  DONE: 'success'
};

export const CS_STAGES = [
  { key: 'thong-tin-chung', label: 'Thông tin chung', title: 'Thông tin chung ON trạm' },
  { key: 'khoi-tao-hop-dong', label: 'Khởi tạo hợp đồng', title: 'Khởi tạo hợp đồng' },
  { key: 'xay-dung-ha-tang', label: 'Xây dựng hạ tầng', title: 'Xây dựng hạ tầng' },
  { key: 'giao-tru', label: 'Giao trụ', title: 'Giao trụ' },
  { key: 'lap-tru', label: 'Lắp trụ', title: 'Lắp trụ' },
  { key: 'nghiem-thu', label: 'Nghiệm thu', title: 'Nghiệm thu' },
  { key: 'on-tram', label: 'On trạm', title: 'On trạm' }
];

export const CS_STAGE_PATH_PREFIX = '/admin/on-tram';

export const getStageConfig = (key) => CS_STAGES.find((stage) => stage.key === key) || CS_STAGES[0];

export const CS_EDITOR_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export const formatCsDate = (value) => {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};
