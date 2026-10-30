const ExcelJS = require('exceljs');
const pool = require('../utils/db');
const adminUserService = require('./adminUserService');

const PREVIEW_LIMIT = 20;
const QUERY_BATCH_SIZE = 1000;
const MAX_EXPORT_ROWS = 50000;
const MAX_EXPORT_COLUMNS = 100;
const SAFE_KEY = /^[a-zA-Z0-9_]+$/;
const FORBIDDEN_FIELD_KEY = /(password|secret|token|private[_-]?key)/i;

const SOURCES = [
  {
    id: 'proposal',
    label: 'Đề xuất',
    entity: 'station_proposals',
    alias: 'p',
    table: 'station_proposals',
    fixedColumns: new Set([
      'id', 'owner_name', 'owner_phone', 'latitude', 'longitude', 'address', 'area',
      'land_type', 'description', 'status', 'tracking_code', 'submission_source', 'note',
      'review_level', 'reject_reason', 'reviewed_by', 'reviewed_at', 'created_at',
      'updated_at', 'info_completed_at', 'ngay_du_kien_on', 'quy_hoach_score',
      'quy_hoach_note', 'phap_ly_score', 'phap_ly_note', 'tong_gia_tri_chot',
      'station_id', 'signed_file_id'
    ]),
    idLabel: 'ID đề xuất'
  },
  {
    id: 'station',
    label: 'Trạm liên kết',
    entity: 'stations',
    alias: 'st',
    table: 'stations',
    fixedColumns: new Set([
      'id', 'name', 'latitude', 'longitude', 'address', 'status', 'created_at', 'updated_at'
    ]),
    idLabel: 'ID trạm'
  },
  {
    id: 'submitter',
    label: 'Người đề xuất',
    entity: 'users',
    alias: 'submitter',
    table: 'users',
    fixedColumns: new Set([
      'id', 'full_name', 'email', 'phone', 'role', 'status', 'parent_id', 'created_at', 'updated_at'
    ]),
    idLabel: 'ID người đề xuất'
  },
  {
    id: 'manager',
    label: 'Quản lý trực tiếp',
    entity: 'users',
    alias: 'manager',
    table: 'users',
    fixedColumns: new Set([
      'id', 'full_name', 'email', 'phone', 'role', 'status', 'parent_id', 'created_at', 'updated_at'
    ]),
    idLabel: 'ID quản lý'
  }
];

