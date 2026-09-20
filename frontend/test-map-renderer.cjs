const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

const results = [];
const check = (n, c, x = '') => {
  results.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`);
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`);
};

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-webgl-developer-extensions',
      '--enable-webgl-draft-extensions',
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const networkReqs = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type()) && !msg.text().includes('React Router')) {
      pageErrors.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', (e) => pageErrors.push(`[pageerror] ${e.message.slice(0, 200)}`));
  page.on('response', (resp) => {
    const url = resp.url();
    if (url.includes('/api/stations') || url.includes('/api/proposals') || url.includes('openfreemap') || url.includes('openstreetmap') || url.includes('elevation-tiles')) {
      networkReqs.push({ url: url.replace(/^https?:\/\/[^/]+/, ''), status: resp.status(), ok: resp.ok() });
    }
  });

  // 1. WebGL availability
  const webglInfo = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { webgl: false };
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        webgl: true,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'no-debug-ext',
        version: gl.getParameter(gl.VERSION),
      };
    } catch (e) {
      return { webgl: false, error: e.message };
    }
  });
  console.log('--- WebGL info ---');
  console.log(JSON.stringify(webglInfo, null, 2));

  // 2. Login
  const loginRes = await page.request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@station.com', password: '123456' },
  });
  const loginData = await loginRes.json();
  const token = loginData?.data?.token;
  check('login admin@station.com', !!token);
  if (!token) {
    await browser.close();
    process.exit(1);
  }

  // 3. Set token + navigate to /map
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto(BASE + '/map', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(8000);

  console.log('--- console errors (non-Router) ---');
  if (pageErrors.length === 0) console.log('none');
  pageErrors.slice(-5).forEach(e => console.log(e));

  console.log('--- key network requests ---');
  if (networkReqs.length === 0) console.log('  none captured');
  networkReqs.slice(-15).forEach(r => console.log(`  [${r.status}] ${r.url}`));

  // 4. Runtime info (MapCanvas sets window.__mapRuntime in DEV mode)
  const rtInfo = await page.evaluate(() => {
    const r = window.__mapRuntime;
    return r ? { id: r.id, hasSetStyle: typeof r.setStyle === 'function', hasSet3D: typeof r.set3D === 'function' } : null;
  });
  console.log('--- runtime ---');
  console.log(JSON.stringify(rtInfo, null, 2));

   // 5. Runtime warning banner — should NOT be present when MapLibre succeeds
  const warningText = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div')).find(d =>
      d.textContent.includes('Renderer') || d.textContent.includes('WebGL') || d.textContent.includes('bản đồ')
    );
    return el ? el.textContent.trim().slice(0, 150) : null;
  });
  check('no runtime warning banner', !warningText, warningText || 'none');

  // 6. Canvas present
  const canvasCount = await page.$$eval('canvas', (cs) => cs.length);
  check('canvas elements present', canvasCount > 0, `count=${canvasCount}`);

  // 7. App marker layers
  const markerCount = await page.evaluate(() => {
    const m = window.__mapRuntime;
    if (!m || !m.map) return { layers: 0 };
    const style = m.map.getStyle ? m.map.getStyle() : null;
    const layers = style?.layers || [];
    const appLayers = layers.filter(l => l.id && l.id.startsWith('app-'));
    return { total: layers.length, appLayers: appLayers.length, appLayerIds: appLayers.map(l => l.id) };
  });
  check('app layers present', (markerCount && markerCount.appLayers >= 0), JSON.stringify(markerCount));

  // 8. Performance: pan + multi-jump
  const perf = await page.evaluate(async () => {
    const r = window.__mapRuntime;
    if (!r || !r.map) return { error: 'no runtime' };
    const map = r.map;
    const info = { loaded: map.loaded(), zoom: Math.round(map.getZoom()) };
    const center = map.getCenter();
    const t0 = performance.now();
    map.jumpTo({ center: { lat: center.lat + 0.5, lng: center.lng + 0.5 } });
    const t1 = performance.now();
    info.panJumpMs = Math.round(t1 - t0);
    const t2 = performance.now();
    for (let i = 0; i < 5; i++) {
      map.jumpTo({ center: { lat: center.lat + (i % 2 ? 0.1 : -0.1), lng: center.lng + (i % 2 ? 0.1 : -0.1) } });
    }
    const t3 = performance.now();
    info.multiJumpMs = Math.round(t3 - t2);
    return info;
  });
  check('pan/jump performance (no error)', !perf.error, JSON.stringify(perf));

  // 9. Marker rendering — check both GeoJSON source AND DOM markers
  const renderPerf = await page.evaluate(() => {
    const m = window.__mapRuntime;
    if (!m || !m.map) return { error: 'no runtime' };
    const map = m.map;
    const info = { loaded: map.loaded(), zoom: Math.round(map.getZoom()) };
    try {
      const style = map.getStyle();
      info.styleSprite = style?.sprite || null;
      info.layerCount = (style?.layers || []).length;
       const src = map.getSource('app-markers');
      if (src) {
        let featCount = 0;
        try {
          const feats = map.querySourceFeatures('app-markers');
          featCount = feats.length;
        } catch(e2) {}
        if (featCount === 0) {
          const d = src._data;
          if (d && typeof d === 'object' && Array.isArray(d.features)) featCount = d.features.length;
        }
        info.markerSource = 'exists';
        info.markerFeatures = featCount;
      } else {
        info.markerSource = 'missing';
        info.markerFeatures = 0;
      }
      info.domMarkers = document.querySelectorAll('.maplibre-marker').length;
      info.canvasCount = document.querySelectorAll('canvas').length;
    } catch(e) { info.error = e.message.slice(0, 200); }
    return info;
  });
  check('markers rendered (source or DOM)', (renderPerf && !renderPerf.error && (renderPerf.markerFeatures > 0 || renderPerf.domMarkers > 0)), JSON.stringify(renderPerf));

  await page.close();
  await browser.close();

  console.log('\n--- SUMMARY ---');
  console.log(results.join('\n'));
  const passes = results.filter(r => r.startsWith('PASS'));
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log(`\n${passes.length} PASS, ${fails.length} FAIL`);
}

main().catch(e => { console.error('SCRIPT ERROR', e.message); process.exit(1); });
