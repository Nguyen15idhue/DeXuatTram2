// backend/src/services/crmFullSyncService.js
// Đồng bộ toàn bộ khách hàng từ TMT CRM về Quản lý leads (chạy nền, có tiến trình).
const pool = require('../utils/db');
const crmInboundService = require('./crmInboundService');
const crmWebhookLogService = require('./crmWebhookLogService');

const CRM_API_BASE = 'https://crm.tmt-vietnam.com/api/v1/partner';
const PAGE_LIMIT = 200;
const MAX_LEADS_PER_RUN = 10000;
const FETCH_TIMEOUT_MS = 30000;
const RETRY_DELAYS = [2000, 5000, 10000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getApiKey = () => String(process.env.TMT_CRM_API_KEY || '').trim();
const isConfigured = () => !!getApiKey();

const RUN_FIELDS = `id, status, \`cursor\`, pages, fetched, inserted, updated, skipped, failed,
  triggered_by, started_at, finished_at, last_error, created_at, updated_at`;

const getRun = async (id) => {
  const [rows] = await pool.query(`SELECT ${RUN_FIELDS} FROM crm_full_sync_runs WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
};

const getActiveRun = async () => {
  const [rows] = await pool.query(
    `SELECT ${RUN_FIELDS} FROM crm_full_sync_runs WHERE status IN ('QUEUED','RUNNING') ORDER BY id ASC LIMIT 1`
  );
  return rows[0] || null;
};

const listRuns = async (limit = 10) => {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const [rows] = await pool.query(
    `SELECT r.id, r.status, r.\`cursor\`, r.pages, r.fetched, r.inserted, r.updated, r.skipped, r.failed,
            r.triggered_by, r.started_at, r.finished_at, r.last_error, r.created_at, r.updated_at,
            u.full_name AS triggered_by_name
       FROM crm_full_sync_runs r
       LEFT JOIN users u ON u.id = r.triggered_by
      ORDER BY r.id DESC LIMIT ?`,
    [safeLimit]
  );
  return rows;
};

const getStatus = async () => {
  const runs = await listRuns(10);
  const active = runs.find((r) => ['QUEUED', 'RUNNING'].includes(r.status)) || null;
  return {
    configured: isConfigured(),
    message: isConfigured() ? 'OK' : 'TMT_CRM_API_KEY chưa cấu hình',
    maxLeadsPerRun: MAX_LEADS_PER_RUN,
    active,
    latest: runs[0] || null,
    runs,
  };
};

const startRun = async (userId) => {
  if (!isConfigured()) {
    return { error: 'TMT_CRM_API_KEY chưa cấu hình', notConfigured: true };
  }
  const active = await getActiveRun();
  if (active) return { run: active, reused: true };
  const [res] = await pool.query(
    "INSERT INTO crm_full_sync_runs (status, triggered_by) VALUES ('QUEUED', ?)",
    [userId || null]
  );
  return { run: await getRun(res.insertId), reused: false };
};

const resumeRun = async (id) => {
  const run = await getRun(id);
  if (!run) return { error: 'Không tìm thấy lần đồng bộ', notFound: true };
  if (!['FAILED', 'PARTIAL', 'CANCELLED'].includes(run.status)) {
    return { error: 'Chỉ có thể tiếp tục lần đồng bộ bị lỗi, đạt giới hạn hoặc đã hủy' };
  }
  const active = await getActiveRun();
  if (active && Number(active.id) !== Number(id)) {
    return { error: `Đang có lần đồng bộ #${active.id} chạy`, active };
  }
  await pool.query(
    "UPDATE crm_full_sync_runs SET status = 'QUEUED', last_error = NULL, finished_at = NULL, updated_at = NOW() WHERE id = ?",
    [id]
  );
  return { run: await getRun(id) };
};

const cancelRun = async (id) => {
  const run = await getRun(id);
  if (!run) return { error: 'Không tìm thấy lần đồng bộ', notFound: true };
  if (!['QUEUED', 'RUNNING'].includes(run.status)) {
    return { error: 'Lần đồng bộ này đã kết thúc' };
  }
  await pool.query(
    "UPDATE crm_full_sync_runs SET status = 'CANCELLED', finished_at = NOW(), updated_at = NOW() WHERE id = ?",
    [id]
  );
  return { run: await getRun(id) };
};

const fetchPage = async (cursor, limit) => {
  const apiKey = getApiKey();
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const url = `${CRM_API_BASE}/leads?limit=${limit}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`CRM trả về HTTP ${res.status}`);
      } else if (!res.ok) {
        const text = await res.text();
        lastError = new Error(`CRM trả về HTTP ${res.status}: ${String(text).slice(0, 200)}`);
      } else {
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await res.text();
          lastError = new Error(`CRM trả về ${contentType || 'nội dung không xác định'}: ${String(text).slice(0, 200)}`);
        } else {
          return await res.json();
        }
      }
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? new Error('CRM không phản hồi trong 30 giây')
        : error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt]);
  }
  throw lastError || new Error('Không gọi được API CRM');
};

const insertIssue = async (runId, lead, result, reason) => {
  try {
    await pool.query(
      'INSERT INTO crm_full_sync_issues (run_id, crm_lead_id, name, phone, result, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [
        runId,
        lead?.id ? String(lead.id).slice(0, 100) : null,
        lead?.name ? String(lead.name).slice(0, 255) : null,
        lead?.phone ? String(lead.phone).slice(0, 32) : null,
        result,
        reason ? String(reason).slice(0, 500) : null,
      ]
    );
  } catch (error) {
    console.error('[CrmFullSync] issue insert failed:', error.message);
  }
};

const updateProgress = async (runId, stats, cursor) => {
  await pool.query(
    `UPDATE crm_full_sync_runs
        SET pages = ?, fetched = ?, inserted = ?, updated = ?, skipped = ?, failed = ?, \`cursor\` = ?, updated_at = NOW()
      WHERE id = ? AND status = 'RUNNING'`,
    [stats.pages, stats.fetched, stats.inserted, stats.updated, stats.skipped, stats.failed, cursor || null, runId]
  );
};

