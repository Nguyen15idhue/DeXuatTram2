const pool = require('../utils/db');

exports.getAllViews = async (entity, status, page, limit, usage) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (entity) {
    where.push('v.entity = ?');
    params.push(entity);
  }

  if (status) {
    where.push('v.status = ?');
    params.push(status);
  }

  if (usage) {
    where.push('v.`usage` = ?');
    params.push(usage);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM views v ${whereClause}`, params);
  const total = countResult[0].total;

  const [rows] = await pool.query(
    `SELECT v.*, COUNT(vf.id) as field_count
     FROM views v
     LEFT JOIN view_fields vf ON v.id = vf.view_id
     ${whereClause}
     GROUP BY v.id
     ORDER BY v.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    views: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getViewById = async (id) => {
  const [views] = await pool.query('SELECT * FROM views WHERE id = ?', [id]);
  if (views.length === 0) return null;

  const view = views[0];

  const [fields] = await pool.query(
    `SELECT vf.*, fd.entity, fd.\`key\`, fd.label, fd.type, fd.source_type, fd.required, fd.options
     FROM view_fields vf
     JOIN field_definitions fd ON vf.field_id = fd.id
     WHERE vf.view_id = ?
     ORDER BY vf.order_index`,
    [id]
  );

  return { ...view, fields };
};

const normalizeIncludeRest = (v, fallbackUsage) => {
  if (v === undefined || v === null || v === '') {
    return fallbackUsage === 'excel_basic' ? 0 : 1;
  }
  return Number(v) ? 1 : 0;
};

const normConfig = (cfg) => {
  if (cfg === undefined) return null;
  if (cfg === null) return null;
  if (typeof cfg === 'string') return cfg.length ? cfg : null;
  return JSON.stringify(cfg);
};

// Seed cot cho view Excel "chi dung cot trong view" (include_rest = 0) de template khong bi rong.
// Uu tien sao chep tu view excel_basic chuan cua entity (neu co); neu khong thi lay cac truong bat buoc.
const seedExactViewFields = async (viewId, entity) => {
  const [std] = await pool.query(
    "SELECT id FROM views WHERE entity = ? AND `usage` = 'excel_basic' AND status = 'active' AND id <> ? ORDER BY id LIMIT 1",
    [entity, viewId]
  );
  if (std.length > 0) {
    const [srcFields] = await pool.query(
      'SELECT field_id, order_index, visible, width, sortable, filterable, config FROM view_fields WHERE view_id = ? ORDER BY order_index, id',
      [std[0].id]
    );
    if (srcFields.length > 0) {
      for (const f of srcFields) {
        await pool.query(
          'INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [viewId, f.field_id, f.order_index, f.visible, f.width, f.sortable, f.filterable, normConfig(f.config)]
        );
      }
      return srcFields.length;
    }
  }
  const [reqFields] = await pool.query(
    "SELECT id FROM field_definitions WHERE entity = ? AND status = 'active' AND `required` = 1 AND type <> 'password' ORDER BY id",
    [entity]
  );
  let idx = 0;
  for (const f of reqFields) {
    await pool.query(
      'INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config) VALUES (?, ?, ?, 1, NULL, 1, 0, NULL)',
      [viewId, f.id, idx++]
    );
  }
  return reqFields.length;
};

exports.createView = async (data) => {
  const { entity, name, description, status, usage } = data;
  const finalUsage = usage || 'table';
  const includeRest = normalizeIncludeRest(data.include_rest, finalUsage);
  const [result] = await pool.query(
    'INSERT INTO views (entity, name, description, status, `usage`, include_rest) VALUES (?, ?, ?, ?, ?, ?)',
    [entity, name, description || null, status || 'active', finalUsage, includeRest]
  );
  const viewId = result.insertId;
  // Chi seed cho view Excel "dung dung cot trong view" (include_rest = 0) de template khong rong.
  if (includeRest === 0 && /^excel/.test(finalUsage)) {
    try { await seedExactViewFields(viewId, entity); } catch (e) { console.error('seedExactViewFields error:', e.message); }
  }
  const [rows] = await pool.query('SELECT * FROM views WHERE id = ?', [viewId]);
  return rows[0];
};

exports.updateView = async (id, data) => {
  const [existing] = await pool.query('SELECT * FROM views WHERE id = ?', [id]);
  if (existing.length === 0) {
    throw Object.assign(new Error('Không tìm thấy view'), { statusCode: 404 });
  }
  const prev = existing[0];
  const next = {
    entity: data.entity !== undefined ? data.entity : prev.entity,
    name: data.name !== undefined ? data.name : prev.name,
    description: data.description !== undefined ? data.description : prev.description,
    status: data.status !== undefined ? data.status : prev.status,
    usage: data.usage !== undefined && data.usage ? data.usage : prev.usage,
    include_rest: data.include_rest !== undefined && data.include_rest !== null && data.include_rest !== ''
      ? (Number(data.include_rest) ? 1 : 0)
      : (prev.include_rest !== undefined && prev.include_rest !== null ? Number(prev.include_rest) : normalizeIncludeRest(undefined, data.usage !== undefined && data.usage ? data.usage : prev.usage))
  };
  await pool.query(
    'UPDATE views SET entity = ?, name = ?, description = ?, status = ?, `usage` = ?, include_rest = ?, updated_at = NOW() WHERE id = ?',
    [next.entity, next.name, next.description, next.status, next.usage, next.include_rest, id]
  );
  const [rows] = await pool.query('SELECT * FROM views WHERE id = ?', [id]);
  return rows[0];
};

exports.deleteView = async (id) => {
  const [rows] = await pool.query('SELECT is_locked FROM views WHERE id = ?', [id]);
  if (rows.length > 0 && rows[0].is_locked) {
    throw Object.assign(new Error('View hệ thống, không thể xóa'), { statusCode: 400 });
  }
  await pool.query('DELETE FROM views WHERE id = ?', [id]);
};

exports.getViewIdByUsage = async (entity, usage) => {
  const [rows] = await pool.query(
    'SELECT id FROM views WHERE entity = ? AND `usage` = ? AND status = ? ORDER BY id ASC LIMIT 1',
    [entity, usage, 'active']
  );
  return rows.length > 0 ? rows[0].id : null;
};
