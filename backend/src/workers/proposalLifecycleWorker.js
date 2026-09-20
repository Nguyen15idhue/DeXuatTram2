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

const deadlineNotified = async (proposalId, action, deadlineIso) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM proposal_activity_logs
      WHERE proposal_id = ? AND action = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(changed_fields, '$.deadline')) = ?`,
    [proposalId, action, deadlineIso]
  );
  return rows[0].n > 0;
};

const notifyChain = async (proposal, type, title, message) => {
  const userIds = new Set();
  if (proposal.user_id) userIds.add(Number(proposal.user_id));
  try {
    let pid = null;
    const [owner] = await pool.query('SELECT parent_id FROM users WHERE id = ?', [proposal.user_id]);
    pid = owner.length > 0 ? owner[0].parent_id : null;
    let guard = 0;
    while (pid && guard < 10) {
      guard++;
      userIds.add(Number(pid));
      const [up] = await pool.query('SELECT parent_id FROM users WHERE id = ?', [pid]);
      pid = up.length > 0 ? up[0].parent_id : null;
    }
  } catch { /* silent */ }
  try {
    const [admins] = await pool.query(`SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') AND status = 'ACTIVE'`);
    admins.forEach(a => userIds.add(Number(a.id)));
  } catch { /* silent */ }
  for (const uid of userIds) {
    if (!uid) continue;
    try {
      await notificationService.create({
        userId: uid, type, title, message,
        entityType: 'station_proposals', entityId: proposal.id, createdBy: null
      });
    } catch { /* silent */ }
  }
  try {
    await notificationService.notifyExternal(type, {
      proposal_id: proposal.id, status: proposal.status,
      deadline: proposal.supplement_deadline_at, title, message
    });
  } catch { /* silent */ }
};

const processDeadlines = async () => {
  const [rows] = await pool.query(
    `SELECT id, user_id, status, supplement_deadline_at FROM station_proposals
      WHERE status IN ('PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED')
        AND supplement_deadline_at IS NOT NULL`
  );
  let acted = 0;
  const now = Date.now();
  for (const p of rows) {
    try {
      const deadline = new Date(p.supplement_deadline_at).getTime();
      if (Number.isNaN(deadline)) continue;
      const iso = new Date(deadline).toISOString();
      const diff = deadline - now;
      if (diff > 0 && diff <= 24 * 3600 * 1000) {
        if (await deadlineNotified(p.id, 'deadline_expiring', iso)) continue;
        const left = Math.ceil(diff / 3600000);
        await notifyChain(p, 'SUPPLEMENT_EXPIRING', notificationService.statusTitle('SUPPLEMENT_EXPIRING'),
          `Đề xuất #${p.id} (${p.status}) còn khoảng ${left} giờ để bổ sung thông tin`);
        await proposalLifecycle.logActivity({
          proposalId: p.id, action: 'deadline_expiring',
          fromStatus: p.status, toStatus: p.status,
          changedFields: { deadline: iso }, source: 'system_auto'
        });
        acted++;
      } else if (diff <= 0) {
        if (await deadlineNotified(p.id, 'deadline_overdue', iso)) continue;
        await notifyChain(p, 'SUPPLEMENT_OVERDUE', notificationService.statusTitle('SUPPLEMENT_OVERDUE'),
          `Đề xuất #${p.id} (${p.status}) đã quá hạn bổ sung thông tin`);
        await proposalLifecycle.logActivity({
          proposalId: p.id, action: 'deadline_overdue',
          fromStatus: p.status, toStatus: p.status,
          changedFields: { deadline: iso }, source: 'system_auto'
        });
        acted++;
      }
    } catch (err) {
      console.error(`[LifecycleWorker] deadline #${p.id} loi: ${err.message}`);
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
    const deadlines = await processDeadlines();
    if (failed > 0 || signed > 0 || deadlines > 0) {
      console.log(`[LifecycleWorker] tick: ${failed} cancel, ${signed} station, ${deadlines} deadline`);
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
exports.processDeadlines = processDeadlines;
