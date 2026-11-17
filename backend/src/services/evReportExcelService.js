const ExcelJS = require('exceljs');
const pool = require('../utils/db');

const BATCH_SIZE = 500;
const MAX_DATA_ROWS = 1048575;
const MAX_COLUMNS = 16384;
const MAX_CELL_LENGTH = 32767;
const FIXED_COLUMNS = [
  ['id', 'Mã nhu cầu'],
  ['full_name', 'Họ và tên'],
  ['phone', 'Số điện thoại'],
  ['address', 'Địa chỉ chi tiết'],
  ['ward', 'Phường/Xã'],
  ['province', 'Tỉnh/Thành phố'],
  ['province_code', 'Mã tỉnh'],
  ['latitude', 'Vĩ độ'],
  ['longitude', 'Kinh độ'],
  ['created_at', 'Thời gian tạo nhu cầu'],
  ['updated_at', 'Thời gian cập nhật']
];

const fail = message => Object.assign(new Error(message), { statusCode: 400 });

const parseCustomData = (value, id) => {
  if (value === null || value === undefined) return {};
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw fail(`Dữ liệu động của nhu cầu #${id} không hợp lệ`);
  }
  return parsed;
};

const cellValue = (value, id, label) => {
  if (value === null || value === undefined) return '';
  let result = value;
  if (value instanceof Date) {
    result = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium'
    }).format(value);
  } else if (Array.isArray(value) && value.every(item =>
    item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
    result = value.map(item => item ?? '').join(', ');
  } else if (typeof value === 'object') {
    result = JSON.stringify(value);
  }
  if (typeof result === 'string' && result.length > MAX_CELL_LENGTH) {
    throw fail(`Nhu cầu #${id}: cột "${label}" vượt giới hạn ô Excel`);
  }
  return result;
};

const scanReports = async (connection, onRow) => {
  let lastId = 0;
  for (;;) {
    const [rows] = await connection.query(
      `SELECT id, full_name, phone, address, ward, province, province_code,
              latitude, longitude, created_at, updated_at, custom_data
         FROM ev_charging_reports WHERE id > ? ORDER BY id ASC LIMIT ?`,
      [lastId, BATCH_SIZE]
    );
    for (const row of rows) await onRow(row);
    if (rows.length < BATCH_SIZE) break;
    lastId = rows[rows.length - 1].id;
  }
};

const createWorkbook = async connection => {
  const [definitions] = await connection.query(
    "SELECT `key`, label FROM field_definitions WHERE entity = ? AND source_type = 'json' ORDER BY id",
    ['ev_charging_reports']
  );
  const keys = new Set(definitions.map(field => field.key));
  let count = 0;
  await scanReports(connection, row => {
    count++;
    if (count > MAX_DATA_ROWS) throw fail('Số bản ghi vượt giới hạn một sheet Excel');
    Object.keys(parseCustomData(row.custom_data, row.id)).forEach(key => keys.add(key));
  });

  const labels = new Map(definitions.map(field => [field.key, field.label]));
  const dynamicKeys = [...keys].sort((a, b) => a.localeCompare(b, 'vi'));
  if (FIXED_COLUMNS.length + dynamicKeys.length + 1 > MAX_COLUMNS) {
    throw fail('Số trường vượt giới hạn cột Excel');
  }
  const dynamicColumns = dynamicKeys.map(key => [key, labels.has(key) ? `${labels.get(key)} (${key})` : key]);
  const columns = [...FIXED_COLUMNS, ...dynamicColumns, ['custom_data', 'Dữ liệu động gốc (JSON)']];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Nhu cầu sạc xe');
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.addRow(columns.map(([, label]) => label));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}1` };
  columns.forEach(([, label], index) => {
    sheet.getColumn(index + 1).width = Math.min(42, Math.max(16, label.length + 2));
  });

  await scanReports(connection, row => {
    const data = parseCustomData(row.custom_data, row.id);
    const values = [
      ...FIXED_COLUMNS.map(([key, label]) => cellValue(key === 'phone' ? String(row[key] ?? '') : row[key], row.id, label)),
      ...dynamicColumns.map(([key, label]) =>
        cellValue(Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null, row.id, label)),
      cellValue(data, row.id, 'Dữ liệu động gốc (JSON)')
    ];
    sheet.addRow(values);
  });
  return workbook;
};

exports.buildExport = async () => {
  const connection = await pool.getConnection();
  let started = false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    started = true;
    const workbook = await createWorkbook(connection);
    await connection.commit();
    started = false;
    return await workbook.xlsx.writeBuffer();
  } catch (error) {
    if (started) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.createWorkbook = createWorkbook;
