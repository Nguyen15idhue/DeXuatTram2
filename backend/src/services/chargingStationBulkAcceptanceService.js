const { createHash, randomUUID } = require('node:crypto');
const pool = require('../utils/db');

const OPERATION = 'BULK_ACCEPTANCE_PASS';
const BATCH_SIZE = 20;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const assertSuperAdmin = user => {
  if (user?.role !== 'SUPER_ADMIN') throw fail('Chỉ SUPER_ADMIN được nghiệm thu hàng loạt', 403);
};

const findCandidates = async (executor, stationId) => {
  const [rows] = await executor.query(`
    SELECT cs.id AS station_id, cs.ma_tram, cs.sub_status AS station_sub_status,
           d.id AS deployment_id, d.quantity, d.workflow_version, d.stage, d.acceptance_status
    FROM charging_stations cs
    LEFT JOIN charging_station_deployments d ON d.charging_station_id=cs.id
      AND d.returned_at IS NULL AND d.quantity>0
      AND d.installation_status='DONE' AND d.acceptance_status IN ('NOT','FAILED')
      AND EXISTS (
        SELECT 1 FROM warehouse_export_items i JOIN warehouse_exports e ON e.id=i.export_id
        WHERE i.id=d.export_item_id AND i.return_pending_quantity=0
          AND e.transport_status NOT IN ('RETURN_PENDING','RETURNED')
      )
    WHERE cs.status<>'CANCELLED'
      AND (d.id IS NOT NULL OR (
        cs.status='ACCEPTANCE' AND (cs.sub_status IS NULL OR cs.sub_status IN ('NOT_ACCEPTED','ACCEPT_FAILED'))
        AND cs.fulfillment_review_required=0
        AND NOT EXISTS (SELECT 1 FROM charging_station_deployments old WHERE old.charging_station_id=cs.id)
        AND NOT EXISTS (SELECT 1 FROM charging_station_commitments c WHERE c.charging_station_id=cs.id)
      ))
      ${stationId === undefined ? '' : 'AND cs.id=?'}
    ORDER BY cs.id,d.id`, stationId === undefined ? [] : [stationId]);
  const candidates = new Map();
  for (const row of rows) {
    const id = Number(row.station_id);
    if (!candidates.has(id)) candidates.set(id, {
      id, ma_tram: row.ma_tram, legacy: row.deployment_id == null,
      subStatus: row.station_sub_status, portions: [], quantity: 0
    });
    const candidate = candidates.get(id);
    if (row.deployment_id != null) {
      candidate.portions.push(row);
      candidate.quantity += Number(row.quantity);
    }
  }
  return [...candidates.values()].map(candidate => ({
    ...candidate,
    token: createHash('sha256').update(JSON.stringify([candidate.id, candidate.legacy
      ? candidate.subStatus
      : candidate.portions.map(row => [row.deployment_id, row.workflow_version, row.quantity, row.acceptance_status])
    ])).digest('hex')
  }));
};

const preview = async user => {
  assertSuperAdmin(user);
  const candidates = await findCandidates(pool);
  return {
    request_id: randomUUID(),
    batch_size: BATCH_SIZE,
    stations: candidates.map(({ id, ma_tram, legacy, token, portions, quantity }) => ({
      id, ma_tram, legacy, token, portions: portions.length, quantity
    }))
  };
};

const audit = (connection, stationId, action, from, to, changes, reason, user, ctx) =>
  connection.query(`INSERT INTO charging_station_activity_logs
    (charging_station_id,action,from_status,to_status,changed_fields,reject_reason,actor_id,actor_role,source,ip)
    VALUES(?,?,?,?,?,?,?,?,'admin_override',?)`,
  [stationId, action, from, to, JSON.stringify(changes), reason, user.id, user.role, ctx.ip || null]);

