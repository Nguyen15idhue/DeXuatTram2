const vehicles = require('../services/cmsVehicleSheetService');

let lastDay = null;
let pendingDate = null;
const tick = (now = new Date()) => {
  const hourMinute = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(now);
  const reports = require('../services/cmsReportService');
  const d = reports.dayKey(now);
  if (hourMinute === '06:00' && lastDay !== d) {
    lastDay = d;
    pendingDate = reports.offsetDay(d, -1);
  }
  if (!pendingDate) return;
  const config = vehicles.getConfig();
  if (!config.configured) {
    console.warn('[CmsVehicleSheetWorker] Bỏ lượt 06:00: chưa cấu hình CMS/Google Sheet');
    pendingDate = null;
    return;
  }
  const date = pendingDate;
  pendingDate = null;
  try {
    vehicles.runVehicleSync({ from: date, to: date })
      .then((result) => console.log(`[CmsVehicleSheetWorker] ${date}: added ${result.added}, updated ${result.updated}, skipped ${result.skipped}, total ${result.total}`))
      .catch((cause) => console.error(`[CmsVehicleSheetWorker] ${date}:`, cause.message));
  } catch (cause) {
    console.error('[CmsVehicleSheetWorker] start:', cause.message);
  }
};
const start = () => {
  const config = vehicles.getConfig();
  if (!config.configured) console.warn('[CmsVehicleSheetWorker] Chưa đủ cấu hình; xem trang thống kê CMS');
  tick();
  const timer = setInterval(() => tick(), 30000);
  timer.unref();
};
module.exports = { start, tick };