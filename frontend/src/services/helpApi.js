import { API_URL, api } from './api';

const _cache = new Map();
const _pending = new Map();

const CACHE_TTL = 60 * 1000;

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) {
    _cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  _cache.set(key, { at: Date.now(), data });
}

export function clearHelpCache() {
  _cache.clear();
}

function dedup(key, loader) {
  if (_pending.has(key)) return _pending.get(key);
  const p = loader().finally(() => _pending.delete(key));
  _pending.set(key, p);
  return p;
}

async function fetchOk(endpoint, token) {
  const res = token ? await api.getWithAuth(endpoint, token) : await api.get(endpoint);
  if (!res || res.success !== true) {
    const err = new Error((res && res.message) || 'Help API error');
    err.payload = res;
    throw err;
  }
  return res.data;
}

export const helpApi = {
  getCategories(token) {
    const key = `cats:${token ? 'auth' : 'guest'}`;
    const hit = cacheGet(key);
    if (hit) return Promise.resolve(hit);
    return dedup(key, async () => {
      const data = await fetchOk('/help/categories', token);
      cacheSet(key, data);
      return data;
    });
  },

  getArticles({ category, q } = {}, token) {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (q) params.set('q', q);
    const qs = params.toString();
    const key = `arts:${qs}:${token ? 'auth' : 'guest'}`;
    const hit = cacheGet(key);
    if (hit) return Promise.resolve(hit);
    return dedup(key, async () => {
      const data = await fetchOk(`/help/articles${qs ? `?${qs}` : ''}`, token);
      cacheSet(key, data);
      return data;
    });
  },

  getArticle(slug, token) {
    const key = `art:${slug}:${token ? 'auth' : 'guest'}`;
    const hit = cacheGet(key);
    if (hit) return Promise.resolve(hit);
    return dedup(key, async () => {
      const data = await fetchOk(`/help/articles/${encodeURIComponent(slug)}`, token);
      cacheSet(key, data);
      return data;
    });
  },

  trackView(id) {
    try {
      const p = api.post('/help/track-view', { id });
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return p;
    } catch {
      return Promise.resolve(null);
    }
  },
};

async function authOk(res) {
  if (!res || res.success !== true) {
    const err = new Error((res && res.message) || 'Help admin API error');
    err.payload = res;
    throw err;
  }
  return res.data;
}

export const adminHelpApi = {
  list(params, token) {
    const qs = new URLSearchParams();
    if (params && params.status) qs.set('status', params.status);
    if (params && params.category) qs.set('category', params.category);
    if (params && params.q) qs.set('q', params.q);
    const s = qs.toString();
    return api.getWithAuth(`/admin/help/articles${s ? `?${s}` : ''}`, token).then(authOk);
  },
  get(id, token) {
    return api.getWithAuth(`/admin/help/articles/${id}`, token).then(authOk);
  },
  categories(token) {
    return api.getWithAuth('/admin/help/categories', token).then(authOk);
  },
  createCategory(body, token) {
    return api.postWithAuth('/admin/help/categories', body, token).then(authOk);
  },
  create(body, token) {
    return api.postWithAuth('/admin/help/articles', body, token).then(authOk);
  },
  update(id, body, token) {
    return api.putWithAuth(`/admin/help/articles/${id}`, body, token).then(authOk);
  },
  remove(id, token) {
    return api.deleteWithAuth(`/admin/help/articles/${id}`, token).then(authOk);
  },
  publish(id, token) {
    return api.postWithAuth(`/admin/help/articles/${id}/publish`, {}, token).then(authOk);
  },
  archive(id, token) {
    return api.postWithAuth(`/admin/help/articles/${id}/archive`, {}, token).then(authOk);
  },
  legacyStatus(token) {
    return api.postWithAuth('/admin/help/import-legacy', {}, token).then(authOk);
  },
  uploadVideo(file, token) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('originalName', file.name);
    return api.uploadWithAuth('/admin/help/videos', formData, token);
  },
};

export function helpFileUrl(fileId, token) {
  const base = `${API_URL}/files/${fileId}/download`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function youtubeVideoId(url) {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}

export function youtubeEmbedUrl(url) {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
