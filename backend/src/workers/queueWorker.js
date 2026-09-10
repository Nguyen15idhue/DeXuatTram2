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
    }

    return false;
  }
};

const processPushJob = async (job) => {
  const requestPayload = typeof job.request_payload === 'string'
    ? JSON.parse(job.request_payload)
    : job.request_payload;

  const { api_config_id, contact_data, proposal_id, was_linked, previous_contact_id } = requestPayload;

  if (!api_config_id || !contact_data) {
    throw new Error('Missing api_config_id or contact_data in request_payload');
  }

  const fileSyncService = require('../services/fileSyncService');
  const pool = require('../utils/db');

  let prevFileNames = [];
  if (proposal_id) {
    try {
      const [rows] = await pool.query('SELECT last_synced_data FROM station_proposals WHERE id = ?', [proposal_id]);
      if (rows.length > 0 && rows[0].last_synced_data) {
        const snap = typeof rows[0].last_synced_data === 'string'
          ? JSON.parse(rows[0].last_synced_data)
          : rows[0].last_synced_data;
        prevFileNames = (snap && snap.files_result && snap.files_result.fileNames) || [];
      }
    } catch (err) {
      console.error('[QueueWorker] Read snapshot error:', err.message);
    }
  }

  let filesInfo = { sent: [], skipped: [], total: 0 };
  if (proposal_id) {
    try {
      const built = await fileSyncService.buildFilesArray(proposal_id, { excludeNames: was_linked ? prevFileNames : [] });
      const sentNames = built.names;
      contact_data.files = built.files.length > 0 ? JSON.stringify(built.files) : undefined;
      if (contact_data.files === undefined) delete contact_data.files;
      filesInfo = { sent: sentNames, skipped: built.skipped, total: built.files.length, cumulative: [...prevFileNames, ...sentNames] };
    } catch (err) {
      console.error('[QueueWorker] Build files error:', err.message);
    }
  }

  const findExistingId = async () => {
    const code = contact_data.code;
    if (!code) return null;
    try {
      const detail = await oneOfficeService.getContactDetail(api_config_id, code);
      if (!detail || !detail.success || !detail.data || detail.data.error) return null;
      const inner = detail.data.data || detail.data;
      const id = inner ? (inner.ID ?? inner.id ?? null) : null;
      return (id !== null && id !== undefined && String(id).match(/^\d+$/)) ? String(id) : null;
    } catch { return null; }
  };

  const existingId = await findExistingId();
  let result;
  let updated = false;
  const recreated = !!was_linked && !existingId;
  if (existingId) {
    result = await oneOfficeService.updateContact(api_config_id, contact_data.code, contact_data);
    updated = true;
  } else {
    result = await oneOfficeService.insertContact(api_config_id, contact_data);
  }

  if (!result.success) {
    throw new Error(result.error || `1Office API error: ${result.status}`);
  }

  if (proposal_id && result.data && !result.data.error) {
    const contactCode = (result.data.data && result.data.data.code) || result.data.code || contact_data.code;
    const urlMatch = String(result.data.url || '').match(/[?&]ID=(\d+)/i);
    const contactId = existingId || (urlMatch ? urlMatch[1] : null);
    if (contactCode || contactId) {
      const cumulative = filesInfo.cumulative || filesInfo.sent || [];
      const snapshot = {
        files_result: { fileNames: cumulative, totalFiles: cumulative.length, sent: filesInfo.sent || [], skipped: filesInfo.skipped || [] },
        synced_at: new Date().toISOString()
      };
      await pool.query(
        `UPDATE station_proposals SET contact_1office_id = COALESCE(?, contact_1office_id), contact_1office_code = COALESCE(?, contact_1office_code), sync_status = 'synced', last_synced_at = NOW(), last_synced_data = ?, updated_at = NOW() WHERE id = ?`,
        [contactId, contactCode, JSON.stringify(snapshot), proposal_id]
      );
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
    files: { sentCount: (filesInfo.sent || []).length, sent: filesInfo.sent || [], skipped: filesInfo.skipped || [] },
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
