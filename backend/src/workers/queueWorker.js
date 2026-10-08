const queueService = require('../services/queueService');
const oneOfficeService = require('../services/oneOfficeService');
const apiConfigService = require('../services/apiConfigService');
const dynamicEngineService = require('../services/dynamicEngineService');

const POLL_INTERVAL_MS = 2000;
const PROCESSING_DELAY_MS = 1500;

let isRunning = false;
let pollTimer = null;
let started = false;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const processJob = async (job) => {
  console.log(`[QueueWorker] Processing job #${job.id}: ${job.action} ${job.entity_type}#${job.entity_id}`);

  await queueService.updateStatus(job.id, 'processing');

  try {
    let result;

    switch (job.action) {
      case 'push':
        result = await processPushJob(job);
        break;
      case 'pull':
        result = await processPullJob(job);
        break;
      case 'link':
        result = await processLinkJob(job);
        break;
      default:
        throw new Error(`Unknown action: ${job.action}`);
    }

    await queueService.updateStatus(job.id, 'completed', {
      response_payload: result
    });

    console.log(`[QueueWorker] Job #${job.id} completed successfully`);
    return true;
  } catch (error) {
    console.error(`[QueueWorker] Job #${job.id} failed:`, error.message);

    const newRetryCount = job.retry_count + 1;
    if (newRetryCount < job.max_retries) {
      await queueService.updateStatus(job.id, 'failed', {
        error_message: error.message,
        retry_count: newRetryCount
      });
      console.log(`[QueueWorker] Job #${job.id} will retry (${newRetryCount}/${job.max_retries})`);
      await queueService.retry(job.id);
    } else {
      await queueService.updateStatus(job.id, 'failed', {
        error_message: error.message,
        retry_count: newRetryCount
      });
      console.log(`[QueueWorker] Job #${job.id} max retries reached, marking as failed permanently`);
      try {
        if (job.action === 'push' && job.entity_type === 'station_proposals' && job.entity_id) {
          const pool = require('../utils/db');
          await pool.query("UPDATE station_proposals SET sync_status = 'error', updated_at = NOW() WHERE id = ?", [job.entity_id]);
        }
      } catch { /* silent: khong chan xu ly job vi sync_status */ }
      try {
        if ((job.action === 'push' || job.action === 'pull') && job.entity_id) {
          const proposalLifecycle = require('../services/proposalLifecycle');
          await proposalLifecycle.logActivity({
            proposalId: job.entity_id,
            action: job.action === 'push' ? 'sync_push' : 'sync_pull',
            source: 'system_auto',
            actorId: job.created_by || null,
            changedFields: { error: error.message, final: true }
          });
        }
      } catch { /* silent */ }
    }

    return false;
  }
};

