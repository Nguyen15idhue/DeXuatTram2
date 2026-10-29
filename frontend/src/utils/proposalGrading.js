export const GRADING_ROLE = { QH: 'QH', PL: 'PL', BOTH: 'BOTH' };

export const GRADING_ROLE_LABELS = {
  QH: 'Quy hoạch',
  PL: 'Pháp lý',
  BOTH: 'Cả 2 phòng'
};

export const GRADING_NOTE_LABELS = {
  NO_QH_NO_PL: 'Quy hoạch và Pháp lý chưa chấm điểm',
  NO_QH_YES_PL: 'Quy hoạch chưa chấm điểm, Pháp lý đã chấm',
  NO_QH_WAIT_PL: 'Quy hoạch chưa chấm điểm, Pháp lý chờ bổ sung thông tin',
  YES_QH_NO_PL: 'Quy hoạch đã chấm, Pháp lý chưa chấm điểm',
  YES_QH_WAIT_PL: 'Quy hoạch đã chấm, Pháp lý chờ bổ sung thông tin'
};

export const LEGAL_DOC_LABELS = [
  { key: 'legal_document', label: 'Giấy chứng nhận quyền sử dụng đất' },
  { key: 'dkkd_cccd_hkd', label: 'Đăng ký kinh doanh' }
];

const DEFAULT_MODEL_LABELS = {
  NQ: 'Nhượng quyền',
  TDT: 'Tự đầu tư',
  LK: 'Liên kết',
  NQ_LK: 'Nhượng quyền + Liên kết'
};

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export const resolveGradingRole = (department) => {
  const dept = normalizeText(department);
  if (!dept) return null;
  if (dept.includes('quy hoach') || dept.includes('cong nghe') || dept.includes('quan he')) return GRADING_ROLE.QH;
  if (dept.includes('chien luoc')) return GRADING_ROLE.PL;
  return null;
};

const parseCustomData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const normalizeFileEntries = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeFileEntries(item));
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? [value] : [];
  if (typeof value === 'object') {
    if (Array.isArray(value.files)) return normalizeFileEntries(value.files);
    const fileId = value.id ?? value.file_id;
    if (fileId !== null && fileId !== undefined && fileId !== '') return [value];
    return Object.keys(value).length > 0 ? [value] : [];
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || ['[]', '{}', 'null', 'undefined'].includes(text)) return [];
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
      try { return normalizeFileEntries(JSON.parse(text)); } catch { return [value]; }
    }
    return [value];
  }
  return [];
};

export const getFieldValue = (row, key) => {
  if (!row || !key) return null;
  const direct = row[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  return parseCustomData(row.custom_data)[key];
};

const getCellValue = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value.value ?? value.label ?? value.name ?? value.code ?? value;
  }
  return value;
};

export const getProposalModelCode = (row) => {
  const value = getCellValue(getFieldValue(row, 'mo_hinh_dau_tu'));
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
  if (normalized === 'NQ_LK' || (normalized.includes('NHUONG_QUYEN') && normalized.includes('LIEN_KET'))) return 'NQ_LK';
  if (normalized === 'TDT' || normalized.includes('TU_DAU_TU')) return 'TDT';
  if (normalized === 'NQ' || normalized.includes('NHUONG_QUYEN')) return 'NQ';
  if (normalized === 'LK' || normalized.includes('LIEN_KET')) return 'LK';
  return '';
};

export const isLegalDocsRequired = (row) => {
  if (typeof row?.legal_docs_required === 'boolean') return row.legal_docs_required;
  const policy = normalizeText(getCellValue(getFieldValue(row, 'chinh_sach_nq')));
  return !(getProposalModelCode(row) === 'NQ' && policy === 'tra thang');
};

export const parseProposalTableRows = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.rows)) return value.rows;
    if (Array.isArray(value.data)) return value.data;
  }
  return [];
};

export const getProposalTableRows = (row, key) => (
  parseProposalTableRows(getFieldValue(row, key))
);

const POLE_TABLES_BY_MODEL = {
  TDT: [{ model: 'TDT', label: 'Tự đầu tư', key: 'tdt_tru' }],
  NQ: [{ model: 'NQ', label: 'Nhượng quyền', key: 'loai_tru_nq' }],
  LK: [{ model: 'LK', label: 'Liên kết', key: 'loai_tru_lk' }],
  NQ_LK: [
    { model: 'NQ', label: 'Nhượng quyền', key: 'loai_tru_nq' },
    { model: 'LK', label: 'Liên kết', key: 'loai_tru_lk' }
  ]
};

