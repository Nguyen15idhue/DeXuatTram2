const pool = require('../utils/db');

const MAX_DETAIL_ROWS = 2000;
const MAX_SUCCESS_IDS = 5000;
const STUCK_MS = 30 * 60 * 1000;

const parseJson = (val, fallback) => {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val;
  if (val === '') return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
};

const parseRowsText = (val) => parseJson(val, []);

function toPublic(job) {
  if (!job) return null;
  const failedRows = parseRowsText(job.failed_rows);
  const pendingRows = parseRowsText(job.pending_rows);
  return {
    ...job,
    params: parseJson(job.params, {}),
    columns: parseJson(job.columns, []),
    rows: undefined,
    failed_rows: failedRows,
    pending_rows: pendingRows,
    success_ids: parseJson(job.success_ids, []),
    warn_details: parseJson(job.warn_details, [])
  };
}

exports.MAX_DETAIL_ROWS = MAX_DETAIL_ROWS;
exports.MAX_SUCCESS_IDS = MAX_SUCCESS_IDS;

exports.create = async ({ id, entity, rows, params, fileName, columns, createdBy }) => {
  const total = Array.isArray(rows) ? rows.length : 0;
  await pool.query(
    `INSERT INTO import_jobs (id, entity, status, total, params, file_name, columns, \`rows\`, created_by)
     VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      String(id),
      entity,
      total,
      params ? JSON.stringify(params) : null,
      fileName || null,
      columns ? JSON.stringify(columns) : null,
      JSON.stringify(rows || []),
      createdBy || null
    ]
  );
  return exports.getById(String(id));
};

exports.getById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM import_jobs WHERE id = ?', [String(id)]);
  if (rows.length === 0) return null;
  const job = toPublic(rows[0]);
  delete job.rows;
  return job;
};

exports.getByIdScoped = async (id, user) => {
  const job = await exports.getById(id);
  if (!job) return null;
  if (user && user.role === 'SALES' && Number(job.created_by) !== Number(user.id)) {
    const err = new Error('Không có quyền xem job này');
    err.statusCode = 403;
    throw err;
  }
  return job;
};

exports.getRows = async (id) => {
  const [rows] = await pool.query('SELECT `rows` FROM import_jobs WHERE id = ?', [String(id)]);
  if (rows.length === 0) return null;
  return parseRowsText(rows[0].rows);
};

exports.claimNext = async () => {
  const [res] = await pool.query(
    `UPDATE import_jobs SET status = 'processing', started_at = NOW(), updated_at = NOW()
     WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
  );
  if (res.affectedRows === 0) return null;
  const [rows] = await pool.query(
    `SELECT * FROM import_jobs WHERE status = 'processing' ORDER BY started_at DESC LIMIT 1`
  );
  return rows.length > 0 ? rows[0] : null;
};

exports.touchProgress = async (id, { done, imported, failed }) => {
  await pool.query(
    `UPDATE import_jobs SET done = ?, imported = ?, failed = ?, updated_at = NOW() WHERE id = ?`,
    [done, imported, failed, String(id)]
  );
};

