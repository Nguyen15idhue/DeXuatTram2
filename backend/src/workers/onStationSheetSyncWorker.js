const onStationSheetSyncService = require('../services/onStationSheetSyncService');

let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const config = onStationSheetSyncService.getConfig();
    if (!config.configured) return;
    const result = await onStationSheetSyncService.processBatch();
    if (result.processed > 0) {
      console.log(`[OnStationSheetSyncWorker] processed ${result.processed}`);
    }
    if (result.error) console.error(`[OnStationSheetSyncWorker] ${result.error}`);
  } catch (error) {
    console.error('[OnStationSheetSyncWorker] tick failed:', error.message);
  } finally {
    running = false;
  }
};

exports.start = async () => {
  if (timer) return;
  const config = onStationSheetSyncService.getConfig();
  if (!config.configured) {
    console.warn(`[OnStationSheetSyncWorker] disabled: ${config.message}`);
    return;
  }
  const pollMs = 3000; // 3s
  timer = setInterval(() => tick(), pollMs);
  // first-run backfill: enqueue all ACTIVE proposals if queue empty
  try {
    const [rows] = await require('../utils/db').query('SELECT COUNT(*) AS n FROM on_station_sheet_sync_queue');
    if (Number(rows[0]?.n || 0) === 0) {
      const r = await onStationSheetSyncService.startDailySync('system_auto');
      console.log(`[OnStationSheetSyncWorker] first-run backfill queued ${r.queued} proposals`);
    }
  } catch (e) { console.error('[OnStationSheetSyncWorker] backfill error:', e.message); }
  tick().catch((error) => console.error('[OnStationSheetSyncWorker] initial tick failed:', error.message));
  console.log(`[OnStationSheetSyncWorker] polling every ${pollMs}ms`);
};

exports.stop = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

exports.tick = tick;
