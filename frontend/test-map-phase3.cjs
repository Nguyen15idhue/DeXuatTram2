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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  try {
    const loginRes = await page.request.post(`${API}/api/auth/login`, {
      data: { email: 'admin@station.com', password: '123456' },
    });
    const token = (await loginRes.json()).data.token;
    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), token);

    // Adapter metadata + runtime mount/destroy
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);

    const adapter = await page.evaluate(async () => {
      const reg = await import('/src/components/map/renderers/index.js');
      const list = reg.listRenderers();
      const leaflet = list.find((r) => r.id === 'leaflet');
      const resolved = reg.resolveRenderer('openlayers-unknown');
      const maplibreResolved = reg.resolveRenderer('maplibre');
      const container = document.createElement('div');
      container.style.width = '200px';
      container.style.height = '200px';
      document.body.appendChild(container);
      let runtimeOk = true;
      let err = '';
      try {
        const { runtime, fallback } = reg.createRuntime('leaflet', { container, center: [16, 108], zoom: 6 });
        runtime.setTileLayer({ url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' });
        runtime.setMarkers([{ latitude: 16, longitude: 108, _color: '#22c55e', _label: 'x', _type: 'station' }], { cluster: true, showLabels: true, renderPopup: () => document.createElement('div') });
        runtime.setPolylines([{ a: { latitude: 16, longitude: 108 }, b: { latitude: 16.01, longitude: 108.01 }, distance_m: 100 }], { renderPopup: () => document.createElement('div') });
        runtime.setProvinceLabels([{ name: 'Test', lat: 16, lng: 108 }], true);
        runtime.setBoundaries(null, false);
        runtime.setPoints([{ position: [16, 108], color: '#000', renderPopup: () => document.createElement('div') }]);
        runtime.flyTo([16, 108], 10);
        runtime.getCenter();
        runtime.remove();
        runtimeOk = !fallback;
      } catch (e) {
        runtimeOk = false;
        err = e.message;
      }
      container.remove();
      return { leaflet, resolved, maplibreResolved, runtimeOk, err };
    });
    record('3.1 listRenderers có leaflet + supports', !!adapter.leaflet && adapter.leaflet.supports.raster === true && adapter.leaflet.supports.cluster === true, JSON.stringify(adapter.leaflet?.supports || {}));
    record('3.1 renderer lạ fallback Leaflet + cảnh báo', adapter.resolved.fallback === true && adapter.resolved.renderer.id === 'leaflet', `fallback=${adapter.resolved.fallback}`);
    record('3.1 renderer maplibre đã đăng ký (không fallback)', adapter.maplibreResolved.fallback === false && adapter.maplibreResolved.renderer.id === 'maplibre');
    record('3.1 runtime mount/setLayer/markers/polylines/remove không lỗi', adapter.runtimeOk, adapter.err);

    // MapView không import Leaflet trực tiếp
    const mapViewSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'MapView.jsx'), 'utf8');
    record('3.2 MapView không import leaflet trực tiếp', !/from ['"]leaflet['"]/.test(mapViewSrc) && !/from ['"]react-leaflet['"]/.test(mapViewSrc));

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway'));
    record('3.2 Không console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-phase3-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
