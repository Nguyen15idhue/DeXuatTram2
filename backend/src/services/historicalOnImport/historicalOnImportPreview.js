const ExcelJS = require('exceljs');
const pool = require('../../utils/db');
const { readSheet } = require('./historicalOnImportSheet');
const { validateRecord, validateExistingRecord } = require('./historicalOnImportValidation');
const { resolveIdentity, resolveOwner } = require('./historicalOnImportIdentity');
const snapshotService = require('./historicalOnImportSnapshot');
const { checkRealProgress, checkFeasibleProgress } = require('./historicalOnImportReconciliation');

const text = value => String(value ?? '').trim();
const canonical = value => text(value).toLocaleLowerCase('vi-VN');
const fail = message => Object.assign(new Error(message), { statusCode: 400 });

const loadCatalog = async (executor = pool) => {
  const [poles] = await executor.query('SELECT id, name, charging_type, power_kw FROM charging_poles ORDER BY name, id');
  const [suppliers] = await executor.query('SELECT id, name FROM suppliers ORDER BY name, id');
  return { poles, suppliers };
};

const inspectRows = (rows, { candidates, accounts, catalog, importer }) => {
  const result = [];
  const seenTargets = new Map();
  const seenPairs = new Map();
  const legacyRows = new Map();
  for (const row of rows) {
    const key = canonical(row.legacy_code);
    if (!legacyRows.has(key)) legacyRows.set(key, []);
    legacyRows.get(key).push(row);
  }
  for (const raw of rows) {
    const errors = [];
    const warnings = [];
    let identity;
    let owner;
    let record;
    try {
      identity = resolveIdentity(raw, candidates);
      if (identity.action === 'choose') errors.push('Có nhiều hồ sơ phù hợp; nhập ID đề xuất cần cập nhật');
      record = validateRecord(raw, { creating: identity.action === 'create' });
      if (identity.action !== 'update' || text(record.owner_name_system) || text(record.owner_user_id)) {
        owner = resolveOwner(record.owner_name_system, accounts, importer, record.owner_user_id);
        if (owner.action === 'choose') errors.push('Tên người đề xuất trùng; nhập ID người đề xuất cần chọn');
        if (owner.action === 'fallback' && text(record.owner_name_system)) {
          warnings.push('Không tìm thấy người đề xuất; dự kiến dùng tài khoản đang nhập');
        }
      }
      const key = `${canonical(record.legacy_code)}\0${canonical(record.cms_code)}`;
      if (seenPairs.has(key)) errors.push(`Mã BCĐX và CMS trùng dòng ${seenPairs.get(key)}`);
      else seenPairs.set(key, record.row);
      const related = legacyRows.get(canonical(record.legacy_code));
      if (related.length > 1 && related.some(item => !canonical(item.cms_code))) {
        errors.push('Mã BCĐX xuất hiện nhiều dòng có dòng thiếu mã CMS; cần đối soát');
      }
      if (identity.action === 'update') {
        const id = Number(identity.candidate.id);
        if (seenTargets.has(id)) errors.push(`Cùng cập nhật đề xuất với dòng ${seenTargets.get(id)}`);
        else seenTargets.set(id, record.row);
      }
      for (const pole of record.poles) {
        const matches = catalog.poles.filter(item => canonical(item.name) === canonical(pole.name));
        if (matches.length !== 1) errors.push(`Không xác định duy nhất loại trụ "${pole.name}" trong danh mục kho`);
        const supplier = text(pole.supplier) || 'Meter';
        const suppliers = catalog.suppliers.filter(item => canonical(item.name) === canonical(supplier));
        if (suppliers.length !== 1) errors.push(`Không xác định duy nhất nhà cung cấp "${supplier}"`);
      }
      if (record.on_date && record.delivery_date && record.on_date < record.delivery_date) {
        warnings.push('Ngày ON trước ngày giao trụ; cần kiểm tra dữ liệu lịch sử');
      }
      if (record.on_date && record.contract_date && record.on_date < record.contract_date) {
        warnings.push('Ngày ON trước ngày ký hợp đồng; cần kiểm tra dữ liệu lịch sử');
      }
      if (record.poles.some(pole => pole.on > 0) && !record.on_date) {
        warnings.push('Có trụ đã ON nhưng chưa nhập ngày ON đầu tiên');
      }
      if (['Đã nhận', 'Chờ hoàn', 'Đã hoàn'].includes(record.deposit_status)
        || ['Đang thực hiện', 'Hoàn thành'].includes(record.payment_status)) {
        warnings.push('Trạng thái tài chính không tạo giao dịch hoặc chứng từ; số tiền lịch sử không được nhập');
      }
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) throw error;
      errors.push(error.message);
    }
    result.push({
      row: raw.row,
      legacy_code: text(raw.legacy_code),
      cms_code: text(raw.cms_code),
      action: identity?.action || 'invalid',
      proposal_id: identity?.candidate?.id || null,
      candidates: (identity?.candidates || []).map(candidate => ({
        id: candidate.id, legacy_code: candidate.legacy_code, cms_code: candidate.cms_code
      })),
      owner: owner?.account ? { id: owner.account.id, full_name: owner.account.full_name } : null,
      owner_candidates: (owner?.candidates || []).map(account => ({ id: account.id, full_name: account.full_name })),
      proposal_status: record?.proposal_status || null,
      on_status: record?.on_status || null,
      poles: (record?.poles || []).map(({ model, name, supplier, proposed, committed, shipped, received, installed, accepted, on, accepted_on }) => {
        const matchingPoles = catalog.poles.filter(item => canonical(item.name) === canonical(name));
        const matchingSuppliers = catalog.suppliers.filter(item => canonical(item.name) === canonical(supplier || 'Meter'));
        return {
          model, name, supplier: supplier || 'Meter',
          pole_id: matchingPoles.length === 1 ? Number(matchingPoles[0].id) : null,
          supplier_id: matchingSuppliers.length === 1 ? Number(matchingSuppliers[0].id) : null,
          proposed, committed, shipped, received, installed, accepted, on, accepted_on
        };
      }),
      errors,
      warnings
    });
  }
  return result;
};

