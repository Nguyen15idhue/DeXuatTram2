const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const router = express.Router();

const ALLOWED_TILE_HOSTS = [
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'tiles.openstreetmap.org',
  'a.tile.opentopomap.org',
  'b.tile.opentopomap.org',
  'c.tile.opentopomap.org',
  'server.arcgisonline.com',
];

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_CACHE_MAX_AGE = 7 * 24 * 60 * 60;
const USER_AGENT = 'StationManagement/1.0 (MapTileProxy)';

function fetchTile(tileUrl, res, redirectCount) {
  if (redirectCount > 3) {
    return res.status(502).json({ success: false, message: 'Too many redirects' });
  }

  let parsed;
  try {
    parsed = new URL(tileUrl);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid tile URL' });
  }

  if (!ALLOWED_TILE_HOSTS.includes(parsed.hostname)) {
    return res.status(403).json({ success: false, message: `Host not allowed: ${parsed.hostname}` });
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
      return fetchTile(proxyRes.headers.location, res, redirectCount + 1);
    }

    if (proxyRes.statusCode !== 200) {
      return res.status(proxyRes.statusCode).json({ success: false, message: `Tile server returned ${proxyRes.statusCode}` });
    }

    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', `public, max-age=${TILE_CACHE_MAX_AGE}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Tile proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: `Tile fetch failed: ${err.message}` });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ success: false, message: 'Tile fetch timeout' });
    }
  });
}

router.get('/:z/:x/:y', (req, res) => {
  const { z, x, y } = req.params;
  const tileUrl = req.query.url || DEFAULT_TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);

  fetchTile(tileUrl, res, 0);
});

module.exports = router;
