const pool = require('../utils/db');
const readiness = require('./chargingStationReadiness');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const idOf = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw fail('ID không hợp lệ');
  return id;
};
const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const text = (value) => String(value ?? '').trim();
const ACTIONS = {
  'start-installation': { stage: 'INSTALLING', sub: ['NOT_INSTALLED'], next: 'INSTALLING', nextSub: 'INSTALLING' },
  'complete-installation': { stage: 'INSTALLING', sub: ['INSTALLING'], next: 'CONFIGURING', nextSub: 'NOT_CONFIGURED' }
};

const log = async (connection, stationId, action, before, after, ctx, reason, extra = {}) => {
  await connection.query(
    `INSERT INTO charging_station_activity_logs
      (charging_station_id, action, from_status, to_status, changed_fields, reject_reason, actor_id, actor_role, source, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [stationId, action, before, after, JSON.stringify(extra), reason || null,
      ctx.actorId || null, ctx.actorRole || null, ctx.source || 'user', ctx.ip || null]
  );
};

const notify = async (connection, station, ctx, title, details, finance = false) => {
  const [users] = await connection.query("SELECT id, role, custom_data FROM users WHERE status = 'ACTIVE'");
  const normalize = (s) => text(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  for (const user of users) {
    if (user.role === 'ADMIN') continue;
    const department = normalize((json(user.custom_data) || {}).department);
    const matches = finance
      ? department.includes('tai chinh') || department.includes('back office')
      : department.includes('setup') && department.includes('van hanh');
    if (!matches && user.role !== 'SUPER_ADMIN') continue;
    await connection.query(
      `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, is_read, created_by)
       VALUES (?, ?, ?, ?, 'charging_stations', ?, 0, ?)`,
      [user.id, finance ? 'CHARGING_STATION_REFUND_TASK' : 'CHARGING_STATION_INSTALLATION_TASK',
        title, `Mã trạm: ${station.ma_tram || `#${station.id}`} · ${details}`, station.id, ctx.actorId || null]
    );
  }
};

const getDeployments = async (stationId, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT d.id, d.charging_station_id, d.export_item_id, d.quantity, d.stage, d.sub_status,
            d.installation_status, d.installation_note, d.installation_version,
            d.acceptance_status, d.acceptance_legacy, d.acceptance_user_id, d.workflow_version, d.on_note,
            i.export_id, i.commitment_id, i.pole_id, i.supplier_id, cp.name AS pole_name, s.name AS supplier_name,
            d.acceptance_file_id, DATE_FORMAT(d.acceptance_date, '%Y-%m-%d') AS acceptance_date,
            DATE_FORMAT(d.on_date, '%Y-%m-%d') AS on_date, d.created_at, d.updated_at,
            f.original_name AS acceptance_file_name, f.mime_type AS acceptance_file_mime
       FROM charging_station_deployments d
       JOIN warehouse_export_items i ON i.id=d.export_item_id
       JOIN charging_poles cp ON cp.id=i.pole_id
       LEFT JOIN suppliers s ON s.id=i.supplier_id
       LEFT JOIN files f ON f.id = d.acceptance_file_id
      WHERE d.charging_station_id = ? ORDER BY d.id`,
    [idOf(stationId)]
  );
  if (!rows.length) return rows;
  const [documents] = await executor.query(`SELECT a.id,a.deployment_id,a.kind,a.note,a.file_id,
    f.original_name,f.mime_type FROM charging_station_acceptance_documents a
    JOIN files f ON f.id=a.file_id WHERE a.deployment_id IN (?) ORDER BY a.id`, [rows.map(row => row.id)]);
  const [images] = documents.length ? await executor.query(`SELECT i.acceptance_document_id,i.file_id AS id,
    f.original_name,f.mime_type FROM charging_station_acceptance_images i JOIN files f ON f.id=i.file_id
    WHERE i.acceptance_document_id IN (?) ORDER BY i.sort_order,i.id`, [documents.map(row => row.id)]) : [[]];
  for (const row of rows) {
    row.acceptance_reports = Object.fromEntries(documents.filter(doc => Number(doc.deployment_id) === Number(row.id)).map(doc =>
      [doc.kind, { file: { id: doc.file_id, original_name: doc.original_name, mime_type: doc.mime_type },
        note: doc.note, images: images.filter(image => Number(image.acceptance_document_id) === Number(doc.id)) }]));
  }
  return rows;
};

