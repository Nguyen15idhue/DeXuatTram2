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

exports.reverse = async (lat, lng) => {
  const config = await exports.getConfig();
  if (!config || !Number(config.enabled)) return { found: false, disabled: true };
  if (!config.api_key) return { found: false, disabled: true };

  const ttlDays = Number(config.cache_ttl_days) || 30;
  let result = await getCached(lat, lng, ttlDays);

  if (!result) {
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
