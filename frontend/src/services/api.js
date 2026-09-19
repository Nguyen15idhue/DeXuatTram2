export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const fileStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const parseDispositionFilename = (disposition) => {
  if (!disposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8 && utf8[1]) {
    try { return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, '')); } catch { /* silent */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain && plain[1] ? plain[1].trim() : null;
};

const triggerDownload = (href, filename) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename || '';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { a.remove(); } catch { /* silent */ } }, 5000);
};

const handleUnauthorized = (response) => {
  if (response.status === 401) {
    try {
      localStorage.removeItem('token');
      if (typeof window !== 'undefined' && window.location && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    } catch { /* silent */ }
  }
};

export const api = {
  async get(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`);
    const data = await response.json();
    return data;
  },

  async post(endpoint, body) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    return data;
  },

  async put(endpoint, body) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    return data;
  },

  async delete(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    return data;
  },

  async getWithAuth(endpoint, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    handleUnauthorized(response);
    const data = await response.json();
    return data;
  },

  async postWithAuth(endpoint, body, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    handleUnauthorized(response);
    const data = await response.json();
    return data;
  },

  async putWithAuth(endpoint, body, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    handleUnauthorized(response);
    const data = await response.json();
    return data;
  },

  async deleteWithAuth(endpoint, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    handleUnauthorized(response);
    const data = await response.json();
    return data;
  },

  async patchWithAuth(endpoint, body, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    handleUnauthorized(response);
    const data = await response.json();
    return data;
  },

  async downloadWithAuth(endpoint, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    handleUnauthorized(response);
    if (!response.ok) {
      let message = `Tải file thất bại (HTTP ${response.status})`;
      try {
        const err = await response.json();
        if (err && err.message) message = err.message;
      } catch { /* silent */ }
      throw new Error(message);
    }
    return response;
  },

  async uploadWithAuth(endpoint, formData, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    handleUnauthorized(response);
    const data = await response.json();
    return data;
  }
};

const _pendingGets = new Map();
function dedupGet(endpoint) {
  if (_pendingGets.has(endpoint)) return _pendingGets.get(endpoint);
  const p = api.get(endpoint).finally(() => _pendingGets.delete(endpoint));
  _pendingGets.set(endpoint, p);
  return p;
}
function dedupGetWithAuth(endpoint, token) {
  const key = `auth:${endpoint}`;
  if (_pendingGets.has(key)) return _pendingGets.get(key);
  const p = api.getWithAuth(endpoint, token).finally(() => _pendingGets.delete(key));
  _pendingGets.set(key, p);
  return p;
}

export const stationService = {
  getAll() {
    return api.get('/stations');
  },
  getAllWithParams(queryString) {
    return api.get(`/stations?${queryString}`);
  },
  getById(id) {
    return api.get(`/stations/${id}`);
  },
  create(station, token) {
    return api.postWithAuth('/stations', station, token);
  },
  update(id, station, token) {
    return api.putWithAuth(`/stations/${id}`, station, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/stations/${id}`, token);
  }
};

export const proposalService = {
  getAll() {
    return api.get('/proposals');
  },
  getById(id) {
    return api.get(`/proposals/${id}`);
  },
  create(proposal, token, formId) {
    const q = formId ? `?formId=${formId}` : '';
    return api.postWithAuth(`/proposals${q}`, proposal, token);
  },
  checkNearby(data, token) {
    return api.postWithAuth('/proposals/check-nearby', data, token);
  },
  createGuest(data) {
    return api.post('/proposals/guest', data);
  },
  checkNearbyPublic(data) {
    return api.post('/proposals/check-nearby-public', data);
  },
  trackByCode(code) {
    return api.get(`/proposals/track/${encodeURIComponent(code)}`);
  }
};