const finishRun = async (runId, status, stats, cursor, lastError) => {
  await pool.query(
    `UPDATE crm_full_sync_runs
        SET status = ?, pages = ?, fetched = ?, inserted = ?, updated = ?, skipped = ?, failed = ?,
            \`cursor\` = ?, last_error = ?, finished_at = NOW(), updated_at = NOW()
      WHERE id = ?`,
    [
      status, stats.pages, stats.fetched, stats.inserted, stats.updated, stats.skipped, stats.failed,
      cursor || null, lastError || null, runId
    ]
  );
};

const logSummary = async (run, status, stats, cursor, startedAt, errorMessage) => {
  const logStatus = status === 'failed' ? 'failed' : (status === 'cancelled' ? 'skipped' : 'processed');
  await crmWebhookLogService.logInbound({
    eventId: null,
    eventType: 'full_sync',
    status: logStatus,
    httpStatus: null,
    payload: {
      source: 'full_sync',
      runId: run.id,
      result: status,
      pages: stats.pages,
      fetched: stats.fetched,
      inserted: stats.inserted,
      updated: stats.updated,
      skipped: stats.skipped,
      failed: stats.failed,
      cursor: cursor || null,
    },
    error: errorMessage || null,
    durationMs: Date.now() - startedAt,
  });
};

const executeRun = async (run) => {
  const startedAt = Date.now();
  const stats = {
    pages: Number(run.pages) || 0,
    fetched: Number(run.fetched) || 0,
    inserted: Number(run.inserted) || 0,
    updated: Number(run.updated) || 0,
    skipped: Number(run.skipped) || 0,
    failed: Number(run.failed) || 0,
  };
  let cursor = run.cursor || null;
  const cache = {};

  try {
    while (true) {
      const current = await getRun(run.id);
      if (!current) return;
      if (current.status === 'CANCELLED') {
        await logSummary(run, 'cancelled', stats, cursor, startedAt, null);
        return;
      }

      const remaining = MAX_LEADS_PER_RUN - stats.fetched;
      if (remaining <= 0) {
        await finishRun(run.id, 'PARTIAL', stats, cursor, `Đã đạt giới hạn ${MAX_LEADS_PER_RUN} khách/lần`);
        await logSummary(run, 'partial', stats, cursor, startedAt, null);
        return;
      }

      const page = await fetchPage(cursor, Math.min(PAGE_LIMIT, remaining));
      const leads = Array.isArray(page && page.data) ? page.data : [];
      for (const lead of leads) {
        stats.fetched++;
        try {
          const result = await crmInboundService.upsertLeadFromCrm(lead, pool, {
            onExisting: 'update',
            skipOutbound: true,
            cache,
          });
          if (result.result === 'inserted') stats.inserted++;
          else if (result.result === 'skipped') {
            stats.skipped++;
            await insertIssue(run.id, lead, 'SKIPPED', result.reason);
          } else stats.updated++;
        } catch (error) {
          stats.failed++;
          await insertIssue(run.id, lead, 'FAILED', error.message || String(error));
        }
      }

      cursor = page?.nextCursor || null;
      stats.pages++;
      await updateProgress(run.id, stats, cursor);

      if (stats.fetched >= MAX_LEADS_PER_RUN) {
        await finishRun(run.id, 'PARTIAL', stats, cursor, `Đã đạt giới hạn ${MAX_LEADS_PER_RUN} khách/lần`);
        await logSummary(run, 'partial', stats, cursor, startedAt, null);
        return;
      }

      if (page?.more !== true || !cursor) {
        await finishRun(run.id, 'SUCCESS', stats, cursor, null);
        if (cursor) {
          const crmInboundPollingService = require('./crmInboundPollingService');
          await crmInboundPollingService.setCursor(cursor);
        }
        await logSummary(run, 'success', stats, cursor, startedAt, null);
        return;
      }

      await sleep(100);
    }
  } catch (error) {
    const message = error?.message || String(error);
    console.error('[CrmFullSync] run failed:', message);
    await finishRun(run.id, 'FAILED', stats, cursor, message);
    await logSummary(run, 'failed', stats, cursor, startedAt, message);
  }
};

