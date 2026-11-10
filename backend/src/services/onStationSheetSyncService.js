// backend/src/services/onStationSheetSyncService.js
// Đồng bộ Google Sheet riêng cho trạm đã ON (proposal status = ACTIVE).
// Cột A–Q: STT, Mã Trạm, Tên trạm sạc, Pháp nhân, Nhân sự phụ trách, Nguồn phụ trách,
//          Link Google Map, Vĩ độ, Kinh độ, Địa chỉ chi tiết, Tỉnh cũ, Tỉnh mới,
//          Quy mô trụ ban đầu, Quy mô trụ chốt triển khai, Số lượng trụ,
//          Ngày ON trạm, Mã chủ đầu tư
const pool = require('../utils/db');
const { google } = require('googleapis');

const LOCK_NAME = 'on_station_sheet_sync';
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 8;
const LAST_COLUMN = 'Q';
const KEY_COLUMN_INDEX = 1; // cột B — Mã Trạm
const KEY_COLUMN_LETTER = 'B';

// Ánh xạ tỉnh mới (34 đơn vị sau sáp nhập) -> danh sách tỉnh cũ
const PROVINCE_MERGE_MAP = {
  'Tuyên Quang': ['Tuyên Quang', 'Hà Giang'],
  'Lào Cai': ['Lào Cai', 'Yên Bái'],
  'Thái Nguyên': ['Thái Nguyên', 'Bắc Kạn'],
  'Phú Thọ': ['Phú Thọ', 'Vĩnh Phúc', 'Hòa Bình'],
  'Bắc Ninh': ['Bắc Ninh', 'Bắc Giang'],
  'Hưng Yên': ['Hưng Yên', 'Thái Bình'],
  'Hải Phòng': ['Hải Phòng', 'Hải Dương'],
  'Ninh Bình': ['Ninh Bình', 'Hà Nam', 'Nam Định'],
  'Quảng Trị': ['Quảng Trị', 'Quảng Bình'],
  'Huế': ['Thừa Thiên Huế'],
  'Đà Nẵng': ['Đà Nẵng', 'Quảng Nam'],
  'Quảng Ngãi': ['Quảng Ngãi', 'Kon Tum'],
  'Gia Lai': ['Gia Lai', 'Bình Định'],
  'Khánh Hòa': ['Khánh Hòa', 'Ninh Thuận'],
  'Lâm Đồng': ['Lâm Đồng', 'Đắk Nông', 'Bình Thuận'],
  'Đắk Lắk': ['Đắk Lắk', 'Phú Yên'],
  'Hà Nội': ['Hà Nội'],
  'Hồ Chí Minh': ['Hồ Chí Minh', 'Bình Dương', 'Bà Rịa - Vũng Tàu'],
  'Đồng Nai': ['Đồng Nai', 'Bình Phước'],
  'Tây Ninh': ['Tây Ninh', 'Long An'],
  'Cần Thơ': ['Cần Thơ', 'Sóc Trăng', 'Hậu Giang'],
  'Vĩnh Long': ['Vĩnh Long', 'Bến Tre', 'Trà Vinh'],
  'Đồng Tháp': ['Đồng Tháp', 'Tiền Giang'],
  'Cà Mau': ['Cà Mau', 'Bạc Liêu'],
  'An Giang': ['An Giang', 'Kiên Giang'],
  'Quảng Ninh': ['Quảng Ninh'],
  'Thanh Hóa': ['Thanh Hóa'],
  'Nghệ An': ['Nghệ An'],
  'Hà Tĩnh': ['Hà Tĩnh'],
  'Sơn La': ['Sơn La'],
  'Điện Biên': ['Điện Biên'],
  'Lai Châu': ['Lai Châu'],
  'Cao Bằng': ['Cao Bằng'],
  'Lạng Sơn': ['Lạng Sơn']
};

