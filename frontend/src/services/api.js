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
  update(id, data, token) {
    return api.putWithAuth(`/my-proposals/${id}`, data, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/my-proposals/${id}`, token);
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
  async exportStations(token) {
    const response = await api.downloadWithAuth('/admin/excel/export/stations', token);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stations.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async exportProposals(token) {
    const response = await api.downloadWithAuth('/admin/excel/export/proposals', token);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proposals.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async downloadTemplate(token) {
    const response = await api.downloadWithAuth('/admin/excel/template', token);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'station_import_template.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  previewImport(file, token) {
    const formData = new FormData();
    formData.append('file', file);
    return api.uploadWithAuth('/admin/excel/import/preview', formData, token);
  },

  confirmImport(rows, token) {
    return api.postWithAuth('/admin/excel/import/confirm', { rows }, token);
  }
};