export const adminProposalService = {
  getAll(status, token) {
    const query = status ? `?status=${status}` : '';
    return api.getWithAuth(`/admin/proposals${query}`, token);
  },
  getAllWithParams(queryString, token) {
    return api.getWithAuth(`/admin/proposals?${queryString}`, token);
  },
  getById(id, token) {
    return api.getWithAuth(`/admin/proposals/${id}`, token);
  },
  updateStatus(id, status, token, reason) {
    return api.putWithAuth(`/admin/proposals/${id}/status`, { status, reason }, token);
  },
  convertToStation(id, data, token) {
    return api.postWithAuth(`/admin/proposals/${id}/convert-to-station`, data || {}, token);
  },
  update(id, data, token) {
    return api.putWithAuth(`/admin/proposals/${id}`, data, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/admin/proposals/${id}`, token);
  },
  duplicates(minM, maxM, token) {
    return api.getWithAuth(`/admin/proposals/duplicates?min_m=${minM}&max_m=${maxM}`, token);
  }
};

export const myProposalService = {
  getAll(status, token) {
    const query = status ? `?status=${status}` : '';
    return api.getWithAuth(`/my-proposals${query}`, token);
  },
  getAllWithParams(queryString, token) {
    return api.getWithAuth(`/my-proposals?${queryString}`, token);
  },
  create(data, token, formId) {
    const q = formId ? `?formId=${formId}` : '';
    return api.postWithAuth(`/proposals${q}`, data, token);
  },
  update(id, data, token) {
    return api.putWithAuth(`/my-proposals/${id}`, data, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/my-proposals/${id}`, token);
  },
  duplicates(minM, maxM, token) {
    return api.getWithAuth(`/my-proposals/duplicates?min_m=${minM}&max_m=${maxM}`, token);
  }
};

export const profileService = {
  update(data, token) {
    return api.putWithAuth('/auth/profile', data, token);
  }
};

export const adminUserService = {
  getAll(token) {
    return api.getWithAuth('/admin/users', token);
  },
  getAllWithParams(queryString, token) {
    return api.getWithAuth(`/admin/users?${queryString}`, token);
  },
  getById(id, token) {
    return api.getWithAuth(`/admin/users/${id}`, token);
  },
  create(user, token) {
    return api.postWithAuth('/admin/users', user, token);
  },
  update(id, user, token) {
    return api.putWithAuth(`/admin/users/${id}`, user, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/admin/users/${id}`, token);
  },
  toggleLock(id, token) {
    return api.patchWithAuth(`/admin/users/${id}/lock`, {}, token);
  },
  changeRole(id, role, token) {
    return api.patchWithAuth(`/admin/users/${id}/role`, { role }, token);
  },
  changePassword(id, password, token, oldPassword) {
    return api.patchWithAuth(`/admin/users/${id}/password`, oldPassword ? { password, old_password: oldPassword } : { password }, token);
  }
};

export const authService = {
  login(email, password) {
    return api.post('/auth/login', { email, password });
  },
  register(full_name, email, phone, password) {
    return api.post('/auth/register', { full_name, email, phone, password });
  },
  fetchUser(token) {
    return api.getWithAuth('/auth/me', token);
  }
};

export const mapService = {
  resolveMapUrl(url) {
    return api.post('/map/resolve-map-url', { url });
  }
};

export const geocodeService = {
  reverse(lat, lng) {
    return api.post('/geocode/reverse', { lat, lng });
  },
  getConfig(token) {
    return api.getWithAuth('/admin/geocode-config', token);
  },
  updateConfig(data, token) {
    return api.putWithAuth('/admin/geocode-config', data, token);
  },
  test(data, token) {
    return api.postWithAuth('/admin/geocode-config/test', data, token);
  }
};

export const dashboardService = {
  getStats(token) {
    return api.getWithAuth('/admin/dashboard', token);
  }
};

export const fieldDefinitionService = {
  getAll(queryString, token) {
    const query = queryString ? `?${queryString}` : '';
    return dedupGetWithAuth(`/field-definitions${query}`, token);
  },
  getById(id, token) {
    return api.getWithAuth(`/field-definitions/${id}`, token);
  },
  getByEntity(entity) {
    return dedupGet(`/field-definitions/entity/${entity}`);
  },
  create(data, token) {
    return api.postWithAuth('/field-definitions', data, token);
  },
  update(id, data, token) {
    return api.putWithAuth(`/field-definitions/${id}`, data, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/field-definitions/${id}`, token);
  },
  updateStatus(id, status, token) {
    return api.patchWithAuth(`/field-definitions/${id}/status`, { status }, token);
  },
  setLock(id, locked, token) {
    return api.patchWithAuth(`/field-definitions/${id}/lock`, { locked }, token);
  }
};

