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
const dateOf = (value) => {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date || date < '1000-01-01') {
    throw fail('Ngày ON không hợp lệ (YYYY-MM-DD)');
  }
  return date;
};
const ACTIONS = {
  'start-installation': { stage: 'INSTALLING', sub: ['NOT_INSTALLED'], next: 'INSTALLING', nextSub: 'INSTALLING' },
  'complete-installation': { stage: 'INSTALLING', sub: ['INSTALLING'], next: 'ACCEPTANCE', nextSub: 'NOT_ACCEPTED' },
  'acceptance-failed': { stage: 'ACCEPTANCE', sub: ['NOT_ACCEPTED', 'ACCEPT_FAILED'], next: 'ACCEPTANCE', nextSub: 'ACCEPT_FAILED' },
  'acceptance-passed': { stage: 'ACCEPTANCE', sub: ['NOT_ACCEPTED', 'ACCEPT_FAILED'], next: 'CONFIGURING', nextSub: 'NOT_CONFIGURED' },
  'complete-configuration': { stage: 'CONFIGURING', sub: ['NOT_CONFIGURED'], next: 'OPERATING', nextSub: 'ACTIVE' }
};

const log = async (connection, stationId, action, before, after, ctx, reason, extra = {}) => {
  await connection.query(
    `INSERT INTO charging_station_activity_logs
      (charging_station_id, action, from_status, to_status, changed_fields, reject_reason, actor_id, actor_role, source, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?)`,
    [stationId, action, before, after, JSON.stringify(extra), reason || null,
      ctx.actorId || null, ctx.actorRole || null, ctx.ip || null]
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
            d.acceptance_file_id, DATE_FORMAT(d.acceptance_date, '%Y-%m-%d') AS acceptance_date,
            DATE_FORMAT(d.on_date, '%Y-%m-%d') AS on_date, d.created_at, d.updated_at,
            f.original_name AS acceptance_file_name, f.mime_type AS acceptance_file_mime
       FROM charging_station_deployments d
       LEFT JOIN files f ON f.id = d.acceptance_file_id
      WHERE d.charging_station_id = ? ORDER BY d.id`,
    [idOf(stationId)]
  );
  return rows;
};

const refreshStationProgress = async (connection, stationId, ctx = {}) => {
  const [rows] = await connection.query('SELECT * FROM charging_stations WHERE id = ? FOR UPDATE', [idOf(stationId)]);
  if (!rows.length) throw fail('Không tìm thấy ON trạm', 404);
  const station = rows[0];
  if (station.status === 'CANCELLED') throw fail('ON trạm đã hủy', 409);
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
  const [proposals] = await connection.query(
    "SELECT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_dau_tu')) AS model FROM station_proposals WHERE id = ?",
    [station.proposal_id]
  );
  if (anyOn && !Number(station.fulfillment_review_required) && station.deposit_status === 'RECEIVED'
    && readiness.normalizeInvestmentModel(proposals[0]?.model) === 'LK') {
    const [commitments] = await connection.query(
      `SELECT c.id, c.quantity, COALESCE(SUM(CASE WHEN d.stage = 'OPERATING' THEN d.quantity ELSE 0 END), 0) AS operating_quantity
         FROM charging_station_commitments c
         LEFT JOIN warehouse_export_items i ON i.commitment_id = c.id
         LEFT JOIN charging_station_deployments d ON d.export_item_id = i.id AND d.charging_station_id = c.charging_station_id
        WHERE c.charging_station_id = ? GROUP BY c.id, c.quantity`,
      [stationId]
    );
    if (commitments.length && commitments.every((c) => Number(c.operating_quantity) >= Number(c.quantity))) {
      await connection.query("UPDATE charging_stations SET deposit_status = 'REFUND_PENDING' WHERE id = ? AND deposit_status = 'RECEIVED'", [stationId]);
      await log(connection, stationId, 'deployment_refund_requested', status, status, ctx, null, {
        deposit_status: { old: 'RECEIVED', new: 'REFUND_PENDING' }
      });
      station.deposit_status = 'REFUND_PENDING';
      await notify(connection, station, ctx, 'Đã ON toàn bộ trụ — cần hoàn cọc', 'Toàn bộ số lượng trụ cam kết đã hoạt động.', true);
    }
  }
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
    deployment_id: deploymentId, action: body.action, reason: text(body.reason),
    acceptance_file_id: body.action === 'acceptance-passed' ? idOf(body.acceptance_file_id) : null,
    cms_station_code: body.action === 'complete-configuration' ? text(body.cms_station_code) : null,
    on_date: body.action === 'complete-configuration' ? dateOf(body.on_date) : null,
    accept_missing: body.accept_missing === true
  };
  if (payload.reason.length > 5000) throw fail('Lý do tối đa 5000 ký tự');
  if (body.action === 'acceptance-failed' && !payload.reason) throw fail('Bắt buộc nhập lý do nghiệm thu không đạt');
  if (body.action === 'complete-configuration' && (!payload.cms_station_code || payload.cms_station_code.length > 100)) {
    throw fail('Mã trạm CMS bắt buộc và tối đa 100 ký tự');
  }
  ctx = { ...ctx, actorId: user.id, actorRole: user.role };
  const connection = await pool.getConnection();
  let result;
  let missingPrerequisites = [];
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
    const [portions] = await connection.query(
      'SELECT * FROM charging_station_deployments WHERE id = ? AND charging_station_id = ? FOR UPDATE',
      [deploymentId, stationId]
    );
    if (!portions.length) throw fail('Không tìm thấy phần trụ tại ON trạm này', 404);
    const portion = portions[0];
    if (body.action === 'complete-configuration' && station.cms_station_code
      && station.cms_station_code !== payload.cms_station_code) throw fail('Mã CMS khác với mã đã ON của trạm', 409);
    if (portion.stage !== rule.stage || !rule.sub.includes(portion.sub_status)) {
      throw fail('Phần trụ không ở bước phù hợp; hãy tải lại dữ liệu', 409);
    }
    if (!(Number(portion.quantity) > 0)) throw fail('Số lượng phần trụ không hợp lệ', 409);
    if (body.action === 'acceptance-passed') {
      const [files] = await connection.query('SELECT * FROM files WHERE id = ? FOR UPDATE', [payload.acceptance_file_id]);
      const file = files[0];
      if (!file || file.status !== 'active' || file.mime_type !== 'application/pdf') throw fail('Biên bản nghiệm thu phải là tệp PDF đang hoạt động');
      if (Number(file.uploaded_by) !== Number(user.id)
        || !await require('../controllers/fileController').canAccessFile(file, { user, ip: ctx.ip })) {
        throw fail('Biên bản nghiệm thu phải do bạn tải lên và có quyền truy cập', 403);
      }
      await connection.query(
        'UPDATE charging_station_deployments SET acceptance_file_id = ?, acceptance_date = CURRENT_DATE() WHERE id = ?',
        [file.id, deploymentId]
      );
    }
    if (body.action === 'complete-configuration') {
      const [proposals] = await connection.query(
        "SELECT status, JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_dau_tu')) AS model FROM station_proposals WHERE id = ? FOR UPDATE",
        [station.proposal_id]
      );
      if (!proposals.length) throw fail('Không tìm thấy đề xuất liên quan', 409);
      missingPrerequisites = configurationMissing(station, proposals[0].model);
      if (missingPrerequisites.length && (!payload.accept_missing || !payload.reason)) {
        throw fail(`Còn thiếu: ${missingPrerequisites.join(', ')}. Cần xác nhận accept_missing=true và nhập lý do`, 400);
      }
      if (proposals[0].status !== 'ACTIVE') {
        const lifecycle = require('./proposalLifecycle');
        const options = { ...ctx, stationCode: station.ma_tram, reason: payload.reason || `ON phần trụ #${deploymentId}` };
        if (proposals[0].status === 'APPROVED') {
          await lifecycle.transitionOnStationWithinTransaction(connection, station.proposal_id, 'DEPLOYING', options);
        }
        await lifecycle.transitionOnStationWithinTransaction(connection, station.proposal_id, 'ACTIVE', options);
      }
      const alreadyOn = station.status === 'OPERATING' && station.sub_status === 'ACTIVE';
      if (!alreadyOn) {
        await connection.query('UPDATE charging_stations SET cms_station_code = ?, on_date = ? WHERE id = ?',
          [payload.cms_station_code, payload.on_date, stationId]);
      } else if (!station.cms_station_code || !station.on_date) {
        throw fail('Trạm cũ thiếu mã CMS hoặc ngày ON; cần quản trị viên đối soát trước', 409);
      }
    }
    await connection.query('UPDATE charging_station_deployments SET stage = ?, sub_status = ?, on_date = COALESCE(?, on_date) WHERE id = ?',
      [rule.next, rule.nextSub, payload.on_date, deploymentId]);
    await log(connection, stationId, `portion_${body.action.replace(/-/g, '_')}`, portion.stage, rule.next, ctx, payload.reason, {
      deployment_id: deploymentId, quantity: Number(portion.quantity), sub_status: { old: portion.sub_status, new: rule.nextSub },
      acceptance_file_id: payload.acceptance_file_id, on_date: payload.on_date,
      cms_station_code: payload.cms_station_code, accept_missing: payload.accept_missing,
      missing_prerequisites: missingPrerequisites
    });
    const updatedStation = await refreshStationProgress(connection, stationId, ctx);
    await notify(connection, updatedStation, ctx, rule.next === 'OPERATING' ? 'Phần trụ đã ON' : 'Cập nhật tiến độ phần trụ',
      `Phần trụ #${deploymentId} · Số lượng: ${portion.quantity} · ${rule.next}/${rule.nextSub}`);
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

module.exports = { getDeployments, refreshStationProgress, updatePortion, notifySetupOperations };
