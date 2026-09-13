const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const router = express.Router();
const pool = require('../utils/db');
const mapConfigService = require('../services/mapConfigService');

const ALLOWED_TILE_HOSTS = [
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'tiles.openstreetmap.org',
  'tile.openstreetmap.de',
  'a.tile.openstreetmap.fr',
  'b.tile.openstreetmap.fr',
  'c.tile.openstreetmap.fr',
  'a.tile.opentopomap.org',
  'b.tile.opentopomap.org',
  'c.tile.opentopomap.org',
  'server.arcgisonline.com',
  'basemaps.cartocdn.com',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'maps.geoapify.com',
  'api.mapbox.com',
  'maps.hereapi.com',
  'api.tomtom.com',
];

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_CACHE_MAX_AGE = 7 * 24 * 60 * 60;
const USER_AGENT = 'StationManagement/1.0 (MapTileProxy)';
const FALLBACK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const TARGET_TTL = 30000;
let targetCache = { key: null, value: null, at: 0 };

function buildProviderTileUrl(config) {
  const providers = mapConfigService.getTileProviders();
  const provider = providers.find(p => p.id === config.tile_provider_id);
  let url = '';
  if (provider) {
    const styles = provider.tile_url_styles || [];
    const selectedStyle = styles.find(s => s.value === config.style_url || s.value === config.style_value) || styles[0];
    if (selectedStyle && selectedStyle.url) url = selectedStyle.url;
    else if (provider.tile_url_template) url = provider.tile_url_template;
    else if (provider.tile_url) url = provider.tile_url;
  }
  if (!url) url = config.tile_url || DEFAULT_TILE_URL;
  url = url.replace('{key}', config.api_key || '');
  if (Number(config.retina) && url.includes('.png')) url = url.replace('.png', '@2x.png');
  return url;
}

async function getTileTarget(entity) {
  const now = Date.now();
  if (targetCache.key === entity && now - targetCache.at < TARGET_TTL) return targetCache.value;
  let value = null;
  try {
    const [rows] = await pool.query('SELECT * FROM map_configs WHERE entity = ? LIMIT 1', [entity || 'stations']);
    if (rows.length > 0) {
      const config = rows[0];
      if ((config.tile_mode || 'proxy') === 'proxy') {
        value = buildProviderTileUrl(config);
      }
    }
  } catch (err) {
    console.error('[TileProxy] config error:', err.message);
  }
  targetCache = { key: entity, value, at: now };
  return value;
}

function sendFallback(res) {
  if (res.headersSent) return;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).end(FALLBACK_PNG);
}

function fetchTile(tileUrl, res, redirectCount) {
  if (redirectCount > 3) {
    return sendFallback(res);
  }

  let parsed;
  try {
    parsed = new URL(tileUrl);
  } catch {
    return sendFallback(res);
  }

  if (!ALLOWED_TILE_HOSTS.includes(parsed.hostname)) {
    return sendFallback(res);
  }

  const client = parsed.protocol === 'https:' ? https : http;

  const proxyReq = client.get(tileUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'image/png,image/jpeg,image/webp,*/*',
    },
    timeout: 10000,
  }, (proxyRes) => {
    if ((proxyRes.statusCode === 301 || proxyRes.statusCode === 302) && proxyRes.headers.location) {
      try {
        const next = new URL(proxyRes.headers.location, tileUrl).toString();
        return fetchTile(next, res, redirectCount + 1);
      } catch {
        return sendFallback(res);
      }
    }

    if (proxyRes.statusCode !== 200) {
      proxyRes.resume();
      return sendFallback(res);
    }

    const contentType = proxyRes.headers['content-type'] || 'image/png';
    if (!contentType.startsWith('image/')) {
      proxyRes.resume();
      return sendFallback(res);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', `public, max-age=${TILE_CACHE_MAX_AGE}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[TileProxy] error:', err.message);
    sendFallback(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    sendFallback(res);
  });
}

router.get('/:z/:x/:y', async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (!Number.isInteger(z) || z < 0 || z > 22) return sendFallback(res);
  const max = Math.pow(2, z) - 1;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > max || y > max) {
    return sendFallback(res);
  }

  const entity = req.query.entity || 'stations';
  let tileUrl = null;
  try {
    tileUrl = await getTileTarget(entity);
  } catch (err) {
    console.error('[TileProxy] target error:', err.message);
  }
  if (!tileUrl) tileUrl = DEFAULT_TILE_URL;

  tileUrl = tileUrl
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y)
    .replace('{s}', 'a')
    .replace('{r}', '');

  fetchTile(tileUrl, res, 0);
});

module.exports = router;
