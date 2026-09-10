const pool = require('../utils/db');

const memoryQueue = {
  pending: [],
  processing: null,
  completed: [],
  failed: []
};

exports.addJob = async (data) => {
  const {
    api_config_id, action, entity_type, entity_id,
    direction = 'push', request_payload, priority = 0, created_by, max_retries = 3
  } = data;

  const [result] = await pool.query(
    `INSERT INTO api_queue_logs
      (api_config_id, action, entity_type, entity_id, status, direction, request_payload, priority, created_by, max_retries)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      api_config_id || null,
      action,
      entity_type || 'station_proposals',
      entity_id || null,
      direction,
      request_payload ? JSON.stringify(request_payload) : null,
      priority,
      created_by || null,
      max_retries
    ]
  );

  const [rows] = await pool.query('SELECT * FROM api_queue_logs WHERE id = ?', [result.insertId]);
  const job = rows[0];

  memoryQueue.pending.push(job);
  memoryQueue.pending.sort((a, b) => b.priority - a.priority || new Date(a.created_at) - new Date(b.created_at));

  return job;
};

exports.getNextPending = async () => {
  if (memoryQueue.pending.length > 0) {
    const job = memoryQueue.pending.shift();
    memoryQueue.processing = job;
    return job;
  }

  const [rows] = await pool.query(
    `SELECT * FROM api_queue_logs WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 1`
  );

  if (rows.length === 0) return null;

  const job = rows[0];
  memoryQueue.processing = job;
  return job;
};

exports.updateStatus = async (id, status, extra = {}) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy queue job'), { statusCode: 404 });
  }

  const updates = ['status = ?', 'updated_at = NOW()'];
  const params = [status];

  if (status === 'processing') {
    updates.push('started_at = NOW()');
  }

  if (status === 'completed' || status === 'failed') {
    updates.push('completed_at = NOW()');
  }

  if (extra.response_payload !== undefined) {
    updates.push('response_payload = ?');
    params.push(JSON.stringify(extra.response_payload));
  }

  if (extra.error_message !== undefined) {
    updates.push('error_message = ?');
    params.push(extra.error_message);
  }

  if (extra.retry_count !== undefined) {
    updates.push('retry_count = ?');
    params.push(extra.retry_count);
  }

  params.push(id);
  await pool.query(`UPDATE api_queue_logs SET ${updates.join(', ')} WHERE id = ?`, params);

  if (memoryQueue.processing && memoryQueue.processing.id === id) {
    memoryQueue.processing = null;
  }

  if (status === 'completed') {
    const idx = memoryQueue.failed.findIndex(j => j.id === id);
    if (idx !== -1) memoryQueue.failed.splice(idx, 1);
    memoryQueue.completed.push({ ...existing, status });
  }

  if (status === 'failed') {
    memoryQueue.failed.push({ ...existing, status });
  }

  const [rows] = await pool.query('SELECT * FROM api_queue_logs WHERE id = ?', [id]);
  return rows[0];
};

exports.retry = async (id) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy queue job'), { statusCode: 404 });
  }

  if (existing.status !== 'failed') {
    throw Object.assign(new Error('Chỉ có thể retry job ở trạng thái failed'), { statusCode: 400 });
  }

  const newRetryCount = existing.retry_count + 1;
  if (newRetryCount > existing.max_retries) {
    throw Object.assign(new Error(`Đã vượt quá số lần retry tối đa (${existing.max_retries})`), { statusCode: 400 });
  }

  await pool.query(
    `UPDATE api_queue_logs SET status = 'pending', retry_count = ?, error_message = NULL, updated_at = NOW() WHERE id = ?`,
    [newRetryCount, id]
  );

  const [rows] = await pool.query('SELECT * FROM api_queue_logs WHERE id = ?', [id]);
  const job = rows[0];

  memoryQueue.pending.push(job);
  memoryQueue.pending.sort((a, b) => b.priority - a.priority || new Date(a.created_at) - new Date(b.created_at));

  const idx = memoryQueue.failed.findIndex(j => j.id === id);
  if (idx !== -1) memoryQueue.failed.splice(idx, 1);

  return job;
};

exports.cancel = async (id) => {
  const existing = await exports.getById(id);
  if (!existing) {
    throw Object.assign(new Error('Không tìm thấy queue job'), { statusCode: 404 });
  }

  if (!['pending', 'failed'].includes(existing.status)) {
    throw Object.assign(new Error('Chỉ có thể cancel job ở trạng thái pending hoặc failed'), { statusCode: 400 });
  }

  await pool.query(
    `UPDATE api_queue_logs SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
    [id]
  );

  const idx = memoryQueue.pending.findIndex(j => j.id === id);
  if (idx !== -1) memoryQueue.pending.splice(idx, 1);

  const [rows] = await pool.query('SELECT * FROM api_queue_logs WHERE id = ?', [id]);
  return rows[0];
};