const refreshStationProgress = async (connection, stationId, ctx = {}) => {
  const [rows] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [idOf(stationId)]);
  if (!rows.length) throw fail('Không tìm thấy ON trạm', 404);
  const station = rows[0];
  if (station.status === 'CANCELLED') throw fail('ON trạm đã hủy', 409);
  if (json(station.workflow_override)?.completed) return station;
  const portions = await getDeployments(stationId, connection);
  if (!portions.length) return station;
  const anyOn = portions.some((portion) => portion.stage === 'OPERATING');
  const alreadyOn = station.status === 'OPERATING' && station.sub_status === 'ACTIVE';
  const order = ['INSTALLING', 'ACCEPTANCE', 'CONFIGURING', 'OPERATING'];
  const earliest = [...portions].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || a.id - b.id)[0];
  const status = anyOn || alreadyOn ? 'OPERATING' : earliest.stage;
  const sub = anyOn || alreadyOn ? 'ACTIVE' : earliest.sub_status;
  if (station.status !== status || station.sub_status !== sub) {
    await connection.query('UPDATE charging_stations SET status = ?, sub_status = ? WHERE id = ?', [status, sub, stationId]);
    await log(connection, stationId, 'deployment_progress_updated', station.status, status, ctx, null, {
      sub_status: { old: station.sub_status, new: sub }
    });
  }
  station.status = status;
  station.sub_status = sub;
  return station;
};

const configurationMissing = (station, model) => {
  const missing = [];
  if (station.contract_status !== 'DONE') missing.push('Hợp đồng');
  if (station.infra_power_status !== 'DONE') missing.push('Hạ tầng điện');
  if (station.infra_site_status !== 'DONE') missing.push('Hạ tầng mặt bằng');
  const requirements = readiness.getFinanceRequirements(model);
  if (requirements.requiresDeposit && !readiness.isDepositReceived(station.deposit_status)) missing.push('Tiền cọc');
  if (requirements.requiresPayment && !['DOING', 'DONE'].includes(station.payment_status)) missing.push('Thanh toán');
  return missing;
};

