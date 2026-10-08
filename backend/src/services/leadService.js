const crypto = require('crypto');
const pool = require('../utils/db');
const { isGdtt, isGdkv } = require('../constants/salesRanks');

const SYSTEM_KEYS = new Set(['id', 'journey_id', 'lead_code', 'stage', 'created_by', 'created_at', 'updated_at', 'deleted_at']);

const normalizeUserValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const raw = (typeof value === 'object') ? (value.id ?? value.user_id ?? value.value) : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const lookupProvince = async (province, conn = pool) => {
  if (!province) return null;
  const [lists] = await conn.query(
    "SELECT id FROM data_lists WHERE name IN ('Tỉnh', 'dm_tinh') ORDER BY (name = 'Tỉnh') DESC LIMIT 1"
  );
  if (lists.length === 0) return null;
  const [rows] = await conn.query(
    'SELECT `data` FROM data_list_rows WHERE list_id = ?',
    [lists[0].id]
  );
  for (const r of rows) {
    let d = r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { continue; } }
    const name = d.ten_tinh || d.tinh || '';
    if (String(name).trim() === String(province).trim()) {
      return { province_code: d.ma_tinh || null, region: d.vung_mien || null };
    }
  }
  return { notFound: true };
};

const checkWard = async (ward, province, conn = pool) => {
  if (!ward) return true;
  const [lists] = await conn.query(
    "SELECT id FROM data_lists WHERE name = 'Danh mục Phường Xã' LIMIT 1"
  );
  if (lists.length === 0) return true;
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM data_list_rows
      WHERE list_id = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.xa')) = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.tinh')) = ?`,
    [lists[0].id, String(ward).trim(), String(province).trim()]
  );
  return rows[0].c > 0;
};

const parseCustomData = (val) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

const FILTER_COLUMNS = {
  stage: 'l.stage',
  source: 'l.source',
  province: 'l.province',
  region: 'l.region',
  assigned_user_id: 'l.assigned_user_id',
  assigned_department: 'l.assigned_department',
  customer_classification: 'l.customer_classification',
  sales_outcome: 'l.sales_outcome',
};

// Scope Lead theo contract docs/8/mkt/04 §3 — WHERE clause, khong filter FE.
// Tra ve null (khong gioi han) hoac { sql, params } cho nguoi dung hien tai.
const buildScope = async (user) => {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return null;

  if (user.role === 'MKT') {
    return { sql: 'l.created_by = ?', params: [user.id] };
  }

  if (user.role === 'SALES') {
    const [rows] = await pool.query('SELECT custom_data FROM users WHERE id = ?', [user.id]);
    const cd = parseCustomData(rows[0] && rows[0].custom_data);
    const department = cd.department || '';

    if (department && isGdtt(cd.chuc_vu, department)) {
      return { sql: 'l.assigned_department = ?', params: [department] };
    }
    if (isGdkv(cd.chuc_vu, department)) {
      return { sql: 'l.assigned_user_id = ?', params: [user.id] };
    }
    // SALES khong phai GĐTT/GĐKV: khong thay lead nao (contract 04 §3)
    return { sql: '1 = 0', params: [] };
  }

  // CTV/NPP khong co quyen Lead — bi chan o middleware, khong duoc vao day
  return { sql: '1 = 0', params: [] };
};

exports.getLeads = async (query, user) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const search = String(query.search || '').trim();

  const where = ['l.deleted_at IS NULL'];
  const params = [];

  if (search) {
    where.push('(l.full_name LIKE ? OR l.phone LIKE ? OR l.lead_code LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const EMPTY_FILTER = '__empty__';
  Object.keys(FILTER_COLUMNS).forEach((key) => {
    const value = query[key];
    if (value === undefined || value === null || value === '') return;
    const col = FILTER_COLUMNS[key];
    if (value === EMPTY_FILTER) {
      if (key === 'assigned_user_id') {
        where.push(`${col} IS NULL`);
      } else {
        where.push(`(${col} IS NULL OR ${col} = '')`);
      }
      return;
    }
    where.push(`${col} = ?`);
    params.push(value);
  });

  const dateField = query.date_field === 'updated_at' ? 'l.updated_at' : 'l.created_at';
  if (query.date_from) {
    where.push(`${dateField} >= ?`);
    params.push(`${String(query.date_from).slice(0, 10)} 00:00:00`);
  }
  if (query.date_to) {
    where.push(`${dateField} <= ?`);
    params.push(`${String(query.date_to).slice(0, 10)} 23:59:59`);
  }

  const scope = await buildScope(user);
  if (scope) {
    where.push(scope.sql);
    params.push(...scope.params);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM leads l ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT l.*, j.journey_code
       FROM leads l
       JOIN business_journeys j ON j.id = l.journey_id
       ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  let enriched = rows;
  try {
    const dynamicUtils = require('./dynamicUtils');
    const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('leads');
    enriched = await dynamicUtils.enrichUserFieldsMany(rows, fieldDefs);
  } catch { /* silent */ }

  return {
    leads: enriched,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const canAccessLead = async (lead, user) => {
  if (!lead) return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
  if (user.role === 'MKT') return Number(lead.created_by) === Number(user.id);
  if (user.role === 'SALES') {
    const [rows] = await pool.query('SELECT custom_data FROM users WHERE id = ?', [user.id]);
    const cd = parseCustomData(rows[0] && rows[0].custom_data);
    const department = cd.department || '';
    if (department && isGdtt(cd.chuc_vu, department)) {
      return String(lead.assigned_department || '') === String(department);
    }
    if (isGdkv(cd.chuc_vu, department)) {
      return Number(lead.assigned_user_id) === Number(user.id);
    }
  }
  return false;
};

const getLeadRow = async (id, conn = pool) => {
  const [rows] = await conn.query(
    `SELECT l.*, j.journey_code, j.current_stage AS journey_stage
       FROM leads l
       JOIN business_journeys j ON j.id = l.journey_id
      WHERE l.id = ? AND l.deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

