const fs = require('fs');
const { google } = require('googleapis');
const pool = require('../utils/db');
const proposalGradingService = require('./proposalGradingService');
const { isGdkv, isGdtt } = require('../constants/salesRanks');
const ttlCache = require('../utils/ttlCache');

const LOCK_NAME = 'proposal_google_sheet_sync_worker';
const MANUAL_LOCK_NAME = 'proposal_google_sheet_daily_enqueue';
const BATCH_SIZE = 100;
const SHEET_WRITE_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 8;
const EXPORT_FIELD_CACHE_KEY = 'fielddefs:export:station_proposals';
const EXPORT_FIELD_CACHE_TTL = 120000;
const EXPORT_EXCLUDED_FIELD_TYPES = new Set(['password', 'table']);
const SHEET_MAX_READ_COLUMNS = 60;

const BASE_COLUMNS = [
  { kind: 'serial', key: '__serial', header: 'STT' },
  { kind: 'proposalId', key: '__proposal_id', header: 'ID đề xuất' },
  { kind: 'proposalCode', key: '__proposal_code', header: 'Mã đề xuất' },
  { kind: 'createdAt', key: '__created_at', header: 'Ngày tạo' },
  { kind: 'submitter', key: '__submitter_name', header: 'Người đề xuất' },
  { kind: 'areaDirector', key: '__area_director', header: 'GĐKV quản lý' },
  { kind: 'centerDirector', key: '__center_director', header: 'Giám đốc TTKD' },
  { kind: 'legalName', key: '__legal_name', header: 'Pháp nhân / Chủ trạm' },
  { kind: 'contactPhone', key: '__contact_phone', header: 'SĐT liên hệ' },
  { kind: 'model', key: '__investment_model', header: 'Mô hình đầu tư' },
  { kind: 'address', key: '__address', header: 'Địa chỉ' },
  { kind: 'latitude', key: '__latitude', header: 'Vĩ độ' },
  { kind: 'longitude', key: '__longitude', header: 'Kinh độ' },
  { kind: 'ward', key: '__ward', header: 'Phường/Xã' },
  { kind: 'province', key: '__province', header: 'Tỉnh/Thành phố' },
  { kind: 'region', key: '__region', header: 'Miền' },
  { kind: 'landType', key: '__land_type', header: 'Loại đất' },
  { kind: 'area', key: '__area', header: 'Diện tích mặt bằng' },
  { kind: 'proposedScale', key: '__proposed_scale', header: 'Quy mô trụ đề xuất' },
  { kind: 'committedScale', key: '__committed_scale', header: 'Quy mô trụ chốt' },
  { kind: 'totalCost', key: '__total_cost', header: 'Tổng chi phí' },
  { kind: 'committedTotal', key: '__committed_total', header: 'Tổng giá trị trụ chốt' },
  { kind: 'proposalStatus', key: '__proposal_status', header: 'Trạng thái đề xuất' },
  { kind: 'reviewLevel', key: '__review_level', header: 'Mức độ xem xét' },
  { kind: 'qhStatus', key: '__qh_status', header: 'Trạng thái Quy hoạch' },
  { kind: 'plStatus', key: '__pl_status', header: 'Trạng thái Pháp lý' },
  { kind: 'proposalNote', key: '__proposal_note', header: 'Ghi chú trạng thái' },
  { kind: 'expectedOnDate', key: '__expected_on_date', header: 'Ngày dự kiến ON' },
  { kind: 'updatedAt', key: '__updated_at', header: 'Ngày cập nhật' },
  { kind: 'mapUrl', key: '__map_url', header: 'Google Maps' }
];

const EXPLICIT_FIELD_KEYS = new Set([
  'ma_de_xuat', 'ma_de_xuat_gen', 'created_at', 'updated_at', 'user_name',
  'owner_name', 'owner_phone', 'mo_hinh_dau_tu', 'address', 'latitude', 'longitude',
  'xa_phuong', 'province', 'vung_mien', 'land_type', 'dien_tich_mat_bang',
  'loai_tru', 'so_luong_tru', 'tdt_tru', 'loai_tru_nq', 'loai_tru_nq_cs', 'loai_tru_lk',
  'chot_so_luong_tru', 'tong_chi_phi', 'tong_gia_tri_chot', 'status', 'review_level',
  'quy_hoach_score', 'phap_ly_score', 'note', 'ngay_du_kien_on', 'link_google_map', 'link_gg_map'
]);

const LEGACY_HEADERS = [
  'ID đề xuất',
  'Mã đề xuất',
  'Ngày tạo',
  'Người đề xuất',
  'Pháp nhân / Chủ trạm',
  'SĐT liên hệ',
  'Mô hình đầu tư',
  'Địa chỉ',
  'Phường/Xã',
  'Tỉnh/Thành phố',
  'Miền',
  'Loại đất',
  'Diện tích mặt bằng',
  'Quy mô trụ chốt',
  'Tổng chi phí',
  'Tổng giá trị trụ chốt',
  'Trạng thái đề xuất',
  'Mức độ xem xét',
  'Trạng thái Quy hoạch',
  'Trạng thái Pháp lý',
  'Ghi chú trạng thái',
  'Ngày dự kiến ON',
  'Ngày cập nhật',
  'Google Maps'
];

