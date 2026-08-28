const API_URL = 'http://localhost:3000/api';

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
  updateStatus(id, status, token) {
    return api.putWithAuth(`/admin/proposals/${id}/status`, { status }, token);
  },
  delete(id, token) {
    return api.deleteWithAuth(`/admin/proposals/${id}`, token);
  }
};

export const myProposalService = {
  getAll(status, token) {
    const query = status ? `?status=${status}` : '';
    return api.getWithAuth(`/my-proposals${query}`, token);
  }
};

export const adminUserService = {
  getAll(token) {
    return api.getWithAuth('/admin/users', token);
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