const SOURCE_BY_ID = new Map(SOURCES.map((source) => [source.id, source]));

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const parseJson = (value, fallback = null) => {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toOptions = (value) => {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((option) => option && option.value !== undefined && option.value !== null)
    .map((option) => ({
      value: String(option.value),
      label: String(option.label || option.value)
    }));
};

const isAllowedField = (source, field) => {
  if (!field.key || FORBIDDEN_FIELD_KEY.test(field.key) || field.type === 'password') return false;
  if (field.source_type === 'fixed') return source.fixedColumns.has(field.key);
  return field.source_type === 'json' && SAFE_KEY.test(field.key);
};

const loadCatalog = async () => {
  const groups = [];
  for (const source of SOURCES) {
    const [rows] = await pool.query(
      `SELECT \`key\`, label, type, source_type, \`options\`
       FROM field_definitions
       WHERE entity = ? AND status = 'active' AND type <> 'password'
       ORDER BY id`,
      [source.entity]
    );
    const fields = [{
      id: `${source.id}.id`,
      key: 'id',
      label: source.idLabel,
      type: 'number',
      source_type: 'fixed',
      options: []
    }];
    const seen = new Set(['id']);
    rows.forEach((field) => {
      if (seen.has(field.key) || !isAllowedField(source, field)) return;
      seen.add(field.key);
      fields.push({
        id: `${source.id}.${field.key}`,
        key: field.key,
        label: field.label || field.key,
        type: field.type,
        source_type: field.source_type,
        options: toOptions(field.options)
      });
    });
    groups.push({ id: source.id, label: source.label, fields });
  }

  const proposalFields = groups.find((group) => group.id === 'proposal')?.fields || [];
  return {
    dataset: { id: 'proposal_station', label: 'Đề xuất, trạm và người liên quan' },
    groups,
    filters: {
      statusOptions: proposalFields.find((field) => field.key === 'status')?.options || [],
      modelOptions: proposalFields.find((field) => field.key === 'mo_hinh_dau_tu')?.options || [],
      stationStatusOptions: groups.find((group) => group.id === 'station')
        ?.fields.find((field) => field.key === 'status')?.options || []
    }
  };
};

const resolveSelection = async (inputFields) => {
  if (!Array.isArray(inputFields) || inputFields.length === 0) {
    throw badRequest('Chọn ít nhất một trường để xuất');
  }
  if (inputFields.length > MAX_EXPORT_COLUMNS) {
    throw badRequest(`Chọn tối đa ${MAX_EXPORT_COLUMNS} trường cho mỗi file`);
  }

  const catalog = await loadCatalog();
  const fieldMap = new Map(catalog.groups.flatMap((group) => group.fields.map((field) => [field.id, field])));
  const selectedIds = new Set();
  const selected = inputFields.map((input) => {
    const id = typeof input === 'string' ? input : input?.id;
    if (typeof id !== 'string' || !fieldMap.has(id)) {
      throw badRequest('Danh sách trường có trường không hợp lệ hoặc không còn được phép xuất');
    }
    if (selectedIds.has(id)) throw badRequest('Danh sách trường không được chứa trường trùng lặp');
    selectedIds.add(id);
    const field = fieldMap.get(id);
    const customLabel = typeof input === 'object' && typeof input.label === 'string'
      ? input.label.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
      : '';
    return { ...field, label: customLabel || field.label };
  });
  return { catalog, fields: selected };
};

const validateDate = (value, label) => {
  if (!value) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${label} không hợp lệ`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw badRequest(`${label} không hợp lệ`);
  }
  return value;
};

const buildQueryScope = async (user) => {
  if (user.role !== 'SALES') return { clauses: [], params: [] };
  const branchIds = await adminUserService.getBranchIds(Number(user.id));
  if (branchIds.length === 0) return { clauses: ['1 = 0'], params: [] };
  return {
    clauses: [`p.user_id IN (${branchIds.map(() => '?').join(',')})`],
    params: branchIds.map(Number)
  };
};

const buildQueryPlan = async (user, rawFilters = {}) => {
  const filters = rawFilters && typeof rawFilters === 'object' && !Array.isArray(rawFilters)
    ? rawFilters
    : {};
  const { clauses, params } = await buildQueryScope(user);
  const search = String(filters.search || '').trim().slice(0, 150);
  if (search) {
    const like = `%${search}%`;
    clauses.push(`(
      p.owner_name LIKE ?
      OR p.address LIKE ?
      OR submitter.full_name LIKE ?
      OR JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.ma_de_xuat')) LIKE ?
    )`);
    params.push(like, like, like, like);
  }

  const status = String(filters.status || '').trim();
  if (status) {
    clauses.push('p.status = ?');
    params.push(status);
  }

  const model = String(filters.model || '').trim();
  if (model) {
    clauses.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) = ?");
    params.push(model);
  }

  const region = String(filters.region || '').trim().slice(0, 80);
  if (region) {
    clauses.push("JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) = ?");
    params.push(region);
  }

  const dateFrom = validateDate(filters.dateFrom, 'Từ ngày');
  const dateTo = validateDate(filters.dateTo, 'Đến ngày');
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw badRequest('Từ ngày phải nhỏ hơn hoặc bằng Đến ngày');
  }
  if (dateFrom) {
    clauses.push('p.created_at >= ?');
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    clauses.push('p.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(`${dateTo} 00:00:00`);
  }

  if (filters.linkedOnly === true) clauses.push('p.station_id IS NOT NULL');

  const stationStatus = String(filters.stationStatus || '').trim();
  if (stationStatus) {
    clauses.push('st.status = ?');
    params.push(stationStatus);
  }

  return {
    fromSql: `FROM station_proposals p
      LEFT JOIN stations st ON st.id = p.station_id
      LEFT JOIN users submitter ON submitter.id = p.user_id
      LEFT JOIN users manager ON manager.id = submitter.parent_id`,
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
};

const getFieldExpression = (field, index) => {
  const source = SOURCE_BY_ID.get(field.id.split('.')[0]);
  if (!source) throw badRequest('Nguồn trường không hợp lệ');
  let expression;
  if (field.source_type === 'fixed' && source.fixedColumns.has(field.key)) {
    expression = `${source.alias}.\`${field.key}\``;
  } else if (field.source_type === 'json' && SAFE_KEY.test(field.key)) {
    expression = `JSON_UNQUOTE(JSON_EXTRACT(${source.alias}.custom_data, '$.${field.key}'))`;
  } else {
    throw badRequest(`Trường ${field.label} không thể xuất`);
  }
  return `${expression} AS f${index}`;
};

