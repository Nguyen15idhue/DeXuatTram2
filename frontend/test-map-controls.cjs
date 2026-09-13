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

    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: { renderer: 'maplibre', tile_provider_id: 'maplibre-self-hosted', tile_url: '/pmtiles/vietnam.pmtiles', style_url: '', tile_mode: 'direct', default_mode: 'streets', enable_3d: 0 } });
    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6000);

    record('nút chuyển layer/mode xuất hiện (maplibre self-host)', (await page.locator('.map-layer-switcher').count()) > 0);

    await page.locator('.map-layer-switcher button').first().click();
    await page.waitForTimeout(400);
    const opts = await page.locator('.map-layer-option').allTextContents();
    record('có đủ 4 mode', ['Đường phố', 'Vệ tinh', 'Vệ tinh + nhãn', 'Địa hình'].every((m) => opts.includes(m)), JSON.stringify(opts));

    await page.getByText('Vệ tinh', { exact: true }).last().click();
    await page.waitForTimeout(2500);
    const satSources = await page.evaluate(() => Object.keys(window.__mapRuntime.map.getStyle().sources));
    record('chọn mode Vệ tinh → đổi style', satSources.includes('satellite'), JSON.stringify(satSources));

    await page.locator('.map-layer-switcher button').first().click();
    await page.waitForTimeout(300);
    await page.getByText('Đường phố', { exact: true }).last().click();
    await page.waitForTimeout(2500);
    const streetSources = await page.evaluate(() => Object.keys(window.__mapRuntime.map.getStyle().sources));
    record('về mode Đường phố → pmtiles vector', streetSources.includes('openmaptiles'), JSON.stringify(streetSources));

    // Zoom không tự đổi layer
    await page.evaluate(() => window.__mapRuntime.map.setZoom(13));
    await page.waitForTimeout(3000);
    const afterZoom = await page.evaluate(() => Object.keys(window.__mapRuntime.map.getStyle().sources));
    record('zoom in không tự đổi layer', afterZoom.includes('openmaptiles') && !afterZoom.includes('satellite'), JSON.stringify(afterZoom));
    await page.evaluate(() => window.__mapRuntime.map.setZoom(6));
    await page.waitForTimeout(2000);

    // Legend và filter không chồng nhau (desktop)
    const layout = await page.evaluate(() => {
      const f = document.querySelector('.map-filter');
      const l = document.querySelector('.map-legend');
      if (!f || !l) return { ok: false };
      const a = f.getBoundingClientRect();
      const b = l.getBoundingClientRect();
      const overlap = !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
      return { ok: !overlap };
    });
    record('legend không chồng nút bộ lọc', layout.ok === true, JSON.stringify(layout));

    const cube = page.locator('button[title*="3D"]').first();
    record('có nút 3D trên map', (await page.locator('button[title*="3D"]').count()) > 0);
    await cube.click();
    await page.waitForTimeout(2500);
    const pitchOn = await page.evaluate(() => window.__mapRuntime.map.getPitch());
    record('bật 3D → pitch > 0', pitchOn > 0, `pitch=${pitchOn}`);
    await cube.click();
    await page.waitForTimeout(4000);
    const pitchOff = await page.evaluate(() => window.__mapRuntime.map.getPitch());
    record('tắt 3D → pitch ≈ 0', pitchOff < 1, `pitch=${pitchOff}`);

    await page.request.put(`${API}/api/map-configs/${admin.id}`, { headers: { ...auth, 'Content-Type': 'application/json' }, data: orig });

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway') && !e.includes('Failed to load resource'));
    record('hạn chế console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-controls-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