const readWorkbook = async buffer => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw fail('Vui lòng chọn file Excel');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw fail('Không đọc được file Excel .xlsx; hãy kiểm tra lại file');
  }
  return readSheet(workbook);
};

const preview = async (buffer, actor, executor = pool) => {
  const rows = await readWorkbook(buffer);
  if (executor !== pool) return inspectDatabaseRows(rows, actor, executor);
  const connection = await pool.getConnection();
  let started = false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    started = true;
    const result = await inspectDatabaseRows(rows, actor, connection);
    await connection.commit();
    started = false;
    return result;
  } catch (error) {
    if (started) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const inspectDatabaseRows = async (rows, actor, executor) => {
  const legacyCodes = [...new Set(rows.map(row => text(row.legacy_code)).filter(Boolean))];
  const cmsCodes = [...new Set(rows.map(row => text(row.cms_code)).filter(Boolean))];
  const clauses = [];
  const values = [];
  const codeExpr = "COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.historical_bcdx_code')), ''), p.ma_de_xuat_gen)";
  if (legacyCodes.length) { clauses.push(`${codeExpr} IN (?)`); values.push(legacyCodes); }
  if (cmsCodes.length) { clauses.push('cs.cms_station_code IN (?)'); values.push(cmsCodes); }
  let candidates = [];
  if (clauses.length) {
    [candidates] = await executor.query(
      `SELECT p.id, ${codeExpr} AS legacy_code, cs.cms_station_code AS cms_code
         FROM station_proposals p LEFT JOIN charging_stations cs ON cs.proposal_id = p.id
        WHERE ${clauses.join(' OR ')} ORDER BY p.id`, values
    );
  }
  const [accounts] = await executor.query(
    "SELECT id, full_name, role, status FROM users WHERE status = 'ACTIVE' AND role <> 'MKT' ORDER BY id"
  );
  const importer = accounts.find(account => Number(account.id) === Number(actor.id));
  if (!importer) throw Object.assign(new Error('Không tìm thấy tài khoản đang nhập'), { statusCode: 403 });
  const catalog = await loadCatalog(executor);
  const result = inspectRows(rows, { candidates, accounts, catalog, importer });
  for (const row of result) {
    if (row.errors.length) continue;
    const record = rows.find(item => item.row === row.row);
    if (row.action === 'update') {
      const snapshot = await snapshotService.capture(executor, row.proposal_id);
      try {
        validateExistingRecord(record, snapshot);
      } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) throw error;
        row.errors.push(error.message);
      }
      if (row.errors.length) continue;
      row.errors.push(...checkRealProgress(record, snapshot, catalog));
      if (!row.errors.length) row.errors.push(...checkFeasibleProgress(record, snapshot, catalog));
      row.snapshot_fingerprint = snapshotService.fingerprint(snapshot);
    } else if (row.action === 'create') {
      row.errors.push(...checkFeasibleProgress(record, null, catalog));
    }
  }
  return result;
};

module.exports = { loadCatalog, inspectRows, inspectDatabaseRows, readWorkbook, preview };
