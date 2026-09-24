const pool = require('../utils/db');
const ttlCache = require('../utils/ttlCache');

const PROVIDERS = ['gemini', 'openrouter'];
const CACHE_KEY = 'assistant:provider-config';
const CACHE_TTL_MS = 60 * 1000;
const MAX_MODELS = 6;
const MAX_MODEL_LEN = 150;

function parseList(value) {
  if (value === null || value === undefined) return [];
  const arr = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(arr) ? arr : [];
}

function cleanModels(list) {
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    const s = String(m || '').trim();
    if (!s || s.length > MAX_MODEL_LEN || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}

function keyConfigured(name) {
  if (name === 'gemini') return !!process.env.GEMINI_API_KEY;
  if (name === 'openrouter') return !!process.env.OPENROUTER_API_KEY;
  return false;
}

function envModels(name) {
  if (name === 'gemini') {
    return [String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim()].filter(Boolean);
  }
  return String(process.env.OPENROUTER_MODEL || 'nex-agi/nex-n2.5-mini:free')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

function envVisionModels() {
  return String(process.env.OPENROUTER_VISION_MODEL || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

async function getConfig() {
  const hit = ttlCache.get(CACHE_KEY);
  if (hit) return hit;
  const [rows] = await pool.query(
    'SELECT provider, enabled, models, vision_models, priority, updated_at FROM assistant_provider_configs'
  );
  const byName = {};
  for (const r of rows) byName[r.provider] = r;
  const providers = PROVIDERS.map((name) => {
    const r = byName[name];
    const models = r ? parseList(r.models) : [];
    const visionModels = r ? parseList(r.vision_models) : [];
    return {
      provider: name,
      enabled: r ? Number(r.enabled) === 1 : true,
      models,
      visionModels,
      effectiveModels: models.length > 0 ? models : envModels(name),
      effectiveVisionModels: name === 'openrouter'
        ? (visionModels.length > 0 ? visionModels : envVisionModels())
        : [],
      priority: r ? Number(r.priority) || 10 : 10,
      keyConfigured: keyConfigured(name),
      updatedAt: r ? r.updated_at : null,
    };
  }).sort((a, b) => a.priority - b.priority);
  const out = { providers, fetchedAt: new Date().toISOString() };
  ttlCache.set(CACHE_KEY, out, CACHE_TTL_MS);
  return out;
}

function invalidate() {
  ttlCache.del(CACHE_KEY);
  ttlCache.delPrefix('assistant:');
}

function validatePayload(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.providers)) {
    const err = new Error('providers phai la mang');
    err.statusCode = 400;
    throw err;
  }
  if (body.providers.length === 0) {
    const err = new Error('providers khong duoc rong');
    err.statusCode = 400;
    throw err;
  }
  const seenPriority = new Set();
  const out = [];
  for (const p of body.providers) {
    if (!p || !PROVIDERS.includes(p.provider)) {
      const err = new Error('provider khong hop le (gemini|openrouter)');
      err.statusCode = 400;
      throw err;
    }
    const enabled = p.enabled === true || p.enabled === 1 || p.enabled === '1';
    const models = cleanModels(p.models);
    const visionModels = cleanModels(p.visionModels !== undefined ? p.visionModels : p.vision_models);
    const priority = Number(p.priority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 99) {
      const err = new Error('priority phai la so nguyen 1-99');
      err.statusCode = 400;
      throw err;
    }
    if (seenPriority.has(priority)) {
      const err = new Error('priority phai duy nhat cho tung provider');
      err.statusCode = 400;
      throw err;
    }
    seenPriority.add(priority);
    out.push({ provider: p.provider, enabled: enabled ? 1 : 0, models, visionModels, priority });
  }
  return out;
}

async function saveConfig(body) {
  const items = validatePayload(body);
  for (const it of items) {
    await pool.query(
      'INSERT INTO assistant_provider_configs (provider, enabled, models, vision_models, priority) VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), models = VALUES(models), vision_models = VALUES(vision_models), priority = VALUES(priority)',
      [it.provider, it.enabled, JSON.stringify(it.models), JSON.stringify(it.visionModels), it.priority]
    );
  }
  invalidate();
  return getConfig();
}

const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MODEL_FETCH_TIMEOUT_MS = 15000;

async function fetchGeminiModels() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('Chua cau hinh key Gemini nen khong tai duoc danh sach model');
    err.statusCode = 503;
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(key)}`, { signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((body && body.error && body.error.message) || `Gemini HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }
    const list = Array.isArray(body && body.models) ? body.models : [];
    return list
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => ({
        id: String(m.name || '').replace(/^models\//, ''),
        name: m.displayName || String(m.name || '').replace(/^models\//, ''),
      }))
      .filter((m) => m.id);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpenRouterModels() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(`OpenRouter HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }
    const list = Array.isArray(body && body.data) ? body.data : [];
    return list
      .map((m) => ({
        id: String(m.id || ''),
        name: m.name || String(m.id || ''),
        free: String((m.pricing && m.pricing.prompt) || '0') === '0' && String((m.pricing && m.pricing.completion) || '0') === '0',
        context: m.context_length || null,
      }))
      .filter((m) => m.id);
  } finally {
    clearTimeout(timer);
  }
}

async function listModels(provider, refresh) {
  if (!PROVIDERS.includes(provider)) {
    const err = new Error('provider khong hop le (gemini|openrouter)');
    err.statusCode = 400;
    throw err;
  }
  if (!refresh) {
    const [cached] = await pool.query(
      'SELECT models, fetched_at FROM assistant_model_cache WHERE provider = ? AND fetched_at > (NOW() - INTERVAL 24 HOUR)',
      [provider]
    );
    if (cached.length > 0) {
      return { provider, models: parseList(cached[0].models), cached: true, fetchedAt: cached[0].fetched_at };
    }
  }
  const models = provider === 'gemini' ? await fetchGeminiModels() : await fetchOpenRouterModels();
  await pool.query(
    'INSERT INTO assistant_model_cache (provider, models) VALUES (?, CAST(? AS JSON)) ON DUPLICATE KEY UPDATE models = VALUES(models), fetched_at = CURRENT_TIMESTAMP',
    [provider, JSON.stringify(models)]
  );
  const [row] = await pool.query('SELECT fetched_at FROM assistant_model_cache WHERE provider = ?', [provider]);
  return { provider, models, cached: false, fetchedAt: row.length > 0 ? row[0].fetched_at : new Date().toISOString() };
}

module.exports = { getConfig, saveConfig, invalidate, validatePayload, listModels, PROVIDERS, cleanModels };
