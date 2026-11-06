// backend/src/services/onStationSheetSyncService.js
// Đồng bộ Google Sheet riêng cho trạm đã ON (proposal status = ACTIVE).
// Cột: STT, Mã Trạm, Tên trạm sạc, Pháp nhân, Nhân sự phụ trách, Nguồn phụ trách,
//      Link Google Map, Vĩ độ, Kinh độ, Địa chỉ chi tiết, Tỉnh cũ, Tỉnh mới,
//      Quy mô trụ ban đầu, Quy mô trụ chốt triển khai, Ngày ON trạm,
//      Mã chủ đầu tư, Mã BCĐX
const pool = require('../utils/db');
const { google } = require('googleapis');

const LOCK_NAME = 'on_station_sheet_sync';
const BATCH_SIZE = 50;
const SHEET_MAX_READ_COLUMNS = 40;
const MAX_ATTEMPTS = 8;

const PROVINCE_MERGE_MAP = {
  'Tuyên Quang': ['Tuyên Quang', 'Hà Giang'],
  'Lào Cai': ['Lào Cai', 'Yên Bái'],
  'Thái Nguyên': ['Thái Nguyên', 'Bắc Kạn'],
  'Phú Thọ': ['Phú Thọ', 'Vĩnh Phúc', 'Hòa Bình'],
  'Bắc Ninh': ['Bắc Ninh', 'Bắc Giang'],
  'Hưng Yên': ['Hưng Yên', 'Thái Bình'],
  'Hải Phòng': ['Hải Phòng', 'Hải Dương'],
  'Ninh Bình': ['Ninh Bình', 'Hà Nam', 'Nam Định'],
  'Quảng Trị': ['Quảng Bình', 'Quảng Trị'],
  'Huế': ['Thừa Thiên Huế'],
  'Đà Nẵng': ['Đà Nẵng', 'Quảng Nam'],
  'Quảng Ngãi': ['Quảng Ngãi', 'Kon Tum'],
  'Gia Lai': ['Gia Lai', 'Bình Định'],
  'Khánh Hòa': ['Khánh Hòa', 'Ninh Thuận'],
  'Lâm Đồng': ['Lâm Đồng', 'Đắk Nông', 'Bình Thuận'],
  'Đắk Lắk': ['Đắk Lắk', 'Phú Yên'],
  'Hà Nội': ['Hà Nội'],
  'TP. Hồ Chí Minh': ['TP. Hồ Chí Minh', 'Bình Dương', 'Bà Rịa-Vũng Tàu'],
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

const OLD_PROVINCE_MAP = PROVINCE_MERGE_MAP; // new -> old list

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
const columnName = (index) => {
  let result = '';
  let n = index;
  while (n > 0) {
    const mod = (n - 1) % 26;
    result = String.fromCharCode(65 + mod) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
};

const parseObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const scalarValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map(scalarValue).filter(Boolean).join(', ');
    return value.label || value.name || value.value || value.code || '';
  }
  return String(value).trim();
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(date);
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
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('vi-VN');
};

const formatPoleScale = (value) => {
  if (!value) return '';
  let rows = value;
  if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { return ''; } }
  if (!Array.isArray(rows)) return '';
  return rows.map((r) => `${r.mo_hinh || ''}_${r.so_luong || 0} ${r.loai_tru || ''}`).join(' + ');
};

const formatProposedScale = (custom) => {
  const parts = [];
  const tdt = custom.tdt_tru || custom.loai_tru;
  if (tdt) parts.push(`TDT: ${tdt}`);
  const nq = custom.loai_tru_nq || custom.loai_tru_nq_cs;
  if (nq) parts.push(`NQ: ${nq}`);
  const lk = custom.loai_tru_lk;
  if (lk) parts.push(`LK: ${lk}`);
  return parts.join(' | ');
};

const resolveManagers = (proposal) => {
  const custom = parseObject(proposal.custom_data);
  const areaDirector = (custom.sales_quan_ly && (custom.sales_quan_ly.full_name || custom.sales_quan_ly.name)) || '';
  const centerDirector = (custom.nguoi_phu_trach && (custom.nguoi_phu_trach.full_name || custom.nguoi_phu_trach.name)) || '';
  return { areaDirector, centerDirector };
};

