const crmFullSyncService = require('../services/crmFullSyncService');

let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const result = await crmFullSyncService.processNextRun();
    if (result.processed) {
      console.log(`[CrmFullSyncWorker] finished run #${result.runId}`);
    }
  } catch (error) {
    console.error('[CrmFullSyncWorker] tick failed:', error.message);
  } finally {
    running = false;
  }
};

exports.start = async () => {
  if (timer) return;
  const pollMs = 3000;
  timer = setInterval(() => tick(), pollMs);
  tick().catch((error) => console.error('[CrmFullSyncWorker] initial tick failed:', error.message));
  console.log(`[CrmFullSyncWorker] polling every ${pollMs}ms`);
};

exports.stop = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

exports.tick = tick;
