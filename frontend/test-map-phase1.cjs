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

async function login(page) {
  const res = await page.request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@station.com', password: '123456' },
  });
  const body = await res.json();
  const token = body && body.data && body.data.token;
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  return token;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  try {
    const token = await login(page);
    const auth = { Authorization: `Bearer ${token}` };

    const adminRes = await page.request.get(`${API}/api/map-configs/admin?entity=stations`, { headers: auth });
    const adminBody = await adminRes.json();
    const cfg = adminBody.data;
    const origTileUrl = cfg.tile_url;

    // ---- 1.1 C1: public không lộ key (kể cả trong tile_url) ----
    const injectUrl = 'https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=SECRET_E2E_KEY_1';
    await page.request.put(`${API}/api/map-configs/${cfg.id}`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { tile_url: injectUrl, foo: 'bar' },
    });
    const pubRes = await page.request.get(`${API}/api/map-configs?entity=stations`);
    const pub = (await pubRes.json()).data;
    record('1.1-C1 public không có api_key', !('api_key' in pub));
    record('1.1-C1 public strip key khỏi tile_url', !/SECRET_E2E_KEY_1/.test(pub.tile_url || ''), pub.tile_url);
    await page.request.put(`${API}/api/map-configs/${cfg.id}`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { tile_url: origTileUrl },
    });

    // ---- 1.1 C2: popup duplicate dùng DOM, không chạy script ----
    await page.goto(`${BASE}/map`);
    await page.waitForLoadState('networkidle');
    const xss = await page.evaluate(async () => {
      const mod = await import('/src/components/MapView.jsx');
      window.__dupXss = 0;
      const el = mod.createDuplicatePopupContent({
        a: { kind: 'proposal', id: 1, code: '<img src=x onerror="window.__dupXss=1">' },
        b: { kind: 'station', id: 2, code: 'Tram A' },
        distance_m: 12.3,
      });
      document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 400));
      const text = el.textContent || '';
      el.remove();
      return { fired: window.__dupXss, text };
    });
    record('1.1-C2 popup duplicate không chạy script', xss.fired === 0, `fired=${xss.fired}`);
    record('1.1-C2 popup hiển thị đúng text', /<img/.test(xss.text) && /12.3m/.test(xss.text), xss.text.slice(0, 60));

    // ---- 1.2 catalog + capability ----
    const provRes = await page.request.get(`${API}/api/map-configs/tile-providers`);
    const provs = (await provRes.json()).data;
    const allHaveCaps = provs.every((p) => Array.isArray(p.capabilities) && p.capabilities.length > 0);
    record('1.2 provider có capabilities', allHaveCaps, `count=${provs.length}`);
    const selfHost = provs.find((p) => p.id === 'maplibre-self-hosted');
    record('1.2 maplibre-self-hosted incompatible Leaflet', !!selfHost && selfHost.incompatible_with_leaflet === true);
    const arc = provs.find((p) => p.id === 'arcgis-js');
    record('1.2 arcgis-js requires_key=false (đồng bộ)', !!arc && arc.requires_key === false);

    const feCompare = await page.evaluate(async () => {
      const be = await (await fetch('/api/map-configs/tile-providers')).json();
      const mod = await import('/src/utils/tileProviderCatalog.js');
      const beIds = be.data.map((p) => p.id).sort().join(',');
      const feIds = mod.TILE_PROVIDER_CATALOG.map((p) => p.id).sort().join(',');
      return { beIds, feIds, beCount: be.data.length };
    });
    record('1.2 catalog FE/BE cùng id', feCompare.beIds === feCompare.feIds, `be=${feCompare.beCount}`);

    // ---- 1.3 H1: buildTileConfig proxy mang style ----
    const proxyStyle = await page.evaluate(async () => {
      const mod = await import('/src/utils/mapTile.js');
      const t = mod.buildTileConfig({ tile_provider_id: 'leaflet-osm', tile_mode: 'proxy', style_url: 'osm-fr' });
      return t.url;
    });
    record('1.3-H1 proxy URL có style', /\/tiles\/\{z\}\/\{x\}\/\{y\}\?style=osm-fr/.test(proxyStyle), proxyStyle);

    // ---- 1.3 H1/H3: proxy thật trả tile, và lỗi trả 502 + header ----
    const goodTile = await page.request.get(`${API}/tiles/6/23/36?style=osm-de`);
    record('1.3-H1 proxy trả tile 200 image', goodTile.status() === 200 && (goodTile.headers()['content-type'] || '').startsWith('image/'), `status=${goodTile.status()}`);
    const badTile = await page.request.get(`${API}/tiles/99/0/0`);
    record('1.3-H3 tile lỗi trả 502 + X-Tile-Proxy-Status', badTile.status() === 502 && badTile.headers()['x-tile-proxy-status'] === 'fallback', `status=${badTile.status()} hdr=${badTile.headers()['x-tile-proxy-status']}`);

    // ---- 1.3 H6 + map thật dùng proxy style ----
    const tileReqs = [];
    page.on('response', (resp) => { if (resp.url().includes('/tiles/')) tileReqs.push(resp.url()); });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);
    const styledTile = tileReqs.some((u) => /\/tiles\/\d+\/\d+\/\d+\?style=/.test(u));
    record('1.3-H6 map gọi /tiles kèm style đã lưu', styledTile, `tiles=${tileReqs.length}`);
    const leafletOk = await page.locator('.leaflet-container').count();
    record('1.4 map render Leaflet', leafletOk > 0, `containers=${leafletOk}`);

    // ---- 1.3 H2: admin Test kết nối qua proxy ----
    await page.goto(`${BASE}/admin/map-config`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Test kết nối/ }).click();
    await page.waitForTimeout(9000);
    const testText = await page.locator('.font-mono').first().textContent().catch(() => '');
    const testOk = await page.getByText('Kết nối OK').count();
    record('1.3-H2 admin test qua proxy', testOk > 0 || /\/tiles\//.test(testText || ''), `${testText ? testText.slice(0, 80) : 'no-url'} okCount=${testOk}`);

    // ---- 1.4 M4/M7: không còn host bị chặn / style_value ----
    const mapSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'MapView.jsx'), 'utf8');
    record('1.4-M4 MapView không còn tile.openstreetmap.org', !mapSrc.includes('tile.openstreetmap.org'));
    const adminSrc = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'admin', 'AdminMapConfigPage.jsx'), 'utf8');
    record('1.4-M4 Admin không còn tile.openstreetmap.org', !adminSrc.includes('tile.openstreetmap.org'));
    const feGrep = ['src/components/MapView.jsx', 'src/utils/mapTile.js', 'src/pages/admin/AdminMapConfigPage.jsx']
      .map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
    record('1.4-M7 FE không còn style_value (source)', !/style_value/.test(feGrep));

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('502'));
    record('Không console error', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  } catch (err) {
    record('Test runner', false, err.message);
  }

  fs.writeFileSync(path.join(__dirname, 'test-map-phase1-results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n== ${passed}/${results.length} PASS ==`);
  await browser.close();
}

main();
