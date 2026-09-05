const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
    const data = await response.json();
    return data;
  },

  async deleteWithAuth(endpoint, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
    const data = await response.json();
    return data;
  },

  async downloadWithAuth(endpoint, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Download failed');
    return response;
  },

  async uploadWithAuth(endpoint, formData, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await response.json();
    return data;
  }
};

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
  create(proposal, token) {
    return api.postWithAuth('/proposals', proposal, token);
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
  updateStatus(id, status, token) {
    return api.putWithAuth(`/admin/proposals/${id}/status`, { status }, token);
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
  create(data, token) {
    return api.postWithAuth('/proposals', data, token);
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

export const dashboardService = {
  getStats(token) {
    return api.getWithAuth('/admin/dashboard', token);
  }
};

export const fieldDefinitionService = {
  getAll(queryString, token) {
    const query = queryString ? `?${queryString}` : '';
    return api.getWithAuth(`/field-definitions${query}`, token);
  },
  getById(id, token) {
    return api.getWithAuth(`/field-definitions/${id}`, token);
  },
  getByEntity(entity) {
    return api.get(`/field-definitions/entity/${entity}`);
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
    return api.get(`/dynamic/${entity}/form/${formId}`);
  },
  getViewConfig(entity, viewId) {
    return api.get(`/dynamic/${entity}/view/${viewId}`);
  },
  validate(entity, data, token) {
    return api.postWithAuth(`/dynamic/${entity}/validate`, data, token);
  }
};

export const excelService = {
  async downloadBlob(url, token, filename) {
    const response = await api.downloadWithAuth(url, token);
    const blob = await response.blob();
    const objUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objUrl);
  },

  async exportData(entity, token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    await this.downloadBlob(`/admin/excel/export/${entity}${query}`, token, `${entity}_export.xlsx`);
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
    const blob = await response.blob();
    const objUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objUrl);
  },

  async downloadTemplate(entity, token) {
    await this.downloadBlob(`/admin/excel/template?entity=${entity}`, token, `${entity}_template.xlsx`);
  },

  previewImport(entity, file, token) {
    const formData = new FormData();
    formData.append('file', file);
    return api.uploadWithAuth(`/admin/excel/import/preview?entity=${entity}`, formData, token);
  },

  confirmImport(entity, rows, token) {
    return api.postWithAuth('/admin/excel/import/confirm', { entity, rows }, token);
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