const HEADER_ROW = [
  'STT', 'Mã Trạm', 'Tên trạm sạc', 'Pháp nhân', 'Nhân sự phụ trách', 'Nguồn phụ trách',
  'Link Google Map', 'Vĩ độ', 'Kinh độ', 'Địa chỉ chi tiết', 'Tỉnh cũ', 'Tỉnh mới',
  'Quy mô trụ ban đầu', 'Quy mô trụ chốt triển khai', 'Số lượng trụ', 'Ngày ON trạm', 'Mã chủ đầu tư'
];

const getConfig = () => {
  const spreadsheetId = String(process.env.ON_STATION_GOOGLE_SHEETS_SPREADSHEET_ID || '').trim();
  const tabName = String(process.env.ON_STATION_GOOGLE_SHEETS_TAB_NAME || '').trim();
  const credentialsFile = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  const configured = !!spreadsheetId && !!tabName && !!credentialsFile;
  return {
    configured,
    spreadsheetId,
    tabName,
    credentialsFile,
    message: configured ? 'OK' : 'Thiếu ON_STATION_GOOGLE_SHEETS_SPREADSHEET_ID / TAB_NAME / GOOGLE_APPLICATION_CREDENTIALS'
  };
};

const createSheetsClient = async (config) => {
  if (!config.configured) {
    const error = new Error(config.message || 'Google Sheet ON trạm chưa được cấu hình');
    error.statusCode = 503;
    throw error;
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: config.credentialsFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
};

const quoteTab = (tabName) => `'${String(tabName).replace(/'/g, "''")}'`;

const chunks = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const parseObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const parseArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
};

const scalarValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map(scalarValue).filter(Boolean).join(', ');
    return value.label || value.name || value.value || value.code || '';
  }
  return String(value).trim();
};

