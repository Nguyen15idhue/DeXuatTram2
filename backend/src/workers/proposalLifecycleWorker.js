const pool = require('../utils/db');
const cronMatcher = require('../utils/cronMatcher');
const proposalLifecycle = require('../services/proposalLifecycle');
const stationService = require('../services/stationService');
const notificationService = require('../services/notificationService');

const TICK_MS = 60 * 1000;
let running = false;
let lastRunMinute = null;

const minuteKey = (d) =>
  `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;

const getConfig = async () => {
  const [rows] = await pool.query('SELECT `key`, `value` FROM proposal_lifecycle_configs');
  const m = {};
  rows.forEach(r => { m[r.key] = r.value; });
  return {
    signedDays: Number(m.contract_signed_to_station_days) || 90,
    failedDays: Number(m.contract_failed_to_cancel_days) || 30,
    maxRetries: Number(m.lifecycle_max_retries) || 5,
    cron: String(m.lifecycle_check_cron || '*/5 * * * *').trim()
  };
};

const notifyAdmins = async (title, message, proposalId) => {
  const [admins] = await pool.query(
    `SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') AND status = 'ACTIVE'`
  );
  for (const a of admins) {
    try {
      await notificationService.create({
        userId: a.id,
        type: 'AUTO_FAILED',
        title,
        message,
        entityType: 'station_proposals',
        entityId: proposalId,
        createdBy: null
      });
    } catch { /* silent */ }
  }
};

const autoFailCount = async (proposalId, from, to) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM proposal_activity_logs
     WHERE proposal_id = ? AND action = 'auto_failed' AND from_status = ? AND to_status = ?
       AND (changed_fields IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(changed_fields, '$.final')) IS NULL)`,
    [proposalId, from, to]
  );
  return rows[0].n;
};

const finalNoticeSent = async (proposalId, from, to) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM proposal_activity_logs
     WHERE proposal_id = ? AND action = 'auto_failed' AND from_status = ? AND to_status = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(changed_fields, '$.final')) = 'true'`,
    [proposalId, from, to]
  );
  return rows[0].n > 0;
};

const recordAutoFail = async (proposal, from, to, error, maxRetries, describe) => {
  const fails = await autoFailCount(proposal.id, from, to);
  if (fails + 1 >= maxRetries) {
    const alreadyNotified = await finalNoticeSent(proposal.id, from, to);
    await proposalLifecycle.logActivity({
      proposalId: proposal.id, action: 'auto_failed',
      fromStatus: from, toStatus: to,
      changedFields: { final: true, error: String(error && error.message ? error.message : error) },
      reason: `Tự động ${describe} thất bại ${fails + 1} lần — cần kiểm tra thủ công`,
      source: 'system_auto'
    });
    if (!alreadyNotified) {
      await notifyAdmins(
        'Tác vụ tự động thất bại',
        `Đề xuất #${proposal.id}: tự động ${describe} thất bại ${fails + 1} lần. Vui lòng kiểm tra thủ công.`,
        proposal.id
      );
    }
  } else {
    await proposalLifecycle.logActivity({
      proposalId: proposal.id, action: 'auto_failed',
      fromStatus: from, toStatus: to,
      changedFields: { attempt: fails + 1, error: String(error && error.message ? error.message : error) },
      source: 'system_auto'
    });
  }
};

const exhausted = async (proposalId, from, to, maxRetries) => {
  if (await finalNoticeSent(proposalId, from, to)) return true;
  const n = await autoFailCount(proposalId, from, to);
  return n >= maxRetries;
};

const processFailed = async (cfg) => {
  const [rows] = await pool.query(
    `SELECT id, user_id FROM station_proposals
     WHERE status = 'CONTRACT_FAILED' AND updated_at <= (NOW() - INTERVAL ? DAY)`,
    [cfg.failedDays]
  );
  let acted = 0;
  for (const p of rows) {
    try {
      if (await exhausted(p.id, 'CONTRACT_FAILED', 'CANCELLED', cfg.maxRetries)) continue;
      await proposalLifecycle.transition(p.id, 'CANCELLED', {
        reason: `Tự động hủy sau ${cfg.failedDays} ngày ký thất bại`,
        source: 'system_auto'
      });
      acted++;
      console.log(`[LifecycleWorker] auto-cancel proposal #${p.id}`);
    } catch (err) {
      console.error(`[LifecycleWorker] auto-cancel #${p.id} loi: ${err.message}`);
      try {
        await recordAutoFail(p, 'CONTRACT_FAILED', 'CANCELLED', err, cfg.maxRetries, 'hủy');
      } catch (e) {
        console.error(`[LifecycleWorker] recordAutoFail #${p.id} loi: ${e.message}`);
      }
    }
  }
  return acted;
};

const processSigned = async (cfg) => {
  const [rows] = await pool.query(
    `SELECT id, user_id FROM station_proposals
     WHERE status = 'CONTRACT_SIGNED' AND station_id IS NULL AND updated_at <= (NOW() - INTERVAL ? DAY)`,
    [cfg.signedDays]
  );
  let acted = 0;
  for (const p of rows) {
    try {
      if (await exhausted(p.id, 'CONTRACT_SIGNED', 'CONTRACT_SIGNED', cfg.maxRetries)) continue;
      const { station, created } = await stationService.convertProposalToStation(p.id, { source: 'system_auto' });
      if (created) {
        acted++;
        console.log(`[LifecycleWorker] auto-create station #${station.id} from proposal #${p.id}`);
      }
    } catch (err) {
      console.error(`[LifecycleWorker] auto-create station from #${p.id} loi: ${err.message}`);
      try {
        await recordAutoFail(p, 'CONTRACT_SIGNED', 'CONTRACT_SIGNED', err, cfg.maxRetries, 'tạo trạm');
      } catch (e) {
        console.error(`[LifecycleWorker] recordAutoFail #${p.id} loi: ${e.message}`);
      }
    }
  }
  return acted;
};

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const cfg = await getConfig();
    if (!cronMatcher.validate(cfg.cron)) {
      console.warn(`[LifecycleWorker] cron khong hop le: "${cfg.cron}"`);
      return;
    }
    const now = new Date();
    if (!cronMatcher.matches(cfg.cron, now)) return;
    const key = minuteKey(now);
    if (lastRunMinute === key) return;
    lastRunMinute = key;
    const failed = await processFailed(cfg);
    const signed = await processSigned(cfg);
    if (failed > 0 || signed > 0) {
      console.log(`[LifecycleWorker] tick: ${failed} cancel, ${signed} station`);
    }
  } catch (err) {
    console.error('[LifecycleWorker] tick error:', err.message);
  } finally {
    running = false;
  }
};

exports.start = async () => {
  await tick();
  setInterval(() => { tick().catch((err) => console.error('[LifecycleWorker] tick error:', err.message)); }, TICK_MS);
};

exports.tick = tick;
exports.processFailed = processFailed;
exports.processSigned = processSigned;
