const { test, expect } = require('@playwright/test');

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';
test.use({ baseURL });

for (const renderer of ['leaflet', 'maplibre']) {
  test(`${renderer}: station filters include active and deploying proposals on both maps`, async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const station = (id, status, lat) => ({ id, status, latitude: lat, longitude: 105.85, name: `S${id}`, loai_uu_tien: '1' });
    const proposal = (id, status, lat, user_id = 1) => ({
      id, status, latitude: lat, longitude: 105.85, user_id, ma_de_xuat: `P${id}`,
      address: 'Địa chỉ đề xuất', mo_hinh_dau_tu: 'LK',
      map_pole_summary: 'Trụ thử', nearby_pole_summary: 'Trụ thử'
    });
    const stations = [station(10, 'ACTIVE', 21.01), station(11, 'DEPLOYING', 21.011), station(12, 'PLANNING', 21.012)];
    const proposals = [
      proposal(1, 'PENDING', 21.021), proposal(2, 'GRADING', 21.022), proposal(3, 'APPROVED', 21.023),
      proposal(4, 'ACTIVE', 21.024), proposal(5, 'DEPLOYING', 21.025), proposal(6, 'ACTIVE', 21.026, 2),
      proposal(7, 'CANCELLED', 21.027), proposal(8, 'ARCHIVED', 21.028),
      proposal(9, 'CONTRACT_SIGNED', 21.029)
    ];
    await page.addInitScript(() => localStorage.setItem('token', 'map-group-fixture'));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path === '/api/auth/me') data = { user: { id: 1, role: 'ADMIN', full_name: 'Tester' } };
      if (path === '/api/proposals') data = proposals;
      if (path === '/api/stations') data = stations;
      if (path === '/api/map-configs') data = {
        renderer, tile_provider_id: 'leaflet-osm', default_mode: 'satellite', tile_mode: 'direct',
        center_lat: 21.02, center_lng: 105.85, default_zoom: 12,
        show_boundaries: 0, show_province_labels: 0, show_cluster: 0
      };
      if (path === '/api/assistant/status') data = { enabled: false };
      await route.fulfill({ json: { success: true, data } });
    });
    await page.route('**/*.geojson', route => route.fulfill({ json: { type: 'FeatureCollection', features: [] } }));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(baseURL).origin ? route.fallback() : route.abort();
    });
    await page.goto('/map');
    await page.waitForFunction(expected => window.__mapRuntime?.id === expected, renderer, { timeout: 45000 });
    const isolatedFilter = await page.evaluate(async () => {
      const { filterMapProposals } = await import('/src/utils/mapStatuses.js');
      const records = [
        { id: 1, status: 'ACTIVE', user_id: 1 },
        { id: 2, status: 'DEPLOYING', user_id: 1 },
        { id: 3, status: 'PENDING', user_id: 1 },
        { id: 4, status: 'CONTRACT_SIGNED', user_id: 1 },
      ];
      const filters = { scope: 'all', hideStations: false, hideProposals: true, stationStatuses: ['ACTIVE', 'DEPLOYING'] };
      return [[], [{ value: 'PENDING' }]].map(legend =>
        filterMapProposals(records, filters, { id: 1 }, legend).map(item => item.id));
    });
    expect(isolatedFilter).toEqual([[1, 2], [1, 2]]);

    const markerLats = async () => page.evaluate(async () => {
      const runtime = window.__mapRuntime;
      if (runtime.id === 'maplibre') {
        const source = runtime.map.getSource('app-markers');
        const features = source ? (await source.getData()).features : [];
        return features.map(feature => Math.round(feature.geometry.coordinates[1] * 1000)).sort();
      }
      const values = [];
      runtime.map.eachLayer(layer => {
        if (layer.getPopup?.() && layer.getLatLng) values.push(Math.round(layer.getLatLng().lat * 1000));
      });
      return values.sort();
    });
    const expectMarkers = async (container, values) => {
      await expect.poll(markerLats, { timeout: 20000 }).toEqual([...values].sort());
      if (await container.evaluate(element => element.matches('.location-map-modal'))) {
        await expect(container.locator('.location-map-toolbar')).toContainText(`${values.length} điểm lân cận`);
      }
    };

    async function exercise(container) {
      const panel = container.locator('.map-filter');
      await panel.locator('.map-filter-toggle').click();
      const stationGroup = panel.locator('.map-filter-group').filter({ has: page.locator('.map-filter-label', { hasText: 'Trạng thái trạm' }) });
      const proposalGroup = panel.locator('.map-filter-group').filter({ has: page.locator('.map-filter-label', { hasText: 'Trạng thái đề xuất' }) });
      await expect(proposalGroup.getByRole('button', { name: 'Hoạt động', exact: true })).toHaveCount(0);
      await expect(proposalGroup.getByRole('button', { name: 'Đang triển khai', exact: true })).toHaveCount(0);
      const legend = container.locator('.map-legend-col-wide');
      await expect(legend).not.toContainText('Đang triển khai');
      await expect(legend).not.toContainText('Hoạt động');
      await expect(legend).toContainText('Đã hủy');
      await expect(legend).toContainText('Đã lưu trữ');
      await expectMarkers(container, [21010, 21011, 21021, 21022, 21023, 21024, 21025, 21026]);

      await panel.getByLabel('Đề xuất', { exact: true }).uncheck();
      await expectMarkers(container, [21010, 21011, 21024, 21025, 21026]);
      await page.evaluate(() => {
        const runtime = window.__mapRuntime;
        if (runtime.id === 'leaflet') runtime.map.setView([21.024, 105.85], 16, { animate: false });
        else runtime.setView([21.024, 105.85], 16);
      });
      const surface = container.locator(renderer === 'leaflet' ? '.leaflet-container' : '.maplibregl-canvas').last();
      const popup = container.locator('.leaflet-popup-content, .maplibregl-popup-content').last();
      await expect(async () => {
        const box = await surface.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await expect(popup).toContainText('P4', { timeout: 3000 });
      }).toPass({ timeout: 30000 });
      await expect(popup).toContainText('Địa chỉ đề xuất');
      if (!(await container.evaluate(element => element.matches('.location-map-modal')))) {
        await expect(popup.getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute('href', '/admin/proposals/chi-tiet/4');
      }
      const close = container.locator('.leaflet-popup-close-button, .maplibregl-popup-close-button').last();
      if (await close.isVisible()) await close.evaluate(element => element.click());
      await panel.getByLabel('Trạm', { exact: true }).uncheck();
      await expectMarkers(container, []);
      await panel.getByLabel('Đề xuất', { exact: true }).check();
      await expectMarkers(container, [21021, 21022, 21023]);
      await panel.getByLabel('Trạm', { exact: true }).check();
      await stationGroup.getByRole('button', { name: 'Hoạt động', exact: true }).click();
      await expectMarkers(container, [21011, 21021, 21022, 21023, 21025]);
      await stationGroup.getByRole('button', { name: 'Triển khai', exact: true }).click();
      await expectMarkers(container, [21021, 21022, 21023]);
      await stationGroup.getByRole('button', { name: 'Hoạt động', exact: true }).click();
      await expectMarkers(container, [21010, 21021, 21022, 21023, 21024, 21026]);
      await stationGroup.getByRole('button', { name: 'Triển khai', exact: true }).click();
      await expectMarkers(container, [21010, 21011, 21021, 21022, 21023, 21024, 21025, 21026]);
      await panel.getByRole('button', { name: 'Của tôi', exact: true }).click();
      await expectMarkers(container, [21010, 21011, 21021, 21022, 21023, 21024, 21025]);
      await panel.getByLabel('Quy hoạch', { exact: true }).check();
      await expectMarkers(container, [21010, 21011, 21012, 21021, 21022, 21023, 21024, 21025]);
      await proposalGroup.getByRole('button', { name: 'Đã hủy', exact: true }).click();
      await proposalGroup.getByRole('button', { name: 'Đã lưu trữ', exact: true }).click();
      await expectMarkers(container, [21010, 21011, 21012, 21021, 21022, 21023, 21024, 21025, 21027, 21028]);
      await panel.getByRole('button', { name: 'Đặt lại bộ lọc' }).click();
      await expectMarkers(container, [21010, 21011, 21021, 21022, 21023, 21024, 21025, 21026]);
    }

    await exercise(page.locator('body'));
    await page.evaluate(async () => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { AuthProvider } = await import('/src/contexts/AuthContext.jsx');
      const { default: Modal } = await import('/src/components/LocationMapModal.jsx');
      const root = document.createElement('div');
      document.body.appendChild(root);
      ReactDOM.createRoot(root).render(React.createElement(AuthProvider, null,
        React.createElement(Modal, { open: true, lat: 21.02, lng: 105.85, onClose: () => {} })));
    });
    const modal = page.locator('.location-map-modal');
    await expect(modal).toBeVisible();
    await page.waitForFunction(expected => window.__mapRuntime?.id === expected
      && !!window.__mapRuntime.map.getContainer().closest('.location-map-modal'), renderer, { timeout: 45000 });
    await exercise(modal);
    expect(errors).toEqual([]);
  });
}