const buildRow = (proposal, serial) => {
  const custom = parseObject(proposal.custom_data);
  const legalName = scalarValue(custom.lk_ten_phap_nhan || custom.nq_ten_khach_hang || proposal.owner_name);
  const phone = scalarValue(custom.lk_sdt || custom.nq_sdt || proposal.owner_phone);
  const province = scalarValue(custom.province);
  const provinceOld = OLD_PROVINCE_MAP[province] ? OLD_PROVINCE_MAP[province].join(', ') : province;
  const modelCode = scalarValue(custom.mo_hinh_dau_tu);
  const modelLabel = { NQ: 'Nhượng quyền', TDT: 'Tự đầu tư', LK: 'Liên kết', NQ_LK: 'Nhượng quyền + Liên kết' }[modelCode] || modelCode;
  const managers = resolveManagers(proposal);
  const proposedScale = formatProposedScale(custom);
  const committedScale = formatPoleScale(proposal.chot_so_luong_tru);
  const mapUrl = proposal.latitude !== null && proposal.latitude !== undefined
    && proposal.longitude !== null && proposal.longitude !== undefined
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${proposal.latitude},${proposal.longitude}`)}`
    : '';
  const onDate = proposal.on_date ? formatDate(proposal.on_date) : '';
  const cmsCode = proposal.cms_station_code || '';
  return [
    serial,
    proposal.ma_tram || '',
    proposal.station_name || '',
    legalName,
    proposal.owner_name || '',
    scalarValue(custom.vung_mien || ''),
    mapUrl,
    scalarValue(proposal.latitude),
    scalarValue(proposal.longitude),
    scalarValue(proposal.address || custom.address),
    provinceOld,
    province,
    proposedScale,
    committedScale,
    onDate,
    cmsCode,
    proposal.ma_de_xuat_gen || ''
  ];
};

const HEADER_ROW = [
  'STT', 'Mã Trạm', 'Tên trạm sạc', 'Pháp nhân', 'Nhân sự phụ trách', 'Nguồn phụ trách',
  'Link Google Map', 'Vĩ độ', 'Kinh độ', 'Địa chỉ chi tiết', 'Tỉnh cũ', 'Tỉnh mới',
  'Quy mô trụ ban đầu', 'Quy mô trụ chốt triển khai', 'Ngày ON trạm', 'Mã chủ đầu tư', 'Mã BCĐX'
];

const loadProposals = async (proposalIds) => {
  if (!proposalIds.length) return [];
  const [rows] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.address, p.owner_name, p.owner_phone,
            p.status, p.custom_data, p.chot_so_luong_tru, p.ma_de_xuat_gen,
            cs.ma_tram, cs.cms_station_code, cs.on_date, cs.station_name,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) AS vung_mien,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province')) AS province,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.sales_quan_ly.full_name')) AS sales_quan_ly_name,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nguoi_phu_trach.full_name')) AS nguoi_phu_trach_name,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.lk_ten_phap_nhan')) AS lk_ten_phap_nhan,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nq_ten_khach_hang')) AS nq_ten_khach_hang,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.lk_sdt')) AS lk_sdt,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.nq_sdt')) AS nq_sdt,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_tru_nq')) AS loai_tru_nq,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_tru_lk')) AS loai_tru_lk,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.tdt_tru')) AS tdt_tru
       FROM station_proposals p
       LEFT JOIN charging_stations cs ON cs.proposal_id = p.id
       WHERE p.id IN (${proposalIds.map(() => '?').join(',')}) AND p.status = 'ACTIVE'`,
    proposalIds
  );
  return rows;
};

const readSheetRows = async (sheets, config) => {
  const tab = quoteTab(config.tabName);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${tab}!A2:Q`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const rows = response.data.values || [];
    const rowById = new Map();
    let maxSerial = 0;
    rows.forEach((row, index) => {
      if (!row || !row.length) return;
      const serial = Number(row[0]);
      const id = String(row[1] || '').trim();
      if (!id) return;
      if (Number.isFinite(serial) && serial > maxSerial) maxSerial = serial;
      if (!rowById.has(id)) rowById.set(id, { row: index + 2, serial: Number.isFinite(serial) ? serial : null });
    });
    return { rowById, maxSerial, legacyLayout: false };
  } catch (error) {
    return { rowById: new Map(), maxSerial: 0, legacyLayout: false };
  }
};

