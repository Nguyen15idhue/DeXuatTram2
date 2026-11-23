const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:5174' });

for (const renderer of ['leaflet', 'maplibre']) {
  for (const { role, status } of ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP', 'MKT']
    .flatMap(role => ['PENDING', 'ACTIVE'].map(status => ({ role, status })))) {
    test(`${renderer}: ${role} sees permitted ${status} proposal fields on both maps`, async ({ page }) => {
      test.setTimeout(90000);
      const proposal = {
        id: 501, user_id: 1, latitude: 21.03, longitude: 105.85,
        status, ma_de_xuat: 'DX-TEST', address: 'Địa chỉ đề xuất riêng',
        mo_hinh_dau_tu: 'NQ_LK', loai_tru_nq: [{ loai_tru: 'DC 30', so_luong: 1 }],
        loai_tru_lk: [{ loai_tru: 'DC 60', so_luong: 2 }],
        map_pole_summary: '1× DC 30 + 2× DC 60 (tổng 3 trụ)',
        nearby_pole_summary: '1× DC 30 + 2× DC 60 (tổng 3 trụ)'
      };
      const station = {
        id: 502, latitude: 21.031, longitude: 105.851, status: 'ACTIVE',
        name: 'Trạm kiểm thử', address: 'Địa chỉ trạm', mo_hinh_tram: 'LK'
      };
      await page.addInitScript(() => localStorage.setItem('token', 'map-privacy-test'));
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = [];
        if (path === '/api/auth/me') data = { user: { id: 1, role, full_name: 'Tester', custom_data: {} } };
        if (path === '/api/proposals') data = [proposal];
        if (path === '/api/stations') data = [station];
        if (path === '/api/map-configs') data = {
          renderer, tile_provider_id: 'leaflet-osm', default_mode: 'satellite',
          tile_mode: 'direct', center_lat: 21.03, center_lng: 105.85, default_zoom: 16,
          show_boundaries: 0, show_province_labels: 0, show_cluster: 0
        };
        await route.fulfill({ json: { success: true, data } });
      });
      await page.route(/^https?:\/\/(?!127\.0\.0\.1:5174)/, route => route.abort());
      await page.goto('/map');
      await expect(page.locator(renderer === 'leaflet' ? '.leaflet-container' : '.maplibregl-canvas')).toBeVisible({ timeout: 45000 });
      await page.waitForFunction(expected => window.__mapRuntime?.id === expected, renderer, { timeout: 45000 });

      async function openAt(lat, lng, expectedTitle, mapSelector) {
        const close = page.locator('.leaflet-popup-close-button, .maplibregl-popup-close-button').last();
        if (await close.isVisible()) await close.evaluate(element => element.click());
        await page.evaluate(([lat, lng]) => {
          const runtime = window.__mapRuntime;
          if (runtime.id === 'leaflet') runtime.map.setView([lat, lng], 16, { animate: false });
          else runtime.setView([lat, lng], 16);
        }, [lat, lng]);
        const map = page.locator(mapSelector).last();
        const popup = page.locator('.leaflet-popup-content, .maplibregl-popup-content').last();
        await expect(async () => {
          const box = await map.boundingBox();
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await expect(popup).toContainText(expectedTitle, { timeout: 3000 });
        }).toPass({ timeout: 30000, intervals: [1000] });
        return popup;
      }

      async function checkProposal(popup) {
        await expect(popup).toContainText('1× DC 30 + 2× DC 60 (tổng 3 trụ)');
        if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
          await expect(popup).toContainText('Địa chỉ: Địa chỉ đề xuất riêng');
          await expect(popup).toContainText('Mô hình: Nhượng quyền + Liên kết');
        } else {
          await expect(popup).not.toContainText('Địa chỉ:');
          await expect(popup).not.toContainText('Mô hình:');
        }
      }

      const surface = renderer === 'leaflet' ? '.leaflet-container' : '.maplibregl-canvas';
      await checkProposal(await openAt(proposal.latitude, proposal.longitude, 'DX-TEST', surface));
      const stationPopup = await openAt(station.latitude, station.longitude, 'Trạm kiểm thử', surface);
      await expect(stationPopup).toContainText('Địa chỉ: Địa chỉ trạm');
      await expect(stationPopup).toContainText('Mô hình: Liên kết');

      await page.evaluate(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { AuthProvider } = await import('/src/contexts/AuthContext.jsx');
        const { default: LocationMapModal } = await import('/src/components/LocationMapModal.jsx');
        const root = document.createElement('div');
        document.body.appendChild(root);
        ReactDOM.createRoot(root).render(React.createElement(AuthProvider, null,
          React.createElement(LocationMapModal, { open: true, lat: 21.03, lng: 105.85, onClose: () => {} })));
      });
      const modal = page.locator('.location-map-modal');
      await expect(modal).toBeVisible();
      await expect(modal.locator(surface)).toBeVisible({ timeout: 45000 });
      await checkProposal(await openAt(proposal.latitude, proposal.longitude, 'DX-TEST', `.location-map-modal ${surface}`));
      const nearbyStation = await openAt(station.latitude, station.longitude, 'Trạm kiểm thử', `.location-map-modal ${surface}`);
      await expect(nearbyStation).toContainText('Địa chỉ: Địa chỉ trạm');
      await expect(nearbyStation).toContainText('Mô hình: Liên kết');
    });
  }
}
