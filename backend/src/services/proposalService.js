const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');
const dataListService = require('./dataListService');
const addressEnrichment = require('./addressEnrichment');
const proximityService = require('./proximityService');

exports.getAllProposals = async () => {
  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.address, p.status, p.owner_name,
            p.created_at, p.user_id, u.parent_id AS owner_parent_id,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_uu_tien')) AS loai_uu_tien,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.ma_de_xuat')) AS ma_de_xuat,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_tru')) AS loai_tru,
            JSON_EXTRACT(p.custom_data, '$.tdt_tru') AS tdt_tru,
            JSON_EXTRACT(p.custom_data, '$.loai_tru_nq') AS loai_tru_nq,
            JSON_EXTRACT(p.custom_data, '$.loai_tru_lk') AS loai_tru_lk
     FROM station_proposals p
     LEFT JOIN users u ON p.user_id = u.id
     ORDER BY p.created_at DESC
     LIMIT 20000`
  );
  return proposals;
};

exports.getProposalById = async (id) => {
  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.address, p.status, p.owner_name,
            p.created_at, p.user_id, u.parent_id AS owner_parent_id,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) AS mo_hinh_dau_tu,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_uu_tien')) AS loai_uu_tien,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.ma_de_xuat')) AS ma_de_xuat,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.loai_tru')) AS loai_tru,
            JSON_EXTRACT(p.custom_data, '$.tdt_tru') AS tdt_tru,
            JSON_EXTRACT(p.custom_data, '$.loai_tru_nq') AS loai_tru_nq,
            JSON_EXTRACT(p.custom_data, '$.loai_tru_lk') AS loai_tru_lk
     FROM station_proposals p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [id]
  );
  if (proposals.length === 0) return null;
  return proposals[0];
};

exports.getProposalFullById = async (id) => {
  const [proposals] = await pool.query(
    `SELECT p.*, u.full_name as user_name
     FROM station_proposals p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [id]
  );
  if (proposals.length === 0) return null;
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const merged = dynamicUtils.mergeData(proposals[0], fieldDefs);
  return dynamicUtils.enrichUserFields(merged, fieldDefs);
};

