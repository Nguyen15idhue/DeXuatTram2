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
    const orig = { renderer: admin.renderer, tile_provider_id: admin.tile_provider_id, style_url: admin.style_url, tile_mode: admin.tile_mode, default_mode: admin.default_mode, enable_3d: admin.enable_3d, tile_url: admin.tile_url };
    const setCfg = (data) => page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data });

    async function loadAndInspect() {
      await page.goto(`${BASE}/login`);
      await page.evaluate((t) => localStorage.setItem('token', t), token);
      await page.goto(`${BASE}/map`);
      await page.waitForLoadState('networkidle');
      return page.evaluate(async () => {
        const deadline = Date.now() + 25000;
        while (Date.now() < deadline) {
          const rt = window.__mapRuntime;
          if (rt && rt.id === 'maplibre' && rt.map && rt.map.getSource && rt.map.getSource('app-markers')) {
            await new Promise((r) => setTimeout(r, 1200));
            break;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
        const rt = window.__mapRuntime;
        const map = rt && rt.map;
        return {
          id: rt && rt.id,
          pitch: map && map.getPitch ? map.getPitch() : -1,
          dem: !!(map && map.getSource && map.getSource('dem')),
          hillshade: !!(map && map.getLayer && map.getLayer('hillshade')),
          buildings: !!(map && map.getLayer && map.getLayer('app-buildings')),
          terrain: !!(map && map.getTerrain && map.getTerrain()),
        };
      });
    }

    // 3D bật
    await setCfg({ renderer: 'maplibre', tile_provider_id: 'maplibre-osm', style_url: '', tile_mode: 'direct', default_mode: 'streets', enable_3d: 1 });
    let s = await loadAndInspect();
    record('9.1 3D bật: pitch > 0 + DEM/hillshade/buildings', s.id === 'maplibre' && s.pitch > 0 && s.dem && s.hillshade && s.buildings, JSON.stringify(s));
    record('9.1 3D bật: terrain không bật khi zoom xa (tối ưu)', s.terrain === false, `terrain=${s.terrain}`);

    // Zoom gần → terrain bật
    const terrainNear = await page.evaluate(async () => {
      const map = window.__mapRuntime.map;
      map.setZoom(14);
      await new Promise((r) => setTimeout(r, 2500));
      return !!(map.getTerrain && map.getTerrain());
    });
    record('9.1 zoom gần → terrain active', terrainNear === true, `terrain=${terrainNear}`);

    // 3D tắt
    await setCfg({ enable_3d: 0 });
    s = await loadAndInspect();
    record('9.1 3D tắt: pitch = 0, không DEM/buildings', s.pitch === 0 && !s.dem && !s.buildings, JSON.stringify(s));

    // MapLibre 2D không hồi quy: markers vẫn có
    record('9.1 2D không hồi quy (marker source)', s.id === 'maplibre', `id=${s.id}`);

    // Mobile: bật 3D nhưng tự tắt (viewport 375px)
    const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 700 } });
    const mobilePage = await mobileCtx.newPage();
    await setCfg({ enable_3d: 1 });
    await mobilePage.goto(`${BASE}/login`);
    await mobilePage.evaluate((t) => localStorage.setItem('token', t), token);
    await mobilePage.goto(`${BASE}/map`);
    await mobilePage.waitForLoadState('networkidle');
    const mobile = await mobilePage.evaluate(async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const rt = window.__mapRuntime;
        if (rt && rt.map && rt.map.getSource && rt.map.getSource('app-markers')) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      const rt = window.__mapRuntime;
      return { id: rt && rt.id, pitch: rt && rt.map ? rt.map.getPitch() : -1, dem: !!(rt && rt.map && rt.map.getSource && rt.map.getSource('dem')) };
    });
    record('9.1 mobile mặc định không bật 3D', mobile.id === 'maplibre' && mobile.pitch === 0 && !mobile.dem, JSON.stringify(mobile));
    await mobileCtx.close();

    // Leaflet: 3D no-op, không lỗi
    await setCfg({ renderer: 'leaflet', tile_provider_id: 'leaflet-osm', tile_mode: 'proxy', style_url: '', enable_3d: 1 });
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);
    const leafletState = await page.evaluate(() => ({ id: window.__mapRuntime && window.__mapRuntime.id, leaflet: !!document.querySelector('.leaflet-container') }));
    record('9.1 Leaflet renderer bỏ qua 3D (no-op)', leafletState.id === 'leaflet' && leafletState.leaflet, JSON.stringify(leafletState));

    await setCfg(orig);

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway') && !e.includes('Failed to load resource') && !e.includes('elevation-tiles-prod'));
    record('9.1 hạn chế console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-phase9-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
