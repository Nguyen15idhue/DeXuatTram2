const fs = require('node:fs');
const pool = require('../utils/db');
const { createSheetsClient } = require('./proposalSheetSyncService');

const TAB = 'QL_khach_hang';
const LOCK = 'lead_google_sheet_sync';
const MANUAL_LOCK = 'lead_google_sheet_sync_manual';
const HEADERS = [
  'Mã khách hàng', 'Họ và tên', 'Số điện thoại', 'Email', 'Địa chỉ', 'Phường/Xã',
  'Tỉnh/Thành phố', 'Vùng miền', 'Đối tượng khách hàng', 'Nguồn Lead', 'Ghi chú chung',
  'Giai đoạn', 'Phân loại khách hàng', 'Trạng thái tư vấn', 'Kết quả TVBH', 'Ngày tạo',
  'Ngày cập nhật', 'ID người phụ trách', 'Người phụ trách', 'Chức vụ', 'Phòng ban hiện tại',
  'Phòng ban được phân chia', 'Thời điểm phân chia', 'Ghi chú CSKH', 'Ghi chú TVBH', 'Lịch sử tư vấn'
];
const STATUS_LABELS = {
  WAITING_ALLOCATION: 'Chờ GĐTTKD phân bổ', WAITING_FIRST_CONTACT: 'Chờ GĐKV tư vấn lần đầu',
  CONSULTING: 'GĐKV đang tư vấn', SUCCESS: 'Đã tư vấn thành công', FAILED: 'Đã tư vấn thất bại'
};
const RANGE = `'${TAB}'`;
const TIMEOUT = { timeout: 8000, retry: false };
const fault = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, safeMessage: message });
const getConfig = () => {
  const spreadsheetId = process.env.PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const enabled = process.env.LEAD_SHEET_SYNC_ENABLED === 'true';
  const message = !enabled ? 'Đồng bộ khách hàng đang tắt'
    : process.env.PROPOSAL_GOOGLE_SHEETS_TAB_NAME?.trim().toLowerCase() === TAB.toLowerCase()
      ? 'Tab khách hàng không được trùng tab Đề xuất'
      : !spreadsheetId || !credentialsFile || !fs.existsSync(credentialsFile)
        ? 'Thiếu cấu hình Google Sheets hoặc service account' : '';
  return { enabled, configured: !message, message, spreadsheetId, credentialsFile };
};
const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const text = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return text(value.label ?? value.name ?? value.value ?? value.id);
  return String(value ?? '').trim();
};
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const localTime = (value) => {
  const input = text(value);
  if (!input) return NaN;
  const normalized = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(input)
    ? `${input.replace(' ', 'T')}+07:00` : input;
  return value instanceof Date ? value.getTime() : Date.parse(normalized);
};
const displayDate = (value) => {
  const ms = localTime(value);
  return Number.isFinite(ms) ? dateFormat.format(ms).replace(',', '') : text(value);
};
const oneLine = (value) => text(value).replace(/\r\n?|\n|\u2028|\u2029/g, ' ↵ ').replace(/--/g, '—');
const formatHistory = (data, label = (_, value) => text(value)) => ['CSKH', 'TVBH']
  .flatMap(kind => {
    const key = `${kind.toLowerCase()}_history`;
    const entries = json(data[key]);
    if (entries == null) return [];
    if (!Array.isArray(entries)) throw fault('Bảng lịch sử khách hàng không đúng định dạng');
    return entries.map(row => ({ kind, key, time: row?.thoi_gian ?? row?.at ?? row?.created_at,
      status: row?.tinh_trang, note: row?.ghi_chu }));
  })
  .filter(row => [row.time, row.status, row.note].some(value => text(value)))
  .sort((a, b) => (Number.isNaN(localTime(a.time)) ? Infinity : localTime(a.time))
    - (Number.isNaN(localTime(b.time)) ? Infinity : localTime(b.time)))
  .map((row, i) => [`${i + 1}. ${row.kind}`, displayDate(row.time), label(row.key, row.status), row.note]
    .map(oneLine).join(' -- '))
  .join('\n');

