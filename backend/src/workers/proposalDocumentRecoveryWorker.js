const service = require('../services/proposalDocumentRecoveryService');
let timer;
exports.start = async () => {
  if (timer) return;
  const tick = () => service.processNext().catch(error => console.error('[ProposalRecoveryWorker]', error));
  timer = setInterval(tick, 3000);
  timer.unref();
  await tick();
};
