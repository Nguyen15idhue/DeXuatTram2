export const CS_STATUS = {
  ONBOARDING: 'ONBOARDING',
  DELIVERING: 'DELIVERING',
  INSTALLING: 'INSTALLING',
  ACCEPTANCE: 'ACCEPTANCE',
  CONFIGURING: 'CONFIGURING',
  OPERATING: 'OPERATING'
};

export const CS_STATUS_ORDER = [
  CS_STATUS.ONBOARDING,
  CS_STATUS.DELIVERING,
  CS_STATUS.INSTALLING,
  CS_STATUS.ACCEPTANCE,
  CS_STATUS.CONFIGURING,
  CS_STATUS.OPERATING
];

export const CS_STATUS_LABELS = {
  ONBOARDING: 'Đang hoàn thiện thủ tục',
  DELIVERING: 'Đang giao hàng',
  INSTALLING: 'Đang lắp đặt',
  ACCEPTANCE: 'Đang nghiệm thu',
  CONFIGURING: 'Đang cấu hình',
  OPERATING: 'Đang hoạt động',
  CANCELLED: 'Đã hủy'
};

export const CS_STATUS_VARIANT = {
  ONBOARDING: 'warning',
  DELIVERING: 'info',
  INSTALLING: 'info',
  ACCEPTANCE: 'info',
  CONFIGURING: 'info',
  OPERATING: 'success',
  CANCELLED: 'ghost'
};

export const CS_SUB_STATUS_BY_STATUS = {
  ONBOARDING: [],
  DELIVERING: ['NOT_DELIVERED', 'DELIVERING', 'DELIVERED'],
  INSTALLING: ['NOT_INSTALLED', 'INSTALLING', 'INSTALLED'],
  ACCEPTANCE: ['NOT_ACCEPTED', 'ACCEPT_FAILED', 'ACCEPT_PASSED'],
  CONFIGURING: ['NOT_CONFIGURED'],
  OPERATING: ['ACTIVE']
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
  NOT_CONFIGURED: 'Chưa cấu hình',
  CONFIGURING: 'Đang cấu hình',
  ACTIVE: 'Đã hoạt động'
};

export const CS_NEXT_STATUS = {
  ONBOARDING: CS_STATUS.DELIVERING,
  DELIVERING: CS_STATUS.INSTALLING,
  INSTALLING: CS_STATUS.ACCEPTANCE,
  ACCEPTANCE: CS_STATUS.CONFIGURING,
  CONFIGURING: CS_STATUS.OPERATING,
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
  NOT_REQUIRED: 'Không yêu cầu',
  NOT: 'Chưa thanh toán',
  DOING: 'Đã thanh toán 1 phần',
  DONE: 'Đã thanh toán toàn bộ'
};

export const CS_DEPOSIT_LABELS = {
  NOT_REQUIRED: 'Không yêu cầu',
  NOT_RECEIVED: 'Chưa nhận cọc',
  RECEIVED: 'Đã nhận cọc',
  REFUND_PENDING: 'Chờ hoàn cọc',
  REFUNDED: 'Đã hoàn cọc'
};

export const CS_DEPOSIT_VARIANT = {
  NOT_REQUIRED: 'ghost',
  NOT_RECEIVED: 'ghost',
  RECEIVED: 'success',
  REFUND_PENDING: 'warning',
  REFUNDED: 'info'
};

export const CS_FLOW_VARIANT = {
  NOT_REQUIRED: 'ghost',
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

export const CS_EDITOR_ROLES = ['SUPER_ADMIN'];

export const formatCsDate = (value) => {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};

export const isCsDeadlineStopped = (station) => station?.status === CS_STATUS.OPERATING;

export const getCsDeadlineLabel = (value, completed, stopped = false) => {
  if (completed) return 'Đã hoàn thành';
  if (stopped) return 'Ngừng đếm hạn';
  if (!value) return '—';
  const deadline = new Date(String(value).replace(' ', 'T')).getTime();
  if (Number.isNaN(deadline)) return '—';
  const remaining = deadline - Date.now();
  if (remaining <= 0) return 'Quá hạn';
  const totalHours = Math.ceil(remaining / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `Còn ${days} ngày ${hours} giờ` : `Còn ${totalHours} giờ`;
};