async function loadLabels(db) {
  const [defs] = await db.query(`SELECT \`key\`, options, data_list_id, data_list_column, data_list_label_column, source_config
    FROM field_definitions WHERE entity = 'leads' AND status = 'active' AND \`key\` IN
    ('region','customer_type','source','stage','customer_classification','sales_outcome','cskh_history','tvbh_history')`);
  const sources = defs.map(def => ({
    key: def.key, options: json(def.options),
    list: json(def.source_config)?.columns?.find(col => col.key === 'tinh_trang') || def
  }));
  const ids = [...new Set(sources.map(({ list }) => list.data_list_id).filter(Boolean))];
  const [rows] = ids.length ? await db.query(
    'SELECT list_id, data FROM data_list_rows WHERE list_id IN (?) ORDER BY sort_order, id', [ids]) : [[]];
  const maps = new Map(sources.map(({ key, options, list }) => {
    const map = new Map();
    for (const row of rows.filter(row => row.list_id === list.data_list_id)) {
      const data = json(row.data);
      const value = text(data?.[list.data_list_column || 'value']);
      if (value) map.set(value, text(data[list.data_list_label_column || 'label']) || value);
    }
    for (const option of Array.isArray(options) ? options : []) {
      map.set(text(option.value ?? option), text(option.label ?? option));
    }
    return [key, map];
  }));
  return (key, value) => maps.get(key)?.get(text(value)) || text(value);
}

function mapLeadToRow(lead, label = (_, value) => text(value)) {
  const data = json(lead.custom_data) || {};
  const assignee = json(lead.assignee_data) || {};
  const row = [
    lead.lead_code, lead.full_name, lead.phone, lead.email, lead.address, lead.ward, lead.province,
    ...['region', 'customer_type', 'source'].map(key => label(key, lead[key])), lead.note,
    label('stage', lead.stage), label('customer_classification', lead.customer_classification),
    STATUS_LABELS[lead.consultation_status] || lead.consultation_status, label('sales_outcome', lead.sales_outcome),
    displayDate(lead.created_at), displayDate(lead.updated_at), lead.assigned_user_id, lead.assignee_name,
    assignee.chuc_vu, assignee.department, lead.assigned_department, displayDate(lead.assigned_at),
    data.cskh_note, data.tvbh_note, formatHistory(data, label)
  ].map(text);
  if (row.some(value => value.length > 50000)) throw fault('Có ô vượt giới hạn 50.000 ký tự của Google Sheets');
  return row;
}

function indexRows(rows) {
  if (!HEADERS.every((value, i) => rows[0]?.[i] === value)) {
    throw fault(`Tiêu đề A–Z của tab ${TAB} không đúng bố cục`);
  }
  const index = new Map();
  rows.slice(1).forEach((row, i) => {
    const code = text(row[0]);
    if (!code && row.slice(0, HEADERS.length).every(value => !text(value))) return;
    if (!/^LD-\d+$/.test(code)) throw fault(`Mã khách hàng không hợp lệ ở hàng ${i + 2}`);
    if (index.has(code)) throw fault(`Trùng mã khách hàng tại hàng ${index.get(code)} và ${i + 2}`);
    index.set(code, i + 2);
  });
  return index;
}

