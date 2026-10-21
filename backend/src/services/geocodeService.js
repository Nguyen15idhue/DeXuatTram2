const https = require('https');
const pool = require('../utils/db');
const dataListService = require('./dataListService');

const ALLOWED_FIELDS = ['provider', 'api_key', 'enabled', 'lang', 'countrycodes', 'cache_ttl_days'];

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

const parseResult = (val) => {
  if (!val) return null;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val;
};

exports.getConfig = async () => {
  const [rows] = await pool.query('SELECT * FROM geocode_configs ORDER BY id LIMIT 1');
  return rows[0] || null;
};

exports.updateConfig = async (data) => {
  const config = await exports.getConfig();
  if (!config) return null;
  const fields = [];
  const values = [];
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(key === 'enabled' ? (Number(data[key]) ? 1 : 0) : data[key]);
    }
  }
  if (fields.length === 0) return config;
  values.push(config.id);
  await pool.query(`UPDATE geocode_configs SET ${fields.join(', ')} WHERE id = ?`, values);
  return exports.getConfig();
};

const getCached = async (lat, lng, ttlDays) => {
  const [rows] = await pool.query(
    'SELECT result, updated_at FROM geocode_cache WHERE lat_key = ? AND lng_key = ? LIMIT 1',
    [round4(lat), round4(lng)]
  );
  if (rows.length === 0) return null;
  const ageMs = Date.now() - new Date(rows[0].updated_at).getTime();
  if (ageMs > ttlDays * 24 * 60 * 60 * 1000) return null;
  return parseResult(rows[0].result);
};

const setCache = async (lat, lng, result) => {
  await pool.query(
    `INSERT INTO geocode_cache (lat_key, lng_key, result) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE result = VALUES(result), updated_at = CURRENT_TIMESTAMP`,
    [round4(lat), round4(lng), JSON.stringify(result)]
  );
};

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const timeout = Number(process.env.GEOCODE_TIMEOUT_MS) || 8000;
    const req = https.get(url, {
      timeout,
      headers: { 'User-Agent': 'StationManagement/1.0 (Geocode)' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Geoapify HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Geoapify timeout')); });
  });
}

const FORWARD_CACHE_TTL_MS = 5 * 60 * 1000;
const forwardCache = new Map();

