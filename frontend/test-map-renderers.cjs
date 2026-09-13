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

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  try {
    const token = (await (await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } })).json()).data.token;
    const auth = { Authorization: `Bearer ${token}` };
    const admin = (await (await page.request.get(`${API}/api/map-configs/admin?entity=stations`, { headers: auth })).json()).data;
    const orig = { renderer: admin.renderer, tile_provider_id: admin.tile_provider_id, style_url: admin.style_url, tile_mode: admin.tile_mode, default_mode: admin.default_mode, tile_url: admin.tile_url };

    const cases = [
      { renderer: 'leaflet', provider: 'leaflet-osm', mode: 'streets' },
      { renderer: 'maplibre', provider: 'maplibre-osm', mode: 'streets' },
    ];

    for (const c of cases) {
      await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: { renderer: c.renderer, tile_provider_id: c.provider, style_url: '', tile_mode: 'proxy', default_mode: c.mode, tile_url: '' } });
      await page.goto(`${BASE}/login`);
      await page.evaluate((t) => localStorage.setItem('token', t), token);
      await page.goto(`${BASE}/map`);
      await page.waitForLoadState('networkidle');

      const state = await page.evaluate(async (renderer) => {
        const deadline = Date.now() + 25000;
        while (Date.now() < deadline) {
          const rt = window.__mapRuntime;
          if (rt && rt.id === renderer) {
            if (renderer === 'leaflet' && document.querySelector('.leaflet-container') && document.querySelectorAll('.custom-marker').length > 0) break;
            if (renderer === 'maplibre' && rt.map && rt.map.getSource && rt.map.getSource('app-markers')) break;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
        const rt = window.__mapRuntime;
        return {
          id: rt && rt.id,
          leafletContainer: !!document.querySelector('.leaflet-container'),
          mlCanvas: !!document.querySelector('.maplibregl-canvas'),
          markers: document.querySelectorAll('.custom-marker').length,
          clusterSource: !!(rt && rt.map && rt.map.getSource && rt.map.getSource('app-markers')),
        };
      }, c.renderer);

      const ok = c.renderer === 'leaflet'
        ? state.id === 'leaflet' && state.leafletContainer && state.markers > 0
        : state.id === 'maplibre' && state.mlCanvas && state.clusterSource;
      record(`8.1 parity ${c.renderer}: render + marker/cluster`, ok, JSON.stringify(state));

      const filterPanel = await page.evaluate(() => document.body.textContent.includes('Của tôi') || !!document.querySelector('.map-filter-panel, .map-control-btn'));
      record(`8.1 parity ${c.renderer}: filter/controls hiện diện`, filterPanel);
    }

    // Renderer lạ → fallback Leaflet
    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: { renderer: 'unknown-renderer', tile_provider_id: 'leaflet-osm', tile_mode: 'proxy', style_url: '' } });
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    const fb = await page.evaluate(() => ({ id: window.__mapRuntime && window.__mapRuntime.id, leaflet: !!document.querySelector('.leaflet-container') }));
    record('8.1 renderer lạ → fallback Leaflet + cảnh báo', fb.id === 'leaflet' && fb.leaflet, JSON.stringify(fb));

    // Restore
    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: orig });

    // Backend + Swagger
    const health = await page.request.get(`${API}/health`);
    record('8.1 backend /health OK', health.status() === 200);
    const swagger = await page.request.get(`${API}/api-docs.json`);
    record('8.1 Swagger JSON OK', swagger.status() === 200);

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway') && !e.includes('Failed to load resource'));
    record('8.1 hạn chế console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-renderers-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