async function writeRows(sheets, spreadsheetId, jobs) {
  const document = await sheets.spreadsheets.get({
    spreadsheetId, fields: 'sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)))'
  }, TIMEOUT);
  let tab = document.data.sheets?.find(sheet => sheet.properties.title === TAB)?.properties;
  if (!tab && jobs.every(job => !job.values)) return;
  if (!tab) {
    const result = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: {
      requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }]
    } }, TIMEOUT);
    tab = result.data.replies[0].addSheet.properties;
  }
  if (tab.sheetType !== 'GRID' || tab.gridProperties.columnCount < HEADERS.length) {
    throw fault(`Tab ${TAB} phải có tối thiểu 26 cột`);
  }
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId, range: RANGE, valueRenderOption: 'FORMULA'
  }, TIMEOUT);
  const rows = result.data.values || [];
  const initializing = rows.length === 0;
  const index = initializing ? new Map() : indexRows(rows);
  const data = initializing ? [{ range: `${RANGE}!A1:Z1`, values: [HEADERS] }] : [];
  let lastRow = Math.max(1, rows.length);
  for (const job of jobs) {
    const existing = index.get(job.code);
    if (!job.values && !existing) continue;
    const rowNr = existing || ++lastRow;
    index.set(job.code, rowNr);
    data.push({ range: `${RANGE}!A${rowNr}:Z${rowNr}`, values: [job.values || HEADERS.map(() => '')] });
  }
  const requests = [];
  if (lastRow > tab.gridProperties.rowCount) requests.push({
    appendDimension: { sheetId: tab.sheetId, dimension: 'ROWS', length: lastRow - tab.gridProperties.rowCount }
  });
  if (initializing) requests.push({ repeatCell: {
    range: { sheetId: tab.sheetId, startColumnIndex: 25, endColumnIndex: 26 },
    cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy'
  } });
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }, TIMEOUT);
  if (data.length) await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId, requestBody: { valueInputOption: 'RAW', data }
  }, TIMEOUT);
}

const getCounts = async (db, where = '', params = []) => {
  const [[counts]] = await db.query(`SELECT COUNT(*) AS total,
    COUNT(CASE WHEN status = 'DONE' THEN 1 END) AS synced,
    COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS failed,
    COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending,
    MAX(last_error) AS error FROM lead_sheet_sync_queue ${where}`, params);
  return counts;
};

async function getStatus() {
  const { configured, enabled, message } = getConfig();
  if (!enabled) return { configured, message };
  const [counts, [[run]]] = await Promise.all([
    getCounts(pool), pool.query('SELECT id, created_at FROM lead_sheet_sync_runs ORDER BY id DESC LIMIT 1')
  ]);
  return { configured, message, ...counts, run: run ? { ...run, ...await getCounts(pool, 'WHERE run_id = ?', [run.id]) } : null };
}

async function startRun(userId) {
  const config = getConfig();
  if (!config.configured) throw fault(config.message, 503);
  const db = await pool.getConnection();
  let locked = false;
  let transaction = false;
  try {
    const [[lock]] = await db.query('SELECT GET_LOCK(?, 0) AS acquired', [MANUAL_LOCK]);
    locked = lock.acquired === 1;
    if (!locked) throw fault('Đã có lượt đồng bộ đang được tạo');
    await db.beginTransaction();
    transaction = true;
    const [[pending]] = await db.query(
      `SELECT COUNT(*) AS count FROM lead_sheet_sync_queue WHERE status = 'PENDING'
        AND run_id = (SELECT MAX(id) FROM lead_sheet_sync_runs)`);
    if (pending.count) throw fault('Đã có lượt đồng bộ đang chạy');
    const [run] = await db.query('INSERT INTO lead_sheet_sync_runs (triggered_by) VALUES (?)', [userId]);
    await db.query(`INSERT INTO lead_sheet_sync_queue (id, lead_code, run_id)
      SELECT id, lead_code, ? FROM leads WHERE deleted_at IS NULL
      ON DUPLICATE KEY UPDATE run_id = ?, version = version + 1, status = 'PENDING',
        attempt_count = 0, next_attempt_at = NOW(), last_error = NULL`, [run.insertId, run.insertId]);
    await db.query(`UPDATE lead_sheet_sync_queue SET run_id = ?, version = version + 1, status = 'PENDING',
      attempt_count = 0, next_attempt_at = NOW(), last_error = NULL
      WHERE status IN ('PENDING','FAILED') AND (run_id IS NULL OR run_id <> ?)`, [run.insertId, run.insertId]);
    await db.commit();
    return { id: run.insertId };
  } catch (error) {
    if (transaction) await db.rollback();
    throw error;
  } finally {
    try {
      if (locked) await db.query('SELECT RELEASE_LOCK(?)', [MANUAL_LOCK]);
    } finally {
      db.release();
    }
  }
}