exports.createLead = async (data, user, opts = {}) => {
  const fullName = String(data.full_name || '').trim();
  const phone = String(data.phone || '').trim();
  if (!fullName) {
    const err = new Error('Họ tên là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  if (!/^\d{10}$/.test(phone)) {
    const err = new Error('Số điện thoại phải có đúng 10 chữ số');
    err.statusCode = 400;
    throw err;
  }
  const province = String(data.province || '').trim();
  if (!province) {
    const err = new Error('Tỉnh/Thành phố là bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const geo = await lookupProvince(province, conn);
    if (!geo || geo.notFound) {
      const err = new Error(`Tỉnh/Thành phố "${province}" không thuộc danh mục`);
      err.statusCode = 400;
      throw err;
    }
    if (data.ward && !(await checkWard(data.ward, province, conn))) {
      const err = new Error(`Phường/Xã "${data.ward}" không thuộc "${province}"`);
      err.statusCode = 400;
      throw err;
    }

    const journeyCode = crypto.randomUUID();
    const [jres] = await conn.query(
      "INSERT INTO business_journeys (journey_code, current_stage, status, started_at) VALUES (?, 'NEW', 'ACTIVE', NOW())",
      [journeyCode]
    );
    const journeyId = jres.insertId;

    const customData = {};
    ['cskh_history', 'cskh_note', 'tvbh_history', 'tvbh_note'].forEach((k) => {
      if (data[k] !== undefined) customData[k] = data[k];
    });

    const [lres] = await conn.query(
      `INSERT INTO leads (journey_id, full_name, phone, email, address, province, ward,
        province_code, region, customer_type, source, note, stage,
        customer_classification, sales_outcome, custom_data, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, NULL, ?, ?)`,
      [
        journeyId, fullName, phone,
        data.email ? String(data.email).trim() : null,
        data.address ? String(data.address).trim() : null,
        province,
        data.ward ? String(data.ward).trim() : null,
        geo.province_code, geo.region,
        data.customer_type ? String(data.customer_type).trim() : null,
        data.source ? String(data.source).trim() : null,
        data.note ? String(data.note).trim() : null,
        data.customer_classification ? String(data.customer_classification).trim() : null,
        JSON.stringify(customData),
        user.id,
      ]
    );
    const leadId = lres.insertId;
    const leadCode = `LD-${String(leadId).padStart(6, '0')}`;
    await conn.query('UPDATE leads SET lead_code = ? WHERE id = ?', [leadCode, leadId]);

    const journeyActivityService = require('./journeyActivityService');
    await journeyActivityService.log({
      journey_id: journeyId,
      entity_type: 'lead',
      entity_id: leadId,
      action: 'lead_created',
      stage_after: 'NEW',
      actor_id: user.id,
      actor_role: user.role,
      source: opts.source || 'admin',
      ip: opts.ip || null,
    }, conn);

    await conn.commit();
    return await getLeadRow(leadId);
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateLead = async (id, data, user, opts = {}) => {
  const lead = await getLeadRow(id);
  if (!lead) {
    const err = new Error('Không tìm thấy Lead');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canAccessLead(lead, user))) {
    const err = new Error('Không có quyền sửa Lead này');
    err.statusCode = 403;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const updated = await applyLeadUpdate(conn, lead, data, user, opts);
    await conn.commit();
    return updated;
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw err;
  } finally {
    conn.release();
  }
};

const applyLeadUpdate = async (conn, lead, data, user, opts = {}) => {
  const id = lead.id;

  const patch = {};
  const updatable = ['full_name', 'phone', 'email', 'address', 'province', 'ward',
    'customer_type', 'source', 'note', 'customer_classification', 'sales_outcome',
    'cskh_note', 'tvbh_note', 'cskh_history', 'tvbh_history',
    'assigned_user_id', 'assigned_department'];
  updatable.forEach((k) => {
    if (data[k] !== undefined) patch[k] = data[k];
  });

  if (patch.full_name !== undefined && !String(patch.full_name).trim()) {
    const err = new Error('Họ tên là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  if (patch.phone !== undefined) {
    const digits = String(patch.phone).replace(/[^\d]/g, '');
    if (!/^\d{10}$/.test(digits)) {
      const err = new Error('Số điện thoại phải có đúng 10 chữ số');
      err.statusCode = 400;
      throw err;
    }
    patch.phone = digits;
  }
  if (patch.assigned_user_id !== undefined) {
    const n = normalizeUserValue(patch.assigned_user_id);
    if (patch.assigned_user_id !== null && patch.assigned_user_id !== '' && n === null) {
      const err = new Error('Người phụ trách không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    patch.assigned_user_id = n;
    patch.assigned_at = n ? new Date() : null;
  }

  const province = patch.province !== undefined ? String(patch.province).trim() : lead.province;
  if (patch.province !== undefined && !province) {
    const err = new Error('Tỉnh/Thành phố là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  if (patch.province !== undefined || patch.ward !== undefined) {
    const ward = patch.ward !== undefined ? patch.ward : lead.ward;
    const geo = await lookupProvince(province, conn);
    if (!geo || geo.notFound) {
      const err = new Error(`Tỉnh/Thành phố "${province}" không thuộc danh mục`);
      err.statusCode = 400;
      throw err;
    }
    if (ward && !(await checkWard(ward, province, conn))) {
      const err = new Error(`Phường/Xã "${ward}" không thuộc "${province}"`);
      err.statusCode = 400;
      throw err;
    }
    patch.province_code = geo.province_code;
    patch.region = geo.region;
  }

  const fixedCols = ['full_name', 'phone', 'email', 'address', 'province', 'ward',
    'province_code', 'region', 'customer_type', 'source', 'note',
    'customer_classification', 'sales_outcome', 'assigned_user_id', 'assigned_department', 'assigned_at'];
  const sets = [];
  const params = [];
  fixedCols.forEach((c) => {
    if (patch[c] !== undefined) {
      sets.push(`\`${c}\` = ?`);
      params.push(typeof patch[c] === 'string' ? patch[c].trim() || null : patch[c]);
    }
  });

  const jsonKeys = ['cskh_history', 'cskh_note', 'tvbh_history', 'tvbh_note'];
  const hasJson = jsonKeys.some((k) => patch[k] !== undefined);
  let customData = {};
  if (hasJson) {
    const [rows] = await conn.query('SELECT custom_data FROM leads WHERE id = ?', [id]);
    customData = parseCustomData(rows[0] && rows[0].custom_data);
    jsonKeys.forEach((k) => { if (patch[k] !== undefined) customData[k] = patch[k]; });
    sets.push('`custom_data` = ?');
    params.push(JSON.stringify(customData));
  }

  if (sets.length > 0) {
    params.push(id);
    await conn.query(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  const journeyActivityService = require('./journeyActivityService');
  const after = await getLeadRow(id, conn);
  const changed = {};
  ['full_name', 'phone', 'email', 'address', 'province', 'ward', 'customer_type',
    'source', 'note', 'customer_classification', 'sales_outcome'].forEach((k) => {
    if (patch[k] !== undefined && String(after[k] ?? '') !== String(lead[k] ?? '')) {
      changed[k] = { from: lead[k] ?? null, to: after[k] ?? null };
    }
  });

  const beforeCd = parseCustomData(lead.custom_data);
  const afterCd = parseCustomData(after.custom_data);
  ['cskh_history', 'cskh_note', 'tvbh_history', 'tvbh_note'].forEach((k) => {
    const b = beforeCd[k] ?? null;
    const a = afterCd[k] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changed[k] = { from: b, to: a };
    }
  });

  const assigneeChanged = patch.assigned_user_id !== undefined &&
    Number(patch.assigned_user_id || 0) !== Number(lead.assigned_user_id || 0);
  if (assigneeChanged) {
    await conn.query(
      'UPDATE lead_assignments SET ended_at = NOW() WHERE lead_id = ? AND ended_at IS NULL',
      [id]
    );
    if (after.assigned_user_id) {
      await conn.query(
        `INSERT INTO lead_assignments (lead_id, assignee_user_id, assigned_department, assignment_type, assigned_by)
         VALUES (?, ?, ?, 'manual', ?)`,
        [id, after.assigned_user_id, after.assigned_department, user.id]
      );
    }
    await journeyActivityService.log({
      journey_id: lead.journey_id,
      entity_type: 'lead',
      entity_id: id,
      action: 'assigned',
      stage_before: lead.stage,
      stage_after: after.stage,
      actor_id: user.id,
      actor_role: user.role,
      source: opts.source || 'admin',
      ip: opts.ip || null,
    }, conn);
  }

  if (String(lead.customer_classification || '') !== String(after.customer_classification || '')) {
    await journeyActivityService.log({
      journey_id: lead.journey_id,
      entity_type: 'lead',
      entity_id: id,
      action: 'classification_changed',
      changed_fields: { customer_classification: { from: lead.customer_classification, to: after.customer_classification } },
      actor_id: user.id,
      actor_role: user.role,
      source: opts.source || 'admin',
      ip: opts.ip || null,
    }, conn);
  }

  if (Object.keys(changed).length > 0) {
    const stageChanged = String(lead.stage || '') !== String(after.stage || '');
    await journeyActivityService.log({
      journey_id: lead.journey_id,
      entity_type: 'lead',
      entity_id: id,
      action: stageChanged ? 'stage_changed' : 'lead_updated',
      stage_before: stageChanged ? lead.stage : undefined,
      stage_after: stageChanged ? after.stage : undefined,
      changed_fields: changed,
      actor_id: user.id,
      actor_role: user.role,
      source: opts.source || 'admin',
      ip: opts.ip || null,
    }, conn);
  }
  return after;
};

exports.deleteLead = async (id, user) => {
  const lead = await getLeadRow(id);
  if (!lead) {
    const err = new Error('Không tìm thấy Lead');
    err.statusCode = 404;
    throw err;
  }
  if (!(await canAccessLead(lead, user))) {
    const err = new Error('Không có quyền xóa Lead này');
    err.statusCode = 403;
    throw err;
  }
  const [[{ c }]] = await pool.query(
    'SELECT COUNT(*) AS c FROM station_proposals WHERE journey_id = ?',
    [lead.journey_id]
  );
  if (c > 0) {
    const err = new Error(`Lead đã có ${c} đề xuất liên kết, không thể xóa`);
    err.statusCode = 409;
    throw err;
  }
  await pool.query('UPDATE leads SET deleted_at = NOW() WHERE id = ?', [id]);
  return { id: Number(id) };
};

exports.bulkDeleteLeads = async (ids, user) => {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (list.length === 0) {
    const err = new Error('Danh sách id không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const results = [];
    for (const lid of list) {
      const [rows] = await conn.query(
        `SELECT l.*, j.journey_code FROM leads l
           JOIN business_journeys j ON j.id = l.journey_id
          WHERE l.id = ? AND l.deleted_at IS NULL LIMIT 1`,
        [lid]
      );
      const lead = rows[0];
      if (!lead) {
        const err = new Error(`Lead #${lid} không tồn tại`);
        err.statusCode = 404;
        throw err;
      }
      if (!(await canAccessLead(lead, user))) {
        const err = new Error(`Không có quyền xóa Lead #${lid}`);
        err.statusCode = 403;
        throw err;
      }
      const [[{ c }]] = await conn.query(
        'SELECT COUNT(*) AS c FROM station_proposals WHERE journey_id = ?',
        [lead.journey_id]
      );
      if (c > 0) {
        const err = new Error(`Lead #${lid} đã có ${c} đề xuất liên kết, không thể xóa`);
        err.statusCode = 409;
        throw err;
      }
      await conn.query('UPDATE leads SET deleted_at = NOW() WHERE id = ?', [lid]);
      results.push({ id: lid });
    }
    await conn.commit();
    return results;
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw err;
  } finally {
    conn.release();
  }
};

exports.getLeadDetail = async (id) => {
  const row = await getLeadRow(id);
  if (!row) return null;
  const dynamicUtils = require('./dynamicUtils');
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('leads');
  const merged = dynamicUtils.mergeData(row, fieldDefs);
  try { return await dynamicUtils.enrichUserFields(merged, fieldDefs); } catch { return merged; }
};

exports.getJourneyProposals = async (journeyId) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.status, p.station_id, p.created_at,
        JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.ma_de_xuat')) AS ma_de_xuat,
        s.id AS station_id_resolved, s.name AS station_name, s.status AS station_status,
        JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.ma_tram')) AS station_code
       FROM station_proposals p
       LEFT JOIN stations s ON s.id = p.station_id
      WHERE p.journey_id = ?
      ORDER BY p.created_at ASC, p.id ASC`,
    [journeyId]
  );
  return rows;
};

exports.getLeadById = getLeadRow;
exports.canAccessLead = canAccessLead;
exports.buildScope = buildScope;
exports.lookupProvince = lookupProvince;
exports.checkWard = checkWard;