const processPushJob = async (job) => {
  const requestPayload = typeof job.request_payload === 'string'
    ? JSON.parse(job.request_payload)
    : job.request_payload;

  const { api_config_id, contact_data, proposal_id, was_linked, previous_contact_id, set_status } = requestPayload;

  if (!api_config_id || !contact_data) {
    throw new Error('Missing api_config_id or contact_data in request_payload');
  }

  const fileSyncService = require('../services/fileSyncService');
  const pool = require('../utils/db');

  const fetchContactInfo = async () => {
    const code = contact_data.code;
    if (!code) return { id: null, fileNames: [] };
    try {
      const detail = await oneOfficeService.getContactDetail(api_config_id, code);
      if (!detail || !detail.success || !detail.data || detail.data.error) return { id: null, fileNames: [] };
      const inner = detail.data.data || detail.data;
      const id = inner ? (inner.ID ?? inner.id ?? null) : null;
      const validId = (id !== null && id !== undefined && String(id).match(/^\d+$/)) ? String(id) : null;
      const fileNames = Array.isArray(inner && inner.files)
        ? inner.files.map((f) => String(f.filename || f.title || '')).filter(Boolean)
        : [];
      return { id: validId, fileNames };
    } catch { return { id: null, fileNames: [] }; }
  };

  const contactInfo = await fetchContactInfo();
  const existingId = contactInfo.id;
  const recreated = !!was_linked && !existingId;

  let prevFileIds = [];
  if (proposal_id && !recreated) {
    try {
      const [rows] = await pool.query('SELECT last_synced_data FROM station_proposals WHERE id = ?', [proposal_id]);
      if (rows.length > 0 && rows[0].last_synced_data) {
        const snap = typeof rows[0].last_synced_data === 'string'
          ? JSON.parse(rows[0].last_synced_data)
          : rows[0].last_synced_data;
        const fr = snap && snap.files_result;
        prevFileIds = (fr && fr.fileIds) || [];
      }
    } catch (err) {
      console.error('[QueueWorker] Read snapshot error:', err.message);
    }
  }

  const stripFileName = (n) => String(n || '').trim()
    .replace(/\.(jpe?g|png|gif|pdf|docx?|xlsx?|txt)$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();

  let filesInfo = { sent: [], skipped: [], total: 0, stale: [] };
  if (proposal_id) {
    try {
      const on1office = recreated ? [] : contactInfo.fileNames;
      const built = await fileSyncService.buildFilesArray(proposal_id, {
        excludeNames: on1office,
        excludeIds: recreated ? [] : prevFileIds
      });
      const sentNames = built.names;
      contact_data.files = built.files.length > 0 ? JSON.stringify(built.files) : undefined;
      if (contact_data.files === undefined) delete contact_data.files;
      const cumulative = [...contactInfo.fileNames, ...sentNames];
      const cumulativeIds = [...new Set([...prevFileIds, ...(built.ids || [])])];
      const activeNames = new Set((await fileSyncService.loadFiles(proposal_id)).map((f) => stripFileName(f.original_name)));
      const stale = recreated ? [] : contactInfo.fileNames.filter((n) => !activeNames.has(stripFileName(n)));
      filesInfo = { sent: sentNames, skipped: built.skipped, total: built.files.length, cumulative, cumulativeIds, stale };
    } catch (err) {
      console.error('[QueueWorker] Build files error:', err.message);
    }
  }

  let result;
  let updated = false;
  let statusMerged = false;
  if (existingId) {
    const mergedPayload = set_status ? { ...contact_data, status_id: set_status } : { ...contact_data };
    result = await oneOfficeService.updateContact(api_config_id, contact_data.code, mergedPayload);
    updated = true;
    statusMerged = !!set_status;
  } else {
    result = await oneOfficeService.insertContact(api_config_id, contact_data);
  }

  if (!result.success) {
    throw new Error(result.error || `1Office API error: ${result.status}`);
  }

  if (updated && contact_data.code && contact_data.desc) {
    const dec = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'");
    const normText = (s) => dec(String(s || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, '');
    const want = normText(contact_data.desc);
    let ok = false;
    let gotLen = 0;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      if (attempt > 0) await delay(2000);
      try {
        const check = await oneOfficeService.getContactDetail(api_config_id, contact_data.code);
        const inner = check && check.data ? (check.data.data || check.data) : null;
        const got = normText(inner && inner.desc);
        gotLen = got.length;
        ok = got.length > 0 && got === want;
      } catch { /* retry once */ }
    }
    if (!ok) {
      throw new Error(`1Office không nhận desc mới (đã gửi ${want.length} ký tự, hiện tại ${gotLen} ký tự)`);
    }
  }

  let statusUpdated = false;
  let statusUpdateError = null;
  if (set_status) {
    if (statusMerged) {
      if (result.data && !result.data.error) {
        statusUpdated = true;
      } else {
        statusUpdateError = 'Không đặt được trạng thái contact';
      }
    } else if (result.data && !result.data.error) {
      const codeForStatus = (result.data.data && result.data.data.code) || result.data.code || contact_data.code;
      if (codeForStatus) {
        try {
          const stResult = await oneOfficeService.updateContact(api_config_id, codeForStatus, { status_id: set_status });
          if (stResult && stResult.success && !(stResult.data && stResult.data.error)) {
            statusUpdated = true;
          } else {
            statusUpdateError = (stResult && (stResult.error || (stResult.data && stResult.data.message))) || 'Không đặt được trạng thái contact';
          }
        } catch (e) {
          statusUpdateError = e.message || 'Không đặt được trạng thái contact';
        }
      } else {
        statusUpdateError = 'Không xác định được mã contact để đặt trạng thái';
      }
    }
  }
  if (statusUpdateError) {
    throw new Error(`Đã đồng bộ liên hệ nhưng chưa đặt được trạng thái "${set_status}": ${statusUpdateError}`);
  }

  if (proposal_id && result.data && !result.data.error) {
    const contactCode = (result.data.data && result.data.data.code) || result.data.code || contact_data.code;
    const urlMatch = String(result.data.url || '').match(/[?&]ID=(\d+)/i);
    const contactId = existingId || (urlMatch ? urlMatch[1] : null);
    if (contactCode || contactId) {
      const cumulative = filesInfo.cumulative || filesInfo.sent || [];
      const snapshot = {
        files_result: { fileNames: cumulative, fileIds: filesInfo.cumulativeIds || [], totalFiles: cumulative.length, sent: filesInfo.sent || [], skipped: filesInfo.skipped || [] },
        synced_at: new Date().toISOString()
      };
      await pool.query(
        `UPDATE station_proposals SET contact_1office_id = COALESCE(?, contact_1office_id), contact_1office_code = COALESCE(?, contact_1office_code), sync_status = 'synced', last_synced_at = NOW(), last_synced_data = ?, updated_at = NOW() WHERE id = ?`,
        [contactId, contactCode, JSON.stringify(snapshot), proposal_id]
      );
      try {
        const [jrows] = await pool.query('SELECT journey_id FROM station_proposals WHERE id = ? LIMIT 1', [proposal_id]);
        const journeyId = jrows[0] && jrows[0].journey_id;
        if (journeyId && (contactId || contactCode)) {
          const journeySyncService = require('../services/journeySyncService');
          await journeySyncService.upsertExternalRef({
            journeyId, system: '1office', refType: 'contact',
            externalId: contactId || contactCode, externalCode: contactCode || null
          });
        }
      } catch { /* silent */ }
      try {
        const proposalLifecycle = require('../services/proposalLifecycle');
        await proposalLifecycle.logActivity({
          proposalId: proposal_id, action: 'sync_push', source: 'system_auto',
          actorId: job.created_by || null,
          changedFields: { contact_code: contactCode, files_sent: filesInfo.sent || [], files_skipped: filesInfo.skipped || [], ...((filesInfo.stale && filesInfo.stale.length) ? { files_stale: filesInfo.stale } : {}), ...(set_status ? { contact_status: set_status } : {}) }
        });
      } catch { /* silent: khong chan push vi log */ }
      try {
        const [rows] = await pool.query('SELECT custom_data FROM station_proposals WHERE id = ?', [proposal_id]);
        if (rows.length > 0) {
          let cd = rows[0].custom_data;
          if (typeof cd === 'string') {
            try { cd = JSON.parse(cd); } catch { cd = {}; }
          }
          cd = cd || {};
          const postResults = await dynamicEngineService.computePostFormulas('station_proposals', proposal_id, cd, null, null, { excludeKeys: ['ma_de_xuat'] });
          if (postResults.id_1office !== undefined) {
            cd.id_1office = postResults.id_1office;
            await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(cd), proposal_id]);
          }
        }
      } catch { /* silent */ }
    }
  }

  return {
    action: 'push',
    contact_created: !updated && !recreated,
    contact_updated: updated,
    contact_recreated: recreated,
    previous_contact_id: recreated ? (previous_contact_id || null) : null,
    files: { sentCount: (filesInfo.sent || []).length, sent: filesInfo.sent || [], skipped: filesInfo.skipped || [], stale: filesInfo.stale || [] },
    status_updated: statusUpdated,
    contact_status: statusUpdated ? set_status : null,
    api_response: result.data,
    response_time: result.responseTime
  };
};