const PREVIOUS_HEADERS = [
  'STT', 'ID đề xuất', 'Mã đề xuất', 'Ngày tạo', 'Người đề xuất', 'GĐKV quản lý',
  'Giám đốc TTKD', 'Pháp nhân / Chủ trạm', 'SĐT liên hệ', 'Mô hình đầu tư', 'Địa chỉ',
  'Vĩ độ', 'Kinh độ', 'Phường/Xã', 'Tỉnh/Thành phố', 'Miền', 'Loại đất',
  'Diện tích mặt bằng', 'Quy mô trụ đề xuất', 'Quy mô trụ chốt', 'Tổng chi phí',
  'Tổng giá trị trụ chốt', 'Trạng thái đề xuất', 'Mức độ xem xét', 'Trạng thái Quy hoạch',
  'Trạng thái Pháp lý', 'Ghi chú trạng thái', 'Ngày dự kiến ON', 'Ngày cập nhật', 'Google Maps'
];

const REVIEW_LEVEL_LABELS = {
  1: 'GĐTTKD xem xét',
  2: 'Quy hoạch và Pháp lý chấm lại',
  3: 'Tổng Giám đốc xem xét'
};

const GRADING_NOTE_LABELS = {
  NO_QH_NO_PL: 'Quy hoạch và Pháp lý chưa chấm điểm',
  NO_QH_YES_PL: 'Quy hoạch chưa chấm điểm, Pháp lý đã chấm',
  NO_QH_WAIT_PL: 'Quy hoạch chưa chấm điểm, Pháp lý chờ bổ sung thông tin',
  YES_QH_NO_PL: 'Quy hoạch đã chấm, Pháp lý chưa chấm điểm',
  YES_QH_WAIT_PL: 'Quy hoạch đã chấm, Pháp lý chờ bổ sung thông tin'
};

const STATUS_FALLBACK_LABELS = {
  PENDING: 'Đang đề xuất',
  REVIEWING: 'Đang xem xét',
  PRINCIPLE_APPROVED: 'Đã duyệt chủ trương',
  APPROVED: 'Đã duyệt BCĐX',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
  CONTRACT_SIGNED: 'Đã ký hợp đồng',
  CONTRACT_FAILED: 'Ký hợp đồng thất bại',
  ARCHIVED: 'Đã lưu trữ',
  GRADING: 'Đánh giá Quy hoạch và Pháp lý',
  GDTTKD_EVALUATING: 'GĐTTKD đánh giá',
  RE_GRADING: 'Chấm điểm lại Quy hoạch và Pháp lý',
  RE_GDTTKD_EVALUATING: 'GĐTTKD xem xét lại',
  TGD_REVIEW: 'Tổng Giám đốc xem xét',
  DESIGNING: 'Đánh giá layout',
  INFOR_WAITING: 'Chờ bổ sung thông tin',
  PROPOSAL_REPORT_CREATING: 'Lập tờ trình BCĐX',
  PROPOSAL_REPORT_RE_CREATING: 'Yêu cầu tạo lại BCĐX',
  PROPOSAL_REPORT_REVIEWING: 'Đang duyệt BCĐX',
  PROPOSAL_REPORT_UPDATING: 'Chờ cập nhật lại BCĐX',
  SIGNATURE_PENDING: 'Trình ký',
  PAUSED: 'Tạm dừng',
  DEPLOYING: 'Đang triển khai',
  ACTIVE: 'Đang hoạt động'
};

const parseObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.rows)) return value.rows;
    if (Array.isArray(value.data)) return value.data;
  }
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const scalarValue = (value) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(scalarValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return scalarValue(value.label ?? value.value ?? value.name ?? value.code ?? '');
  }
  return String(value).trim();
};

const getConfig = () => {
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  const missing = [];
  if (!process.env.PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID) missing.push('Spreadsheet ID đề xuất chưa cấu hình');
  if (!process.env.PROPOSAL_GOOGLE_SHEETS_TAB_NAME) missing.push('Tên tab Google Sheet đề xuất chưa cấu hình');
  if (!credentialsFile || !fs.existsSync(credentialsFile)) missing.push('Không tìm thấy file service account trong backend');
  const pollMs = Math.max(1000, Math.min(60000, Number(process.env.PROPOSAL_SHEET_SYNC_POLL_MS) || 3000));
  return {
    configured: missing.length === 0,
    message: missing.join('; '),
    spreadsheetId: process.env.PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID || '',
    tabName: process.env.PROPOSAL_GOOGLE_SHEETS_TAB_NAME || '',
    credentialsFile,
    pollMs
  };
};

const quoteTab = (tabName) => `'${String(tabName).replace(/'/g, "''")}'`;

const createSheetsClient = async (config) => {
  if (!config.configured) {
    const error = new Error(config.message || 'Google Sheet đề xuất chưa được cấu hình');
    error.statusCode = 503;
    throw error;
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: config.credentialsFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
};

const parseOptions = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const optionLabel = (definitions, key, value, fallback = '') => {
  const normalized = scalarValue(value);
  if (!normalized) return fallback;
  const definition = (definitions || []).find((field) => field && field.key === key);
  const option = parseOptions(definition?.options).find((item) => {
    const optionValue = item && typeof item === 'object' ? (item.value ?? item.label) : item;
    return String(optionValue ?? '') === normalized;
  });
  if (option && typeof option === 'object') return String(option.label || option.value || normalized);
  return STATUS_FALLBACK_LABELS[normalized] || normalized || fallback;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
};

const formatDate = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short' }).format(value);
  }
  const text = String(value).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
};