export const formService = {
  getAll(queryString, token) {
    const query = queryString ? `?${queryString}` : '';
    return api.getWithAuth(`/forms${query}`, token);
  },
  getById(id) {
    return api.get(`/forms/${id}`);
  },
  getByEntityAndPurpose(entity, purpose) {
    return dedupGet(`/forms/by-entity-purpose?entity=${entity}&purpose=${purpose}`);
  },
  create(data, token) {
    return api.postWithAuth('/forms', data, token);
  },
  update(id, data, token) {
    return api.putWithAuth(`/forms/${id}`, data, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/forms/${id}`, token);
  }
};

export const formFieldService = {
  getByForm(formId) {
    return api.get(`/forms/${formId}/fields`);
  },
  add(formId, data, token) {
    return api.postWithAuth(`/forms/${formId}/fields`, data, token);
  },
  update(formId, id, data, token) {
    return api.putWithAuth(`/forms/${formId}/fields/${id}`, data, token);
  },
  remove(formId, id, token) {
    return api.deleteWithAuth(`/forms/${formId}/fields/${id}`, token);
  },
  reorder(formId, items, token) {
    return api.putWithAuth(`/forms/${formId}/fields/reorder`, { items }, token);
  }
};

export const viewService = {
  getAll(queryString, token) {
    const query = queryString ? `?${queryString}` : '';
    return api.getWithAuth(`/views${query}`, token);
  },
  getById(id) {
    return api.get(`/views/${id}`);
  },
  create(data, token) {
    return api.postWithAuth('/views', data, token);
  },
  update(id, data, token) {
    return api.putWithAuth(`/views/${id}`, data, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/views/${id}`, token);
  }
};

export const viewFieldService = {
  getByView(viewId) {
    return api.get(`/views/${viewId}/fields`);
  },
  add(viewId, data, token) {
    return api.postWithAuth(`/views/${viewId}/fields`, data, token);
  },
  update(viewId, id, data, token) {
    return api.putWithAuth(`/views/${viewId}/fields/${id}`, data, token);
  },
  remove(viewId, id, token) {
    return api.deleteWithAuth(`/views/${viewId}/fields/${id}`, token);
  },
  reorder(viewId, items, token) {
    return api.putWithAuth(`/views/${viewId}/fields/reorder`, { items }, token);
  }
};

export const dynamicService = {
  getFormConfig(entity, formId) {
    return dedupGet(`/dynamic/${entity}/form/${formId}`);
  },
  getViewConfig(entity, viewId) {
    return dedupGet(`/dynamic/${entity}/view/${viewId}`);
  },
  validate(entity, data, token) {
    return api.postWithAuth(`/dynamic/${entity}/validate`, data, token);
  }
};

