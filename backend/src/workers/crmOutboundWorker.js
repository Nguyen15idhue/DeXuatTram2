const crmOutboundService = require('../services/crmOutboundService');

let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const config = crmOutboundService.getConfig();
    if (!config.configured) return;
    const result = await crmOutboundService.processBatch();
    if (result.processed > 0) {
      console.log(`[CrmOutboundWorker] processed ${result.processed}, sent ${result.sent}, failed ${result.failed}`);
    }
    if (result.error) console.error(`[CrmOutboundWorker] ${result.error}`);
  } catch (error) {
    console.error('[CrmOutboundWorker] tick failed:', error.message);
  } finally {
    running = false;
  }
};

exports.start = async () => {
  if (timer) return;
  const config = crmOutboundService.getConfig();
  if (!config.configured) {
    console.warn(`[CrmOutboundWorker] disabled: ${config.message}`);
    return;
  }
  const pollMs = 30 * 1000; // 30 giây
  timer = setInterval(() => tick(), pollMs);
  tick().catch((error) => console.error('[CrmOutboundWorker] initial tick failed:', error.message));
  console.log(`[CrmOutboundWorker] polling every ${pollMs}ms`);
};

exports.stop = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

exports.tick = tick;
