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
    const auth = { Authorization: `Bearer ${token}` };
    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), token);

    const admin = (await (await page.request.get(`${API}/api/map-configs/admin?entity=stations`, { headers: auth })).json()).data;
    const orig = { default_mode: admin.default_mode, layers_config: admin.layers_config };

    // 2.1 / 2.2 public trả field mới
    const pub = (await (await page.request.get(`${API}/api/map-configs?entity=stations`)).json()).data;
    record('2.2 public có default_mode', typeof pub.default_mode === 'string' && pub.default_mode.length > 0, pub.default_mode);
    record('2.2 public có layers_config (JSON)', Array.isArray(pub.layers_config), `type=${Array.isArray(pub.layers_config) ? 'array' : typeof pub.layers_config}`);
    record('2.2 public vẫn ẩn api_key', !('api_key' in pub));

    // 2.2 PUT ghi default_mode + layers_config (có secret) → public strip
    const leak = 'https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=LAYER_LEAK_TEST';
    await page.request.put(`${API}/api/map-configs/${admin.id}`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: {
        default_mode: 'satellite',
        layers_config: [
          { id: 'base', role: 'base', type: 'raster', provider: 'leaflet-osm', style: 'osm-de', mode: 'streets' },
          { id: 'sat', role: 'base', type: 'raster', url: leak },
        ],
      },
    });
    const pub2 = (await (await page.request.get(`${API}/api/map-configs?entity=stations`)).json()).data;
    record('2.2 PUT default_mode → public đổi', pub2.default_mode === 'satellite', pub2.default_mode);
    record('2.2 layers_config lưu đúng số layer', Array.isArray(pub2.layers_config) && pub2.layers_config.length === 2);
    const satUrl = (pub2.layers_config || []).find((l) => l.id === 'sat')?.url || '';
    record('2.2 public strip secret trong layers_config', !/LAYER_LEAK_TEST/.test(satUrl), satUrl);

    // Restore
    await page.request.put(`${API}/api/map-configs/${admin.id}`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { default_mode: orig.default_mode, layers_config: orig.layers_config },
    });
    const pub3 = (await (await page.request.get(`${API}/api/map-configs?entity=stations`)).json()).data;
    record('2.2 restore default_mode', pub3.default_mode === orig.default_mode, pub3.default_mode);

    // FE smoke
    await page.goto(`${BASE}/admin/map-config`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    record('2.2 FE /admin/map-config load', (await page.getByText('Cấu hình Bản đồ').count()) > 0);
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    record('2.2 FE /map render', (await page.locator('.leaflet-container').count()) > 0);

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway'));
    record('2.2 Không console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-phase2-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