export const getProposalPoleGroups = (row) => {
  const model = getProposalModelCode(row);
  const tableConfigs = POLE_TABLES_BY_MODEL[model] || Object.values(POLE_TABLES_BY_MODEL).flat();
  const groups = tableConfigs.map((table) => ({
    ...table,
    rows: getProposalTableRows(row, table.key)
  })).filter((group) => group.rows.length > 0);

  if (groups.length > 0) return groups;
  const legacyType = getCellValue(getFieldValue(row, 'loai_tru'));
  if (!legacyType) return [];
  const quantity = getCellValue(getFieldValue(row, 'so_luong_tru'));
  return [{
    model: model || '',
    label: getModelLabel(model),
    key: 'loai_tru',
    rows: [{ loai_tru: legacyType, so_luong: quantity || 1 }]
  }];
};

export const getProposalCostRows = (row) => {
  const model = getProposalModelCode(row);
  if (model && model !== 'NQ_LK') return [];
  return getProposalTableRows(row, 'chi_phi_lk');
};

export const isProposalFieldForModel = (fieldKey, row) => {
  const model = getProposalModelCode(row);
  if (!model) return true;
  if (['chinh_sach_nq', 'loai_tru_nq', 'chinh_sach_lk', 'loai_tru_lk', 'chi_phi_lk', 'dat_coc', 'ghi_chu_dat_coc', 'tong_chi_phi'].includes(fieldKey)) {
    return model === 'NQ_LK';
  }
  if (fieldKey === 'tdt_tru') return model === 'TDT';
  return true;
};

export const formatProposalMoney = (value) => {
  const number = parseNumberValue(getCellValue(value));
  return number === null ? '—' : `${number.toLocaleString('vi-VN')} ₫`;
};

export const getProposalNumber = (value) => parseNumberValue(getCellValue(value));

export const hasFileValue = (value) => normalizeFileEntries(value).length > 0;

const toFileSummary = (item) => {
  if (item && typeof item === 'object') {
    return {
      id: item.id ?? item.file_id ?? null,
      name: item.original_name || item.name || null,
      mime_type: item.mime_type || item.type || null,
      url: item.url || null
    };
  }
  return { id: item, name: null, mime_type: null, url: null };
};

const mergeFileSummaries = (first, second) => {
  const result = [];
  [...first, ...second].forEach((item) => {
    const key = item.id !== null && item.id !== undefined ? `id:${item.id}` : `name:${item.name || ''}`;
    if (!result.some((existing) => {
      const existingKey = existing.id !== null && existing.id !== undefined ? `id:${existing.id}` : `name:${existing.name || ''}`;
      return existingKey === key;
    })) {
      result.push(item);
    }
  });
  return result;
};

export const getLegalDocFiles = (row, key) => {
  if (!row || !key) return [];
  const direct = normalizeFileEntries(row[key]).map(toFileSummary);
  const nested = normalizeFileEntries(parseCustomData(row.custom_data)[key]).map(toFileSummary);
  return mergeFileSummaries(direct, nested);
};

export const getLegalDocs = (row) => {
  const apiDocs = Array.isArray(row?.legal_docs) ? row.legal_docs : [];
  return LEGAL_DOC_LABELS.map((doc) => {
    const apiDoc = apiDocs.find((item) => item.key === doc.key);
    const files = getLegalDocFiles(row, doc.key);
    const apiFiles = Array.isArray(apiDoc?.files) ? apiDoc.files.map(toFileSummary) : [];
    const mergedFiles = mergeFileSummaries(files, apiFiles);
    return {
      ...doc,
      files: mergedFiles,
      has_file: mergedFiles.length > 0 || !!apiDoc?.has_file
    };
  });
};

export const getMissingLegalDocs = (row) => getLegalDocs(row)
  .filter((doc) => !doc.has_file)
  .map((doc) => doc.label);

export const isLegalDocsComplete = (row, value) => {
  if (typeof value === 'boolean') return value;
  if (!isLegalDocsRequired(row)) return true;
  if (getLegalDocs(row).every((doc) => doc.has_file)) return true;
  return typeof row?.legal_docs_complete === 'boolean' ? row.legal_docs_complete : false;
};

