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

  async getWithAuth(endpoint, token) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    return data;
  }
};

export const stationService = {
  getAll() {
    return api.get('/stations');
  },
  getById(id) {
    return api.get(`/stations/${id}`);
  }
};

export const proposalService = {
  getAll() {
    return api.get('/proposals');
  },
  getById(id) {
    return api.get(`/proposals/${id}`);
  }
};