export const excelService = {
  async downloadBlob(url, token, filename) {
    const response = await api.downloadWithAuth(url, token);

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isExcel = contentType.includes('spreadsheetml')
      || contentType.includes('ms-excel')
      || contentType.includes('octet-stream');

    if (!isExcel) {
      let message = `Máy chủ trả về định dạng không phải Excel (${contentType || 'không rõ định dạng'})`;
      try {
        const text = await response.text();
        if (/^\s*</.test(text)) {
          message = 'Máy chủ trả về trang HTML thay vì file Excel — kiểm tra cấu hình proxy /api (backend có chạy không?).';
        } else {
          const err = JSON.parse(text);
          if (err && err.message) message = err.message;
        }
      } catch { /* silent */ }
      throw new Error(message);
    }

    const serverName = parseDispositionFilename(response.headers.get('content-disposition')) || filename;
    try { if (response.body && response.body.cancel) await response.body.cancel(); } catch { /* silent */ }

    const sep = url.includes('?') ? '&' : '?';
    triggerDownload(`${API_URL}${url}${sep}token=${encodeURIComponent(token)}`, serverName);
    return serverName;
  },

  async exportData(entity, token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.layout) params.append('layout', filters.layout);
    if (filters.formId) params.append('formId', filters.formId);
    if (filters.purpose) params.append('purpose', filters.purpose);
    if (filters.viewId) params.append('viewId', filters.viewId);
    if (filters.viewIds && filters.viewIds.length) params.append('viewIds', filters.viewIds.join(','));
    const query = params.toString() ? `?${params.toString()}` : '';
    await this.downloadBlob(`/admin/excel/export/${entity}${query}`, token, `${fileStamp()}_export_${entity}.xlsx`);
  },

  async exportMyProposals(token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.layout) params.append('layout', filters.layout);
    if (filters.formId) params.append('formId', filters.formId);
    const query = params.toString() ? `?${params.toString()}` : '';
    await this.downloadBlob(`/my-proposals/export${query}`, token, `${fileStamp()}_export_station_proposals.xlsx`);
  },

  async exportDuplicatesBlob(url, body, token, filename) {
    const response = await fetch(`${API_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      let message = 'Export thất bại';
      try {
        const err = await response.json();
        if (err.message) message = err.message;
      } catch { /* silent */ }
      throw new Error(message);
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('spreadsheetml') && !contentType.includes('ms-excel') && !contentType.includes('octet-stream')) {
      throw new Error('Máy chủ trả về định dạng không phải Excel');
    }

    const serverName = parseDispositionFilename(response.headers.get('content-disposition')) || filename;
    const blob = await response.blob();
    const objUrl = window.URL.createObjectURL(blob);
    triggerDownload(objUrl, serverName);
    setTimeout(() => { try { window.URL.revokeObjectURL(objUrl); } catch { /* silent */ } }, 30000);
    return serverName;
  },

  async downloadTemplate(entity, token, opts = {}) {
    const params = new URLSearchParams({ entity });
    if (opts.viewId) params.append('viewId', opts.viewId);
    if (opts.viewIds && opts.viewIds.length) params.append('viewIds', opts.viewIds.join(','));
    if (opts.usage) params.append('usage', opts.usage);
    await this.downloadBlob(`/admin/excel/template?${params.toString()}`, token, `template_${entity}.xlsx`);
  },

  previewImport(entity, file, token, opts = {}) {
    const params = new URLSearchParams({ entity });
    if (opts.viewId) params.append('viewId', opts.viewId);
    if (opts.usage) params.append('usage', opts.usage);
    const formData = new FormData();
    formData.append('file', file);
    return api.uploadWithAuth(`/admin/excel/import/preview?${params.toString()}`, formData, token);
  },

  confirmImport(entity, rows, token, opts = {}) {
    return api.postWithAuth('/admin/excel/import/confirm', { entity, rows, viewId: opts.viewId || null, jobId: opts.jobId || null, geocode: opts.geocode !== false }, token);
  },

  getImportProgress(jobId, token) {
    return api.getWithAuth(`/admin/excel/import/progress/${encodeURIComponent(jobId)}`, token);
  },

  async exportDataList(listId, token) {
    await this.downloadBlob(`/admin/data-lists/${listId}/export`, token, `datalist_${listId}.xlsx`);
  },

  previewDataListImport(listId, file, token) {
    const formData = new FormData();
    formData.append('file', file);
    return api.uploadWithAuth(`/admin/data-lists/${listId}/import/preview`, formData, token);
  },

  confirmDataListImport(listId, rows, token) {
    return api.postWithAuth(`/admin/data-lists/${listId}/import/confirm`, { rows }, token);
  },
};

export const dataListService = {
  getAll(params, token) {
    return api.getWithAuth(`/admin/data-lists?${params}`, token);
  },
  getById(id, token, params = '') {
    const query = params ? `?${params}` : '';
    if (!token) return api.get(`/data-lists/${id}${query}`);
    return api.getWithAuth(`/admin/data-lists/${id}${query}`, token);
  },
  getChildren(id, column, parentColumn, parentValue) {
    const q = `column=${encodeURIComponent(column)}&parent_column=${encodeURIComponent(parentColumn)}&parent_value=${encodeURIComponent(parentValue ?? '')}`;
    return api.get(`/data-lists/${id}/children?${q}`);
  },
  create(data, token) {
    return api.postWithAuth('/admin/data-lists', data, token);
  },
  update(id, data, token) {
    return api.putWithAuth(`/admin/data-lists/${id}`, data, token);
  },
  remove(id, token) {
    return api.deleteWithAuth(`/admin/data-lists/${id}`, token);
  },
  addRows(id, rows, token) {
    return api.postWithAuth(`/admin/data-lists/${id}/rows`, { rows }, token);
  },
  updateRow(id, rowId, data, token) {
    return api.putWithAuth(`/admin/data-lists/${id}/rows/${rowId}`, { data }, token);
  },
  deleteRow(id, rowId, token) {
    return api.deleteWithAuth(`/admin/data-lists/${id}/rows/${rowId}`, token);
  }
};

export const formulaService = {
  validate(expression, fields, token) {
    return api.postWithAuth('/formulas/validate', { expression, fields }, token);
  },
  preview(expression, scope = {}, token) {
    return api.postWithAuth('/formulas/preview', { expression, scope }, token);
  },
  previewPost(expression, metadata, scope = {}, token) {
    return api.postWithAuth('/formulas/preview', { expression, metadata, scope }, token);
  }
};

export const apiConfigService = {
  getAll(queryString, token) {
    return api.getWithAuth(`/admin/api-configs?${queryString || ''}`, token);
  },
  getById(id, token) {
    return api.getWithAuth(`/admin/api-configs/${id}`, token);
  },
  create(data, token) {
    return api.postWithAuth('/admin/api-configs', data, token);
  },
  update(id, data, token) {
    return api.putWithAuth(`/admin/api-configs/${id}`, data, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/admin/api-configs/${id}`, token);
  },
  testConnection(id, token) {
    return api.postWithAuth(`/admin/api-configs/${id}/test`, {}, token);
  },
  syncPersonnel(id, token) {
    return api.postWithAuth(`/admin/api-configs/${id}/sync-personnel`, {}, token);
  },
  rotateWebhookSecret(id, token) {
    return api.postWithAuth(`/admin/api-configs/${id}/webhook-secret/rotate`, {}, token);
  },
  testWebhook(id, data, token) {
    return api.postWithAuth(`/admin/api-configs/${id}/webhook-test`, data, token);
  }
};