const applyStation = async (target, requestId, reason, user, ctx) => {
  const { id, token } = target;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[station]] = await connection.query('SELECT id,ma_tram FROM charging_stations WHERE id=? FOR UPDATE', [id]);
    if (!station) {
      await connection.commit();
      return { id, status: 'skipped', message: 'Không còn trạm này' };
    }
    const [[event]] = await connection.query(`SELECT operation,actor_id,payload,result
      FROM charging_station_fulfillment_events WHERE charging_station_id=? AND request_id=?`, [id, requestId]);
    if (event) {
      const saved = parse(event.payload);
      if (event.operation !== OPERATION || Number(event.actor_id) !== Number(user.id)
        || saved?.token !== token || saved?.reason !== reason) {
        throw fail('Mã yêu cầu đã được sử dụng cho nội dung khác', 409);
      }
      await connection.commit();
      return parse(event.result);
    }
    const [candidate] = await findCandidates(connection, id);
    if (!candidate || candidate.token !== token) {
      await connection.commit();
      return { id, ma_tram: station.ma_tram, status: 'skipped', message: 'Điều kiện nghiệm thu đã thay đổi; hãy xem trước lại' };
    }
    const batch = { bulk_acceptance: true, request_id: requestId };
    if (candidate.legacy) {
      await connection.query("UPDATE charging_stations SET status='CONFIGURING',sub_status='NOT_CONFIGURED' WHERE id=?", [id]);
      await audit(connection, id, 'acceptance_passed', 'ACCEPTANCE', 'CONFIGURING',
        { ...batch, sub_status: { old: candidate.subStatus, new: 'NOT_CONFIGURED' } }, reason, user, ctx);
    } else {
      for (const row of candidate.portions) {
        await connection.query(`UPDATE charging_station_deployments
          SET acceptance_status='PASSED', acceptance_date=CURRENT_DATE(), acceptance_user_id=?,
              acceptance_legacy=IF(
                (SELECT COUNT(*) FROM charging_station_acceptance_documents WHERE deployment_id=?)=2,
                acceptance_legacy, 1
              ),
              workflow_version=workflow_version+1
          WHERE id=?`, [user.id, row.deployment_id, row.deployment_id]);
        await audit(connection, id, 'portion_acceptance_passed', row.stage, row.stage, {
          ...batch, deployment_id: row.deployment_id, quantity: row.quantity,
          acceptance_status: { old: row.acceptance_status, new: 'PASSED' }, later_results_preserved: true
        }, reason, user, ctx);
      }
    }
    const result = { id, ma_tram: station.ma_tram, status: 'updated', legacy: candidate.legacy,
      portions: candidate.portions.length, quantity: candidate.quantity };
    await connection.query(`INSERT INTO charging_station_fulfillment_events
      (charging_station_id,request_id,operation,actor_id,payload,result) VALUES(?,?,?,?,?,?)`,
    [id, requestId, OPERATION, user.id, JSON.stringify({ token, reason }), JSON.stringify(result)]);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const execute = async (body, user, ctx = {}) => {
  assertSuperAdmin(user);
  const { reason, request_id: requestId, stations } = body || {};
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (cleanReason.length < 3 || cleanReason.length > 5000) throw fail('Lý do bắt buộc từ 3–5000 ký tự');
  if (typeof requestId !== 'string' || !/^[\w.:-]{1,100}$/.test(requestId)) throw fail('Mã yêu cầu không hợp lệ');
  if (!Array.isArray(stations) || !stations.length) throw fail('Không có trạm để nghiệm thu');
  if (stations.length > BATCH_SIZE) throw fail(`Mỗi yêu cầu chỉ được xử lý tối đa ${BATCH_SIZE} trạm`);
  const ids = new Set();
  for (const target of stations) {
    if (!target || !Number.isSafeInteger(target.id) || target.id < 1 || ids.has(target.id)
      || typeof target.token !== 'string' || !/^[a-f0-9]{64}$/.test(target.token)) {
      throw fail('Danh sách trạm xem trước không hợp lệ');
    }
    ids.add(target.id);
  }
  const summary = { updated: 0, skipped: 0, failed: 0, legacy: 0, portions: 0, quantity: 0, stations: [] };
  for (const target of stations) {
    if (ctx.disconnected?.()) break;
    let result;
    try {
      result = await applyStation(target, requestId, cleanReason, user, ctx);
    } catch (error) {
      if (!error.statusCode) console.error(`Bulk acceptance failed for station ${target.id}`, error);
      result = { id: target.id, status: 'failed', retryable: !error.statusCode,
        message: error.statusCode ? error.message : 'Không thể cập nhật trạm. Vui lòng thử lại.' };
    }
    ++summary[result.status];
    if (result.status === 'updated') {
      summary.legacy += Number(result.legacy);
      summary.portions += result.portions;
      summary.quantity += result.quantity;
    }
    summary.stations.push(result);
  }
  return summary;
};

module.exports = { preview, execute };