const formatDate = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${value.getFullYear()}`;
  }
  const text = String(value).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
};

const normalizeProvince = (value) => {
  return String(value || '')
    .trim()
    .replace(/^(tỉnh|tinh|thành phố|thanh pho|tp\.?|tp)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const PROVINCE_ALIASES = {
  'Hồ Chí Minh': 'Hồ Chí Minh',
  'Ho Chi Minh': 'Hồ Chí Minh',
  'HCM': 'Hồ Chí Minh',
  'Huế': 'Huế',
  'Thừa Thiên Huế': 'Huế',
  'Đà Nẵng': 'Đà Nẵng',
  'Đắk Lắk': 'Đắk Lắk',
  'Dak Lak': 'Đắk Lắk'
};

const resolveOldProvince = (newProvince, address) => {
  const normalized = normalizeProvince(newProvince);
  if (!normalized) return '';
  const key = PROVINCE_ALIASES[normalized] || normalized;
  const candidates = PROVINCE_MERGE_MAP[key] || [normalized];
  if (candidates.length === 1) return candidates[0];
  const haystack = normalizeProvince(address).toLowerCase();
  if (haystack) {
    const matched = candidates.find((name) => haystack.includes(normalizeProvince(name).toLowerCase()));
    if (matched) return matched;
  }
  return candidates[0];
};

const formatPoleScale = (value) => {
  const rows = parseArray(value);
  if (!rows.length) return '';
  return rows
    .map((row) => {
      const model = scalarValue(row.mo_hinh);
      const type = formatPoleType(row.loai_tru);
      if (!model || !type) throw new Error('Dòng quy mô trụ thiếu mô hình hoặc loại trụ');
      return `${model}_${poleQuantity(row)} ${type}`;
    })
    .filter(Boolean)
    .join(' + ');
};

const countPoles = (value) => {
  const rows = parseArray(value);
  if (!rows.length) return '';
  const total = rows.reduce((sum, row) => sum + poleQuantity(row), 0);
  return total > 0 ? total : '';
};

const poleQuantity = (row) => {
  const quantity = Number(scalarValue(row.so_luong));
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error('Số lượng trụ phải là số nguyên dương');
  }
  return quantity;
};

const formatPoleType = (value) => scalarValue(value)
  .replace(/\b(AC|DC)\s*(\d+(?:[.,]\d+)?)\s*kw\b/gi,
    (_, type, power) => `${type.toUpperCase()} ${power}kW`);

const tableRows = (value) => {
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') {
    try { return tableRows(JSON.parse(value)); } catch {
      throw new Error('Bảng quy mô trụ không phải JSON hợp lệ');
    }
  }
  if (Array.isArray(value)) return value;
  const rows = value?.rows || value?.data || [];
  if (!Array.isArray(rows)) throw new Error('Bảng quy mô trụ phải là danh sách dòng');
  return rows;
};

const formatProposedScale = (custom, model) => {
  const groups = {
    TDT: [['TDT', 'tdt_tru']],
    LK: [['LK', 'loai_tru_lk']],
    NQ: [['NQ', 'loai_tru_nq']],
    NQ_LK: [['NQ', 'loai_tru_nq'], ['LK', 'loai_tru_lk']]
  }[model] || [];
  const rows = groups.flatMap(([mo_hinh, key]) => tableRows(custom[key])
    .map((row) => ({ ...row, mo_hinh })));
  if (rows.length) return formatPoleScale(rows);
  if (!scalarValue(custom.loai_tru)) return '';
  return formatPoleScale([{ mo_hinh: model, so_luong: custom.so_luong_tru, loai_tru: custom.loai_tru }]);
};

const resolveSource = (proposal, model) => {
  if (proposal.assignee_role === 'NPP') return 'NPP';
  if (model === 'TDT') return 'TMT';
  const department = scalarValue(parseObject(proposal.assignee_custom_data).department)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  if (/(kinh doanh|\bkd\b)/.test(department)) {
    if (department.includes('mien bac')) return 'MB';
    if (department.includes('mien trung')) return 'MT';
    if (department.includes('mien nam')) return 'MN';
  }
  throw new Error(`Đề xuất ${proposal.id}: không xác định được nguồn từ phòng ban người phụ trách`);
};

const buildRow = (proposal, serial) => {
  const custom = parseObject(proposal.custom_data);
  const model = scalarValue(proposal.mo_hinh_dau_tu || custom.mo_hinh_dau_tu).toUpperCase();
  if (!scalarValue(proposal.cms_station_code)) throw new Error(`Đề xuất ${proposal.id}: thiếu mã trạm EMS`);
  if (!scalarValue(proposal.assignee_name)) throw new Error(`Đề xuất ${proposal.id}: thiếu người phụ trách hợp lệ`);
  if (!parseArray(proposal.chot_so_luong_tru).length) throw new Error(`Đề xuất ${proposal.id}: thiếu bảng trụ chốt BCĐX`);
  const legalName = scalarValue(custom.lk_ten_phap_nhan || custom.nq_ten_khach_hang || proposal.owner_name);
  const province = scalarValue(proposal.province || custom.province);
  const address = scalarValue(proposal.address || custom.address);
  const oldProvince = resolveOldProvince(province, address);
  const mapUrl = proposal.latitude !== null && proposal.latitude !== undefined
    && proposal.longitude !== null && proposal.longitude !== undefined
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${proposal.latitude},${proposal.longitude}`)}`
    : '';
  return [
    serial,
    scalarValue(proposal.cms_station_code),
    scalarValue(proposal.station_name),
    legalName,
    scalarValue(proposal.assignee_name),
    resolveSource(proposal, model),
    mapUrl,
    scalarValue(proposal.latitude),
    scalarValue(proposal.longitude),
    address,
    oldProvince,
    province,
    formatProposedScale(custom, model),
    formatPoleScale(proposal.chot_so_luong_tru),
    countPoles(proposal.chot_so_luong_tru),
    formatDate(proposal.on_date),
    ''
  ];
};

const loadProposals = async (proposalIds) => {
  if (!proposalIds.length) return [];
  const [rows] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.address, p.owner_name, p.owner_phone,
            p.status, p.custom_data, p.chot_so_luong_tru, p.ma_de_xuat_gen, p.station_id,
            cs.ma_tram, cs.cms_station_code, cs.on_date,
            st.name AS station_name,
            assignee.full_name AS assignee_name, assignee.role AS assignee_role,
            assignee.custom_data AS assignee_custom_data,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) AS vung_mien,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) AS province,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.lk_ten_phap_nhan')) AS lk_ten_phap_nhan,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nq_ten_khach_hang')) AS nq_ten_khach_hang,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.lk_sdt')) AS lk_sdt,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nq_sdt')) AS nq_sdt,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_tru_nq')) AS loai_tru_nq,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_tru_lk')) AS loai_tru_lk,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.tdt_tru')) AS tdt_tru
       FROM station_proposals p
       LEFT JOIN charging_stations cs ON cs.proposal_id = p.id
       LEFT JOIN stations st ON st.id = p.station_id
       LEFT JOIN users assignee ON assignee.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nguoi_phu_trach.id')) AS UNSIGNED)
       WHERE p.id IN (${proposalIds.map(() => '?').join(',')}) AND p.status = 'ACTIVE'`,
    proposalIds
  );
  return rows;
};

