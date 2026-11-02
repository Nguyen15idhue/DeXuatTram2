const proposalSheetSyncService = require('../services/proposalSheetSyncService');

let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const result = await proposalSheetSyncService.processBatch();
    if (result.processed > 0) {
      console.log(`[ProposalSheetSyncWorker] synced batch: ${result.processed}`);
    }
    if (result.error) console.error(`[ProposalSheetSyncWorker] ${result.error}`);
  } catch (error) {
    console.error('[ProposalSheetSyncWorker] tick failed:', error.message);
  } finally {
    running = false;
  }
};

exports.start = async () => {
  if (timer) return;
  const config = proposalSheetSyncService.getConfig();
  if (!config.configured) {
    console.warn(`[ProposalSheetSyncWorker] disabled: ${config.message}`);
    return;
  }
  timer = setInterval(() => tick(), config.pollMs);
  tick().catch((error) => console.error('[ProposalSheetSyncWorker] initial tick failed:', error.message));
  console.log(`[ProposalSheetSyncWorker] polling every ${config.pollMs}ms`);
};

exports.stop = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

exports.tick = tick;