export const webhookConfigService = {
  list(token) {
    return api.getWithAuth('/admin/webhook-configs', token);
  },
  create(data, token) {
    return api.postWithAuth('/admin/webhook-configs', data, token);
  },
  rotate(id, token) {
    return api.postWithAuth(`/admin/webhook-configs/${id}/rotate`, {}, token);
  },
  setActive(id, isActive, token) {
    return api.putWithAuth(`/admin/webhook-configs/${id}/active`, { is_active: isActive }, token);
  },
  remove(id, token) {
    return api.deleteWithAuth(`/admin/webhook-configs/${id}`, token);
  },
  testSend(data, token) {
    return api.postWithAuth('/admin/webhook-configs/test-send', data, token);
  },
  inboundLogs(params, token) {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    return api.getWithAuth(`/admin/webhook-configs/inbound-logs?${qs.toString()}`, token);
  }
};

export const externalUserService = {
  getAll(system, token) {
    const qs = system ? `?system=${encodeURIComponent(system)}` : '';
    return api.getWithAuth(`/admin/external-users${qs}`, token);
  }
};

export const notificationService = {
  getAll(page = 1, limit = 20, token) {
    return api.getWithAuth(`/notifications?page=${page}&limit=${limit}`, token);
  },
  unreadCount(token) {
    return api.getWithAuth('/notifications/unread-count', token);
  },
  getAllAdmin(page = 1, limit = 20, token) {
    return api.getWithAuth(`/notifications/all?page=${page}&limit=${limit}`, token);
  },
  markRead(id, token) {
    return api.putWithAuth(`/notifications/${id}/read`, {}, token);
  },
  markAllRead(token) {
    return api.putWithAuth('/notifications/read-all', {}, token);
  }
};

