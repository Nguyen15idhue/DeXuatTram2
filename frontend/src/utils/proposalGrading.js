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
  const model = String(row.mo_hinh ?? '').trim().toUpperCase();
  const qty = parseCount(row.so_luong) ?? 1;
  const type = String(row.loai_tru ?? '').trim();
  if (!model && !type) return null;
  return `${model || '?'}_${qty}${type ? ` ${type}` : ''}`;
};

export const formatProposalScale = (row) => {
  if (!row) return '-';
  const parts = [];
  const chot = row.chot_so_luong_tru;
  const chotRows = Array.isArray(chot)
    ? chot
    : (typeof chot === 'string' && chot.trim().startsWith('[') ? (() => { try { return JSON.parse(chot); } catch { return []; } })() : []);
  (chotRows || []).forEach((item) => {
    const text = formatRow(item);
    if (text) parts.push(text);
  });
  if (parts.length === 0) {
    const extras = [
      { model: 'NQ', rows: row.loai_tru_nq },
      { model: 'LK', rows: row.loai_tru_lk },
      { model: 'TDT', rows: row.tdt_tru }
    ];
    extras.forEach(({ model, rows }) => {
      (Array.isArray(rows) ? rows : []).forEach((item) => {
        const text = formatRow({ ...item, mo_hinh: model });
        if (text) parts.push(text);
      });
    });
  }
  if (parts.length === 0 && row.loai_tru) {
    const model = String(row.mo_hinh_dau_tu || '').trim().toUpperCase();
    const qty = model ? 1 : null;
    parts.push(`${model || ''}_${qty || 1} ${row.loai_tru}`.replace(/^_/, ''));
  }
  return parts.length > 0 ? parts.join(' + ') : '-';
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