const writeSheetRows = async (sheets, config, jobs, proposalsById) => {
  const tab = quoteTab(config.tabName);
  const sheetIndex = await readSheetRows(sheets, config);
  const { rowById, maxSerial } = sheetIndex;
  const endColumn = 'Q';
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
    const serial = existing && existing.serial ? existing.serial : nextSerial++;
    const row = buildRow(proposal, serial);
    if (existing) {
      updates.push({ range: `${tab}!A${existing.row}:${endColumn}${existing.row}`, values: [row] });
    } else {
      appends.push(row);
    }
  }

  for (const batch of chunks(updates, 50)) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: batch }
    });
  }
  if (appends.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends }
    });
  }
  for (const range of clears) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: config.spreadsheetId, range });
  }
  // mark jobs done
  for (const job of jobs) {
    await pool.query(
      `UPDATE on_station_sheet_sync_queue SET status = 'DONE', synced_version = requested_version, last_synced_at = NOW(), updated_at = NOW() WHERE proposal_id = ? AND requested_version = ?`,
      [job.proposal_id, job.requested_version]
    );
  }
};

const chunks = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, size));
  return out;
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
      `UPDATE on_station_sheet_sync_queue SET status = 'PENDING', attempt_count = 0, next_attempt_at = NOW(), updated_at = NOW() WHERE status = 'PROCESSING' AND updated_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`
    );
    const [jobs] = await connection.query(
      `SELECT proposal_id, operation, requested_version, attempt_count, manual_run_id FROM on_station_sheet_sync_queue WHERE status IN ('PENDING','FAILED') AND attempt_count < ? AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()) ORDER BY COALESCE(next_attempt_at, updated_at), proposal_id LIMIT ?`,
      [MAX_ATTEMPTS, limit]
    );
    if (!jobs.length) return { processed: 0 };
    selectedJobs = jobs;
    for (const job of jobs) {
      job.attempt_number = Number(job.attempt_count || 0) + 1;
      await pool.query(
        `UPDATE on_station_sheet_sync_queue SET status = 'PROCESSING', attempt_count = ?, updated_at = NOW() WHERE proposal_id = ? AND requested_version = ? AND status IN ('PENDING','FAILED')`,
        [job.attempt_number, job.proposal_id, job.requested_version]
      );
    }
    const upsertIds = jobs.filter((j) => j.operation === 'UPSERT').map((j) => Number(j.proposal_id));
    const proposalRows = await loadProposals(upsertIds);
    const proposalsById = new Map(proposalRows.map((p) => [Number(p.id), p]));
    const sheets = await createSheetsClient(config);
    await writeSheetRows(sheets, config, jobs, proposalsById);
    return { processed: jobs.length };
  } catch (error) {
    for (const job of selectedJobs) {
      await pool.query(
        `UPDATE on_station_sheet_sync_queue SET status = 'FAILED', attempt_count = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE), last_error = ?, updated_at = NOW() WHERE proposal_id = ? AND requested_version = ?`,
        [job.attempt_number || 1, String(error.message || 'sync failed').slice(0, 500), job.proposal_id, job.requested_version]
      ).catch(() => {});
    }
    return { processed: 0, error: error.message || 'sync failed' };
  } finally {
    if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
    connection.release();
  }
};

const startDailySync = async (triggeredBy) => {
  const config = getConfig();
  if (!config.configured) return { queued: 0, message: config.message };
  const [rows] = await pool.query("SELECT id FROM station_proposals WHERE status = 'ACTIVE'");
  const ids = rows.map((r) => Number(r.id));
  for (const id of ids) {
    await pool.query(
      `INSERT INTO on_station_sheet_sync_queue (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
       VALUES (?, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
       ON DUPLICATE KEY UPDATE requested_version = requested_version + 1, operation = 'UPSERT', status = IF(status='PROCESSING','PROCESSING','PENDING'), attempt_count = IF(status='PROCESSING', attempt_count, 0), next_attempt_at = NOW(), last_error = NULL, updated_at = NOW()`,
      [id]
    );
  }
  return { queued: ids.length };
};

const enqueueActiveProposal = async (proposalId) => {
  const config = getConfig();
  if (!config.configured) return;
  await pool.query(
    `INSERT INTO on_station_sheet_sync_queue (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
     VALUES (?, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
     ON DUPLICATE KEY UPDATE requested_version = requested_version + 1, operation = 'UPSERT', status = IF(status='PROCESSING','PROCESSING','PENDING'), attempt_count = IF(status='PROCESSING', attempt_count, 0), next_attempt_at = NOW(), last_error = NULL, updated_at = NOW()`,
    [proposalId]
  );
};

exports.getConfig = getConfig;
exports.processBatch = processBatch;
exports.startDailySync = startDailySync;
exports.enqueueActiveProposal = enqueueActiveProposal;
exports.HEADER_ROW = HEADER_ROW;
exports.buildRow = buildRow;
exports.loadProposals = loadProposals;
