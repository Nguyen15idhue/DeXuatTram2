const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');
const dataListService = require('./dataListService');
const addressEnrichment = require('./addressEnrichment');
const { buildColumnFilterWhere } = require('../utils/dynamicFilter');

const STATION_FIXED_COLUMNS = ['name', 'latitude', 'longitude', 'address', 'status', 'description'];

exports.getAllStations = async (search, status, page, limit, mapMode = false, extra = {}) => {
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (search) {
    const like = `%${search}%`;
    where.push('(s.name LIKE ? OR s.address LIKE ? OR s.ma_tram_gen LIKE ?)');
    params.push(like, like, like);
  }

  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }

  if (extra.moHinhTram) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.mo_hinh_tram')) = ?");
    params.push(extra.moHinhTram);
  }

  if (extra.uuTien) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.loai_uu_tien')) = ?");
    params.push(String(extra.uuTien));
  }

  if (extra.columnFilters) {
    const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
    const { clauses, params: filterParams } = buildColumnFilterWhere({
      filters: extra.columnFilters,
      fieldDefs,
      fixedColumns: STATION_FIXED_COLUMNS,
      alias: 's'
    });
    where.push(...clauses);
    params.push(...filterParams);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM stations s ${whereClause}`, params);
  const total = countResult[0].total;

  const columns = mapMode
    ? "s.id, s.name, s.latitude, s.longitude, s.address, s.status, s.description, s.created_at, s.ma_tram_gen, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.ma_tram')) AS ma_tram, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.loai_uu_tien')) AS loai_uu_tien, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.mo_hinh_tram')) AS mo_hinh_tram, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.so_luong_tru')) AS so_luong_tru, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.loai_tru_sac')) AS loai_tru_sac, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.tower_type')) AS tower_type, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.power_capacity')) AS power_capacity, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.chu_tram')) AS chu_tram, JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.sdt_chu_tram')) AS sdt_chu_tram"
    : 's.id, s.name, s.latitude, s.longitude, s.address, s.status, s.description, s.custom_data, s.created_at';

  const [stations] = await pool.query(
    `SELECT ${columns}
     FROM stations s ${whereClause} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  if (mapMode) {
    return {
      stations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  const merged = stations.map(s => dynamicUtils.mergeData(s, fieldDefs));

  return {
    stations: merged,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getStationById = async (id) => {
  const [stations] = await pool.query('SELECT * FROM stations WHERE id = ?', [id]);
  if (stations.length === 0) return null;

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  return dynamicUtils.mergeData(stations[0], fieldDefs);
};

exports.createStation = async (data) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  const { fixedData, dynamicData } = dynamicUtils.splitData('stations', data, fieldDefs);
  await addressEnrichment.enrichDynamicData({ dynamicData, fixedData }).catch(() => {});
  await dataListService.applyDiaGioi(dynamicData);

  const customData = Object.keys(dynamicData).length > 0 ? JSON.stringify(dynamicData) : null;

  const conn = await pool.getConnection();
  let recordId;
  let postResults = {};
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO stations (name, latitude, longitude, address, status, description, custom_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [fixedData.name || '', fixedData.latitude, fixedData.longitude, fixedData.address || '', fixedData.status || 'ACTIVE', fixedData.description || '', customData]
    );

    recordId = result.insertId;

    postResults = await dynamicEngineService.computePostFormulas('stations', recordId, dynamicData, null, null, { connection: conn });
    if (Object.keys(postResults).length > 0) {
      const updatedDynamic = { ...dynamicData, ...postResults };
      const updatedCustomData = JSON.stringify(updatedDynamic);
      await conn.query('UPDATE stations SET custom_data = ? WHERE id = ?', [updatedCustomData, recordId]);
    }

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw err;
  } finally {
    conn.release();
  }

  const [station] = await pool.query('SELECT * FROM stations WHERE id = ?', [recordId]);
  const finalData = dynamicUtils.mergeData(station[0], fieldDefs);
  if (Object.keys(postResults).length > 0) {
    Object.assign(finalData, postResults);
  }
  return finalData;
};

exports.updateStation = async (id, data) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('stations');
  const { fixedData, dynamicData } = dynamicUtils.splitData('stations', data, fieldDefs);
  await addressEnrichment.enrichDynamicData({ dynamicData, fixedData }).catch(() => {});
  if (dynamicData.province !== undefined && dynamicData.province !== null && String(dynamicData.province).trim() !== '') {
    await dataListService.applyDiaGioi(dynamicData);
  }

  const postKeys = new Set(fieldDefs.filter(f => {
    if (f.type !== 'formula' || !f.formula_config) return false;
    try {
      const fc = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config;
      return fc.compute_mode === 'post';
    } catch { return false; }
  }).map(f => f.key));
  Object.keys(dynamicData).forEach(k => { if (postKeys.has(k)) delete dynamicData[k]; });

  const [existing] = await pool.query('SELECT name, latitude, longitude, address, status, description, custom_data FROM stations WHERE id = ?', [id]);
  const prev = existing.length > 0 ? existing[0] : {};
  const current = prev.custom_data
    ? (typeof prev.custom_data === 'string' ? JSON.parse(prev.custom_data) : prev.custom_data)
    : {};
  const mergedDynamic = { ...current, ...dynamicData };
  const customData = Object.keys(mergedDynamic).length > 0 ? JSON.stringify(mergedDynamic) : null;
  const next = {
    name: fixedData.name !== undefined ? fixedData.name : prev.name,
    latitude: fixedData.latitude !== undefined ? fixedData.latitude : prev.latitude,
    longitude: fixedData.longitude !== undefined ? fixedData.longitude : prev.longitude,
    address: fixedData.address !== undefined ? fixedData.address : prev.address,
    status: fixedData.status !== undefined ? fixedData.status : prev.status,
    description: fixedData.description !== undefined ? fixedData.description : prev.description
  };

  await pool.query(
    'UPDATE stations SET name = ?, latitude = ?, longitude = ?, address = ?, status = ?, description = ?, custom_data = ?, updated_at = NOW() WHERE id = ?',
    [next.name, next.latitude, next.longitude, next.address || '', next.status || 'ACTIVE', next.description || '', customData, id]
  );

  const postResults = await dynamicEngineService.computePostFormulas('stations', id, mergedDynamic, null, null);
  if (Object.keys(postResults).length > 0) {
    const updatedDynamic = { ...mergedDynamic, ...postResults };
    await pool.query('UPDATE stations SET custom_data = ? WHERE id = ?', [JSON.stringify(updatedDynamic), id]);
  }
};

exports.deleteStation = async (id) => {
  await pool.query('DELETE FROM stations WHERE id = ?', [id]);
};

const parseJson = (v) => {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
};

exports.convertProposalToStation = async (proposalId, opts = {}) => {
  const proposalLifecycle = require('./proposalLifecycle');
  const notificationService = require('./notificationService');
  const geocodeService = require('./geocodeService');

  const [rows] = await pool.query('SELECT * FROM station_proposals WHERE id = ?', [proposalId]);
  if (rows.length === 0) {
    throw Object.assign(new Error('Không tìm thấy đề xuất'), { statusCode: 404 });
  }
  const p = rows[0];
  if (p.status !== 'CONTRACT_SIGNED') {
    throw Object.assign(new Error('Chỉ tạo trạm từ đề xuất ở trạng thái Ký thành công'), { statusCode: 400 });
  }
  if (p.station_id) {
    const existing = await exports.getStationById(p.station_id);
    return { station: existing, created: false };
  }

  const cd = parseJson(p.custom_data);
  const maDeXuat = cd.ma_de_xuat || p.ma_de_xuat_gen || p.tracking_code || `#${p.id}`;
  const name = String(opts.name || '').trim() || `Trạm ${maDeXuat}`;

  let address = p.address || '';
  let province = cd.province || null;
  let maTinh = cd.ma_tinh || null;
  let vungMien = cd.vung_mien || null;
  let xaPhuong = cd.xa_phuong || null;
  if (!address || !province) {
    try {
      const geo = await geocodeService.reverse(p.latitude, p.longitude);
      if (geo && geo.found) {
        if (!address && geo.address) address = geo.address;
        if (geo.admin) {
          if (!province && geo.admin.province) province = geo.admin.province;
          if (!maTinh && geo.admin.ma_tinh) maTinh = geo.admin.ma_tinh;
          if (!vungMien && geo.admin.vung_mien) vungMien = geo.admin.vung_mien;
          if (!xaPhuong && geo.admin.xa_phuong) xaPhuong = geo.admin.xa_phuong;
        }
      }
    } catch { /* silent: dung du lieu de xuat */ }
  }
  if (!province) {
    throw Object.assign(new Error('Không xác định được Tỉnh/Thành phố của đề xuất, vui lòng bổ sung trước khi tạo trạm'), { statusCode: 400 });
  }

  const station = await exports.createStation({
    name,
    latitude: p.latitude,
    longitude: p.longitude,
    address,
    status: 'DEPLOYING',
    description: `Tạo tự động từ đề xuất ${maDeXuat} (proposal #${p.id})`,
    province,
    ma_tinh: maTinh,
    vung_mien: vungMien,
    xa_phuong: xaPhuong,
    mo_hinh_tram: cd.mo_hinh_dau_tu || null
  });

  await pool.query('UPDATE station_proposals SET station_id = ?, updated_at = NOW() WHERE id = ?', [station.id, p.id]);

  try {
    await proposalLifecycle.logActivity({
      proposalId: p.id, action: 'station_created',
      fromStatus: 'CONTRACT_SIGNED', toStatus: 'CONTRACT_SIGNED',
      changedFields: { station_id: { label: 'Trạm', old: '', new: String(station.id) }, station_name: { label: 'Tên trạm', old: '', new: station.name } },
      actorId: opts.actorId || null, actorRole: opts.actorRole || null,
      source: opts.source || 'user', manualOverride: false, ip: opts.ip || null
    });
  } catch { /* silent */ }

  if (p.user_id) {
    try {
      const actorName = (opts.source === 'system_auto') ? 'Hệ thống' : await notificationService.getUserName(opts.actorId);
      await notificationService.create({
        userId: p.user_id,
        type: 'CONTRACT_SIGNED',
        title: notificationService.statusTitle('CONTRACT_SIGNED'),
        message: `Mã đề xuất: ${maDeXuat} · Đã trở thành trạm "${station.name}" (#${station.id}) · Người thực hiện: ${actorName || 'Hệ thống'}`,
        entityType: 'stations',
        entityId: station.id,
        createdBy: opts.actorId || null
      });
    } catch { /* silent */ }
  }

  return { station, created: true };
};
