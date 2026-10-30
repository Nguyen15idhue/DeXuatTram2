const cronMatcher = require("../utils/cronMatcher");
const evReportSheetSyncService = require("../services/evReportSheetSyncService");

const TICK_MS = 60 * 1000;
let running = false;
let lastRunMinute = null;

const minuteKey = (date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;

const tick = async (date = new Date()) => {
  if (running) return;
  const config = evReportSheetSyncService.getConfig();
  if (!config.configured || !cronMatcher.matches(config.cron, date)) return;
  const key = minuteKey(date);
  if (lastRunMinute === key) return;
  lastRunMinute = key;
  running = true;
  try {
    const result = await evReportSheetSyncService.syncReports({
      triggerType: "scheduled",
    });
    console.log(
      `[EvReportSheetSyncWorker] ${result.status}: ${result.insertedCount} added`,
    );
  } catch (error) {
    console.error("[EvReportSheetSyncWorker] sync error:", error.message);
  } finally {
    running = false;
  }
};

exports.start = async () => {
  const config = evReportSheetSyncService.getConfig();
  if (!config.configured) {
    console.warn(
      `[EvReportSheetSyncWorker] disabled: ${config.message || "chưa cấu hình"}`,
    );
    return;
  }
  if (!cronMatcher.validate(config.cron)) {
    throw new Error("EV_REPORT_SHEET_SYNC_CRON không đúng định dạng cron 5 phần");
  }
  lastRunMinute = minuteKey(new Date());
  setInterval(() => {
    tick().catch((error) =>
      console.error("[EvReportSheetSyncWorker] tick error:", error.message),
    );
  }, TICK_MS);
  console.log(`[EvReportSheetSyncWorker] scheduled: ${config.cron}`);
};

exports.tick = tick;