exports.finish = async (id, result) => {
  const {
    status, imported, failed, pending,
    failedRows, failedTruncated, pendingRows, pendingTruncated,
    successIds, warnDetails, error
  } = result;
  const limitedFailed = Array.isArray(failedRows) ? failedRows.slice(0, MAX_DETAIL_ROWS) : [];
  const limitedPending = Array.isArray(pendingRows) ? pendingRows.slice(0, MAX_DETAIL_ROWS) : [];
  const limitedSuccess = Array.isArray(successIds) ? successIds.slice(0, MAX_SUCCESS_IDS) : [];
  await pool.query(
    `UPDATE import_jobs
     SET status = ?, done = total, imported = ?, failed = ?, pending = ?,
         failed_rows = ?, failed_truncated = ?, pending_rows = ?, pending_truncated = ?,
         success_ids = ?, warn_details = ?, error_message = ?,
         finished_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [
      status,
      imported || 0,
      failed || 0,
      pending || 0,
      JSON.stringify(limitedFailed),
      failedTruncated ? 1 : 0,
      JSON.stringify(limitedPending),
      pendingTruncated ? 1 : 0,
      JSON.stringify(limitedSuccess),
      warnDetails ? JSON.stringify(warnDetails) : null,
      error ? String(error).slice(0, 2000) : null,
      String(id)
    ]
  );
  return exports.getById(String(id));
};

exports.cancel = async (id, user) => {
  const job = await exports.getByIdScoped(id, user);
  if (!job) {
    const err = new Error('Không tìm thấy job import');
    err.statusCode = 404;
    throw err;
  }
  if (user && user.role !== 'SUPER_ADMIN' && Number(job.created_by) !== Number(user.id)) {
    const err = new Error('Không có quyền hủy job này');
    err.statusCode = 403;
    throw err;
  }
  if (!['queued', 'processing'].includes(job.status)) {
    const err = new Error('Chỉ hủy được job đang chờ hoặc đang chạy');
    err.statusCode = 400;
    throw err;
  }
  if (job.status === 'queued') {
    const rows = await exports.getRows(id);
    const pendingRows = (rows || []).map((r) => ({ rowNumber: r.rowNumber || '?', data: { ...(r.fixedData || {}), ...(r.dynamicData || {}) } }));
    await exports.finish(id, {
      status: 'cancelled',
      imported: 0,
      failed: 0,
      pending: (rows || []).length,
      failedRows: [],
      failedTruncated: false,
      pendingRows: pendingRows.slice(0, MAX_DETAIL_ROWS),
      pendingTruncated: pendingRows.length > MAX_DETAIL_ROWS,
      successIds: [],
      warnDetails: [],
      error: null
    });
  } else {
    await pool.query(`UPDATE import_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = ?`, [String(id)]);
  }
  return exports.getById(String(id));
};

exports.isCancelled = async (id) => {
  const [rows] = await pool.query('SELECT status FROM import_jobs WHERE id = ?', [String(id)]);
  return rows.length > 0 && rows[0].status === 'cancelled';
};

exports.requeueStuck = async () => {
  const [res] = await pool.query(
    `UPDATE import_jobs SET status = 'queued', started_at = NULL, updated_at = NOW()
     WHERE status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
  );
  return { requeued: res.affectedRows || 0 };
};

exports.listScoped = async (filters = {}, page = 1, limit = 20, user) => {
  const where = [];
  const params = [];
  if (user && user.role === 'SALES') {
    where.push('j.created_by = ?');
    params.push(user.id);
  } else if (filters.created_by) {
    where.push('j.created_by = ?');
    params.push(filters.created_by);
  }
  if (filters.entity) {
    where.push('j.entity = ?');
    params.push(filters.entity);
  }
  if (filters.status) {
    where.push('j.status = ?');
    params.push(filters.status);
  }
  if (filters.date_from) {
    where.push('j.created_at >= ?');
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    where.push('j.created_at <= ?');
    params.push(filters.date_to);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM import_jobs j ${whereClause}`, params);
  const total = countRows[0].total;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;
  const [rows] = await pool.query(
    `SELECT j.*, u.full_name FROM import_jobs j LEFT JOIN users u ON u.id = j.created_by
     ${whereClause} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );
  const data = rows.map((r) => {
    const job = toPublic(r);
    job.failed_rows = undefined;
    job.pending_rows = undefined;
    return job;
  });
  return { data, pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) } };
};

exports.cleanupOld = async () => {
  await pool.query(
    `UPDATE import_jobs
     SET \`rows\` = NULL, failed_rows = NULL, pending_rows = NULL, success_ids = NULL
     WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
       AND (\`rows\` IS NOT NULL OR failed_rows IS NOT NULL OR pending_rows IS NOT NULL OR success_ids IS NOT NULL)`
  );
  const [res] = await pool.query(`DELETE FROM import_jobs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)`);
  return { deleted: res.affectedRows || 0 };
};

exports.STUCK_MS = STUCK_MS;
