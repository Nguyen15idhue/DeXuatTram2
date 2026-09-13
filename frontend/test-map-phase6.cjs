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
    const orig = { renderer: admin.renderer, tile_provider_id: admin.tile_provider_id, style_url: admin.style_url, tile_mode: admin.tile_mode, default_mode: admin.default_mode, layers_config: admin.layers_config };

    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.goto(`${BASE}/admin/map-config`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    record('6.1 có renderer Leaflet + MapLibre', (await page.getByText('Leaflet', { exact: true }).count()) > 0 && (await page.getByText('MapLibre GL JS', { exact: true }).count()) > 0);
    record('6.1 có Mode/Layer', (await page.getByText('Đường phố', { exact: true }).count()) > 0 && (await page.getByText('Vệ tinh', { exact: true }).count()) > 0);

    // Chọn MapLibre renderer + provider vector + mode satellite
    await page.getByText('MapLibre GL JS', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.getByText('MapLibre GL JS + OSM', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.getByText('Đường phố', { exact: true }).first().click();
    await page.waitForTimeout(2500);

    const preview = await page.evaluate(() => ({
      ml: !!document.querySelector('.maplibregl-canvas'),
      leaflet: !!document.querySelector('.leaflet-container'),
    }));
    record('6.1 preview dùng đúng renderer (MapLibre)', preview.ml && !preview.leaflet, JSON.stringify(preview));

    // Test kết nối (vector style, mode Đường phố)
    await page.getByRole('button', { name: /Test kết nối/ }).click();
    await page.waitForTimeout(9000);
    const testOk = await page.getByText('Kết nối OK').count();
    record('6.1 test kết nối vector → OK', testOk > 0, `okCount=${testOk}`);

    // Chuyển mode Vệ tinh rồi Lưu
    await page.getByText('Vệ tinh', { exact: true }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Lưu cấu hình', exact: true }).click();
    await page.waitForTimeout(3000);

    const saved = (await (await page.request.get(`${API}/api/map-configs?entity=stations`)).json()).data;
    record('6.1 lưu renderer maplibre', saved.renderer === 'maplibre', saved.renderer);
    record('6.1 lưu default_mode satellite', saved.default_mode === 'satellite', saved.default_mode);
    const layerTypes = (saved.layers_config || []).map((l) => l.type + ':' + l.provider).join(',');
    record('6.1 lưu layers_config đúng', Array.isArray(saved.layers_config) && saved.layers_config.length > 0, layerTypes);

    // /map tự cập nhật qua mapconfig:refresh (cùng tab? mở tab mới)
    const mapPage = await browser.newPage();
    await mapPage.goto(`${BASE}/login`);
    await mapPage.evaluate((t) => localStorage.setItem('token', t), token);
    await mapPage.goto(`${BASE}/map`);
    await mapPage.waitForLoadState('networkidle');
    const mapInfo = await mapPage.evaluate(async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const rt = window.__mapRuntime;
        if (rt && rt.id === 'maplibre' && rt.map && rt.map.getSource && rt.map.getSource('app-markers')) return { id: rt.id };
        await new Promise((r) => setTimeout(r, 400));
      }
      return { id: window.__mapRuntime && window.__mapRuntime.id };
    });
    record('6.1 /map dùng cấu hình mới', mapInfo.id === 'maplibre', `id=${mapInfo.id}`);
    await mapPage.close();

    // Restore
    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: orig });

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway'));
    record('6.1 Không console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-phase6-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