const processPullJob = async (job) => {
  const requestPayload = typeof job.request_payload === 'string'
    ? JSON.parse(job.request_payload)
    : job.request_payload;

  const { api_config_id, filter } = requestPayload;

  if (!api_config_id) {
    throw new Error('Missing api_config_id in request_payload');
  }

  const syncService = require('../services/syncService');
  const result = await syncService.processPull(api_config_id, filter || {});

  return {
    action: 'pull',
    contacts_fetched: result.total,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    details: result.details
  };
};

const processLinkJob = async (job) => {
  const requestPayload = typeof job.request_payload === 'string'
    ? JSON.parse(job.request_payload)
    : job.request_payload;

  const { proposal_id, contact_code } = requestPayload;

  if (!proposal_id || !contact_code) {
    throw new Error('Missing proposal_id or contact_code in request_payload');
  }

  const pool = require('../utils/db');
  await pool.query(
    `UPDATE station_proposals SET
      contact_1office_code = ?,
      sync_status = 'synced',
      last_synced_at = NOW(),
      updated_at = NOW()
     WHERE id = ?`,
    [contact_code, proposal_id]
  );

  return {
    action: 'link',
    proposal_id,
    contact_code,
    linked: true
  };
};

const poll = async () => {
  if (isRunning) return;

  isRunning = true;

  try {
    const job = await queueService.getNextPending();
    if (!job) {
      isRunning = false;
      return;
    }

    console.log(`[QueueWorker] Found pending job #${job.id}`);
    await processJob(job);

    await delay(PROCESSING_DELAY_MS);
  } catch (error) {
    console.error('[QueueWorker] Poll error:', error.message);
  } finally {
    isRunning = false;
  }
};

exports.start = async () => {
  console.log('[QueueWorker] Starting queue worker...');

  const requeued = await queueService.requeuePending();
  console.log(`[QueueWorker] Requeued ${requeued.requeued} processing jobs, ${requeued.pending} pending jobs`);

  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  started = true;
  console.log(`[QueueWorker] Worker started, polling every ${POLL_INTERVAL_MS}ms`);
};

exports.stop = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    started = false;
    console.log('[QueueWorker] Worker stopped');
  }
};

exports.processOne = async () => {
  await poll();
};

exports.getStatus = () => {
  return {
    isRunning: started,
    pollInterval: POLL_INTERVAL_MS,
    memoryQueue: queueService.getMemoryQueue()
  };
};
