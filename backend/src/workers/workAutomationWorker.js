const workAutomationService = require('../services/workAutomationService');

const TICK_MS = 20000;
let started = false;
let syncRunning = false;

const tickSync = async () => {
  if (syncRunning) return;
  let syncReportService;
  try {
    syncReportService = require('../services/syncReportService');
  } catch {
    return;
  }
  const pool = require('../utils/db');
  const [rows] = await pool.query(`SELECT * FROM work_automations WHERE automation_key = 'sync_process_report' AND enabled = 1 LIMIT 1`);
  if (!rows.length) return;
  const auto = rows[0];
  const freqMs = Math.max(5, parseInt(auto.frequency_min, 10) || 15) * 60 * 1000;
  if (auto.last_run_at && Date.now() - new Date(auto.last_run_at).getTime() < freqMs) return;
  syncRunning = true;
  try {
    const result = await syncReportService.runSync(auto, { trigger: 'auto' });
    const tabs = Object.keys(result.versions || {}).length;
    console.log(`[AutomationWorker] sync: ${tabs} tabs, unmapped=${(result.unmapped || []).length}`);
  } catch (err) {
    console.error('[AutomationWorker] sync error:', err.message);
    try {
      const notificationService = require('../services/notificationService');
      const [admins] = await pool.query(`SELECT id FROM users WHERE role IN ('SUPER_ADMIN','ADMIN') AND status = 'ACTIVE'`);
      for (const a of admins) {
        await notificationService.create({
          userId: a.id, type: 'AUTOMATION_FAILED', title: 'Đồng bộ Sheet thất bại',
          message: `Lý do: ${err.message}`, entityType: 'automation_run', entityId: null,
        });
      }
    } catch { /* silent */ }
  } finally {
    syncRunning = false;
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
};

exports.start = async () => {
  if (started) return;
  started = true;
  console.log(`[AutomationWorker] Worker started, polling every ${TICK_MS}ms`);
  setInterval(() => { tick().catch((err) => console.error('[AutomationWorker] tick error:', err.message)); }, TICK_MS);
};

exports.getStatus = () => ({ isRunning: started, pollInterval: TICK_MS });
