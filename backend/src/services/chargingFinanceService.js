const pool = require('../utils/db');
const chargingStationService = require('./chargingStationService');
const readiness = require('./chargingStationReadiness');

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const INVOICE_TYPES = new Set(['DEPOSIT', 'REFUND', 'PAYMENT']);
const INVOICE_LABELS = { DEPOSIT: 'tiền cọc', REFUND: 'hoàn cọc', PAYMENT: 'thanh toán' };
const MAX_AMOUNT = 9999999999999.99;

const toId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw err(`${label} không hợp lệ`, 400);
  return id;
};

const assertFinanceManager = (user) => chargingStationService.assertFinanceManager(
  user,
  'Chỉ Phòng Tài chính, Back Office hoặc quản trị viên được quản lý tài chính ON trạm'
);

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
      `SELECT cs.id, cs.proposal_id, cs.ma_tram, cs.status, cs.sub_status, cs.deposit_status, cs.payment_status,
              JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu
         FROM charging_stations cs
         JOIN station_proposals p ON p.id = cs.proposal_id
        WHERE cs.id = ? FOR UPDATE`,
      [id]
    );
    if (!stations.length) throw err('Không tìm thấy trạm sạc', 404);
    const station = stations[0];
    const model = readiness.normalizeInvestmentModel(station.mo_hinh_dau_tu);
    if (!readiness.getFinanceRequirements(model).requiresDeposit) {
      throw err('Mô hình Tự đầu tư không thu cọc hoặc thanh toán', 400);
    }

    const [[totals]] = await connection.query(
      `SELECT COALESCE(SUM(CASE WHEN invoice_type = 'DEPOSIT' THEN amount ELSE 0 END), 0) AS deposit_total,
              COALESCE(SUM(CASE WHEN invoice_type = 'REFUND' THEN amount ELSE 0 END), 0) AS refund_total
         FROM charging_station_invoices
        WHERE charging_station_id = ?`,
      [id]
    );
    const depositTotal = Number(totals.deposit_total);
    const refundTotal = Number(totals.refund_total);
    const statusChanges = {};
    let nextDepositStatus = station.deposit_status;
    let nextPaymentStatus = station.payment_status;

    if (invoiceType === 'DEPOSIT') {
      if (['REFUND_PENDING', 'REFUNDED'].includes(station.deposit_status)) {
        throw err('Tiền cọc đã chuyển sang giai đoạn hoàn cọc, không thể ghi nhận thêm khoản cọc', 409);
      }
      nextDepositStatus = 'RECEIVED';
    } else if (invoiceType === 'PAYMENT') {
      if (!readiness.isDepositReceived(station.deposit_status)) {
        throw err('Chưa có đặt cọc. Vui lòng tạo hóa đơn cọc trước rồi mới tạo hóa đơn thanh toán', 409);
      }
      if (station.payment_status === 'NOT') nextPaymentStatus = 'DOING';
    } else {
      if (model !== 'LK') throw err('Chỉ mô hình Liên kết được hoàn cọc', 400);
      if (station.status !== 'OPERATING' || station.sub_status !== 'ACTIVE') {
        throw err('Chỉ được hoàn cọc sau khi trạm đã ON', 409);
      }
      if (!['RECEIVED', 'REFUND_PENDING'].includes(station.deposit_status)) {
        throw err('Trạm không có khoản cọc đang chờ hoàn', 409);
      }
      if (refundTotal + amount > depositTotal) {
        throw err('Số tiền hoàn vượt quá tổng tiền cọc đã nhận', 400);
      }
      nextDepositStatus = refundTotal + amount >= depositTotal ? 'REFUNDED' : 'REFUND_PENDING';
    }

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

    const proposalId = station.proposal_id;
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

    if (nextDepositStatus !== station.deposit_status) {
      statusChanges.deposit_status = {
        label: chargingStationService.FIELD_LABELS.deposit_status,
        old: station.deposit_status,
        new: nextDepositStatus
      };
    }
    if (nextPaymentStatus !== station.payment_status) {
      statusChanges.payment_status = {
        label: chargingStationService.FIELD_LABELS.payment_status,
        old: station.payment_status,
        new: nextPaymentStatus
      };
    }
    if (Object.keys(statusChanges).length > 0) {
      await connection.query(
        'UPDATE charging_stations SET deposit_status = ?, payment_status = ? WHERE id = ?',
        [nextDepositStatus, nextPaymentStatus, id]
      );
      await chargingStationService.writeActivity(connection, {
        chargingStationId: id,
        action: 'finance_status_changed',
        changedFields: statusChanges,
        reason: `Ghi nhận hóa đơn ${INVOICE_LABELS[invoiceType]}`,
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        source: 'user',
        ip: ctx.ip
      });
      await chargingStationService.advanceToDeliveryIfReady(connection, { id }, ctx);
    }
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (invoiceType === 'DEPOSIT') {
    await chargingStationService.advanceProposalToDeploying(station.proposal_id, ctx);
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