const formatMoney = (value) => {
  const amount = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('vi-VN').format(amount)} ₫` : '';
};

const formatPoleScale = (value, definitions) => parseArray(value)
  .map((row) => {
    const model = scalarValue(row.mo_hinh);
    const quantity = Number(row.so_luong) || 0;
    const pole = scalarValue(row.loai_tru);
    if (!pole || quantity <= 0) return '';
    const modelLabel = model
      ? optionLabel(definitions, 'mo_hinh_dau_tu', model, ({ NQ: 'Nhượng quyền', TDT: 'Tự đầu tư', LK: 'Liên kết', NQ_LK: 'Nhượng quyền + Liên kết' })[model] || model)
      : '';
    return `${modelLabel ? `${modelLabel}: ` : ''}${quantity} × ${pole}`;
  })
  .filter(Boolean)
  .join('; ');

const PROPOSAL_POLE_FIELDS = {
  NQ: [{ model: 'NQ', field: 'loai_tru_nq' }],
  TDT: [{ model: 'TDT', field: 'tdt_tru' }],
  LK: [{ model: 'LK', field: 'loai_tru_lk' }],
  NQ_LK: [{ model: 'NQ', field: 'loai_tru_nq' }, { model: 'LK', field: 'loai_tru_lk' }]
};

const getProposalModelCode = (value) => {
  const model = scalarValue(value).trim().toUpperCase();
  if (['NQ', 'TDT', 'LK', 'NQ_LK'].includes(model)) return model;
  return '';
};

const formatProposedScale = (custom, definitions) => {
  const model = getProposalModelCode(custom.mo_hinh_dau_tu);
  const configs = PROPOSAL_POLE_FIELDS[model] || Object.values(PROPOSAL_POLE_FIELDS).flat();
  const parts = configs.flatMap((config) => {
    let rows = parseArray(custom[config.field]);
    if (config.field === 'loai_tru_nq' && rows.length === 0) rows = parseArray(custom.loai_tru_nq_cs);
    return rows.map((row) => {
      const pole = scalarValue(row.loai_tru || row.ten_loai_tru);
      const quantity = Number(row.so_luong) || 0;
      if (!pole || quantity <= 0) return '';
      const modelLabel = optionLabel(
        definitions,
        'mo_hinh_dau_tu',
        config.model,
        ({ NQ: 'Nhượng quyền', TDT: 'Tự đầu tư', LK: 'Liên kết' })[config.model] || config.model
      );
      return `${modelLabel}: ${quantity} × ${pole}`;
    }).filter(Boolean);
  });
  if (parts.length > 0) return parts.join('; ');
  const legacyPole = scalarValue(custom.loai_tru);
  const legacyQuantity = Number(custom.so_luong_tru) || 0;
  return legacyPole ? `${legacyQuantity || 1} × ${legacyPole}` : '';
};

const salesProfile = (user) => ({
  name: user?.full_name || '',
  department: user?.department || '',
  chucVu: user?.chuc_vu || ''
});

const resolveProposalManagers = (proposal) => {
  const chain = [
    salesProfile({ full_name: proposal.submitter_name, department: proposal.submitter_department, chucVu: proposal.submitter_chuc_vu }),
    salesProfile({ full_name: proposal.parent_name, department: proposal.parent_department, chucVu: proposal.parent_chuc_vu }),
    salesProfile({ full_name: proposal.grandparent_name, department: proposal.grandparent_department, chucVu: proposal.grandparent_chuc_vu })
  ];
  return {
    areaDirector: chain.find((user) => isGdkv(user.chucVu, user.department))?.name || '',
    centerDirector: chain.find((user) => isGdtt(user.chucVu, user.department))?.name || ''
  };
};

const getLegalDocsState = (customData) => {
  try {
    return proposalGradingService.getLegalDocsState(customData);
  } catch {
    return { complete: true, required: false };
  }
};

const departmentReviewLabel = ({ score, regradePending, legalDocsComplete, department }) => {
  if (regradePending) return `Đang chờ ${department} chấm lại`;
  if (score !== null && score !== undefined) return `Đã chấm (${score}/3)`;
  if (department === 'Pháp lý' && !legalDocsComplete) return 'Chờ bổ sung hồ sơ pháp lý';
  return 'Chưa chấm xong';
};

const getAllFieldDefinitions = async () => {
  const cacheKey = 'fielddefs:all:station_proposals';
  const cached = ttlCache.get(cacheKey);
  if (cached) return cached;
  const [rows] = await pool.query(
    'SELECT * FROM field_definitions WHERE entity = ? ORDER BY id ASC',
    ['station_proposals']
  );
  ttlCache.set(cacheKey, rows || [], EXPORT_FIELD_CACHE_TTL);
  return rows || [];
};

const getExportFields = (definitions) => {
  const explicitKeys = EXPLICIT_FIELD_KEYS;
  return (definitions || [])
    .filter((field) => field && field.key && !explicitKeys.has(field.key) && !EXPORT_EXCLUDED_FIELD_TYPES.has(field.type))
    .map((field) => ({ key: field.key, label: field.label || field.key, type: field.type, options: field.options }));
};

const buildColumns = (fields) => [
  ...BASE_COLUMNS,
  ...(fields || []).map((field) => ({ kind: 'field', key: field.key, header: field.label }))
];

const buildHeaderRow = (fields) => buildColumns(fields).map((column) => column.header);

const resolveBaseRowValues = (proposal, definitions, serial) => {
  const custom = parseObject(proposal.custom_data);
  const legalDocs = getLegalDocsState(custom);
  const modelCode = scalarValue(custom.mo_hinh_dau_tu);
  const modelFallback = {
    NQ: 'Nhượng quyền',
    TDT: 'Tự đầu tư',
    LK: 'Liên kết',
    NQ_LK: 'Nhượng quyền + Liên kết'
  }[modelCode] || modelCode;
  const landLabel = optionLabel(definitions, 'land_type', proposal.land_type, proposal.land_type || '');
  const statusLabel = optionLabel(definitions, 'status', proposal.status, STATUS_FALLBACK_LABELS[proposal.status] || proposal.status);
  const reviewLevel = proposal.review_level === null || proposal.review_level === undefined
    ? ''
    : REVIEW_LEVEL_LABELS[Number(proposal.review_level)] || `Mức ${proposal.review_level}`;
  const noteCode = String(proposal.note || '').trim();
  const noteLabel = GRADING_NOTE_LABELS[noteCode] || noteCode;
  const legalName = scalarValue(custom.lk_ten_phap_nhan || custom.nq_ten_khach_hang || proposal.owner_name);
  const phone = scalarValue(custom.lk_sdt || custom.nq_sdt || proposal.owner_phone);
  const managers = resolveProposalManagers(proposal);
  const province = scalarValue(custom.province);
  const ward = scalarValue(custom.xa_phuong || custom.ward);
  const region = optionLabel(definitions, 'vung_mien', custom.vung_mien, scalarValue(custom.vung_mien));
  const proposalScale = formatProposedScale(custom, definitions);
  const scale = formatPoleScale(proposal.chot_so_luong_tru, definitions);
  const mapUrl = proposal.latitude !== null && proposal.latitude !== undefined
    && proposal.longitude !== null && proposal.longitude !== undefined
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${proposal.latitude},${proposal.longitude}`)}`
    : '';
  return {
    __serial: serial,
    __proposal_id: String(proposal.id),
    __proposal_code: proposal.ma_de_xuat_gen || '',
    __created_at: formatDateTime(proposal.created_at),
    __submitter_name: proposal.submitter_name || '',
    __area_director: managers.areaDirector,
    __center_director: managers.centerDirector,
    __legal_name: legalName,
    __contact_phone: phone,
    __investment_model: optionLabel(definitions, 'mo_hinh_dau_tu', modelCode, modelFallback),
    __address: scalarValue(proposal.address || custom.address),
    __latitude: scalarValue(proposal.latitude),
    __longitude: scalarValue(proposal.longitude),
    __ward: ward,
    __province: province,
    __region: region,
    __land_type: landLabel,
    __area: scalarValue(custom.dien_tich_mat_bang),
    __proposed_scale: proposalScale,
    __committed_scale: scale,
    __total_cost: formatMoney(custom.tong_chi_phi),
    __committed_total: formatMoney(proposal.tong_gia_tri_chot),
    __proposal_status: statusLabel,
    __review_level: reviewLevel,
    __qh_status: departmentReviewLabel({
      score: proposal.quy_hoach_score,
      regradePending: Number(proposal.qh_regrade_pending) === 1,
      legalDocsComplete: legalDocs.complete,
      department: 'Quy hoạch'
    }),
    __pl_status: departmentReviewLabel({
      score: proposal.phap_ly_score,
      regradePending: Number(proposal.pl_regrade_pending) === 1,
      legalDocsComplete: legalDocs.complete,
      department: 'Pháp lý'
    }),
    __proposal_note: noteLabel,
    __expected_on_date: formatDate(proposal.ngay_du_kien_on),
    __updated_at: formatDateTime(proposal.updated_at),
    __map_url: mapUrl
  };
};

const resolveFieldValue = (proposal, custom, key, definitions, usersById) => {
  const field = (definitions || []).find((item) => item && item.key === key) || null;
  const raw = proposal[key] !== undefined && proposal[key] !== null && proposal[key] !== ''
    ? proposal[key]
    : custom[key];
  const text = scalarValue(raw);
  switch (field?.type) {
    case 'select':
      return optionLabel(definitions, key, raw, text);
    case 'multiselect': {
      const rows = parseArray(raw);
      const labels = rows.map((row) => {
        const optionValue = row && typeof row === 'object' ? (row.label ?? row.value ?? row.name ?? row.code) : row;
        const option = parseOptions(field?.options).find((item) => {
          const value = item && typeof item === 'object' ? (item.value ?? item.label) : item;
          return String(value ?? '') === String(optionValue ?? '');
        });
        return option && typeof option === 'object' ? String(option.label || option.value) : String(optionValue ?? '');
      }).filter(Boolean);
      return labels.join('; ');
    }
    case 'boolean':
      return text ? 'Có' : 'Không';
    case 'user': {
      const rawId = raw && typeof raw === 'object'
        ? (raw.id ?? raw.user_id ?? null)
        : (raw === null || raw === undefined || raw === '' ? null : Number(raw));
      const user = rawId ? usersById.get(Number(rawId)) : null;
      return user ? user.full_name || '' : text;
    }
    default:
      return text;
  }
};

const mapProposalToRow = (proposal, fields, serial = '', usersById = new Map(), definitions = []) => {
  const custom = parseObject(proposal.custom_data);
  const values = resolveBaseRowValues(proposal, definitions, serial);
  for (const field of fields) {
    values[field.key] = resolveFieldValue(proposal, custom, field.key, definitions, usersById);
  }
  return buildColumns(fields).map((column) => values[column.key]);
};

const columnName = (columnNumber) => {
  let number = Number(columnNumber);
  let label = '';
  while (number > 0) {
    number -= 1;
    label = String.fromCharCode(65 + (number % 26)) + label;
    number = Math.floor(number / 26);
  }
  return label;
};

const readSheetRows = async (sheets, config) => {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteTab(config.tabName)}!A2:B`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const rows = response.data.values || [];
  const rowById = new Map();
  let maxSerial = 0;
  let legacyLayout = false;
  rows.forEach((row, index) => {
    const first = String(row[0] ?? '').trim();
    const second = String(row[1] ?? '').trim();
    const firstNum = /^\d+$/.test(first) ? Number(first) : null;
    const secondNum = /^\d+$/.test(second) ? Number(second) : null;
    if (firstNum !== null && secondNum === null) legacyLayout = true;
    const id = secondNum !== null ? String(secondNum) : (firstNum !== null ? String(firstNum) : '');
    const serial = firstNum !== null && secondNum !== null ? firstNum : null;
    if (!id) return;
    if (!rowById.has(id)) rowById.set(id, { row: index + 2, serial });
    if (serial && serial > maxSerial) maxSerial = serial;
  });
  return { rowById, maxSerial, legacyLayout };
};