// Fallback không cần API key: Nominatim (OpenStreetMap). Dùng khi geocode_configs
// chưa có key/bị tắt, để tìm địa chỉ vẫn chạy được ngay sau khi clone dự án.
function nominatimSearch(q, limit) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      addressdetails: '1',
      limit: String(Math.min(10, limit || 6)),
      countrycodes: 'vn',
      'accept-language': 'vi',
    });
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const req = https.get(url, {
      timeout: Number(process.env.GEOCODE_TIMEOUT_MS) || 8000,
      headers: { 'User-Agent': 'StationManagement/1.0 (Geocode)' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve([]);
        try {
          const arr = JSON.parse(data);
          resolve(Array.isArray(arr) ? arr : []);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

function normalizeNominatim(item, admin) {
  const a = (item && item.address) || {};
  const geo = {
    name: item.name || item.display_name || '',
    formatted: item.display_name || '',
    address_line1: [a.house_number, a.road].filter(Boolean).join(' '),
    address_line2: a.suburb || a.quarter || a.city_district || '',
    city: a.city || a.town || a.village || '',
    county: a.county || '',
    state: a.state || '',
    suburb: a.suburb || a.quarter || a.neighbourhood || '',
    district: a.city_district || a.district || '',
    country: a.country || 'Việt Nam',
    lat: item.lat,
    lon: item.lon,
  };
  if (admin) {
    return {
      found: true,
      name: geo.address_line1 || geo.name || geo.formatted,
      formatted: geo.formatted,
      address_line1: geo.address_line1,
      address_line2: geo.address_line2,
      lat: geo.lat,
      lon: geo.lon,
      city: geo.city,
      county: geo.county,
      state: geo.state,
      suburb: geo.suburb,
      district: geo.district,
      country: geo.country,
    };
  }
  return { found: true, ...geo };
}

function forwardCacheKey(text, lat, lng) {
  const la = Number.isFinite(lat) ? Math.round(lat * 100) / 100 : '';
  const ln = Number.isFinite(lng) ? Math.round(lng * 100) / 100 : '';
  return `${String(text).trim().toLowerCase()}|${la}|${ln}`;
}

function looksLikeWard(value) {
  return /^(phường|xã|thị trấn|đặc khu)\b/i.test(String(value || '').trim());
}

function buildAddress(geo, admin) {
  if (!geo) return '';
  const parts = [];
  const line1 = [geo.housenumber, geo.street].filter(Boolean).join(' ').trim();
  if (line1) parts.push(line1);

  let ward = (admin && admin.xa_phuong) || '';
  if (!ward && looksLikeWard(geo.suburb)) ward = geo.suburb;
  if (!ward && looksLikeWard(geo.city)) ward = geo.city;
  if (!ward && looksLikeWard(geo.district)) ward = geo.district;
  if (!ward) ward = geo.suburb || geo.quarter || geo.district || '';

  const province = (admin && admin.province) || geo.state || geo.city || '';
  const country = geo.country || 'Việt Nam';

  if (ward) parts.push(ward);
  if (province && province !== ward) parts.push(province);
  if (country) parts.push(country);
  return parts.join(', ');
}

function normalizeGeoapify(props) {
  return {
    found: true,
    formatted: props.formatted || '',
    address_line1: props.address_line1 || '',
    address_line2: props.address_line2 || '',
    name: props.name || '',
    city: props.city || '',
    county: props.county || '',
    state: props.state || '',
    suburb: props.suburb || '',
    district: props.district || '',
    quarter: props.quarter || '',
    street: props.street || '',
    housenumber: props.housenumber || '',
    postcode: props.postcode || '',
    country: props.country || '',
    result_type: props.result_type || '',
    confidence: props.rank && props.rank.confidence != null ? props.rank.confidence : null,
  };
}

// Fallback không cần API key: Nominatim reverse (tọa độ → địa chỉ).
function nominatimReverse(lat, lng) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      addressdetails: '1',
      'accept-language': 'vi',
    });
    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
    const req = https.get(url, {
      timeout: Number(process.env.GEOCODE_TIMEOUT_MS) || 8000,
      headers: { 'User-Agent': 'StationManagement/1.0 (Geocode)' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

exports.reverse = async (lat, lng) => {
  const config = await exports.getConfig();
  const hasKey = !!(config && Number(config.enabled) && config.api_key);

  const ttlDays = Number((config && config.cache_ttl_days) || 0) || 30;
  let result = await getCached(lat, lng, ttlDays);

  if (!result && hasKey) {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      apiKey: config.api_key,
    });
    if (config.lang) params.set('lang', config.lang);
    if (config.countrycodes) params.set('countrycodes', config.countrycodes);

    const url = `https://api.geoapify.com/v1/geocode/reverse?${params.toString()}`;
    const json = await httpGetJson(url);

    if (!json || !Array.isArray(json.results) || json.results.length === 0) {
      const notFound = { found: false };
      await setCache(lat, lng, notFound);
      return notFound;
    }
    result = normalizeGeoapify(json.results[0]);
  }

  if (!result) {
    // Chưa cấu hình Geoapify → dùng Nominatim (miễn phí, không cần key)
    let item = null;
    try {
      item = await nominatimReverse(lat, lng);
    } catch {
      item = null;
    }
    if (!item || item.error || !item.lat) {
      const notFound = { found: false, fallback: true };
      await setCache(lat, lng, notFound);
      return notFound;
    }
    result = normalizeNominatim(item, false);
    result.fallback = true;
    result.formatted = item.display_name || '';
    const a = item.address || {};
    result.housenumber = a.house_number || '';
    result.street = a.road || '';
    result.quarter = a.quarter || '';
  }

  if (result.found && !result.admin) {
    try {
      result.admin = await dataListService.matchAdministrative(result);
    } catch (err) {
      console.warn('[Geocode] match error:', err.message);
    }
    await setCache(lat, lng, result);
  }

  if (result.found && !result.address) {
    result.address = buildAddress(result, result.admin);
    await setCache(lat, lng, result);
  }

  return result;
};

exports.forward = async (text, opts = {}) => {
  const q = String(text || '').trim();
  if (q.length < 3) return { found: false, results: [] };

  const config = await exports.getConfig();
  const hasKey = !!(config && Number(config.enabled) && config.api_key);

  const lat = parseFloat(opts.lat);
  const lng = parseFloat(opts.lng);
  const limit = Math.min(10, Math.max(1, parseInt(opts.limit, 10) || 6));

  const key = forwardCacheKey(q, lat, lng);
  const cached = forwardCache.get(key);
  if (cached && Date.now() - cached.t < FORWARD_CACHE_TTL_MS) {
    return cached.data;
  }

  if (!hasKey) {
    // Chưa cấu hình Geoapify → dùng Nominatim (miễn phí, không cần key)
    const raw = await nominatimSearch(q, limit);
    const results = raw
      .map((item) => normalizeNominatim(item, true))
      .filter((r) => Number.isFinite(parseFloat(r.lat)) && Number.isFinite(parseFloat(r.lon)));
    const data = { found: results.length > 0, fallback: true, results };
    forwardCache.set(key, { t: Date.now(), data });
    return data;
  }

  const params = new URLSearchParams({
    text: q,
    format: 'json',
    limit: String(limit),
    apiKey: config.api_key,
  });
  if (config.lang) params.set('lang', config.lang);
  const cc = String(config.countrycodes || '').split(',')[0].trim();
  if (cc) params.set('filter', `countrycode:${cc}`);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set('bias', `proximity:${lng},${lat}`);
  }

  const url = `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`;
  let json;
  try {
    json = await httpGetJson(url);
  } catch (err) {
    console.warn('[Geocode] forward error:', err.message);
    return { found: false, error: true, results: [] };
  }

  const results = (Array.isArray(json && json.results) ? json.results : []).map((r) => ({
    name: r.name || r.address_line1 || r.formatted || '',
    formatted: r.formatted || '',
    address_line1: r.address_line1 || '',
    address_line2: r.address_line2 || '',
    lat: r.lat,
    lon: r.lon,
    city: r.city || '',
    county: r.county || '',
    state: r.state || '',
    suburb: r.suburb || '',
    district: r.district || '',
    country: r.country || '',
  })).filter((r) => Number.isFinite(parseFloat(r.lat)) && Number.isFinite(parseFloat(r.lon)));

  const data = { found: results.length > 0, results };
  forwardCache.set(key, { t: Date.now(), data });
  if (forwardCache.size > 500) {
    for (const [k, v] of forwardCache) {
      if (Date.now() - v.t > FORWARD_CACHE_TTL_MS) forwardCache.delete(k);
    }
  }
  return data;
};
