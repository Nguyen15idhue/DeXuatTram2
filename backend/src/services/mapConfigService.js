const pool = require('../utils/db');
const { TILE_PROVIDERS } = require('../config/tileProviders');


function stripSecretsFromUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let out = url.replace(/([?&])(?:apikey|api_key|key|access_token|token|auth)=([^&#]*)/gi, '$1');
  out = out
    .replace(/\?&/g, '?')
    .replace(/&&+/g, '&')
    .replace(/[?&]+(?=$|#)/, '')
    .replace(/[?&]+$/g, '');
  return out;
}

function parseMaybeJson(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function sanitizeLayersConfig(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.map(sanitizeLayersConfig);
  if (parsed && typeof parsed === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && /^https?:\/\//i.test(val)) out[key] = stripSecretsFromUrl(val);
      else if (val && typeof val === 'object') out[key] = sanitizeLayersConfig(val);
      else out[key] = val;
    }
    return out;
  }
  return parsed;
}

const ALLOWED_UPDATE_FIELDS = new Set([
  'name', 'entity', 'label_field',
  'tile_provider', 'tile_provider_id', 'tile_url', 'tile_attribution', 'tile_subdomains',
  'api_key', 'map_id', 'auth_type',
  'style_url', 'renderer', 'tile_mode', 'retina', 'default_mode', 'layers_config', 'enable_3d',
  'show_boundaries', 'show_cluster', 'show_province_labels',
  'center_lat', 'center_lng', 'default_zoom', 'max_zoom', 'max_native_zoom',
]);

exports.getTileProviders = () => TILE_PROVIDERS;

exports.getConfig = async (entity, opts = {}) => {
  const [rows] = await pool.query('SELECT * FROM map_configs WHERE entity = ? LIMIT 1', [entity || 'stations']);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (opts.includeSecret) return row;
  const safe = { ...row };
  safe.tile_url = stripSecretsFromUrl(safe.tile_url);
  safe.layers_config = sanitizeLayersConfig(safe.layers_config);
  if (safe.tile_mode !== 'direct') delete safe.api_key;
  return safe;
};

exports.createConfig = async (data) => {
  const { name, entity, label_field, tile_provider, tile_url, tile_attribution, tile_subdomains, show_boundaries, show_cluster, show_province_labels, center_lat, center_lng, default_zoom } = data;
  const [result] = await pool.query(
    `INSERT INTO map_configs (name, entity, label_field, tile_provider, tile_url, tile_attribution, tile_subdomains, show_boundaries, show_cluster, show_province_labels, center_lat, center_lng, default_zoom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name || 'default', entity, label_field || 'name', tile_provider || 'osm', tile_url, tile_attribution, tile_subdomains, show_boundaries ?? 1, show_cluster ?? 1, show_province_labels ?? 1, center_lat || 14.0583, center_lng || 108.2772, default_zoom || 6]
  );
  return { id: result.insertId, ...data };
};

exports.updateConfig = async (id, data) => {
  const fields = [];
  const params = [];
  const ignored = [];
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) {
      ignored.push(key);
      continue;
    }
    if (value !== undefined && key !== 'id') {
      fields.push(`${key} = ?`);
      params.push(key === 'layers_config' && value !== null && typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }
  if (ignored.length > 0) console.warn('[MapConfig] ignored unknown fields:', ignored.join(', '));
  if (fields.length === 0) return null;
  params.push(id);
  await pool.query(`UPDATE map_configs SET ${fields.join(', ')} WHERE id = ?`, params);
  const [rows] = await pool.query('SELECT * FROM map_configs WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.deleteConfig = async (id) => {
  const [result] = await pool.query('DELETE FROM map_configs WHERE id = ?', [id]);
  return result.affectedRows > 0;
};
