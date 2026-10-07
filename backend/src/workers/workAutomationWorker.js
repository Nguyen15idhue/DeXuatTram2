const workAutomationService = require('../services/workAutomationService');

const TICK_MS = 20000;
let started = false;
const syncRunning = new Set();

const tickSync = async () => {
  let syncReportService;
  try {
    syncReportService = require('../services/syncReportService');
  } catch {
    return;
  }
  const pool = require('../utils/db');
  const [rows] = await pool.query(`SELECT * FROM work_automations WHERE automation_type = 'sync_sheet' AND enabled = 1`);
  if (!rows.length) return;
  for (const auto of rows) {
    if (syncRunning.has(auto.id)) continue;
    const freqMs = Math.max(1, parseInt(auto.frequency_min, 10) || 15) * 60 * 1000;
    if (auto.last_run_at && Date.now() - new Date(auto.last_run_at).getTime() < freqMs) continue;
    syncRunning.add(auto.id);
    try {
      const result = await syncReportService.runSync(auto, { trigger: 'auto' });
      const tabs = Object.keys(result.versions || {}).length;
      console.log(`[AutomationWorker] sync #${auto.id} (${auto.automation_key}): ${tabs} tabs, unmapped=${(result.unmapped || []).length}`);
    } catch (err) {
      console.error(`[AutomationWorker] sync #${auto.id} error:`, err.message);
      try {
        const notificationService = require('../services/notificationService');
        const [admins] = await pool.query(`SELECT id FROM users WHERE role IN ('SUPER_ADMIN','ADMIN') AND status = 'ACTIVE'`);
        for (const a of admins) {
          await notificationService.create({
            userId: a.id, type: 'AUTOMATION_FAILED', title: `Đồng bộ Sheet thất bại (#${auto.id})`,
            message: `Lý do: ${err.message}`, entityType: 'automation_run', entityId: null,
          });
        }
      } catch { /* silent */ }
    } finally {
      syncRunning.delete(auto.id);
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
    await tickTemplateScan();
  } catch (err) {
    console.error('[AutomationWorker] template scan tick error:', err.message);
  }
};

exports.start = async () => {
  if (started) return;
  started = true;
  console.log(`[AutomationWorker] Worker started, polling every ${TICK_MS}ms`);
  setInterval(() => { tick().catch((err) => console.error('[AutomationWorker] tick error:', err.message)); }, TICK_MS);
};

exports.getStatus = () => ({ isRunning: started, pollInterval: TICK_MS });