export const formatScore = (score) => {
  if (score === null || score === undefined || score === '') return 'Chưa chấm';
  return `${Math.trunc(Number(score))}/3`;
};

export const getModelLabel = (value, options) => {
  if (!value) return '-';
  const text = String(value);
  if (Array.isArray(options) && options.length > 0) {
    const found = options.find((opt) => String(opt.value) === text);
    if (found) return found.label;
  }
  return DEFAULT_MODEL_LABELS[text] || text;
};

const parseNumberValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : null;
};

const parseCount = (value) => {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : null;
};

const formatRow = (row) => {
  if (!row) return null;
  const model = String(getCellValue(row.mo_hinh) ?? '').trim().toUpperCase();
  const qty = parseCount(getCellValue(row.so_luong)) ?? 1;
  const type = String(getCellValue(row.loai_tru) ?? '').trim();
  if (!model && !type) return null;
  return `${model || '?'}_${qty}${type ? ` ${type}` : ''}`;
};

export const formatProposedScale = (row) => {
  if (!row) return '-';
  const parts = getProposalPoleGroups(row).flatMap(({ model, rows }) => (
    rows.map((item) => formatRow({ ...item, mo_hinh: model }))
  )).filter(Boolean);
  return parts.length > 0 ? parts.join(' + ') : '-';
};

export const formatProposalScale = (row) => {
  if (!row) return '-';
  const chot = row.chot_so_luong_tru;
  const chotRows = Array.isArray(chot)
    ? chot
    : (typeof chot === 'string' && chot.trim().startsWith('[') ? (() => { try { return JSON.parse(chot); } catch { return []; } })() : []);
  const committed = chotRows.map(formatRow).filter(Boolean);
  return committed.length > 0 ? committed.join(' + ') : formatProposedScale(row);
};

export const formatProposalCost = (row) => {
  if (!row) return '-';
  const raw = row.tong_chi_phi ?? row.investment_cost;
  if (raw === null || raw === undefined || raw === '') return '-';
  const num = parseNumberValue(raw);
  if (num !== null && (typeof raw === 'number' || !/[a-zA-ZÀ-ỹ]/.test(String(raw)))) {
    return `${num.toLocaleString('vi-VN')} VND`;
  }
  return String(raw).trim();
};

export const getProposalLegalName = (row) => {
  if (!row) return '-';
  const custom = row.custom_data || {};
  return row.lk_ten_phap_nhan || custom.lk_ten_phap_nhan
    || row.nq_ten_khach_hang || custom.nq_ten_khach_hang
    || row.owner_name || '-';
};

export const getProposalPhone = (row) => {
  if (!row) return '-';
  const custom = row.custom_data || {};
  return row.lk_sdt || custom.lk_sdt
    || row.nq_sdt || custom.nq_sdt
    || row.owner_phone || '-';
};

export const getProposalAddress = (row) => {
  if (!row) return '-';
  const parts = [
    row.address,
    row.xa_phuong ?? row.custom_data?.xa_phuong,
    row.province ?? row.custom_data?.province
  ]
    .map((part) => String(part || '').trim())
    .filter((part) => part && part !== 'undefined' && part !== 'null');
  const unique = [];
  parts.forEach((part) => {
    if (!unique.some((existing) => existing.toLowerCase() === part.toLowerCase())) unique.push(part);
  });
  return unique.length > 0 ? unique.join(', ') : '-';
};

export const getGradingStatusLabel = (code) => {
  if (!code) return '';
  return GRADING_NOTE_LABELS[code] || code;
};

export const getPartialGradingProgress = (row) => {
  if (row?.status !== 'GDTTKD_EVALUATING' || Number(row.review_level) !== 1) return null;

  const qhScored = row.quy_hoach_score !== null && row.quy_hoach_score !== undefined;
  const plScored = row.phap_ly_score !== null && row.phap_ly_score !== undefined;

  if (qhScored && plScored) return 'Hai phòng đã chấm xong · đang chờ GĐTTKD xem xét';
  if (qhScored) return 'Quy hoạch đã chấm · Pháp lý chưa chấm';
  if (plScored) return 'Pháp lý đã chấm · Quy hoạch chưa chấm';
  return null;
};