const parseFieldValue = (value) => {
  if (typeof value === 'string') {
    const text = value.trim();
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      return parseJson(text, value);
    }
  }
  return value;
};

const getOptionLabel = (value, options = []) => {
  const option = options.find((item) => String(item.value) === String(value));
  return option ? option.label : value;
};

const serializeValue = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const safeCellText = (value) => (
  typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value
);

const getFileNames = (value) => {
  const parsed = parseFieldValue(value);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries
    .filter((item) => item !== null && item !== undefined && item !== '')
    .map((item) => {
      if (typeof item === 'object') {
        return item.original_name || item.name || item.label || (item.id ? `Tệp #${item.id}` : '');
      }
      return `Tệp #${item}`;
    })
    .filter(Boolean)
    .join('; ');
};

const getUserLabel = (value, userMap) => {
  const parsed = parseFieldValue(value);
  if (parsed && typeof parsed === 'object') {
    const label = parsed.label || parsed.full_name || parsed.name;
    if (label) return String(label);
    const id = Number(parsed.id ?? parsed.user_id ?? parsed.value);
    return Number.isInteger(id) && id > 0 ? (userMap.get(id) || `User #${id}`) : '';
  }
  const id = Number(parsed);
  if (Number.isInteger(id) && id > 0) return userMap.get(id) || `User #${id}`;
  return parsed == null ? '' : String(parsed);
};

const toExcelValue = (rawValue, field, userMap) => {
  let value = parseFieldValue(rawValue);
  if (value === null || value === undefined) return '';
  if (value && typeof value === 'object' && !Array.isArray(value) && value.result !== undefined) {
    value = value.result;
  }
  if (field.type === 'file') return safeCellText(getFileNames(value));
  if (field.type === 'user') return safeCellText(getUserLabel(value, userMap));
  if (field.type === 'select') {
    if (value && typeof value === 'object') value = value.label ?? value.value ?? value.name ?? value;
    return safeCellText(getOptionLabel(value, field.options));
  }
  if (field.type === 'multiselect' && Array.isArray(value)) {
    return safeCellText(value.map((item) => getOptionLabel(
      item && typeof item === 'object' ? (item.value ?? item.label ?? item.name) : item,
      field.options
    )).join(', '));
  }
  if (field.type === 'boolean') return safeCellText(value ? 'Có' : 'Không');
  if (value instanceof Date) return value;
  if (typeof value === 'object') return safeCellText(serializeValue(value));
  return safeCellText(value);
};

const toDisplayValue = (rawValue, field, userMap) => {
  const value = toExcelValue(rawValue, field, userMap);
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleString('vi-VN');
  return String(value);
};

const loadUserLabelMap = async (fields, rows) => {
  if (!fields.some((field) => field.type === 'user')) return new Map();
  const ids = new Set();
  rows.forEach((row) => {
    fields.forEach((field, index) => {
      if (field.type !== 'user') return;
      const value = parseFieldValue(row[`f${index}`]);
      if (value && typeof value === 'object' && (value.label || value.full_name || value.name)) return;
      const id = Number(value && typeof value === 'object'
        ? (value.id ?? value.user_id ?? value.value)
        : value);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    });
  });
  if (ids.size === 0) return new Map();
  const idList = [...ids];
  const [userRows] = await pool.query(
    `SELECT id, full_name FROM users WHERE id IN (${idList.map(() => '?').join(',')})`,
    idList
  );
  return new Map(userRows.map((row) => [Number(row.id), row.full_name || '']));
};