exports.getById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM api_queue_logs WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.getAll = async (filters = {}, page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];

  if (filters.status) {
    where.push('q.status = ?');
    params.push(filters.status);
  }

  if (filters.direction) {
    where.push('q.direction = ?');
    params.push(filters.direction);
  }

  if (filters.action) {
    where.push('q.action = ?');
    params.push(filters.action);
  }

  if (filters.api_config_id) {
    where.push('q.api_config_id = ?');
    params.push(filters.api_config_id);
  }

  if (filters.entity_type) {
    where.push('q.entity_type = ?');
    params.push(filters.entity_type);
  }

  if (filters.entity_id) {
    where.push('q.entity_id = ?');
    params.push(filters.entity_id);
  }

  if (filters.created_by) {
    where.push('q.created_by = ?');
    params.push(filters.created_by);
  }

  if (filters.date_from) {
    where.push('q.created_at >= ?');
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    where.push('q.created_at <= ?');
    params.push(filters.date_to);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM api_queue_logs q ${whereClause}`, params);
  const total = countResult[0].total;

  const [rows] = await pool.query(
    `SELECT q.*, u.full_name,
            sp.custom_data->>'$.ma_de_xuat' AS ma_de_xuat
     FROM api_queue_logs q
     LEFT JOIN users u ON q.created_by = u.id
     LEFT JOIN station_proposals sp ON q.entity_type = 'station_proposals' AND q.entity_id = sp.id
     ${whereClause}
     ORDER BY q.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    jobs: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getStats = async (apiConfigId, createdBy) => {
  const conditions = [];
  const params = [];

  if (apiConfigId) {
    conditions.push('api_config_id = ?');
    params.push(apiConfigId);
  }
  if (createdBy) {
    conditions.push('created_by = ?');
    params.push(createdBy);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT status, COUNT(*) as count FROM api_queue_logs ${whereClause} GROUP BY status`,
    params
  );

  const stats = { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
  rows.forEach(row => {
    stats[row.status] = row.count;
    stats.total += row.count;
  });

  const errorWhereParts = [...conditions, 'status = ?', 'error_message IS NOT NULL', "error_message != ''"];
  const errorWhereClause = errorWhereParts.length > 0 ? 'WHERE ' + errorWhereParts.join(' AND ') : '';
  const errorParams = [...params, 'failed'];
  const [errorRows] = await pool.query(
    `SELECT error_message, COUNT(*) as count FROM api_queue_logs ${errorWhereClause} GROUP BY error_message ORDER BY count DESC LIMIT 5`,
    errorParams
  );
  stats.topErrors = errorRows.map(r => ({ message: r.error_message, count: r.count }));

  return stats;
};

exports.requeuePending = async () => {
  const [result] = await pool.query(
    `UPDATE api_queue_logs SET status = 'pending', updated_at = NOW() WHERE status = 'processing'`
  );

  const [rows] = await pool.query(
    `SELECT * FROM api_queue_logs WHERE status = 'pending' ORDER BY priority DESC, created_at ASC`
  );

  memoryQueue.pending = rows;

  return { requeued: result.affectedRows, pending: rows.length };
};

exports.getMemoryQueue = () => {
  return {
    pending: memoryQueue.pending.length,
    processing: memoryQueue.processing ? memoryQueue.processing.id : null,
    completed: memoryQueue.completed.length,
    failed: memoryQueue.failed.length
  };
};