const chunks = (items, size) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const compactSheetSerials = async (sheets, config, rowById) => {
  const ordered = [...rowById.values()].sort((a, b) => a.row - b.row);
  const updates = ordered.map((entry, index) => ({
    range: `${quoteTab(config.tabName)}!A${entry.row}`,
    values: [[index + 1]]
  }));
  for (const batch of chunks(updates, SHEET_WRITE_BATCH_SIZE)) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: batch }
    });
  }
};

const loadProposals = async (proposalIds) => {
  if (!proposalIds.length) return [];
  const [rows] = await pool.query(
    `SELECT p.id, p.ma_de_xuat_gen, p.created_at, p.updated_at, p.status, p.review_level,
            p.quy_hoach_score, p.phap_ly_score, p.note, p.owner_name, p.owner_phone,
            p.address, p.latitude, p.longitude, p.land_type, p.custom_data,
            p.chot_so_luong_tru, p.tong_gia_tri_chot, p.ngay_du_kien_on,
            u.full_name AS submitter_name,
            JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) AS submitter_department,
            JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.chuc_vu')) AS submitter_chuc_vu,
            parent.full_name AS parent_name,
            JSON_UNQUOTE(JSON_EXTRACT(parent.custom_data, '$.department')) AS parent_department,
            JSON_UNQUOTE(JSON_EXTRACT(parent.custom_data, '$.chuc_vu')) AS parent_chuc_vu,
            grandparent.full_name AS grandparent_name,
            JSON_UNQUOTE(JSON_EXTRACT(grandparent.custom_data, '$.department')) AS grandparent_department,
            JSON_UNQUOTE(JSON_EXTRACT(grandparent.custom_data, '$.chuc_vu')) AS grandparent_chuc_vu,
            EXISTS (
              SELECT 1 FROM proposal_requests r
               WHERE r.proposal_id = p.id AND r.request_type = 'RE_GRADE' AND r.status = 'OPEN'
                 AND r.target_department = 'QH'
            ) AS qh_regrade_pending,
            EXISTS (
              SELECT 1 FROM proposal_requests r
               WHERE r.proposal_id = p.id AND r.request_type = 'RE_GRADE' AND r.status = 'OPEN'
                 AND r.target_department = 'PL'
            ) AS pl_regrade_pending
        FROM station_proposals p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN users parent ON parent.id = u.parent_id
        LEFT JOIN users grandparent ON grandparent.id = parent.parent_id
        WHERE p.id IN (${proposalIds.map(() => '?').join(',')})`,
    proposalIds
  );
  return rows;
};

