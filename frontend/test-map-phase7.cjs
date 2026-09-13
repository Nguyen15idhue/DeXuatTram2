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

  async function setMode(mode) {
    const token = (await (await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } })).json()).data.token;
    const auth = { Authorization: `Bearer ${token}` };
    const admin = (await (await page.request.get(`${API}/api/map-configs/admin?entity=stations`, { headers: auth })).json()).data;
    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: { default_mode: mode } });
    return { token, auth, id: admin.id };
  }

  async function loadMap(token, expected = []) {
    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    return page.evaluate(async (expectedKeys) => {
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        const rt = window.__mapRuntime;
        const sources = (rt && rt.map && rt.map.getStyle && rt.map.getStyle().sources) ? Object.keys(rt.map.getStyle().sources) : [];
        if (rt && rt.id === 'maplibre' && expectedKeys.every((k) => sources.includes(k))) {
          await new Promise((r) => setTimeout(r, 400));
          return { id: rt.id, sources };
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      const rt = window.__mapRuntime;
      const sources = (rt && rt.map && rt.map.getStyle && rt.map.getStyle().sources) ? Object.keys(rt.map.getStyle().sources) : [];
      return { id: rt && rt.id, sources };
    }, expected);
  }

  try {
    const token = (await (await page.request.post(`${API}/api/auth/login`, { data: { email: 'admin@station.com', password: '123456' } })).json()).data.token;
    const auth = { Authorization: `Bearer ${token}` };
    const admin = (await (await page.request.get(`${API}/api/map-configs/admin?entity=stations`, { headers: auth })).json()).data;
    const orig = { renderer: admin.renderer, tile_provider_id: admin.tile_provider_id, style_url: admin.style_url, tile_mode: admin.tile_mode, default_mode: admin.default_mode, tile_url: admin.tile_url };

    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: { renderer: 'maplibre', tile_provider_id: 'maplibre-osm', style_url: '', tile_mode: 'direct', default_mode: 'streets' } });

    // streets (OpenFreeMap vector)
    let info = await loadMap(token, ['openmaptiles']);
    const streetsVector = info.sources.some((s) => !['satellite', 'labels', 'terrain'].includes(s));
    record('7.1 mode streets (OpenFreeMap vector)', info.id === 'maplibre' && streetsVector, `sources=${info.sources.join(',')}`);

    // satellite (Esri raster)
    let t = await setMode('satellite');
    info = await loadMap(t.token, ['satellite']);
    record('7.1 mode satellite (raster)', info.id === 'maplibre' && info.sources.includes('satellite'), `sources=${info.sources.join(',')}`);

    // hybrid (raster + labels)
    t = await setMode('hybrid');
    info = await loadMap(t.token, ['satellite', 'labels']);
    record('7.1 mode hybrid (vệ tinh + nhãn)', info.id === 'maplibre' && info.sources.includes('satellite') && info.sources.includes('labels'), `sources=${info.sources.join(',')}`);

    // terrain (OpenTopoMap raster)
    t = await setMode('terrain');
    info = await loadMap(t.token, ['terrain']);
    record('7.1 mode terrain (raster)', info.id === 'maplibre' && info.sources.includes('terrain'), `sources=${info.sources.join(',')}`);

    // PMTiles protocol registration (kiểm tra source + dependency)
    const runtimeSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'map', 'renderers', 'maplibreRuntime.js'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const hasPmtilesDep = !!(pkg.dependencies && pkg.dependencies.pmtiles);
    const registers = /addProtocol\(\s*['"]pmtiles['"]/.test(runtimeSrc) && runtimeSrc.includes("import('pmtiles')");
    record('7.1 pmtiles protocol đăng ký + dependency', hasPmtilesDep && registers, `dep=${hasPmtilesDep} register=${registers}`);

    // Self-host PMTiles (Vietnam build)
    const pmStatuses = [];
    page.on('response', (r) => { if (r.url().includes('/pmtiles/vietnam.pmtiles')) pmStatuses.push(r.status()); });
    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: { renderer: 'maplibre', tile_provider_id: 'maplibre-self-hosted', tile_url: '/pmtiles/vietnam.pmtiles', style_url: '', tile_mode: 'direct', default_mode: 'streets' } });
    info = await loadMap(token, ['openmaptiles']);
    const selfHostSrc = await page.evaluate(() => {
      const st = window.__mapRuntime && window.__mapRuntime.map && window.__mapRuntime.map.getStyle();
      return (st && st.sources && st.sources.openmaptiles && st.sources.openmaptiles.url) || '';
    });
    record('7.1 self-host PMTiles source (pmtiles://)', info.id === 'maplibre' && /^pmtiles:\/\//.test(selfHostSrc), selfHostSrc);
    await page.waitForTimeout(4000);
    record('7.1 self-host PMTiles load qua range request', pmStatuses.includes(206), `statuses=${[...new Set(pmStatuses)].join(',')}`);

    // Restore
    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: orig });

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway') && !e.includes('Failed to load resource'));
    record('7.1 hạn chế console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-phase7-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