const getSelectedRows = async (fields, plan, { limit, cursor } = {}) => {
  const expressions = fields.map(getFieldExpression);
  const whereSql = cursor
    ? `${plan.whereSql}${plan.whereSql ? ' AND' : 'WHERE'} p.id < ?`
    : plan.whereSql;
  const params = [...plan.params];
  if (cursor) params.push(cursor);
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT p.id AS __row_id, ${expressions.join(', ')}
     ${plan.fromSql}
     ${whereSql}
     ORDER BY p.id DESC
     LIMIT ?`,
    params
  );
  return rows;
};

const getTotalCount = async (plan) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total ${plan.fromSql} ${plan.whereSql}`,
    plan.params
  );
  return Number(rows[0]?.total || 0);
};

const timestamp = () => {
  const date = new Date();
  const part = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}_${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
};

const sendError = (res, error, context) => {
  if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
  console.error(`${context}:`, error);
  if (res.headersSent) return res.destroy(error);
  return res.status(500).json({ success: false, message: 'Lỗi server khi xử lý file Excel' });
};

exports.getCatalog = async (req, res) => {
  try {
    const catalog = await loadCatalog();
    res.json({ success: true, data: catalog });
  } catch (error) {
    sendError(res, error, 'Custom Excel catalog error');
  }
};

exports.preview = async (req, res) => {
  try {
    const { catalog, fields } = await resolveSelection(req.body?.fields);
    const plan = await buildQueryPlan(req.user, req.body?.filters);
    const [rows, total] = await Promise.all([
      getSelectedRows(fields, plan, { limit: PREVIEW_LIMIT }),
      getTotalCount(plan)
    ]);
    const userMap = await loadUserLabelMap(fields, rows);
    res.json({
      success: true,
      data: {
        fields: fields.map((field) => ({ id: field.id, label: field.label })),
        rows: rows.map((row) => fields.map((field, index) => toDisplayValue(row[`f${index}`], field, userMap))),
        total,
        previewLimit: PREVIEW_LIMIT,
        dataset: catalog.dataset
      }
    });
  } catch (error) {
    sendError(res, error, 'Custom Excel preview error');
  }
};

exports.export = async (req, res) => {
  try {
    const { fields } = await resolveSelection(req.body?.fields);
    const plan = await buildQueryPlan(req.user, req.body?.filters);
    const total = await getTotalCount(plan);
    if (total > MAX_EXPORT_ROWS) {
      return res.status(413).json({
        success: false,
        message: `Có ${total.toLocaleString('vi-VN')} dòng. Hãy lọc dữ liệu xuống tối đa ${MAX_EXPORT_ROWS.toLocaleString('vi-VN')} dòng trước khi xuất.`
      });
    }

    const filename = `export_de_xuat_${timestamp()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: false
    });
    const worksheet = workbook.addWorksheet('Đề xuất');
    worksheet.columns = fields.map((field) => ({
      width: Math.min(Math.max(String(field.label).length + 4, 14), 40)
    }));
    const header = worksheet.addRow(fields.map((field) => safeCellText(field.label)));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    header.commit();
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(total + 1, 1), column: fields.length }
    };
    let cursor = null;
    let written = 0;
    while (written < total) {
      const rows = await getSelectedRows(fields, plan, { limit: QUERY_BATCH_SIZE, cursor });
      if (rows.length === 0) break;
      const userMap = await loadUserLabelMap(fields, rows);
      for (const row of rows) {
        worksheet.addRow(fields.map((field, index) => toExcelValue(row[`f${index}`], field, userMap))).commit();
      }
      written += rows.length;
      cursor = Number(rows[rows.length - 1].__row_id);
    }
    await workbook.commit();
  } catch (error) {
    sendError(res, error, 'Custom Excel export error');
  }
};