const migrateLegacySheet = async (sheets, config, fields, definitions) => {
  const tab = quoteTab(config.tabName);
  const dataRange = `${tab}!A2:${columnName(SHEET_MAX_READ_COLUMNS)}`;
  const oldRowsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: dataRange,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const oldRows = oldRowsResponse.data.values || [];
  const oldEntries = new Map();
  oldRows.forEach((row, index) => {
    if (!row.some((value) => String(value ?? '').trim())) return;
    const first = String(row[0] ?? '').trim();
    const second = String(row[1] ?? '').trim();
    const firstNum = /^\d+$/.test(first) ? Number(first) : null;
    const secondNum = /^\d+$/.test(second) ? Number(second) : null;
    if (firstNum === null) return;
    const id = secondNum !== null ? secondNum : firstNum;
    const serial = secondNum !== null ? firstNum : null;
    if (!oldEntries.has(String(id))) oldEntries.set(String(id), { row: index + 2, serial });
  });

  const [idRows] = await pool.query('SELECT id FROM station_proposals ORDER BY id ASC');
  const proposals = [];
  for (const idBatch of chunks(idRows.map((row) => Number(row.id)), BATCH_SIZE)) {
    proposals.push(...await loadProposals(idBatch));
  }
  proposals.sort((a, b) => Number(a.id) - Number(b.id));
  const migratedRows = [];
  let serialCursor = 1;
  for (const proposal of proposals) {
    const oldEntry = oldEntries.get(String(proposal.id));
    const serial = oldEntry?.serial || serialCursor++;
    migratedRows.push(mapProposalToRow(proposal, fields, serial, new Map(), definitions));
  }
  const headerRow = buildHeaderRow(fields);
  const rowCount = Math.max(oldRows.length, migratedRows.length);
  const values = [headerRow, ...migratedRows];
  while (values.length < rowCount + 1) values.push(Array(headerRow.length).fill(''));
  const endColumn = columnName(headerRow.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${tab}!A1:${endColumn}${Math.max(1, rowCount + 1)}`,
    valueInputOption: 'RAW',
    requestBody: { values }
  });
};

const writeSheetRows = async (sheets, config, jobs, proposalsById, fields, definitions) => {
  const tab = quoteTab(config.tabName);
  let sheetIndex = await readSheetRows(sheets, config);
  if (sheetIndex.legacyLayout) {
    await migrateLegacySheet(sheets, config, fields, definitions);
    sheetIndex = await readSheetRows(sheets, config);
  }
  const { rowById, maxSerial } = sheetIndex;
  const columns = buildColumns(fields);
  const endColumn = columnName(columns.length);
  const updates = [];
  const appends = [];
  const clears = [];
  let nextSerial = maxSerial + 1;

  for (const job of jobs) {
    const id = String(job.proposal_id);
    const existing = rowById.get(id);
    if (job.operation === 'DELETE' || !proposalsById.has(Number(job.proposal_id))) {
      if (existing) clears.push(`${tab}!A${existing.row}:${endColumn}${existing.row}`);
      continue;
    }
    const proposal = proposalsById.get(Number(job.proposal_id));
    if (existing) {
      const serial = existing.serial || nextSerial++;
      updates.push({
        range: `${tab}!A${existing.row}:${endColumn}${existing.row}`,
        values: [mapProposalToRow(proposal, fields, serial, new Map(), definitions)]
      });
    } else {
      appends.push(mapProposalToRow(proposal, fields, nextSerial++, new Map(), definitions));
    }
  }

  for (const batch of chunks(updates, SHEET_WRITE_BATCH_SIZE)) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: batch }
    });
  }
  for (const batch of chunks(clears, SHEET_WRITE_BATCH_SIZE)) {
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId: config.spreadsheetId,
      requestBody: { ranges: batch }
    });
  }
  for (const batch of chunks(appends, SHEET_WRITE_BATCH_SIZE)) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${tab}!A:${endColumn}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: batch }
    });
  }
  if (clears.length > 0) await compactSheetSerials(sheets, config, rowById);
};

const assertHeader = async (sheets, config, fields, definitions) => {
  const tab = quoteTab(config.tabName);
  const columns = buildColumns(fields);
  const endColumn = columnName(columns.length);
  const range = `${tab}!A1:${endColumn}1`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
  const existing = (response.data.values?.[0] || []).map((value) => String(value || '').trim());
  const expected = buildHeaderRow(fields);
  if (!existing.length || existing.every((value) => !value)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [expected] }
    });
    return;
  }
  const isLegacy = LEGACY_HEADERS.every((header, index) => existing[index] === header);
  const isPrevious = PREVIOUS_HEADERS.every((header, index) => existing[index] === header);
  if (isLegacy || isPrevious) {
    await migrateLegacySheet(sheets, config, fields, definitions);
    return;
  }
  if (!expected.every((header, index) => existing[index] === header)) {
    throw new Error(`Header Google Sheet không khớp. Các cột cần có lần lượt: ${expected.join(' | ')}`);
  }
};

const refreshManualRun = async (runId) => {
  if (!runId) return;
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'DONE' AND synced_version >= requested_version) AS synced,
            SUM(status = 'FAILED') AS failed,
            SUM(status IN ('PENDING','PROCESSING')) AS pending,
            MAX(CASE WHEN status = 'FAILED' THEN last_error END) AS last_error
       FROM proposal_sheet_sync_queue WHERE manual_run_id = ?`,
    [runId]
  );
  const counts = rows[0] || {};
  const total = Number(counts.total || 0);
  const synced = Number(counts.synced || 0);
  const failed = Number(counts.failed || 0);
  const pending = Number(counts.pending || 0);
  const complete = pending === 0 && synced + failed >= total;
  const status = complete ? (failed > 0 ? 'FAILED' : 'SUCCESS') : 'RUNNING';
  await pool.query(
    `UPDATE proposal_sheet_sync_runs
        SET status = ?, total_count = ?, synced_count = ?, failed_count = ?,
            started_at = COALESCE(started_at, NOW()),
            completed_at = IF(? = 1, NOW(), NULL),
            error_message = IF(? = 1, ?, NULL)
      WHERE id = ? AND status IN ('QUEUED','RUNNING')`,
    [status, total, synced, failed, complete ? 1 : 0, failed > 0 ? 1 : 0, counts.last_error || 'Một số đề xuất không đồng bộ được', runId]
  );
  if (complete) {
    await pool.query(
      `UPDATE proposal_sheet_sync_queue SET manual_run_id = NULL
        WHERE manual_run_id = ? AND status IN ('DONE','FAILED')`,
      [runId]
    );
  }
};