const processNextRun = async () => {
  const [rows] = await pool.query("SELECT id FROM crm_full_sync_runs WHERE status = 'QUEUED' ORDER BY id ASC LIMIT 1");
  if (!rows.length) return { processed: false };

  const [lockRows] = await pool.query("SELECT GET_LOCK('crm_full_sync_run', 0) AS ok");
  if (!lockRows[0] || Number(lockRows[0].ok) !== 1) return { processed: false, locked: true };

  try {
    const runId = rows[0].id;
    const [upd] = await pool.query(
      "UPDATE crm_full_sync_runs SET status = 'RUNNING', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = ? AND status = 'QUEUED'",
      [runId]
    );
    if (upd.affectedRows === 0) return { processed: false };
    const run = await getRun(runId);
    if (!run) return { processed: false };
    await executeRun(run);
    return { processed: true, runId };
  } finally {
    await pool.query("SELECT RELEASE_LOCK('crm_full_sync_run')");
  }
};

const getIssues = async (runId, result = null, limit = 10000) => {
  const safeLimit = Math.min(50000, Math.max(1, Number(limit) || 10000));
  const params = [runId];
  let where = 'run_id = ?';
  if (result === 'SKIPPED' || result === 'FAILED') {
    where += ' AND result = ?';
    params.push(result);
  }
  const [rows] = await pool.query(
    `SELECT id, crm_lead_id, name, phone, result, reason, created_at
       FROM crm_full_sync_issues WHERE ${where} ORDER BY id ASC LIMIT ?`,
    [...params, safeLimit]
  );
  return rows;
};

const buildExport = async (runId) => {
  const ExcelJS = require('exceljs');
  const run = await getRun(runId);
  if (!run) return null;
  const issues = await getIssues(runId);
  const [userRows] = await pool.query('SELECT full_name FROM users WHERE id = ? LIMIT 1', [run.triggered_by || 0]);
  const stamp = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—');

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Tổng kết');
  summary.columns = [
    { header: 'Trường', key: 'label', width: 32 },
    { header: 'Giá trị', key: 'value', width: 40 },
  ];
  [
    ['Mã lần chạy', `#${run.id}`],
    ['Trạng thái', run.status],
    ['Người bấm', userRows[0]?.full_name || (run.triggered_by ? `#${run.triggered_by}` : 'Hệ thống')],
    ['Bắt đầu', stamp(run.started_at)],
    ['Kết thúc', stamp(run.finished_at)],
    ['Số trang', run.pages],
    ['Đã lấy', run.fetched],
    ['Thêm mới', run.inserted],
    ['Cập nhật', run.updated],
    ['Bỏ qua', run.skipped],
    ['Lỗi', run.failed],
    ['Ghi chú', run.last_error || ''],
  ].forEach(([label, value]) => summary.addRow({ label, value }));

  const issueSheet = workbook.addWorksheet('Bỏ qua - Lỗi');
  issueSheet.columns = [
    { header: 'CRM Lead ID', key: 'crm_lead_id', width: 24 },
    { header: 'Họ tên', key: 'name', width: 32 },
    { header: 'Số điện thoại', key: 'phone', width: 18 },
    { header: 'Kết quả', key: 'result', width: 14 },
    { header: 'Lý do', key: 'reason', width: 60 },
  ];
  issues.forEach((issue) => issueSheet.addRow(issue));

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, filename: `crm_full_sync_${run.id}_${Date.now()}.xlsx` };
};

module.exports = {
  MAX_LEADS_PER_RUN,
  isConfigured,
  getStatus,
  getRun,
  listRuns,
  startRun,
  resumeRun,
  cancelRun,
  processNextRun,
  getIssues,
  buildExport,
};
