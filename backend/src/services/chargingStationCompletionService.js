const pool = require('../utils/db');
const access = require('./chargingStationAccessService');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const text = value => String(value ?? '').trim();
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const idOf = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw fail('ID không hợp lệ');
  return id;
};
const noteOf = value => {
  if (value !== undefined && value !== null && typeof value !== 'string') throw fail('Ghi chú phải là văn bản');
  const note = text(value);
  if (note.length > 5000) throw fail('Ghi chú tối đa 5000 ký tự');
  return note || null;
};
const assertObject = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('Nội dung thao tác không hợp lệ');
};
const versionOf = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw fail('Thiếu phiên bản phần trụ; hãy tải lại');
  return value;
};
const dateOf = value => {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1000-01-01' || Number.isNaN(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date) throw fail('Ngày ON không hợp lệ');
  return date;
};
const reportOf = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('Thiếu hồ sơ nghiệm thu thiết bị/hạ tầng');
  if (!Array.isArray(value.image_ids) || value.image_ids.length < 2 || value.image_ids.length > 100) {
    throw fail('Mỗi bộ nghiệm thu phải có từ 2 đến 100 ảnh');
  }
  const images = value.image_ids.map(idOf);
  if (new Set(images).size !== images.length) throw fail('Ảnh nghiệm thu không được trùng trong cùng một bộ');
  const fileId = idOf(value.file_id);
  if (images.includes(fileId)) throw fail('File nghiệm thu không được sử dụng thay cho ảnh nghiệm thu');
  return { file_id: fileId, image_ids: images, note: noteOf(value.note) };
};
const documentMimes = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const validateReportFiles = async (connection, report, user, ctx, admin = false) => {
  const ids = [...new Set([report.file_id, ...report.image_ids])];
  const [files] = await connection.query("SELECT * FROM files WHERE id IN (?) AND status='active' ORDER BY id FOR SHARE", [ids]);
  if (files.length !== ids.length) throw fail('Tệp nghiệm thu không tồn tại hoặc không còn hoạt động');
  for (const file of files) {
    const valid = Number(file.id) === report.file_id
      ? documentMimes.includes(file.mime_type)
      : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mime_type);
    if (!valid) throw fail(`Định dạng tệp nghiệm thu không phù hợp: ${file.original_name}`);
    if (Number(file.size) > 10 * 1024 * 1024) throw fail('Tệp nghiệm thu tối đa 10 MB');
    if (!admin && !await require('../controllers/fileController').canAccessFile(file, { user, ip: ctx.ip })) {
      throw fail('Không có quyền sử dụng tệp nghiệm thu', 403);
    }
  }
};
const storeReports = async (connection, deploymentId, reports) => {
  for (const [kind, report] of Object.entries(reports)) {
    await connection.query(`INSERT INTO charging_station_acceptance_documents(deployment_id,kind,file_id,note)
      VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE file_id=VALUES(file_id),note=VALUES(note)`,
    [deploymentId, kind, report.file_id, report.note]);
    const [rows] = await connection.query('SELECT id FROM charging_station_acceptance_documents WHERE deployment_id=? AND kind=?',
      [deploymentId, kind]);
    const documentId = rows[0].id;
    await connection.query('DELETE FROM charging_station_acceptance_images WHERE acceptance_document_id=?', [documentId]);
    await connection.query('INSERT INTO charging_station_acceptance_images(acceptance_document_id,file_id,sort_order) VALUES ?',
      [report.image_ids.map((id, index) => [documentId, id, index])]);
  }
};
const audit = async (connection, station, portion, action, changes, user, ctx, reason, admin = false) => {
  await connection.query(`INSERT INTO charging_station_activity_logs
    (charging_station_id,action,from_status,to_status,changed_fields,reject_reason,actor_id,actor_role,source,ip)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
  [station.id, action, portion.stage, changes.stage || portion.stage,
    JSON.stringify({ deployment_id: portion.id, quantity: portion.quantity, ...changes }),
    reason || null, user.id, user.role, admin ? 'admin_override' : 'user', ctx.ip || null]);
};
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const mutate = async (stationId, body, payload, operation, user, ctx, apply) => {
  stationId = idOf(stationId);
  await access.assertSetup(user);
  await access.assertView(stationId, user);
  const requestId = text(body.request_id);
  if (!/^[\w.:-]{1,100}$/.test(requestId)) throw fail('request_id không hợp lệ');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM charging_stations WHERE id=? FOR UPDATE', [stationId]);
    const station = rows[0];
    if (!station) throw fail('Không tìm thấy ON trạm', 404);
    const [events] = await connection.query('SELECT operation,payload,result FROM charging_station_fulfillment_events WHERE charging_station_id=? AND request_id=?',
      [stationId, requestId]);
    if (events.length) {
      if (events[0].operation !== operation
        || JSON.stringify(canonical(json(events[0].payload))) !== JSON.stringify(canonical(payload))) {
        throw fail('request_id đã dùng cho nội dung khác', 409);
      }
      if (!events[0].result) throw fail('Thao tác đang được xử lý', 409);
      await connection.commit();
      return json(events[0].result);
    }
    if (station.status === 'CANCELLED' || json(station.workflow_override)?.completed) {
      throw fail('Trạm đã hủy hoặc hoàn tất bằng ghi đè; hãy điều chỉnh tại Thông tin chung', 409);
    }
    await apply(connection, station);
    const deployments = require('./chargingStationDeploymentService');
    await deployments.refreshStationProgress(connection, stationId, { ...ctx, actorId: user.id, actorRole: user.role });
    const result = await deployments.getDeployments(stationId, connection);
    await connection.query(`INSERT INTO charging_station_fulfillment_events(charging_station_id,request_id,operation,actor_id,payload,result)
      VALUES(?,?,?,?,?,?)`, [stationId, requestId, operation, user.id, JSON.stringify(payload), JSON.stringify(result)]);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};
const lockPortion = async (connection, stationId, id, version) => {
  const [rows] = await connection.query('SELECT * FROM charging_station_deployments WHERE id=? AND charging_station_id=? FOR UPDATE', [id, stationId]);
  if (!rows.length) throw fail('Phần trụ không thuộc trạm này', 409);
  if (Number(rows[0].workflow_version) !== version) throw fail('Phần trụ đã thay đổi; hãy mở lại modal', 409);
  return rows[0];
};
const updateAcceptance = async (stationId, deploymentId, body, user, ctx = {}) => {
  assertObject(body);
  const passed = body.action === 'acceptance-passed';
  if (!passed && body.action !== 'acceptance-failed') throw fail('Thao tác nghiệm thu không hợp lệ');
  const payload = { id: idOf(deploymentId), expected_version: versionOf(body.expected_version),
    action: body.action, reason: noteOf(body.reason),
    reports: passed ? { EQUIPMENT: reportOf(body.equipment), INFRASTRUCTURE: reportOf(body.infrastructure) } : null };
  if (!passed && !payload.reason) throw fail('Bắt buộc lý do nghiệm thu không đạt');
  return mutate(stationId, body, payload, 'ACCEPTANCE_UPDATE', user, ctx, async (connection, station) => {
    const portion = await lockPortion(connection, station.id, payload.id, payload.expected_version);
    if (portion.installation_status !== 'DONE' || portion.acceptance_status === 'PASSED') {
      throw fail('Phần trụ chưa lắp xong hoặc đã nghiệm thu đạt; hãy tải lại', 409);
    }
    if (passed) {
      for (const report of Object.values(payload.reports)) await validateReportFiles(connection, report, user, ctx);
      await storeReports(connection, portion.id, payload.reports);
    }
    const stage = portion.stage === 'OPERATING' ? 'OPERATING' : 'CONFIGURING';
    const sub = stage === 'OPERATING' ? 'ACTIVE' : 'NOT_CONFIGURED';
    await connection.query(`UPDATE charging_station_deployments SET acceptance_status=?,acceptance_legacy=0,
      acceptance_date=CURRENT_DATE(),acceptance_user_id=?,stage=?,sub_status=?,workflow_version=workflow_version+1 WHERE id=?`,
    [passed ? 'PASSED' : 'FAILED', user.id, stage, sub, portion.id]);
    await audit(connection, station, portion, passed ? 'portion_acceptance_passed' : 'portion_acceptance_failed',
      { stage, acceptance_status: { old: portion.acceptance_status, new: passed ? 'PASSED' : 'FAILED' },
        reports: { old: null, new: payload.reports } },
      user, ctx, payload.reason);
    await require('./chargingStationDeploymentService').notifyProgress(connection, station,
      { ...ctx, actorId: user.id, actorRole: user.role }, passed ? 'Nghiệm thu phần trụ đạt' : 'Nghiệm thu phần trụ không đạt',
      `Phần trụ #${portion.id} · ${portion.quantity} trụ. Trạng thái ON giữ nguyên.`);
  });
};
const updateOn = async (stationId, body, user, ctx = {}) => {
  assertObject(body);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 1000) throw fail('Chọn ít nhất một phần trụ để ON');
  const cms = text(body.cms_station_code);
  if (!cms || cms.length > 100) throw fail('Mã trạm trên CMS bắt buộc, tối đa 100 ký tự');
  const ids = new Set();
  const items = body.items.map(row => {
    assertObject(row);
    const id = idOf(row.id);
    if (ids.has(id)) throw fail('Phần trụ bị lặp');
    ids.add(id);
    return { id, expected_version: versionOf(row.expected_version), on_date: dateOf(row.on_date), note: noteOf(row.note) };
  }).sort((a, b) => a.id - b.id);
  const payload = { items, cms_station_code: cms, reason: noteOf(body.reason), accept_missing: body.accept_missing === true };
  return mutate(stationId, body, payload, 'ON_BATCH', user, ctx, async (connection, station) => {
    if (station.cms_station_code && station.cms_station_code !== cms) throw fail('Mã CMS khác với mã hiện tại của trạm', 409);
    for (const item of items) {
      const portion = await lockPortion(connection, station.id, item.id, item.expected_version);
      if (portion.installation_status !== 'DONE' || portion.stage === 'OPERATING') {
        throw fail('Chỉ được ON phần trụ đã lắp xong và chưa ON', 409);
      }
    }
    const [proposals] = await connection.query(`SELECT status,JSON_UNQUOTE(JSON_EXTRACT(custom_data,'$.mo_hinh_dau_tu')) AS model
      FROM station_proposals WHERE id=? FOR UPDATE`, [station.proposal_id]);
    if (!proposals.length) throw fail('Không tìm thấy đề xuất liên quan', 409);
    const deployments = require('./chargingStationDeploymentService');
    const missing = deployments.configurationMissing(station, proposals[0].model);
    if (missing.length && (!payload.accept_missing || !payload.reason)) {
      throw fail(`Còn thiếu: ${missing.join(', ')}. Cần xác nhận rủi ro và nhập lý do`);
    }
    const options = { ...ctx, actorId: user.id, actorRole: user.role, stationCode: station.ma_tram,
      reason: payload.reason || 'Xác nhận ON các phần trụ' };
    if (proposals[0].status !== 'ACTIVE') {
      const lifecycle = require('./proposalLifecycle');
      if (proposals[0].status === 'APPROVED') await lifecycle.transitionOnStationWithinTransaction(connection, station.proposal_id, 'DEPLOYING', options);
      await lifecycle.transitionOnStationWithinTransaction(connection, station.proposal_id, 'ACTIVE', options);
    }
    const [previousOn] = await connection.query("SELECT id FROM charging_station_deployments WHERE charging_station_id=? AND stage='OPERATING' LIMIT 1", [station.id]);
    if (!previousOn.length && !(station.status === 'OPERATING' && station.on_date)) {
      await connection.query('UPDATE charging_stations SET cms_station_code=?,on_date=? WHERE id=?', [cms, items[0].on_date, station.id]);
    } else if (!station.cms_station_code || !station.on_date) {
      throw fail('Trạm cũ thiếu mã CMS hoặc ngày ON; cần SUPER_ADMIN đối soát trước', 409);
    }
    for (const item of items) {
      const portion = await lockPortion(connection, station.id, item.id, item.expected_version);
      await connection.query(`UPDATE charging_station_deployments SET stage='OPERATING',sub_status='ACTIVE',
        on_date=?,on_note=?,workflow_version=workflow_version+1 WHERE id=?`, [item.on_date, item.note, item.id]);
      await audit(connection, station, portion, 'portion_complete_configuration',
        { stage: 'OPERATING', on_date: { old: portion.on_date, new: item.on_date }, on_note: item.note,
          cms_station_code: cms, missing_prerequisites: missing, accept_missing: payload.accept_missing }, user, ctx, payload.reason);
    }
    await deployments.notifyProgress(connection, station, options, 'Phần trụ đã ON',
      `${items.length} phần trụ đã ON. Các công việc nghiệm thu chưa xong vẫn cần thực hiện.`);
  });
};
const overridePortions = async (connection, station, values, user, ctx, reason) => {
  if (user.role !== 'SUPER_ADMIN') throw fail('Chỉ SUPER_ADMIN được điều chỉnh hồ sơ phần trụ', 403);
  if (!Array.isArray(values) || !values.length || values.length > 1000) throw fail('Danh sách điều chỉnh không hợp lệ');
  for (const value of values) {
    assertObject(value);
    for (const key of Object.keys(value)) {
      if (!['id', 'expected_version', 'equipment', 'infrastructure', 'on_date', 'on_note'].includes(key)) {
        throw fail(`Không được điều chỉnh trường phần trụ ${key}`);
      }
    }
  }
  const ids = new Set();
  for (const value of [...values].sort((a, b) => Number(a.id) - Number(b.id))) {
    const id = idOf(value.id);
    if (ids.has(id)) throw fail('Phần trụ điều chỉnh bị lặp');
    ids.add(id);
    const portion = await lockPortion(connection, station.id, id, versionOf(value.expected_version));
    const patch = {};
    if (value.equipment !== undefined || value.infrastructure !== undefined) {
      if (portion.acceptance_status !== 'PASSED') throw fail('Chỉ điều chỉnh hồ sơ đã nghiệm thu đạt');
      const reports = { EQUIPMENT: reportOf(value.equipment), INFRASTRUCTURE: reportOf(value.infrastructure) };
      for (const report of Object.values(reports)) await validateReportFiles(connection, report, user, ctx, true);
      const before = (await require('./chargingStationDeploymentService').getDeployments(station.id, connection))
        .find(row => Number(row.id) === id);
      await storeReports(connection, id, reports);
      patch.reports = { old: before.acceptance_reports, new: reports };
      await connection.query('UPDATE charging_station_deployments SET acceptance_legacy=0 WHERE id=?', [id]);
    }
    if (value.on_date !== undefined || value.on_note !== undefined) {
      if (portion.stage !== 'OPERATING') throw fail('Chỉ điều chỉnh ngày/ghi chú phần trụ đã ON');
      const date = dateOf(value.on_date);
      const note = noteOf(value.on_note);
      await connection.query('UPDATE charging_station_deployments SET on_date=?,on_note=? WHERE id=?', [date, note, id]);
      patch.on_date = { old: portion.on_date, new: date };
      patch.on_note = { old: portion.on_note, new: note };
    }
    if (!Object.keys(patch).length) throw fail('Không có nội dung điều chỉnh phần trụ');
    await connection.query('UPDATE charging_station_deployments SET workflow_version=workflow_version+1 WHERE id=?', [id]);
    await audit(connection, station, portion, 'portion_documents_overridden', patch, user, ctx, reason, true);
  }
};

module.exports = { updateAcceptance, updateOn, overridePortions };