const updateSuccessfulJob = async (job) => {
  await pool.query(
    `UPDATE proposal_sheet_sync_queue
        SET synced_version = GREATEST(synced_version, ?),
            status = IF(requested_version > ?, 'PENDING', 'DONE'),
            attempt_count = 0,
            next_attempt_at = IF(requested_version > ?, NOW(), NULL), last_error = NULL,
            last_synced_at = IF(requested_version > ?, last_synced_at, NOW()), updated_at = NOW()
      WHERE proposal_id = ?`,
    [job.requested_version, job.requested_version, job.requested_version, job.requested_version, job.proposal_id]
  );
};

const updateFailedJob = async (job, error) => {
  const maxed = Number(job.attempt_number) >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(3600, 5 * (2 ** Math.max(0, Number(job.attempt_number) - 1)));
  await pool.query(
    `UPDATE proposal_sheet_sync_queue
        SET status = ?,
            next_attempt_at = IF(? = 1, NULL, DATE_ADD(NOW(), INTERVAL ? SECOND)),
            last_error = ?, updated_at = NOW()
      WHERE proposal_id = ? AND status = 'PROCESSING'`,
    [maxed ? 'FAILED' : 'PENDING', maxed ? 1 : 0, delaySeconds, String(error?.message || 'Lỗi đồng bộ').slice(0, 2000), job.proposal_id]
  );
};

