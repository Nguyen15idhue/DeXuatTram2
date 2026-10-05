const workAutomationService = require('../services/workAutomationService');

const TICK_MS = 20000;
let started = false;

const tick = async () => {
  try {
    const out = await workAutomationService.processDueRuns();
    if (out.length > 0) console.log(`[AutomationWorker] tick: ${out.map((r) => `#${r.id}=${r.status}`).join(', ')}`);
  } catch (err) {
    console.error('[AutomationWorker] tick error:', err.message);
  }
};

exports.start = async () => {
  if (started) return;
  started = true;
  console.log(`[AutomationWorker] Worker started, polling every ${TICK_MS}ms`);
  setInterval(() => { tick().catch((err) => console.error('[AutomationWorker] tick error:', err.message)); }, TICK_MS);
};

exports.getStatus = () => ({ isRunning: started, pollInterval: TICK_MS });
