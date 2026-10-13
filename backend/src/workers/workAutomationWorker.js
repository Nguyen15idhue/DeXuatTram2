const workAutomationService = require('../services/workAutomationService');

const TICK_MS = 20000;
let started = false;
const syncRunning = new Set();

const tickSync = async () => {
  const pool = require('../utils/db');
  const [rows] = await pool.query(`SELECT * FROM work_automations WHERE automation_type = 'sync_sheet' AND enabled = 1`);
  if (!rows.length) return;
  for (const auto of rows) {
    if (syncRunning.has(auto.id)) continue;
    const freqMs = Math.max(1, parseInt(auto.frequency_min, 10) || 15) * 60 * 1000;
    if (auto.last_run_at && Date.now() - new Date(auto.last_run_at).getTime() < freqMs) continue;
    if (await workAutomationService.hasActiveSyncRun(auto.id)) continue;
    try {
      await workAutomationService.createSyncRun({ automationId: auto.id, trigger: 'auto' });
      await pool.query('UPDATE work_automations SET last_run_at = NOW() WHERE id = ?', [auto.id]);
      console.log(`[AutomationWorker] queued sync #${auto.id} (${auto.automation_key})`);
    } catch (err) {
      console.error(`[AutomationWorker] queue sync #${auto.id} error:`, err.message);
    }
  }
};

const tickPendingSyncRuns = async () => {
  let syncReportService;
  try {
    syncReportService = require('../services/syncReportService');
  } catch {
    return;
  }
  const pool = require('../utils/db');
  const [runs] = await pool.query(
    `SELECT * FROM work_automation_runs WHERE action = 'sync_to_sheet' AND status = 'pending' ORDER BY id ASC LIMIT 5`
  );
  for (const run of runs) {
    if (syncRunning.has(run.automation_id)) continue;
    syncRunning.add(run.automation_id);
    try {
      const [arows] = await pool.query('SELECT * FROM work_automations WHERE id = ?', [run.automation_id]);
      const auto = arows.length ? arows[0] : null;
      if (!auto) {
        await workAutomationService.finishRun(run.id, { status: 'failed', error: 'Khong tim thay automation', finished_at: new Date() });
        continue;
      }
      let reqJson = run.request_json;
      if (typeof reqJson === 'string') { try { reqJson = JSON.parse(reqJson); } catch { reqJson = {}; } }
      const version = reqJson && reqJson.version && reqJson.version !== 'all' ? reqJson.version : undefined;
      await workAutomationService.finishRun(run.id, { status: 'running', attempt: (run.attempt || 0) + 1, started_at: run.started_at || new Date() });
      console.log(`[AutomationWorker] run sync #${run.id} (${auto.automation_key}, ${run.trigger})`);
      const result = await syncReportService.runSync(auto, { version, trigger: run.trigger || 'manual', runId: run.id });
      const tabs = Object.keys(result.versions || {}).length;
      console.log(`[AutomationWorker] done sync #${run.id}: ${tabs} tabs, unmapped=${(result.unmapped || []).length}, failed=${(result.failed || []).length}`);
    } catch (err) {
      console.error(`[AutomationWorker] sync #${run.id} error:`, err.message);
      await workAutomationService.finishRun(run.id, { status: 'failed', error: err.message, finished_at: new Date() });
      try {
        const notificationService = require('../services/notificationService');
        const [admins] = await pool.query(`SELECT id FROM users WHERE role IN ('SUPER_ADMIN','ADMIN') AND status = 'ACTIVE'`);
        for (const a of admins) {
          await notificationService.create({
            userId: a.id, type: 'AUTOMATION_FAILED', title: `Đồng bộ Sheet thất bại (#${run.automation_id})`,
            message: `Lý do: ${err.message}`, entityType: 'automation_run', entityId: run.id,
          });
        }
      } catch { /* silent */ }
    } finally {
      syncRunning.delete(run.automation_id);
    }
  }
};

const tickTemplateScan = async () => {
  let syncReportService;
  try {
    syncReportService = require('../services/syncReportService');
  } catch {
    return;
  }
  const pool = require('../utils/db');
  const [rows] = await pool.query(`SELECT * FROM work_automations WHERE automation_type = 'sync_sheet' AND enabled = 1`);
  for (const auto of rows) {
    const hours = Math.max(1, parseInt(auto.template_scan_hours, 10) || 24);
    const scanMs = hours * 60 * 60 * 1000;
    if (auto.last_template_scan_at && Date.now() - new Date(auto.last_template_scan_at).getTime() < scanMs) continue;
    try {
      console.log(`[AutomationWorker] template scan #${auto.id} (${auto.automation_key})`);
      let tpl = null;
      try {
        const v = auto.template_process_ids ? (typeof auto.template_process_ids === 'string' ? JSON.parse(auto.template_process_ids) : auto.template_process_ids) : [];
        if (Array.isArray(v) && v.length > 0) tpl = v.map((x) => String(x));
      } catch { tpl = null; }
      await syncReportService.refreshFieldTrees(auto, tpl);
      await pool.query('UPDATE work_automations SET last_template_scan_at = NOW() WHERE id = ?', [auto.id]);
      console.log(`[AutomationWorker] template scan #${auto.id} done`);
    } catch (err) {
      console.error(`[AutomationWorker] template scan #${auto.id} error:`, err.message);
    }
  }
};

const tick = async () => {
  try {
    const out = await workAutomationService.processDueRuns();
    if (out.length > 0) console.log(`[AutomationWorker] tick: ${out.map((r) => `#${r.id}=${r.status}`).join(', ')}`);
  } catch (err) {
    console.error('[AutomationWorker] tick error:', err.message);
  }
  try {
    await tickSync();
  } catch (err) {
    console.error('[AutomationWorker] sync tick error:', err.message);
  }
  try {
    await tickPendingSyncRuns();
  } catch (err) {
    console.error('[AutomationWorker] pending sync error:', err.message);
  }
  try {
    await tickTemplateScan();
  } catch (err) {
    console.error('[AutomationWorker] template scan tick error:', err.message);
  }
};

exports.start = async () => {
  if (started) return;
  started = true;
  try {
    const n = await workAutomationService.resetStaleSyncRuns();
    if (n > 0) console.log(`[AutomationWorker] reset ${n} sync run dang do`);
  } catch { /* silent */ }
  console.log(`[AutomationWorker] Worker started, polling every ${TICK_MS}ms`);
  setInterval(() => { tick().catch((err) => console.error('[AutomationWorker] tick error:', err.message)); }, TICK_MS);
};

exports.getStatus = () => ({ isRunning: started, pollInterval: TICK_MS });