const refreshRunsForJobs = async (jobs) => {
  const proposalIds = [...new Set(jobs.map((job) => Number(job.proposal_id)).filter(Boolean))];
  if (!proposalIds.length) return;
  const [rows] = await pool.query(
    `SELECT DISTINCT manual_run_id FROM proposal_sheet_sync_queue
      WHERE proposal_id IN (${proposalIds.map(() => '?').join(',')}) AND manual_run_id IS NOT NULL`,
    proposalIds
  );
  const runIds = new Set(rows.map((row) => Number(row.manual_run_id)).filter(Boolean));
  jobs.forEach((job) => { if (job.manual_run_id) runIds.add(Number(job.manual_run_id)); });
  for (const runId of runIds) await refreshManualRun(runId);
};

const processBatch = async (limit = BATCH_SIZE) => {
  const config = getConfig();
  if (!config.configured) return { processed: 0, disabled: true };
  const connection = await pool.getConnection();
  let lockAcquired = false;
  let selectedJobs = [];
  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [LOCK_NAME]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) return { processed: 0, skipped: true };

    await pool.query(
      `UPDATE proposal_sheet_sync_queue
          SET status = 'PENDING', attempt_count = 0, next_attempt_at = NOW(), updated_at = NOW()
        WHERE status = 'PROCESSING' AND updated_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`
    );
    const [jobs] = await pool.query(
      `SELECT proposal_id, operation, requested_version, attempt_count, manual_run_id
         FROM proposal_sheet_sync_queue
        WHERE status IN ('PENDING','FAILED')
          AND attempt_count < ?
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY COALESCE(next_attempt_at, updated_at), proposal_id
        LIMIT ?`,
      [MAX_ATTEMPTS, limit]
    );
    if (!jobs.length) return { processed: 0 };
    selectedJobs = jobs;

    for (const job of jobs) {
      job.attempt_number = Number(job.attempt_count || 0) + 1;
      await pool.query(
        `UPDATE proposal_sheet_sync_queue
            SET status = 'PROCESSING', attempt_count = ?, updated_at = NOW()
          WHERE proposal_id = ? AND requested_version = ? AND status IN ('PENDING','FAILED')`,
        [job.attempt_number, job.proposal_id, job.requested_version]
      );
      if (job.manual_run_id) {
        await pool.query(
          `UPDATE proposal_sheet_sync_runs SET status = 'RUNNING', started_at = COALESCE(started_at, NOW())
            WHERE id = ? AND status = 'QUEUED'`,
          [job.manual_run_id]
        );
      }
    }

    const upsertIds = jobs.filter((job) => job.operation === 'UPSERT').map((job) => Number(job.proposal_id));
    const [proposalRows, definitions] = await Promise.all([
      loadProposals(upsertIds),
      getAllFieldDefinitions()
    ]);
    const fields = getExportFields(definitions);
    let usersById = new Map();
    const userIdSet = new Set();
    for (const proposal of proposalRows) {
      for (const field of fields) {
        if (field.type !== 'user') continue;
        const custom = parseObject(proposal.custom_data);
        const raw = proposal[field.key] !== undefined && proposal[field.key] !== null && proposal[field.key] !== ''
          ? proposal[field.key]
          : custom[field.key];
        const rawId = raw && typeof raw === 'object'
          ? (raw.id ?? raw.user_id ?? null)
          : (raw === null || raw === undefined || raw === '' ? null : Number(raw));
        if (rawId) userIdSet.add(Number(rawId));
      }
    }
    if (userIdSet.size) {
      const userIdList = [...userIdSet];
      const [userRows] = await pool.query(
        `SELECT id, full_name,
                JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.department')) AS department,
                JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.chuc_vu')) AS chuc_vu
           FROM users WHERE id IN (${userIdList.map(() => '?').join(',')})`,
        userIdList
      );
      usersById = new Map(userRows.map((user) => [user.id, user]));
    }
    const proposalsById = new Map(proposalRows.map((proposal) => [Number(proposal.id), proposal]));
    const sheets = await createSheetsClient(config);
    await assertHeader(sheets, config, fields, definitions);
    await writeSheetRows(sheets, config, jobs, proposalsById, fields, definitions);

    for (const job of jobs) await updateSuccessfulJob(job);
    await refreshRunsForJobs(jobs);
    return { processed: jobs.length };
  } catch (error) {
    for (const job of selectedJobs) {
      job.attempt_number = Number(job.attempt_number || Number(job.attempt_count || 0) + 1);
      await updateFailedJob(job, error).catch((logError) => {
        console.error('[ProposalSheetSync] failed to update retry state:', logError.message);
      });
    }
    await refreshRunsForJobs(selectedJobs).catch((runError) => {
      console.error('[ProposalSheetSync] failed to update daily run:', runError.message);
    });
    console.error('[ProposalSheetSync] batch failed:', error.message);
    return { processed: 0, error: error.message };
  } finally {
    if (lockAcquired) {
      await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
    }
    connection.release();
  }
};

