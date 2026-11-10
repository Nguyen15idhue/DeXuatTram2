const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: __dirname,
    server: { host: '127.0.0.1', port: 0, open: false },
  });
  let browser;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname;
      let data = [];
      if (endpoint.endsWith('/map-configs')) {
        data = { renderer: 'leaflet', tile_provider_id: 'leaflet-osm', tile_mode: 'direct' };
      }
      if (endpoint.endsWith('/assistant/status')) data = { enabled: false };
      return route.fulfill({ json: { success: true, data } });
    });
    await page.route('**/*.geojson', (route) => route.fulfill({
      json: { type: 'FeatureCollection', features: [] }
    }));
    await page.route('**/tiles/**', (route) => route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    }));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.origin === base ? route.fallback() : route.abort();
    });
    await page.goto(`${base}/login`);
    await page.evaluate(async () => {
      const source = await (await fetch('/src/main.jsx')).text();
      const reactUrl = source.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
      const domUrl = source.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1];
      const [{ default: React }, { default: ReactDOM }, { AuthProvider }, { default: Modal, PREVIEW_STATUS_FILTER }, { EMPTY_MAP_FILTERS }] = await Promise.all([
        import(reactUrl), import(domUrl), import('/src/contexts/AuthContext.jsx'),
        import('/src/components/LocationMapModal.jsx'), import('/src/components/MapFilterPanel.jsx')
      ]);
      window.previewDefaults = { preview: PREVIEW_STATUS_FILTER.proposals, normal: EMPTY_MAP_FILTERS.proposalStatuses };
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = ReactDOM.createRoot(host);
      window.mountMapPreview = (createPreview) => root.render(
        React.createElement(AuthProvider, null, React.createElement(Modal, {
          key: String(createPreview), open: true, lat: 21.0285, lng: 105.8542,
          statusFilter: createPreview ? PREVIEW_STATUS_FILTER : null,
          onClose: () => root.render(null)
        }))
      );
    });
    const expected = ['PENDING', 'REVIEWING', 'APPROVED', 'DEPLOYING', 'ACTIVE'];
    assert.deepEqual(await page.evaluate(() => window.previewDefaults), { preview: expected, normal: expected });
    for (const createPreview of [true, false]) {
      await page.evaluate((value) => window.mountMapPreview(value), createPreview);
      const modal = page.locator('.location-map-modal');
      await modal.locator('.map-filter').waitFor();
      await modal.locator('.map-filter-toggle').click();
      const proposalGroup = modal.locator('.map-filter-group').filter({ has: page.locator('.map-filter-label', { hasText: 'Trạng thái đề xuất' }) });
      const selectedLabels = async () => (await proposalGroup.locator('.map-filter-chip.active').allTextContents()).map((text) => text.trim());
      const expectedLabels = ['Mới đề xuất', 'Đang xem xét', 'Đã duyệt BCĐX', 'Đang triển khai', 'Hoạt động'];
      assert.deepEqual(await selectedLabels(), expectedLabels);
      await proposalGroup.getByRole('button', { name: 'Đang xem xét', exact: true }).click();
      assert.deepEqual(await selectedLabels(), expectedLabels.filter((label) => label !== 'Đang xem xét'));
      await modal.getByRole('button', { name: 'Đặt lại bộ lọc', exact: true }).click();
      assert.deepEqual(await selectedLabels(), expectedLabels);
      await modal.getByRole('button', { name: 'Close', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log('PASS create/detail preview: five default proposal statuses, no cancelled/archived, toggles and reset; no runtime errors');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
