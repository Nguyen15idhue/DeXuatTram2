const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

async function login(page, email, password) {
  const res = await page.request.post(`${API}/api/auth/login`, { data: { email, password } });
  const body = await res.json();
  const token = body && body.data && body.data.token;
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
  }, token);
  return token;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  try {
    await login(page, 'admin@station.com', '123456');

    // --- Admin map config page ---
    await page.goto(`${BASE}/admin/map-config`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const geoapifyVisible = await page.getByText('Geoapify (OSM)').count();
    record('Admin: hien provider Geoapify', geoapifyVisible > 0, `count=${geoapifyVisible}`);

    const tileModeLabel = await page.getByText('Chế độ tải tile').count();
    record('Admin: co control "Chế độ tải tile"', tileModeLabel > 0);

    const retinaLabel = await page.getByText('Retina (@2x)').count();
    record('Admin: co toggle Retina', retinaLabel > 0);

    const proxyLabel = await page.getByText('Proxy server').count();
    record('Admin: co tuy chon Proxy server', proxyLabel > 0);

    // --- Main map: tile requests ---
    const tileResponses = [];
    page.on('response', (resp) => {
      const url = resp.url();
      if (url.includes('/tiles/') || url.includes('maps.geoapify.com')) {
        tileResponses.push({
          url,
          status: resp.status(),
          type: resp.headers()['content-type'] || '',
        });
      }
    });

    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const okTiles = tileResponses.filter(t => t.status === 200 && t.type.startsWith('image/'));
    record('Map: co tile tai thanh cong (200 image)', okTiles.length > 0,
      `total=${tileResponses.length}, ok=${okTiles.length}, sample=${tileResponses[0] ? tileResponses[0].url.slice(0, 70) : 'none'}`);

    const usesProxy = tileResponses.some(t => t.url.includes('/tiles/'));
    record('Map: dung proxy /tiles (che do proxy)', usesProxy);

    const mapContainer = await page.locator('.leaflet-container').count();
    record('Map: Leaflet render', mapContainer > 0, `containers=${mapContainer}`);

    const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('502') && !e.includes('Bad Gateway'));
    record('Khong co console error (bo qua tile fallback 502)', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync('test-map-results.json', JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