exports.createProposal = async (userId, data, opts = {}) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const { fixedData, dynamicData } = dynamicUtils.splitData('station_proposals', data, fieldDefs);
  await addressEnrichment.enrichDynamicData({ dynamicData, fixedData }).catch(() => {});
  await dataListService.applyDiaGioi(dynamicData);
  await dynamicUtils.applyAutoUserFields(dynamicData, fieldDefs, userId);
  await dynamicUtils.resolveTablePrices({ ...fixedData, ...dynamicData }, dynamicData, fieldDefs).catch(() => {});

  const customDataObj = { ...dynamicData };
  const customData = Object.keys(customDataObj).length > 0 ? JSON.stringify(customDataObj) : null;

  let supplementMinutes = 4320;
  try {
    const proposalLifecycle = require('./proposalLifecycle');
    const configured = await proposalLifecycle.getDeadlineMinutes('PENDING');
    supplementMinutes = Math.max(1, Number(configured) || 4320);
  } catch { /* silent */ }

  const conn = await pool.getConnection();
  let recordId;
  let postResults = {};
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO station_proposals (user_id, tracking_code, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, custom_data, supplement_deadline_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [userId, fixedData.latitude, fixedData.longitude, fixedData.owner_name || '', fixedData.owner_phone || '', fixedData.address || '', fixedData.area || '', fixedData.land_type || '', fixedData.description || '', customData, supplementMinutes]
    );

    recordId = result.insertId;

    postResults = await dynamicEngineService.computePostFormulas('station_proposals', recordId, dynamicData, userId, null, { connection: conn });
    if (Object.keys(postResults).length > 0) {
      const updatedDynamic = { ...customDataObj, ...postResults };
      const trackingCode = postResults.ma_de_xuat || null;
      await conn.query('UPDATE station_proposals SET custom_data = ?, tracking_code = ? WHERE id = ?', [JSON.stringify(updatedDynamic), trackingCode, recordId]);
    }

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw err;
  } finally {
    conn.release();
  }

  const [proposal] = await pool.query(
    `SELECT p.*, u.full_name as user_name
     FROM station_proposals p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [recordId]
  );

  const finalData = dynamicUtils.mergeData(proposal[0], fieldDefs);
  if (Object.keys(postResults).length > 0) {
    Object.assign(finalData, postResults);
  }
  try {
    const proposalLifecycle = require('./proposalLifecycle');
    await proposalLifecycle.logActivity({
      proposalId: recordId, action: 'created',
      fromStatus: null, toStatus: 'PENDING',
      actorId: userId || null, actorRole: opts.actorRole || null,
      source: 'user', manualOverride: false, ip: opts.ip || null
    });
  } catch { /* silent: khong chan tao de xuat vi log */ }
  return finalData;
};

const normalizePhone = (phone) => String(phone || '').replace(/[^\d]/g, '');

const verifyCaptcha = async (token, ip) => {
  if (process.env.CAPTCHA_ENABLED === 'false') return true;
  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  if (!token || !secret) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip || undefined })
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
};

const maskPhone = (phone) => {
  const digits = normalizePhone(phone);
  if (digits.length < 6) return '***';
  return digits.slice(0, 2) + '***' + digits.slice(-4);
};

exports.createGuestProposal = async (data, ip) => {
  if (data && data.website) {
    const err = new Error('Dữ liệu không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  const captchaOk = await verifyCaptcha(data ? data.captcha_token : null, ip);
  if (!captchaOk) {
    const err = new Error('Xác thực captcha thất bại');
    err.statusCode = 400;
    throw err;
  }

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const { fixedData, dynamicData } = dynamicUtils.splitData('station_proposals', data, fieldDefs);

  const phone = normalizePhone(fixedData.owner_phone);
  if (phone && !/^0(3|5|7|8|9)\d{8}$/.test(phone)) {
    const err = new Error('Số điện thoại phải là số di động Việt Nam 10 chữ số');
    err.statusCode = 400;
    throw err;
  }
  fixedData.owner_phone = phone;

  if (fixedData.description && String(fixedData.description).length > 2000) {
    const err = new Error('Mô tả tối đa 2000 ký tự');
    err.statusCode = 400;
    throw err;
  }

  const lat = Number(fixedData.latitude);
  const lng = Number(fixedData.longitude);
  if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
    const err = new Error('Tọa độ không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const warnings = [];
  let nearby;
  try {
    nearby = await proximityService.checkNearby(lat, lng, 200);
  } catch (err) {
    err.statusCode = err.statusCode || 400;
    throw err;
  }
  if (nearby.is_duplicate) {
    const n = nearby.nearest;
    const who = n.kind === 'station' ? 'trạm' : 'đề xuất';
    warnings.push(`Vị trí này gần với ${who} #${n.id} (cách ${n.distance_m}m < 200m)`);
  }

  if (phone) {
    const [samePhone] = await pool.query(
      "SELECT id, latitude, longitude FROM station_proposals WHERE owner_phone = ? AND status NOT IN ('REJECTED', 'CANCELLED')",
      [phone]
    );
    for (const row of samePhone) {
      const d = proximityService.haversineM(lat, lng, Number(row.latitude), Number(row.longitude));
      if (d < 1000) {
        warnings.push('Số điện thoại này đã gửi đề xuất gần vị trí này (trong 1000m)');
        break;
      }
    }
  }

  await addressEnrichment.enrichDynamicData({ dynamicData, fixedData }).catch(() => {});
  await dataListService.applyDiaGioi(dynamicData);
  await dynamicUtils.resolveTablePrices({ ...fixedData, ...dynamicData }, dynamicData, fieldDefs).catch(() => {});

  const fileKeys = fieldDefs.filter(f => f.type === 'file' && f.source_type === 'json').map(f => f.key);
  const fileIds = [];
  fileKeys.forEach(k => {
    const v = dynamicData[k];
    const arr = Array.isArray(v) ? v : (v ? [v] : []);
    arr.forEach(f => { if (f && f.id) fileIds.push(f.id); });
  });
  if (fileIds.length > 5) {
    const err = new Error('Tối đa 5 file cho mỗi đề xuất');
    err.statusCode = 400;
    throw err;
  }
  if (fileIds.length > 0) {
    const [files] = await pool.query(
      `SELECT id, uploaded_by, submitter_ip FROM files WHERE id IN (${fileIds.map(() => '?').join(',')}) AND status = 'active'`,
      fileIds
    );
    if (files.length !== fileIds.length) {
      const err = new Error('File đính kèm không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    for (const f of files) {
      if (f.uploaded_by !== null || (f.submitter_ip && ip && f.submitter_ip !== ip)) {
        const err = new Error('File đính kèm không hợp lệ');
        err.statusCode = 400;
        throw err;
      }
    }
    const [used] = await pool.query('SELECT custom_data FROM station_proposals');
    const usedIds = new Set();
    used.forEach(r => {
      try {
        const cd = typeof r.custom_data === 'string' ? JSON.parse(r.custom_data) : (r.custom_data || {});
        fileKeys.forEach(k => {
          const v = cd[k];
          const arr = Array.isArray(v) ? v : (v ? [v] : []);
          arr.forEach(f => { if (f && f.id) usedIds.add(f.id); });
        });
      } catch { /* silent */ }
    });
    const [usedStations] = await pool.query('SELECT custom_data FROM stations');
    usedStations.forEach(r => {
      try {
        const cd = typeof r.custom_data === 'string' ? JSON.parse(r.custom_data) : (r.custom_data || {});
        Object.values(cd).forEach(v => {
          const arr = Array.isArray(v) ? v : (v ? [v] : []);
          arr.forEach(f => { if (f && f.id) usedIds.add(f.id); });
        });
      } catch { /* silent */ }
    });
    if (fileIds.some(id => usedIds.has(id))) {
      const err = new Error('File đính kèm không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
  }

  const customData = Object.keys(dynamicData).length > 0 ? JSON.stringify(dynamicData) : null;

  let guestSupplementMinutes = 4320;
  try {
    const proposalLifecycle = require('./proposalLifecycle');
    const configured = await proposalLifecycle.getDeadlineMinutes('PENDING');
    guestSupplementMinutes = Math.max(1, Number(configured) || 4320);
  } catch { /* silent */ }

  const conn = await pool.getConnection();
  let recordId;
  let postResults = {};
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO station_proposals (user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, custom_data, submission_source, tracking_code, submitter_ip, supplement_deadline_at)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'guest', NULL, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [fixedData.latitude, fixedData.longitude, fixedData.owner_name || '', phone || '', fixedData.address || '', fixedData.area || '', fixedData.land_type || '', fixedData.description || '', customData, ip || null, guestSupplementMinutes]
    );

    recordId = result.insertId;

    postResults = await dynamicEngineService.computePostFormulas('station_proposals', recordId, dynamicData, null, null, { connection: conn });
    if (Object.keys(postResults).length > 0) {
      const updatedDynamic = { ...dynamicData, ...postResults };
      const trackingCode = postResults.ma_de_xuat || null;
      await conn.query('UPDATE station_proposals SET custom_data = ?, tracking_code = ? WHERE id = ?', [JSON.stringify(updatedDynamic), trackingCode, recordId]);
    }

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw err;
  } finally {
    conn.release();
  }

  const [proposal] = await pool.query('SELECT * FROM station_proposals WHERE id = ?', [recordId]);
  const finalData = dynamicUtils.mergeData(proposal[0], fieldDefs);
  Object.assign(finalData, postResults);
  try {
    const proposalLifecycle = require('./proposalLifecycle');
    await proposalLifecycle.logActivity({
      proposalId: recordId, action: 'created',
      fromStatus: null, toStatus: 'PENDING',
      actorId: null, actorRole: null,
      source: 'user', manualOverride: false, ip: ip || null
    });
  } catch { /* silent: khong chan tao de xuat vi log */ }
  return { proposal: finalData, warnings };
};

exports.trackByCode = async (code) => {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  const [rows] = await pool.query('SELECT * FROM station_proposals WHERE tracking_code = ?', [clean]);
  if (rows.length === 0) return null;

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const merged = dynamicUtils.mergeData(rows[0], fieldDefs);
  merged.owner_phone = maskPhone(merged.owner_phone);
  delete merged.submitter_ip;
  return merged;
};