export const fieldMappingService = {
  getTypes(token, configId) {
    const url = configId ? `/admin/field-mappings/types?configId=${configId}` : '/admin/field-mappings/types';
    return api.getWithAuth(url, token);
  },
  getAllByConfig(configId, token) {
    return api.getWithAuth(`/admin/field-mappings/${configId}`, token);
  },
  getById(id, token) {
    return api.getWithAuth(`/admin/field-mappings/detail/${id}`, token);
  },
  create(configId, data, token) {
    return api.postWithAuth(`/admin/field-mappings/${configId}`, data, token);
  },
  update(id, data, token) {
    return api.putWithAuth(`/admin/field-mappings/${id}`, data, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/admin/field-mappings/${id}`, token);
  },
  preview(data, token) {
    return api.postWithAuth('/admin/field-mappings/preview', data, token);
  },
  updateMetadata(configId, metadata, token) {
    return api.putWithAuth(`/admin/field-mappings/metadata/${configId}`, metadata, token);
  },
  getSelectedFields(configId, token) {
    return api.getWithAuth(`/admin/field-mappings/selected-fields/${configId}`, token);
  },
  updateSelectedFields(configId, fields, token) {
    return api.putWithAuth(`/admin/field-mappings/selected-fields/${configId}`, fields, token);
  },
  getUsedInDesc(configId, token) {
    return api.getWithAuth(`/admin/field-mappings/used-in-desc/${configId}`, token);
  }
};

export const oneOfficeSyncService = {
  push(data, token) {
    return api.postWithAuth('/admin/1office/push', data, token);
  },
  pull(data, token) {
    return api.postWithAuth('/admin/1office/pull', data, token);
  },
  link(data, token) {
    return api.postWithAuth('/admin/1office/link', data, token);
  },
  unlink(data, token) {
    return api.postWithAuth('/admin/1office/unlink', data, token);
  },
  searchContacts(configId, query, token) {
    return api.getWithAuth(`/admin/1office/contacts/search?configId=${configId}&q=${encodeURIComponent(query || '')}`, token);
  },
  getJobDetail(jobId, token) {
    return api.getWithAuth(`/admin/queue-logs/${jobId}`, token);
  },
  getTemplate(configId, token) {
    return api.getWithAuth(`/admin/1office/template?configId=${configId}`, token);
  },
  updateTemplate(configId, template, token) {
    return api.putWithAuth('/admin/1office/template', { configId, template }, token);
  },
  previewDesc(configId, proposalId, token) {
    return api.postWithAuth('/admin/1office/preview', { apiConfigId: configId, proposalId }, token);
  }
};

export const queueLogService = {
  getAll(filters, token) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    return api.getWithAuth(`/admin/queue-logs?${params.toString()}`, token);
  },
  getStats(apiConfigId, token) {
    const q = apiConfigId ? `?api_config_id=${apiConfigId}` : '';
    return api.getWithAuth(`/admin/queue-logs/stats${q}`, token);
  },
  getById(id, token) {
    return api.getWithAuth(`/admin/queue-logs/${id}`, token);
  },
  retry(id, token) {
    return api.postWithAuth(`/admin/queue-logs/${id}/retry`, {}, token);
  },
  cancel(id, token) {
    return api.postWithAuth(`/admin/queue-logs/${id}/cancel`, {}, token);
  }
};

export const proposalLogService = {
  getAll(filters, token) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    return api.getWithAuth(`/admin/proposal-logs?${params.toString()}`, token);
  },
  timeline(proposalId, token) {
    return api.getWithAuth(`/admin/proposal-logs/${proposalId}/timeline`, token);
  }
};
