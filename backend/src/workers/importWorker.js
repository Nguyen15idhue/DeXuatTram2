const importJobService = require('../services/importJobService');

const POLL_INTERVAL_MS = 2000;

let isRunning = false;
let pollTimer = null;
let started = false;

const getRunner = () => require('../services/excelImportRunner');

const processJob = async (job) => {
  const rows = await importJobService.getRows(job.id);
  const params = typeof job.params === 'string'
    ? JSON.parse(job.params || '{}')
    : (job.params || {});
  const [uRows] = await require('../utils/db').query('SELECT id, role FROM users WHERE id = ?', [job.created_by]);
  const user = uRows.length > 0 ? uRows[0] : null;
  const runner = getRunner();
  const result = await runner.runImportRows({
    jobId: job.id,
    entity: job.entity,
    rows: rows || [],
    params,
    user,
    onProgress: async ({ done, imported, failed }) => {
      await importJobService.touchProgress(job.id, { done, imported, failed });
    },
    shouldStop: async () => importJobService.isCancelled(job.id)
  });
  await importJobService.finish(job.id, result);
  console.log(`[ImportWorker] Job ${job.id} finished: ${result.status} (imported=${result.imported}, failed=${result.failed}, pending=${result.pending})`);
  try {
    const notificationService = require('../services/notificationService');
    if (job.created_by) {
      const label = { done: 'hoàn tất', partial: 'xong một phần', failed: 'thất bại', cancelled: 'đã hủy' }[result.status] || result.status;
      await notificationService.create({
        userId: job.created_by,
        type: result.status === 'done' ? 'IMPORT_DONE' : result.status === 'cancelled' ? 'IMPORT_CANCELLED' : 'IMPORT_PARTIAL',
        title: `Import Excel ${label}`,
        message: `File: ${job.file_name || job.entity} · Đã tạo: ${result.imported} · Lỗi: ${result.failed} · Chưa xử lý: ${result.pending} · Xem tab Excel trong Audit Log`,
        entityType: 'import_jobs',
        entityId: null,
        createdBy: null
      });
    }
  } catch { /* silent */ }
};

const poll = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    const job = await importJobService.claimNext();
    if (!job) {
      isRunning = false;
      return;
    }
    console.log(`[ImportWorker] Processing job ${job.id} (${job.entity}, total=${job.total})`);
    try {
      await processJob(job);
    } catch (error) {
      console.error(`[ImportWorker] Job ${job.id} crashed:`, error.message);
      try {
        await importJobService.finish(job.id, {
          status: 'failed',
          imported: 0,
          failed: job.total || 0,
          pending: 0,
          failedRows: [],
          failedTruncated: false,
          pendingRows: [],
          pendingTruncated: false,
          successIds: [],
          warnDetails: [],
          error: error.message
        });
      } catch { /* silent */ }
    }
  } catch (error) {
    console.error('[ImportWorker] Poll error:', error.message);
  } finally {
    isRunning = false;
  }
};

exports.start = async () => {
  console.log('[ImportWorker] Starting import worker...');
  try {
    const { requeued } = await importJobService.requeueStuck();
    if (requeued > 0) console.log(`[ImportWorker] Requeued ${requeued} stuck jobs`);
  } catch (error) {
    console.error('[ImportWorker] Requeue error:', error.message);
  }
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  started = true;
  console.log(`[ImportWorker] Worker started, polling every ${POLL_INTERVAL_MS}ms`);
};

exports.stop = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    started = false;
    console.log('[ImportWorker] Worker stopped');
  }
};

exports.processOne = async () => {
  await poll();
};

exports.getStatus = () => ({ isRunning: started, pollInterval: POLL_INTERVAL_MS });