const updatePortion = async (stationId, deploymentId, body = {}, user, ctx = {}) => {
  if (['acceptance-passed', 'acceptance-failed'].includes(body?.action)) {
    return require('./chargingStationCompletionService').updateAcceptance(stationId, deploymentId, body, user, ctx);
  }
  if (body?.action === 'complete-configuration') {
    return require('./chargingStationCompletionService').updateOn(stationId, {
      ...body, items: [{ id: deploymentId, expected_version: body.expected_version, on_date: body.on_date, note: body.note }]
    }, user, ctx);
  }
  const access = require('./chargingStationAccessService');
  stationId = idOf(stationId);
  deploymentId = idOf(deploymentId);
  await access.assertSetup(user);
  await access.assertView(stationId, user);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Nội dung thao tác không hợp lệ');
  const rule = ACTIONS[body.action];
  if (!rule) throw fail('Thao tác phần trụ không hợp lệ');
  const requestId = text(body.request_id);
  if (!/^[\w.:-]{1,100}$/.test(requestId)) throw fail('request_id bắt buộc, tối đa 100 ký tự chữ, số hoặc . : - _');
  const payload = {
    deployment_id: deploymentId, action: body.action, reason: text(body.reason)
  };
  if (payload.reason.length > 5000) throw fail('Lý do tối đa 5000 ký tự');
  ctx = { ...ctx, actorId: user.id, actorRole: user.role };
  const connection = await pool.getConnection();
  let result;
  try {
    await connection.beginTransaction();
    const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [stationId]);
    if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
    const station = stations[0];
    const [events] = await connection.query(
      'SELECT operation, payload, result FROM charging_station_fulfillment_events WHERE charging_station_id = ? AND request_id = ?',
      [stationId, requestId]
    );
    if (events.length) {
      if (events[0].operation !== `DEPLOYMENT_${body.action.replace(/-/g, '_').toUpperCase()}`
        || JSON.stringify(json(events[0].payload)) !== JSON.stringify(payload)) {
        const previous = json(events[0].payload);
        if (events[0].operation !== `DEPLOYMENT_${body.action.replace(/-/g, '_').toUpperCase()}`
          || Object.keys(payload).some((key) => previous[key] !== payload[key])) {
          throw fail('request_id đã được sử dụng cho nội dung khác', 409);
        }
      }
      result = json(events[0].result);
      if (!result) throw fail('Thao tác đang được xử lý', 409);
      await connection.commit();
      return result;
    }
    if (station.status === 'CANCELLED') throw fail('ON trạm đã hủy', 409);
    if (json(station.workflow_override)?.completed) throw fail('Trạm đã hoàn tất bằng ghi đè; hãy điều chỉnh tại Thông tin chung', 409);
    const [portions] = await connection.query(
      'SELECT * FROM charging_station_deployments WHERE id = ? AND charging_station_id = ? FOR UPDATE',
      [deploymentId, stationId]
    );
    if (!portions.length) throw fail('Không tìm thấy phần trụ tại ON trạm này', 404);
    const portion = portions[0];
    if (portion.stage !== rule.stage || !rule.sub.includes(portion.sub_status)) {
      throw fail('Phần trụ không ở bước phù hợp; hãy tải lại dữ liệu', 409);
    }
    if (!(Number(portion.quantity) > 0)) throw fail('Số lượng phần trụ không hợp lệ', 409);
    await connection.query('UPDATE charging_station_deployments SET stage = ?, sub_status = ?, workflow_version=workflow_version+1 WHERE id = ?',
      [rule.next, rule.nextSub, deploymentId]);
    if (body.action.includes('installation')) {
      await connection.query('UPDATE charging_station_deployments SET installation_status=?, installation_version=installation_version+1 WHERE id=?',
        [body.action === 'start-installation' ? 'DOING' : 'DONE', deploymentId]);
    }
    await log(connection, stationId, `portion_${body.action.replace(/-/g, '_')}`, portion.stage, rule.next, ctx, payload.reason, {
      deployment_id: deploymentId, quantity: Number(portion.quantity), sub_status: { old: portion.sub_status, new: rule.nextSub },
    });
    const updatedStation = await refreshStationProgress(connection, stationId, ctx);
    await notify(connection, updatedStation, ctx, 'Cập nhật tiến độ phần trụ',
      body.action === 'complete-installation'
        ? `Phần trụ #${deploymentId} đã lắp xong. Hai việc cần thực hiện song song: Nghiệm thu và ON trạm.`
        : `Phần trụ #${deploymentId} · Số lượng: ${portion.quantity} · ${rule.next}/${rule.nextSub}`);
    const updatedPortions = await getDeployments(stationId, connection);
    result = { deployment: updatedPortions.find((p) => Number(p.id) === deploymentId), station: updatedStation };
    await connection.query(
      `INSERT INTO charging_station_fulfillment_events (charging_station_id, request_id, operation, actor_id, payload, result)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [stationId, requestId, `DEPLOYMENT_${body.action.replace(/-/g, '_').toUpperCase()}`, user.id, JSON.stringify(payload), JSON.stringify(result)]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return result;
};

const notifySetupOperations = (connection, station, ctx = {}, label = 'Trạm sạc cần lắp đặt') => (
  notify(connection, station, ctx, label, 'Đã nhận thêm phần trụ. Vui lòng xử lý lắp đặt theo số lượng đã nhận.')
);

const installationSummary = (station, items, portions, needsReview) => {
  if (json(station.workflow_override)?.completed) return 'DONE';
  const complete = !needsReview && items.length > 0 && items.every(item => {
    const installed = portions.filter(portion => Number(portion.commitment_id) === Number(item.commitment_id)
      && portion.installation_status === 'DONE').reduce((sum, portion) => sum + Number(portion.quantity), 0);
    return installed >= Number(item.committed_quantity);
  });
  if (complete) return 'DONE';
  return portions.some(portion => portion.installation_status !== 'NOT') ? 'DOING' : 'NOT';
};

const updateInstallation = async (stationId, body, user, ctx = {}) => {
  const access = require('./chargingStationAccessService');
  await access.assertSetup(user);
  await access.assertView(stationId, user);
  stationId = idOf(stationId);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 1000) throw fail('Danh sách lắp đặt không hợp lệ');
  const ids = new Set();
  const ranks = ['NOT', 'DOING', 'DONE'];
  const items = body.items.map(row => {
    const id = idOf(row.id);
    if (ids.has(id)) throw fail('Phần trụ bị lặp');
    ids.add(id);
    if (!ranks.includes(row.status) || !Number.isSafeInteger(row.expected_version) || row.expected_version < 0) throw fail('Trạng thái/phiên bản lắp đặt không hợp lệ');
    const note = text(row.note);
    if (note.length > 5000) throw fail('Ghi chú tối đa 5000 ký tự');
    return { id, status: row.status, note, expected_version: row.expected_version };
  });
  const requestId = text(body.request_id);
  if (!/^[\w.:-]{1,100}$/.test(requestId)) throw fail('request_id không hợp lệ');
  const connection = await pool.getConnection();
  ctx = { ...ctx, actorId: user.id, actorRole: user.role };
  try {
    await connection.beginTransaction();
    const [stations] = await connection.query('SELECT * FROM charging_stations WHERE id=? FOR UPDATE', [stationId]);
    const station = stations[0];
    if (!station) throw fail('Không tìm thấy ON trạm', 404);
    const [events] = await connection.query('SELECT operation,payload,result FROM charging_station_fulfillment_events WHERE charging_station_id=? AND request_id=?', [stationId, requestId]);
    if (events.length) {
      const previous = json(events[0].payload);
      if (events[0].operation !== 'INSTALLATION_BATCH' || JSON.stringify(previous) !== JSON.stringify(items)) {
        if (events[0].operation !== 'INSTALLATION_BATCH' || !Array.isArray(previous)
          || previous.length !== items.length || items.some((item, index) => Object.keys(item).some(key => item[key] !== previous[index][key]))) {
          throw fail('request_id đã dùng cho nội dung khác', 409);
        }
      }
      await connection.commit();
      return json(events[0].result);
    }
    if (station.status === 'CANCELLED') throw fail('ON trạm đã hủy', 409);
    if (json(station.workflow_override)?.completed && user.role !== 'SUPER_ADMIN') throw fail('Trạm đã hoàn tất bằng ghi đè', 409);
    const [portions] = await connection.query('SELECT * FROM charging_station_deployments WHERE charging_station_id=? AND id IN (?) ORDER BY id FOR UPDATE', [stationId, [...ids]]);
    if (portions.length !== items.length) throw fail('Phần trụ không thuộc trạm này', 409);
    for (const item of items) {
      const current = portions.find(portion => Number(portion.id) === item.id);
      if (Number(current.installation_version) !== item.expected_version) throw fail('Dữ liệu lắp đặt đã thay đổi; hãy mở lại modal', 409);
      const delta = ranks.indexOf(item.status) - ranks.indexOf(current.installation_status);
      if (user.role !== 'SUPER_ADMIN' && (delta < 0 || delta > 1)) throw fail('Chỉ được chuyển tiến từng bước lắp đặt', 403);
      if (item.status === current.installation_status && item.note === text(current.installation_note)) continue;
      const next = current.stage === 'INSTALLING'
        ? { stage: item.status === 'DONE' ? 'CONFIGURING' : 'INSTALLING',
          sub: item.status === 'DONE' ? 'NOT_CONFIGURED' : item.status === 'DOING' ? 'INSTALLING' : 'NOT_INSTALLED' }
        : { stage: current.stage, sub: current.sub_status };
      await connection.query(`UPDATE charging_station_deployments SET installation_status=?,installation_note=?,
        installation_version=installation_version+1,workflow_version=workflow_version+1,stage=?,sub_status=? WHERE id=?`,
      [item.status, item.note || null, next.stage, next.sub, item.id]);
      await log(connection, stationId, 'installation_updated', current.stage, next.stage,
        { ...ctx, source: delta < 0 || delta > 1 ? 'admin_override' : 'user' }, item.note, {
        deployment_id: item.id, installation_status: { old: current.installation_status, new: item.status },
        installation_note: { old: current.installation_note, new: item.note },
        later_results_preserved: current.stage !== 'INSTALLING'
      });
      if (item.status === 'DONE' && current.installation_status !== 'DONE') {
        await notify(connection, station, ctx, 'Nghiệm thu và ON trạm cần thực hiện',
          `Phần trụ #${item.id} đã lắp xong. Nghiệm thu và ON trạm được thực hiện song song.`);
      }
    }
    await refreshStationProgress(connection, stationId, ctx);
    const result = await getDeployments(stationId, connection);
    await connection.query(`INSERT INTO charging_station_fulfillment_events(charging_station_id,request_id,operation,actor_id,payload,result)
      VALUES(?,?,'INSTALLATION_BATCH',?,?,?)`, [stationId, requestId, user.id, JSON.stringify(items), JSON.stringify(result)]);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};

module.exports = { getDeployments, refreshStationProgress, updatePortion, notifySetupOperations, updateInstallation,
  installationSummary, configurationMissing, notifyProgress: notify };