const loadProposalKeys = async (proposalIds) => {
  if (!proposalIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT p.id, cs.cms_station_code
       FROM station_proposals p
       LEFT JOIN charging_stations cs ON cs.proposal_id = p.id
      WHERE p.id IN (${proposalIds.map(() => '?').join(',')})`,
    proposalIds
  );
  const codes = rows.map((row) => String(row.cms_station_code || '').trim()).filter(Boolean);
  if (codes.length) {
    const [duplicates] = await pool.query(
      `SELECT TRIM(cms_station_code) AS code FROM charging_stations
        WHERE TRIM(cms_station_code) IN (?) GROUP BY TRIM(cms_station_code) HAVING COUNT(*) > 1`,
      [codes]
    );
    if (duplicates.length) throw new Error(`Mã trạm EMS trùng trong DB: ${duplicates.map(row => row.code).join(', ')}`);
  }
  return new Map(rows.map((row) => [Number(row.id), String(row.cms_station_code || '').trim()]));
};

const readSheetRows = async (sheets, config) => {
  const tab = quoteTab(config.tabName);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${tab}!A1:${LAST_COLUMN}`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const rows = response.data.values || [];
  const rowById = new Map();
  let maxSerial = 0;
  rows.forEach((row, index) => {
    if (!row || !row.length) return;
    const serial = Number(row[0]);
    const key = String(row[KEY_COLUMN_INDEX] || '').trim();
    if (!key) return;
    if (index === 0 && !Number.isFinite(serial)) return;
    if (serial > maxSerial) maxSerial = serial;
    if (rowById.has(key)) throw new Error(`Mã trạm EMS trùng trên Sheet: ${key}`);
    rowById.set(key, { row: index + 1, serial: Number.isFinite(serial) ? serial : null });
  });
  return { rowById, maxSerial, empty: rows.length === 0, nextRow: Math.max(rows.length + 1, 2) };
};

const resolveKey = (keyById, proposalId, proposal) => {
  const fromKeyMap = String(keyById.get(Number(proposalId)) || '').trim();
  if (fromKeyMap) return fromKeyMap;
  if (proposal && proposal.cms_station_code) return String(proposal.cms_station_code).trim();
  throw new Error(`Đề xuất ${proposalId}: thiếu mã trạm EMS để đối soát`);
};

const writeSheetRows = async (sheets, config, jobs, proposalsById, keyById) => {
  const tab = quoteTab(config.tabName);
  const sheetIndex = await readSheetRows(sheets, config);
  const { rowById, maxSerial, empty } = sheetIndex;
  const updates = [];
  const clears = [];
  let nextSerial = maxSerial + 1;
  let nextRow = sheetIndex.nextRow;
  const seenKeys = new Set();
  if (empty) updates.push({ range: `${tab}!A1:${LAST_COLUMN}1`, values: [HEADER_ROW] });

  for (const job of jobs) {
    const proposalId = Number(job.proposal_id);
    const proposal = proposalsById.get(proposalId) || null;
    const key = resolveKey(keyById, proposalId, proposal);
    if (seenKeys.has(key)) throw new Error(`Mã trạm EMS trùng trong lượt đồng bộ: ${key}`);
    seenKeys.add(key);
    const existing = key ? rowById.get(key) : null;
    if (job.operation === 'DELETE' || !proposal) {
      if (existing) clears.push({ row: existing.row });
      continue;
    }
    const serial = existing && existing.serial ? existing.serial : nextSerial++;
    const row = buildRow(proposal, serial);
    if (existing) {
      updates.push({ range: `${tab}!A${existing.row}:${LAST_COLUMN}${existing.row}`, values: [row] });
    } else {
      updates.push({ range: `${tab}!A${nextRow}:${LAST_COLUMN}${nextRow}`, values: [row] });
      nextRow++;
    }
  }

  for (const batch of chunks(updates, 50)) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: batch }
    });
  }
  if (clears.length) {
    for (const { row } of clears) {
      await sheets.spreadsheets.values.clear({ spreadsheetId: config.spreadsheetId, range: `${tab}!A${row}:${LAST_COLUMN}${row}` });
    }
  }

  for (const job of jobs) {
    await pool.query(
      `UPDATE on_station_sheet_sync_queue
          SET status = 'DONE', synced_version = requested_version, last_synced_at = NOW(), last_error = NULL, updated_at = NOW()
        WHERE proposal_id = ? AND requested_version = ?`,
      [job.proposal_id, job.requested_version]
    );
  }
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
      `UPDATE on_station_sheet_sync_queue
          SET status = 'PENDING', attempt_count = 0, next_attempt_at = NOW(), updated_at = NOW()
        WHERE status = 'PROCESSING' AND updated_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`
    );
    const [jobs] = await connection.query(
      `SELECT proposal_id, operation, requested_version, attempt_count, manual_run_id
         FROM on_station_sheet_sync_queue
        WHERE status IN ('PENDING','FAILED') AND attempt_count < ?
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
        `UPDATE on_station_sheet_sync_queue
            SET status = 'PROCESSING', attempt_count = ?, updated_at = NOW()
          WHERE proposal_id = ? AND requested_version = ? AND status IN ('PENDING','FAILED')`,
        [job.attempt_number, job.proposal_id, job.requested_version]
      );
    }
    const upsertIds = jobs.filter((j) => j.operation === 'UPSERT').map((j) => Number(j.proposal_id));
    const deleteIds = jobs.filter((j) => j.operation === 'DELETE').map((j) => Number(j.proposal_id));
    const proposalRows = await loadProposals(upsertIds);
    const proposalsById = new Map(proposalRows.map((p) => [Number(p.id), p]));
    const keyById = await loadProposalKeys([...new Set([...upsertIds, ...deleteIds])]);
    const validJobs = [];
    for (const job of jobs) {
      let validationError;
      try {
        const proposal = proposalsById.get(Number(job.proposal_id));
        resolveKey(keyById, job.proposal_id, proposal);
        if (job.operation === 'UPSERT' && proposal) buildRow(proposal, 1);
      } catch (error) {
        validationError = error;
      }
      if (validationError) {
        await pool.query(
          `UPDATE on_station_sheet_sync_queue
              SET status = 'FAILED', next_attempt_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
                  last_error = ?, updated_at = NOW()
            WHERE proposal_id = ? AND requested_version = ?`,
          [String(validationError.message).slice(0, 500), job.proposal_id, job.requested_version]
        );
      } else {
        validJobs.push(job);
      }
    }
    selectedJobs = validJobs;
    if (!validJobs.length) return { processed: 0, failed: jobs.length };
    const sheets = await createSheetsClient(config);
    await writeSheetRows(sheets, config, validJobs, proposalsById, keyById);
    return { processed: validJobs.length, failed: jobs.length - validJobs.length };
  } catch (error) {
    for (const job of selectedJobs) {
      await pool.query(
        `UPDATE on_station_sheet_sync_queue
            SET status = 'FAILED', attempt_count = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE), last_error = ?, updated_at = NOW()
          WHERE proposal_id = ? AND requested_version = ?`,
        [job.attempt_number || 1, String(error.message || 'sync failed').slice(0, 500), job.proposal_id, job.requested_version]
      ).catch(() => {});
    }
    return { processed: 0, error: error.message || 'sync failed' };
  } finally {
    if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
    connection.release();
  }
};

const enqueueSql = `INSERT INTO on_station_sheet_sync_queue
  (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
  VALUES (?, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
  ON DUPLICATE KEY UPDATE
    requested_version = requested_version + 1,
    operation = 'UPSERT',
    status = IF(status = 'PROCESSING', 'PROCESSING', 'PENDING'),
    attempt_count = IF(status = 'PROCESSING', attempt_count, 0),
    next_attempt_at = NOW(),
    last_error = NULL,
    updated_at = NOW()`;

const startDailySync = async (triggeredBy) => {
  const config = getConfig();
  if (!config.configured) return { queued: 0, total: 0, message: config.message };
  const [rows] = await pool.query("SELECT id FROM station_proposals WHERE status = 'ACTIVE'");
  const ids = rows.map((r) => Number(r.id));
  for (const batch of chunks(ids, 200)) {
    if (!batch.length) continue;
    const values = batch.map(() => `(?, 'UPSERT', 1, 0, 'PENDING', 0, NOW())`).join(', ');
    const [result] = await pool.query(
      `INSERT INTO on_station_sheet_sync_queue
        (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
        VALUES ${values}
        ON DUPLICATE KEY UPDATE
          requested_version = requested_version + 1,
          operation = 'UPSERT',
          status = IF(status = 'PROCESSING', 'PROCESSING', 'PENDING'),
          attempt_count = IF(status = 'PROCESSING', attempt_count, 0),
          next_attempt_at = NOW(),
          last_error = NULL,
          updated_at = NOW()`,
      batch
    );
    void result;
  }
  return { queued: ids.length, total: ids.length, triggered_by: triggeredBy || null };
};

const enqueueActiveProposal = async (proposalId) => {
  const config = getConfig();
  if (!config.configured) return;
  await pool.query(enqueueSql, [proposalId]);
};

const getStatus = async () => {
  const config = getConfig();
  const [queueRows] = await pool.query(
    `SELECT status, COUNT(*) AS n FROM on_station_sheet_sync_queue GROUP BY status`
  );
  const queue = queueRows.reduce((acc, row) => {
    acc[row.status] = Number(row.n);
    return acc;
  }, {});
  const [activeRows] = await pool.query(
    "SELECT COUNT(*) AS n FROM station_proposals WHERE status = 'ACTIVE'"
  );
  const [lastRows] = await pool.query(
    `SELECT MAX(last_synced_at) AS last_synced_at FROM on_station_sheet_sync_queue WHERE last_synced_at IS NOT NULL`
  );
  const [lastErrorRows] = await pool.query(
    `SELECT proposal_id, last_error, updated_at FROM on_station_sheet_sync_queue WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT 5`
  );
  return {
    configured: config.configured,
    message: config.message,
    tabName: config.tabName || null,
    activeProposals: Number(activeRows[0]?.n || 0),
    queue: {
      pending: queue.PENDING || 0,
      processing: queue.PROCESSING || 0,
      done: queue.DONE || 0,
      failed: queue.FAILED || 0,
      total: Object.values(queue).reduce((sum, n) => sum + n, 0)
    },
    lastSyncedAt: lastRows[0]?.last_synced_at || null,
    recentErrors: lastErrorRows
  };
};

exports.getConfig = getConfig;
exports.processBatch = processBatch;
exports.startDailySync = startDailySync;
exports.enqueueActiveProposal = enqueueActiveProposal;
exports.getStatus = getStatus;
exports.HEADER_ROW = HEADER_ROW;
exports.buildRow = buildRow;
exports.loadProposals = loadProposals;
exports.resolveOldProvince = resolveOldProvince;
exports.writeSheetRows = writeSheetRows;
exports.loadProposalKeys = loadProposalKeys;
