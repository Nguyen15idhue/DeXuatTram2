const pool = require('../utils/db');
const proposalReportService = require('./proposalReportService');
const chargingStationService = require('./chargingStationService');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const INVOICE_TYPES = new Set(['DEPOSIT', 'REFUND', 'PAYMENT']);
const MAX_AMOUNT = 9999999999999.99;

const toId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw err(`${label} không hợp lệ`, 400);
  return id;
};

const assertFinanceManager = async (user) => {
  const scope = await proposalReportService.resolveScope(user);
  if (!scope.isAdmin && !scope.isBackOffice) {
    throw err('Chỉ Back Office hoặc quản trị viên được quản lý tài chính ON trạm', 403);
  }
};

const listInvoices = async (stationId, user, { page = 1, limit = 20 } = {}) => {
  await assertFinanceManager(user);
  const id = toId(stationId, 'Mã trạm');
  if (!await chargingStationService.canViewChargingStation(id, user)) {
    throw err('Không có quyền xem tài chính ON trạm này', 403);
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;
  const [[countRow]] = await pool.query(
    'SELECT COUNT(*) AS total FROM charging_station_invoices WHERE charging_station_id = ?',
    [id]
  );
  const [rows] = await pool.query(
    `SELECT i.id, i.charging_station_id, i.proposal_id, i.invoice_type, i.amount,
            i.content, i.evidence_file_id, f.original_name AS evidence_file_name,
            f.mime_type AS evidence_mime_type, i.created_by, u.full_name AS creator_name,
            i.created_at, i.updated_at
       FROM charging_station_invoices i
       LEFT JOIN files f ON f.id = i.evidence_file_id
       LEFT JOIN users u ON u.id = i.created_by
      WHERE i.charging_station_id = ?
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ? OFFSET ?`,
    [id, safeLimit, offset]
  );

  const total = Number(countRow.total || 0);
  return {
    items: rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

const createInvoice = async (stationId, data = {}, user, ctx = {}) => {
  await assertFinanceManager(user);
  const id = toId(stationId, 'Mã trạm');
  if (!await chargingStationService.canViewChargingStation(id, user)) {
    throw err('Không có quyền cập nhật tài chính ON trạm này', 403);
  }

  const invoiceType = String(data.invoice_type || '').trim().toUpperCase();
  if (!INVOICE_TYPES.has(invoiceType)) throw err('Loại hóa đơn không hợp lệ', 400);
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw err('Số tiền phải lớn hơn 0 và không vượt quá giới hạn lưu trữ', 400);
  }
  const content = data.content === undefined || data.content === null
    ? null
    : String(data.content).trim() || null;
  const evidenceFileId = data.evidence_file_id === undefined || data.evidence_file_id === null || data.evidence_file_id === ''
    ? null
    : toId(data.evidence_file_id, 'Ảnh bằng chứng');

  const connection = await pool.getConnection();
  let transactionStarted = false;
  let invoiceId;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [stations] = await connection.query(
      'SELECT id, proposal_id FROM charging_stations WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!stations.length) throw err('Không tìm thấy trạm sạc', 404);

    if (evidenceFileId) {
      const [files] = await connection.query(
        "SELECT id, mime_type, uploaded_by FROM files WHERE id = ? AND status <> 'deleted'",
        [evidenceFileId]
      );
      if (!files.length) throw err('Không tìm thấy file bằng chứng', 400);
      if (Number(files[0].uploaded_by) !== Number(user.id)) {
        throw err('Chỉ được gắn file bằng chứng do chính bạn tải lên', 403);
      }
      const mimeType = String(files[0].mime_type || '').toLowerCase();
      if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
        throw err('Bằng chứng phải là ảnh hoặc PDF', 400);
      }
    }

    const proposalId = stations[0].proposal_id;
    const [result] = await connection.query(
      `INSERT INTO charging_station_invoices
        (charging_station_id, proposal_id, invoice_type, amount, content, evidence_file_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, proposalId, invoiceType, amount, content, evidenceFileId, user.id]
    );
    invoiceId = result.insertId;
    await connection.query(
      `INSERT INTO charging_station_activity_logs
        (charging_station_id, action, changed_fields, actor_id, actor_role, source, ip)
       VALUES (?, 'finance_invoice_created', ?, ?, ?, 'user', ?)`,
      [
        id,
        JSON.stringify({
          invoice_type: { label: 'Loại hóa đơn', old: '', new: invoiceType },
          amount: { label: 'Số tiền', old: '', new: String(amount) },
          content: { label: 'Nội dung', old: '', new: content || '' },
          evidence_file_id: { label: 'Ảnh bằng chứng', old: '', new: evidenceFileId ? String(evidenceFileId) : '' }
        }),
        user.id,
        user.role,
        ctx.ip || null
      ]
    );
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [rows] = await pool.query(
    `SELECT i.id, i.charging_station_id, i.proposal_id, i.invoice_type, i.amount,
            i.content, i.evidence_file_id, f.original_name AS evidence_file_name,
            f.mime_type AS evidence_mime_type, i.created_by, u.full_name AS creator_name,
            i.created_at, i.updated_at
       FROM charging_station_invoices i
       LEFT JOIN files f ON f.id = i.evidence_file_id
       LEFT JOIN users u ON u.id = i.created_by
      WHERE i.id = ?`,
    [invoiceId]
  );
  return rows[0];
};

exports.assertFinanceManager = assertFinanceManager;
exports.listInvoices = listInvoices;
exports.createInvoice = createInvoice;
