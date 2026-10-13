const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--enable-webgl'] });
  const page = await browser.newPage();

  const errors = [];
  const allConsole = [];
  page.on('console', (msg) => {
    allConsole.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().slice(0,300)}`);
  });
  page.on('pageerror', (e) => {
    errors.push(`[pageerror] ${e.message.slice(0,300)}`);
    allConsole.push(`[pageerror] ${e.message.slice(0, 300)}`);
  });

  const loginRes = await page.request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@station.com', password: '123456' },
  });
  const { data } = await loginRes.json();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.evaluate((t) => localStorage.setItem('token', t), data.token);

  const start = Date.now();
  await page.goto(BASE + '/map', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(20000);

  console.log(`Load time: ${Date.now()-start}ms`);

  console.log('=== Console errors ===');
  errors.slice(-15).forEach(e => console.log(e));
  if (errors.length === 0) console.log('none');

  console.log('=== All console (last 20) ===');
  allConsole.slice(-20).forEach(e => console.log(e));

  console.log('=== Runtime ===');
  const rt = await page.evaluate(() => {
    const r = window.__mapRuntime;
    if (!r) return { error: 'no runtime on window' };
    const keys = Object.keys(r);
    return {
      id: r.id,
      keys: keys,
      hasMap: !!r.map,
      mapType: r.map ? (r.map.constructor ? r.map.constructor.name : 'no-constructor') : 'null',
      webglRenderingContext: !!window.WebGLRenderingContext,
      canvasTest: (() => {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl') || c.getContext('experimental-webgl') || c.getContext('webgl2');
        return gl ? 'context-created' : 'context-null';
      })(),
    };
  });
  console.log(JSON.stringify(rt, null, 2));

  // If runtime exists, check markers
  if (rt.id) {
    const markers = await page.evaluate(() => {
      const r = window.__mapRuntime;
      const info = { runtimeId: r.id };
      try {
        if (r.map && typeof r.map.loaded === 'function') {
          info.loaded = r.map.loaded();
        } else {
          info.loaded = 'no-loaded-method';
        }
        if (r.map && typeof r.map.getStyle === 'function') {
          const s = r.map.getStyle();
          const src = r.map.getSource('app-markers');
          info.layerCount = (s?.layers || []).length;
          info.sources = Object.keys(s?.sources || {});
          if (src) {
            try {
              const f = r.map.querySourceFeatures('app-markers');
              info.markerFeatures = f.length;
            } catch(e) { info.markerFeatures = 'queryError: ' + e.message.slice(0,80); }
          } else {
            info.markerSource = 'missing';
          }
        }
        info.domMarkers = document.querySelectorAll('.maplibre-marker, .leaflet-marker-icon').length;
        info.canvasCount = document.querySelectorAll('canvas').length;
      } catch(e) { info.error = e.message.slice(0, 200); }
      return info;
    });
    console.log('=== Marker info ===');
    console.log(JSON.stringify(markers, null, 2));
  }

  await browser.close();
}
main().catch(e => console.error('SCRIPT ERROR:', e.message));
