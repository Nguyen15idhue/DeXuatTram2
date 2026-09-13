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
    const orig = { renderer: admin.renderer, tile_provider_id: admin.tile_provider_id, style_url: admin.style_url, tile_mode: admin.tile_mode };
    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: { renderer: 'maplibre', tile_provider_id: 'maplibre-osm', style_url: '', tile_mode: 'direct' } });

    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);

    const parity = await page.evaluate(async () => {
      const rt = window.__mapRuntime;
      if (!rt || !rt.map) return { error: 'no runtime' };
      const map = rt.map;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !map.getSource('app-markers')) {
        await new Promise((r) => setTimeout(r, 400));
      }
      rt.getCenter();
      rt.setView([21.03, 105.85], 12);
      rt.setPolylines(
        [{ a: { latitude: 10.8, longitude: 106.7 }, b: { latitude: 10.81, longitude: 106.71 }, distance_m: 120 }],
        { renderPopup: () => document.createElement('div') }
      );
      rt.setBoundaries({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'X' }, geometry: { type: 'LineString', coordinates: [[105, 21], [106, 21]] } }] }, true);
      rt.setCircle({ center: [10.8, 106.7], radiusM: 10000 });
      rt.setProvinceLabels([{ name: 'Test', lat: 16, lng: 108 }], true);
      rt.setPoints([{ position: [10.8, 106.7], variant: 'location' }]);
      await new Promise((r) => setTimeout(r, 800));
      const st = map.getStyle() || {};
      return {
        hasMarkers: !!map.getSource('app-markers'),
        hasPolyline: !!map.getSource('app-polylines'),
        polylineLine: !!(st.layers || []).find((l) => l.id === 'app-polylines-line'),
        hasBoundary: !!map.getSource('app-boundaries'),
        hasCircle: !!map.getSource('app-circle'),
        provinceLabels: document.querySelectorAll('.province-label').length,
        locationPoints: document.querySelectorAll('.location-point').length,
        center: rt.getCenter(),
        zoom: rt.getZoom(),
      };
    });
    record('5.1 duplicate lines (source + layer)', parity.hasPolyline && parity.polylineLine, JSON.stringify({ s: parity.hasPolyline, l: parity.polylineLine }));
    record('5.1 nhãn tỉnh + ranh giới', parity.hasBoundary && parity.provinceLabels > 0, `boundary=${parity.hasBoundary} labels=${parity.provinceLabels}`);
    record('5.1 bán kính (circle) + điểm lộ trình', parity.hasCircle && parity.locationPoints > 0, `circle=${parity.hasCircle} pts=${parity.locationPoints}`);
    record('5.1 marker cluster + flyTo/getCenter', parity.hasMarkers && parity.zoom === 12 && !!parity.center, `zoom=${parity.zoom}`);

    // Popup marker dưới MapLibre: click vào điểm phụ có renderPopup
    const popupResult = await page.evaluate(async () => {
      const rt = window.__mapRuntime;
      if (!rt || !rt.map) return { ok: false, err: 'no runtime' };
      try {
        rt.setPoints([{ position: [10.8, 106.7], color: '#22c55e', renderPopup: () => { const d = document.createElement('div'); d.textContent = 'Popup OK'; return d; } }]);
        await new Promise((r) => setTimeout(r, 500));
        const markers = [...document.querySelectorAll('.maplibregl-marker')];
        const marker = markers.find((m) => (m.getAttribute('style') || '').includes('border-radius')) || markers[markers.length - 1];
        if (marker) marker.click();
        await new Promise((r) => setTimeout(r, 400));
        return { ok: true, popup: !!document.querySelector('.maplibregl-popup'), marker: !!marker, total: markers.length };
      } catch (e) { return { ok: false, err: e.message }; }
    });
    record('5.1 popup marker dưới MapLibre', popupResult.ok && popupResult.popup, JSON.stringify(popupResult));

    // LocationMapModal dùng adapter (maplibre)
    await page.goto(`${BASE}/admin/proposals/view=388`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    const mapBtn = page.getByRole('button', { name: /Xem bản đồ/ });
    if (await mapBtn.count() > 0) {
      await mapBtn.first().click();
      await page.waitForTimeout(3500);
      const modal = await page.evaluate(() => ({
        modal: !!document.querySelector('.location-map-modal'),
        ml: !!document.querySelector('.location-map-modal .maplibregl-canvas'),
        leaflet: !!document.querySelector('.location-map-modal .leaflet-container'),
        ring: document.querySelectorAll('.location-map-modal .location-point').length,
      }));
      record('5.1 LocationMapModal dùng MapLibre + điểm lân cận', modal.modal && modal.ml && !modal.leaflet, `ml=${modal.ml} ring=${modal.ring}`);
    } else {
      record('5.1 LocationMapModal dùng MapLibre + điểm lân cận', false, 'không thấy nút Xem bản đồ');
    }

    // Restore
    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: orig });

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway') && !e.includes('Failed to load resource'));
    record('5.1 Không console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-phase5-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
