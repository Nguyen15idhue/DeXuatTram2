const crmInboundPollingService = require('../services/crmInboundPollingService');

let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const config = crmInboundPollingService.getConfig();
    if (!config.configured) return;
    const result = await crmInboundPollingService.pollOnce();
    if (result.processed > 0) {
      console.log(`[CrmInboundPollingWorker] processed ${result.processed} leads`);
    }
    if (result.error) console.error(`[CrmInboundPollingWorker] ${result.error}`);
  } catch (error) {
    console.error('[CrmInboundPollingWorker] tick failed:', error.message);
  } finally {
    running = false;
  }
};

exports.start = async () => {
  if (timer) return;
  const config = crmInboundPollingService.getConfig();
  if (!config.configured) {
    console.warn(`[CrmInboundPollingWorker] disabled: ${config.message}`);
    return;
  }
  const pollMs = 10 * 60 * 1000; // 10 phút
  timer = setInterval(() => tick(), pollMs);
  tick().catch((error) => console.error('[CrmInboundPollingWorker] initial tick failed:', error.message));
  console.log(`[CrmInboundPollingWorker] polling every ${pollMs}ms`);
};

exports.stop = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

exports.tick = tick;
