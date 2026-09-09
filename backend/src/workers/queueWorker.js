const queueService = require('../services/queueService');
const oneOfficeService = require('../services/oneOfficeService');
const apiConfigService = require('../services/apiConfigService');

const POLL_INTERVAL_MS = 2000;
const PROCESSING_DELAY_MS = 1500;

let isRunning = false;
let pollTimer = null;

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

  const { api_config_id, contact_data } = requestPayload;

  if (!api_config_id || !contact_data) {
    throw new Error('Missing api_config_id or contact_data in request_payload');
  }

  const result = await oneOfficeService.insertContact(api_config_id, contact_data);

  if (!result.success) {
    throw new Error(result.error || `1Office API error: ${result.status}`);
  }

  return {
    action: 'push',
    contact_created: true,
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

  const result = await oneOfficeService.getContacts(api_config_id, filter || {});

  if (!result.success) {
    throw new Error(result.error || `1Office API error: ${result.status}`);
  }

  return {
    action: 'pull',
    contacts_fetched: result.data.contacts ? result.data.contacts.length : 0,
    total: result.data.total,
    api_response: result.data,
    response_time: result.responseTime
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
  console.log(`[QueueWorker] Worker started, polling every ${POLL_INTERVAL_MS}ms`);
};

exports.stop = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[QueueWorker] Worker stopped');
  }
};

exports.processOne = async () => {
  await poll();
};

exports.getStatus = () => {
  return {
    isRunning,
    pollInterval: POLL_INTERVAL_MS,
    memoryQueue: queueService.getMemoryQueue()
  };
};
