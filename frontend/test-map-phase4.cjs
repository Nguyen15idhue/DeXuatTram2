const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

async function login(page) {
  const res = await page.request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@station.com', password: '123456' },
  });
  const token = (await res.json()).data.token;
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  return token;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  const requests = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('request', (req) => { requests.push(req.url()); });

  try {
    const token = await login(page);
    const auth = { Authorization: `Bearer ${token}` };
    const admin = (await (await page.request.get(`${API}/api/map-configs/admin?entity=stations`, { headers: auth })).json()).data;
    const orig = { renderer: admin.renderer, tile_provider_id: admin.tile_provider_id, style_url: admin.style_url, tile_mode: admin.tile_mode };

    const setCfg = (data) => page.request.put(`${API}/api/map-configs/${admin.id}`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data,
    });

    // ---- Phase 4 chính: renderer=maplibre + provider=maplibre-osm ----
    await setCfg({ renderer: 'maplibre', tile_provider_id: 'maplibre-osm', style_url: '', tile_mode: 'direct' });
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6000);

    const info = await page.evaluate(async () => {
      const deadline = Date.now() + 15000;
      let rt = null;
      while (Date.now() < deadline) {
        rt = window.__mapRuntime;
        const map = rt && rt.map;
        if (rt && rt.id === 'maplibre' && map && map.getSource && map.getSource('app-markers')) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      const map = rt && rt.map;
      await new Promise((r) => setTimeout(r, 800));
      return {
        id: rt && rt.id,
        vector: rt && rt.supports && rt.supports.vector,
        hasCanvas: !!document.querySelector('.maplibregl-canvas'),
        leafletCount: document.querySelectorAll('.leaflet-container').length,
        clusterSource: !!(map && map.getSource && map.getSource('app-markers')),
      };
    });
    record('4.1 renderer maplibre chạy', info.id === 'maplibre', `id=${info.id}`);
    record('4.1 maplibre canvas render (không còn Leaflet)', info.hasCanvas && info.leafletCount === 0, `ml=${info.hasCanvas} leaflet=${info.leafletCount}`);
    record('4.1 supports vector', info.vector === true);
    record('4.1 marker/cluster source tồn tại', info.clusterSource === true);

    // ---- Fallback khi thiếu WebGL ----
    const page2 = await browser.newPage();
    await page2.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (String(type).toLowerCase().includes('webgl')) return null;
        return orig.call(this, type, ...args);
      };
    });
    await page2.goto(`${BASE}/login`);
    await page2.evaluate((t) => localStorage.setItem('token', t), token);
    await page2.goto(`${BASE}/map`);
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(6000);
    const fb = await page2.evaluate(() => ({
      id: window.__mapRuntime && window.__mapRuntime.id,
      leaflet: !!document.querySelector('.leaflet-container'),
    }));
    record('4.1 thiếu WebGL → fallback Leaflet', fb.id === 'leaflet' && fb.leaflet, `id=${fb.id} leaflet=${fb.leaflet}`);
    await page2.close();

    // ---- Lazy-load: maplibre chỉ tải khi renderer=maplibre ----
    const loadedLazy = requests.some((u) => /maplibre/i.test(u) && /\.(js|mjs)($|\?)/i.test(u));
    record('4.1 maplibre-gl lazy (chỉ tải khi cần)', loadedLazy, requests.find((u) => /maplibre/i.test(u)) || 'none');

    // Restore
    await setCfg(orig);
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);
    const restored = await page.evaluate(() => window.__mapRuntime && window.__mapRuntime.id);
    record('4.1 restore renderer leaflet', restored === 'leaflet', `id=${restored}`);

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway') && !e.includes('Failed to load resource'));
    record('4.1 Không console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-phase4-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