function classifyError(error) {
  if (error.safeMessage) return { message: error.safeMessage, retry: false };
  const status = Number(error.response?.status || error.code);
  if ([401, 403, 404].includes(status)) return { message: 'Kiểm tra quyền Editor của service account và file Google Sheets', retry: false };
  if (status === 400) return { message: 'Google Sheets từ chối yêu cầu ghi. Kiểm tra cấu trúc và giới hạn của tab.', retry: false };
  return { message: status === 429 ? 'Đã chạm giới hạn Google Sheets' : 'Không thể kết nối hoặc ghi vào Google Sheets', retry: true };
}

async function recordOutcome(db, job, failure) {
  if (!failure) {
    await db.query(`UPDATE lead_sheet_sync_queue SET status = 'DONE', last_error = NULL
      WHERE id = ? AND version = ?`, [job.id, job.version]);
    return;
  }
  const attempt = job.attempt_count + 1;
  const delay = Math.min(300, 10 * 2 ** (attempt - 1));
  await db.query(`UPDATE lead_sheet_sync_queue SET status = ?, attempt_count = ?, last_error = ?,
    next_attempt_at = TIMESTAMPADD(SECOND, ?, NOW()) WHERE id = ? AND version = ?`,
  [failure.retry && attempt < 5 ? 'PENDING' : 'FAILED', attempt, failure.message, delay, job.id, job.version]);
}

async function processBatch() {
  const config = getConfig();
  if (!config.configured) return;
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await db.query('SELECT GET_LOCK(?, 0) AS acquired', [LOCK]);
    locked = lock.acquired === 1;
    if (!locked) return;
    const [jobs] = await db.query(`SELECT l.*, q.id, q.version, q.attempt_count,
      COALESCE(l.lead_code, q.lead_code) AS code, l.id AS live_id,
      u.full_name AS assignee_name, u.custom_data AS assignee_data
      FROM lead_sheet_sync_queue q LEFT JOIN leads l ON l.id = q.id
      LEFT JOIN users u ON u.id = l.assigned_user_id
      WHERE q.status = 'PENDING' AND q.next_attempt_at <= NOW()
      ORDER BY q.next_attempt_at, q.id LIMIT 30`);
    if (!jobs.length) return;
    const label = await loadLabels(db);
    const ready = [];
    for (const job of jobs) {
      try {
        const active = job.live_id && !job.deleted_at;
        if (active && !/^LD-\d+$/.test(job.code || '')) throw fault('Hồ sơ chưa có mã khách hàng hợp lệ');
        if (job.code) ready.push({ ...job, values: active ? mapLeadToRow(job, label) : null });
        else await recordOutcome(db, job);
      } catch (error) {
        if (!error.safeMessage && !(error instanceof SyntaxError)) throw error;
        await recordOutcome(db, job, { message: error.safeMessage || 'Dữ liệu khách hàng không đúng định dạng', retry: false });
      }
    }
    if (!ready.length) return;
    let failure;
    try {
      const sheets = await createSheetsClient(config);
      await writeRows(sheets, config.spreadsheetId, ready);
    } catch (error) {
      failure = classifyError(error);
      console.warn('[LeadSheetSync] Batch failed:', failure.message);
    }
    for (const job of ready) await recordOutcome(db, job, failure);
  } finally {
    try {
      if (locked) await db.query('SELECT RELEASE_LOCK(?)', [LOCK]);
    } finally {
      db.release();
    }
  }
}

function start() {
  const config = getConfig();
  if (!config.configured) {
    if (config.enabled) console.warn('[LeadSheetSync]', config.message);
    return;
  }
  const tick = async () => {
    try {
      await processBatch();
    } catch (error) {
      console.error('[LeadSheetSync] Worker error:', error.code || error.name);
    } finally {
      setTimeout(tick, 3000).unref();
    }
  };
  void tick();
}

module.exports = { getStatus, startRun, start, mapLeadToRow, writeRows, HEADERS };
