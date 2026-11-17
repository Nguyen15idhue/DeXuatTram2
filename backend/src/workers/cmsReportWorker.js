const reports = require('../services/cmsReportService');

let lastDay = null;
let pendingDate = null;
const tick = (now = new Date()) => {
  const hourMinute = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(now);
  const day = reports.dayKey(now);
  if (hourMinute === '07:00' && lastDay !== day) {
    lastDay = day;
    pendingDate = reports.yesterday(now);
  }
  if (!pendingDate || reports.getStatus().run?.status === 'RUNNING') return;
  if (!reports.getConfig().configured) {
    console.warn('[CmsReportWorker] Bỏ lượt 07:00: chưa cấu hình CMS/Google Sheet');
    pendingDate = null;
    return;
  }
  try {
    reports.startRun({ from: pendingDate, to: pendingDate, trigger: 'scheduled' });
    pendingDate = null;
  } catch (cause) {
    console.error('[CmsReportWorker] start:', cause.message);
  }
};
const start = () => {
  if (!reports.getConfig().configured) console.warn('[CmsReportWorker] Chưa đủ cấu hình; xem trang thống kê CMS');
  tick();
  const timer = setInterval(() => tick(), 30000);
  timer.unref();
};

module.exports = { start, tick };