const startDailySync = async (triggeredBy) => {
  const config = getConfig();
  if (!config.configured) {
    const error = new Error(config.message || 'Google Sheet đề xuất chưa được cấu hình');
    error.statusCode = 503;
    throw error;
  }
  const connection = await pool.getConnection();
  let lockAcquired = false;
  let transactionStarted = false;
  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [MANUAL_LOCK_NAME]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      const error = new Error('Đang tạo một lượt đồng bộ cuối ngày khác');
      error.statusCode = 409;
      throw error;
    }
    await connection.beginTransaction();
    transactionStarted = true;
    const [activeRuns] = await connection.query(
      `SELECT id, status, total_count, synced_count, failed_count, created_at
         FROM proposal_sheet_sync_runs WHERE status IN ('QUEUED','RUNNING')
        ORDER BY id DESC LIMIT 1 FOR UPDATE`
    );
    if (activeRuns.length) {
      await connection.commit();
      transactionStarted = false;
      return { ...activeRuns[0], alreadyRunning: true };
    }

    const [rangeRows] = await connection.query(
      `SELECT '1970-01-01 00:00:00' AS date_from,
              DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS date_to`
    );
    const dateFrom = rangeRows[0].date_from;
    const dateTo = rangeRows[0].date_to;
    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT p.id AS proposal_id FROM station_proposals p
         UNION
         SELECT proposal_id FROM proposal_sheet_sync_queue WHERE status IN ('PENDING','PROCESSING','FAILED')
       ) changed_proposals`
    );
    const total = Number(countRows[0]?.total || 0);
    const [runResult] = await connection.query(
      `INSERT INTO proposal_sheet_sync_runs
         (trigger_type, status, triggered_by, date_from, date_to, total_count, started_at, completed_at)
       VALUES ('DAILY_MANUAL', ?, ?, ?, ?, ?, IF(? = 0, NOW(), NULL), IF(? = 0, NOW(), NULL))`,
      [total === 0 ? 'SUCCESS' : 'QUEUED', triggeredBy || null, dateFrom, dateTo, total, total, total]
    );
    const runId = runResult.insertId;
    if (total > 0) {
      await connection.query(
        `INSERT INTO proposal_sheet_sync_queue
         (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at, manual_run_id)
         SELECT changed_proposals.proposal_id, 'UPSERT', 1, 0, 'PENDING', 0, NOW(), ?
           FROM (
             SELECT p.id AS proposal_id FROM station_proposals p
           ) changed_proposals
          ON DUPLICATE KEY UPDATE
            requested_version = proposal_sheet_sync_queue.requested_version + 1,
            operation = 'UPSERT',
            status = IF(proposal_sheet_sync_queue.status = 'PROCESSING', 'PROCESSING', 'PENDING'),
            attempt_count = IF(proposal_sheet_sync_queue.status = 'PROCESSING', proposal_sheet_sync_queue.attempt_count, 0),
           next_attempt_at = NOW(),
           manual_run_id = VALUES(manual_run_id),
           last_error = NULL,
           updated_at = NOW()` ,
        [runId]
      );
    }
    await connection.query(
      `UPDATE proposal_sheet_sync_queue
          SET attempt_count = IF(status = 'FAILED', 0, attempt_count),
              last_error = IF(status = 'FAILED', NULL, last_error),
              status = IF(status = 'FAILED', 'PENDING', status),
              next_attempt_at = NOW(), manual_run_id = ?, updated_at = NOW()
        WHERE status IN ('PENDING','PROCESSING','FAILED')`,
      [runId]
    );
    const [created] = await connection.query('SELECT * FROM proposal_sheet_sync_runs WHERE id = ?', [runId]);
    await connection.commit();
    transactionStarted = false;
    return { ...created[0], alreadyRunning: false };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [MANUAL_LOCK_NAME]).catch(() => {});
    connection.release();
  }
};

const getStatus = async () => {
  const config = getConfig();
  const [[runs], [counts]] = await Promise.all([
    pool.query(
      `SELECT id, trigger_type, status, triggered_by, date_from, date_to,
              total_count, synced_count, failed_count, error_message, started_at, completed_at, created_at
         FROM proposal_sheet_sync_runs ORDER BY id DESC LIMIT 5`
    ),
    pool.query(
      `SELECT SUM(status IN ('PENDING','PROCESSING')) AS pending_count,
              SUM(status = 'FAILED') AS failed_count
         FROM proposal_sheet_sync_queue`
    )
  ]);
  return {
    configured: config.configured,
    message: config.message,
    spreadsheetUrl: config.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.spreadsheetId)}/edit`
      : '',
    pollMs: config.pollMs,
    pendingCount: Number(counts[0]?.pending_count || 0),
    failedCount: Number(counts[0]?.failed_count || 0),
    activeRun: runs.find((run) => ['QUEUED','RUNNING'].includes(run.status)) || null,
    recentRuns: runs
  };
};

exports.HEADERS = BASE_COLUMNS.map((column) => column.header);
exports.getConfig = getConfig;
exports.getStatus = getStatus;
exports.startDailySync = startDailySync;
exports.processBatch = processBatch;
exports.mapProposalToRow = mapProposalToRow;
exports.getExportFields = getExportFields;
exports.buildColumns = buildColumns;
exports.getAllFieldDefinitions = getAllFieldDefinitions;
