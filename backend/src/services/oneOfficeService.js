const apiConfigService = require('./apiConfigService');

const REQUEST_DELAY_MS = 1500;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];
const TIMEOUT_MS = 30000;

let lastRequestTime = 0;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const enforceRateLimit = async () => {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY_MS) {
    await delay(REQUEST_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();
};

const getToken = async (apiConfigId) => {
  const config = await apiConfigService.getById(apiConfigId);
  if (!config) throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });

  const authConfig = typeof config.auth_config === 'string' ? JSON.parse(config.auth_config) : config.auth_config;
  return {
    baseUrl: config.base_url.replace(/\/$/, ''),
    token: authConfig.token || authConfig.access_token || ''
  };
};

const getAdminToken = async (apiConfigId) => {
  const config = await apiConfigService.getById(apiConfigId);
  if (!config) throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });

  const authConfig = typeof config.auth_config === 'string' ? JSON.parse(config.auth_config) : config.auth_config;
  return {
    baseUrl: config.base_url.replace(/\/$/, ''),
    token: authConfig.admin_token || authConfig.token || authConfig.access_token || ''
  };
};

const requestWithRetry = async (method, url, body, token, retryCount = 0) => {
  await enforceRateLimit();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}access_token=${token}`;

    const headers = {};
    const options = { method, headers, signal: controller.signal };
    if (body && method !== 'GET') {
      const formBody = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== null && value !== undefined) {
          formBody.append(key, String(value));
        }
      }
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.body = formBody.toString();
    }

    const startTime = Date.now();
    const response = await fetch(fullUrl, options);
    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    console.log(`[1Office] ${method} ${url} → ${response.status} (${responseTime}ms) retry=${retryCount}`);

    if (!response.ok && retryCount < MAX_RETRIES) {
      console.log(`[1Office] Retrying in ${RETRY_DELAYS[retryCount]}ms...`);
      await delay(RETRY_DELAYS[retryCount]);
      return requestWithRetry(method, url, body, token, retryCount + 1);
    }

    return {
      success: response.ok,
      status: response.status,
      data: responseData,
      responseTime
    };
  } catch (error) {
    clearTimeout(timeout);

    if (error.name === 'AbortError') {
      if (retryCount < MAX_RETRIES) {
        console.log(`[1Office] Timeout, retrying in ${RETRY_DELAYS[retryCount]}ms...`);
        await delay(RETRY_DELAYS[retryCount]);
        return requestWithRetry(method, url, body, token, retryCount + 1);
      }
      return { success: false, status: 0, data: null, error: 'Request timeout (30s)', responseTime: TIMEOUT_MS };
    }

    if (retryCount < MAX_RETRIES) {
      console.log(`[1Office] Error: ${error.message}, retrying in ${RETRY_DELAYS[retryCount]}ms...`);
      await delay(RETRY_DELAYS[retryCount]);
      return requestWithRetry(method, url, body, token, retryCount + 1);
    }

    return { success: false, status: 0, data: null, error: error.message, responseTime: 0 };
  }
};

exports.getUsers = async (apiConfigId, params = {}) => {
  const { baseUrl, token } = await getAdminToken(apiConfigId);
  if (!token) throw Object.assign(new Error('Thiếu admin token 1Office'), { statusCode: 400 });
  const page = Math.max(1, parseInt(params.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit) || 100));
  const url = `${baseUrl}/api/admin/user/gets?page=${page}&limit=${limit}`;
  const result = await requestWithRetry('GET', url, null, token);
  if (result.success && result.data && !result.data.error) {
    result.data = {
      users: result.data.data || [],
      total: result.data.total_item || 0,
      page,
      limit
    };
  }
  return result;
};

exports.getContacts = async (apiConfigId, params = {}) => {
  const { baseUrl, token } = await getToken(apiConfigId);
  const queryParams = {};
  if (params.page) queryParams.page = params.page;
  if (params.limit) queryParams.limit = params.limit;
  if (params.type !== undefined) queryParams.type = params.type;
  if (params.search) queryParams.search = params.search;
  if (params.status_id) queryParams.status_id = params.status_id;

  const queryString = Object.entries(queryParams).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  let url = `${baseUrl}/api/customer/contact/gets${queryString ? '?' + queryString : ''}`;
  const fr = Array.isArray(params.fieldRaws) ? params.fieldRaws.filter(Boolean).join(',') : String(params.fieldRaws || '').trim();
  if (fr) url += (url.includes('?') ? '&' : '?') + 'field_raws=' + fr;

  const result = await requestWithRetry('GET', url, null, token);
  if (result.success && result.data && !result.data.error) {
    result.data = {
      contacts: result.data.data || [],
      total: result.data.total_item || 0
    };
  }
  return result;
};

exports.getContactDetail = async (apiConfigId, code, fieldRaws = null) => {
  const { baseUrl, token } = await getToken(apiConfigId);
  let url = `${baseUrl}/api/customer/contact/item?code=${encodeURIComponent(code)}`;
  const fr = Array.isArray(fieldRaws) ? fieldRaws.filter(Boolean).join(',') : String(fieldRaws || '').trim();
  if (fr) url += `&field_raws=${fr}`;
  return requestWithRetry('GET', url, null, token);
};

exports.insertContact = async (apiConfigId, contactData) => {
  const { baseUrl, token } = await getToken(apiConfigId);
  const body = {};
  for (const [key, value] of Object.entries(contactData)) {
    if (value !== null && value !== undefined) {
      body[key] = value;
    }
  }
  return requestWithRetry('POST', `${baseUrl}/api/customer/contact/insert`, body, token);
};

exports.updateContact = async (apiConfigId, code, contactData) => {
  const { baseUrl, token } = await getToken(apiConfigId);
  const body = { code, ...contactData };
  return requestWithRetry('POST', `${baseUrl}/api/customer/contact/update`, body, token);
};

exports.deleteContact = async (apiConfigId, codes) => {
  const { baseUrl, token } = await getToken(apiConfigId);
  const codeList = Array.isArray(codes) ? codes : [codes];
  return requestWithRetry('POST', `${baseUrl}/api/customer/contact/delete`, { delIds: codeList.join(',') }, token);
};

exports.uploadFile = async (apiConfigId, files) => {
  const { baseUrl, token } = await getToken(apiConfigId);
  const fileList = Array.isArray(files) ? files : [files];
  const body = {};
  fileList.forEach((file, index) => {
    body[`files[${index}][name]`] = file.name;
    body[`files[${index}][type]`] = file.type || 'application/octet-stream';
    body[`files[${index}][content]`] = file.content;
  });
  return requestWithRetry('POST', `${baseUrl}/api/customer/contact/upload-file`, body, token);
};

const FILES_PER_BATCH = 5;

exports.uploadFilesInBatches = async (apiConfigId, files) => {
  const fileList = Array.isArray(files) ? files : [files];
  const results = [];
  const totalBatches = Math.ceil(fileList.length / FILES_PER_BATCH);

  for (let i = 0; i < totalBatches; i++) {
    const batch = fileList.slice(i * FILES_PER_BATCH, (i + 1) * FILES_PER_BATCH);
    console.log(`[1Office] Upload batch ${i + 1}/${totalBatches}: ${batch.length} files`);

    const result = await exports.uploadFile(apiConfigId, batch);
    results.push({
      batch: i + 1,
      totalBatches,
      fileCount: batch.length,
      fileNames: batch.map(f => f.name),
      success: result.success,
      data: result.data,
      error: result.error
    });

    if (!result.success) {
      console.error(`[1Office] Batch ${i + 1} failed:`, result.error);
      break;
    }

    if (i < totalBatches - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return {
    success: failCount === 0,
    totalFiles: fileList.length,
    totalBatches,
    successBatches: successCount,
    failedBatches: failCount,
    batches: results
  };
};
