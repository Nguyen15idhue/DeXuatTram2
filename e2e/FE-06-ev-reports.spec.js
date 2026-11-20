const { test, expect } = require('@playwright/test');

const API = process.env.E2E_API_URL || 'http://localhost:3000';

for (const allowAds of [false, true]) {
test(`guest submit shows loading and allows a retry with ad tracking ${allowAds ? 'enabled' : 'declined'}`, async ({ page }) => {
  const origin = process.env.E2E_BASE_URL || 'http://localhost:5173';
  await page.route('**/*', route =>
    new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  let pixelLoads = 0;
  await page.route('https://connect.facebook.com/en_US/fbevents.js', (route) => {
    pixelLoads++;
    return route.fulfill({ contentType: 'application/javascript', body:
      'window.pixelCalls = []; window.fbq.callMethod = (...args) => window.pixelCalls.push(args);' });
  });
  const pixelEvents = () => page.evaluate(() =>
    (window.pixelCalls || []).filter(([command]) => command === 'trackSingle').map(([, , ...event]) => event));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/field-definitions/entity/ev_charging_reports')
      ? [{ key: 'address', type: 'text', label: 'Địa chỉ', required: true }]
      : [];
    return route.fulfill({ json: { success: true, data } });
  });
  let releaseGeocode, releaseSave;
  const geocodeGate = new Promise(resolve => { releaseGeocode = resolve; });
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  let geocodes = 0, saves = 0;
  await page.route('**/api/geocode/search', async route => {
    geocodes++;
    await geocodeGate;
    await route.fulfill({ json: { success: true, data: { results: [{ lat: 21.03, lon: 105.85 }] } } });
  });
  await page.route('**/api/ev-reports/guest', async route => {
    if (++saves === 1) {
      await saveGate;
      return route.fulfill({ status: 500, json: { success: false, message: 'Không thể lưu bản thử' } });
    }
    return route.fulfill({ status: 201, json: { success: true, data: { address: 'Địa chỉ thử' } } });
  });
  try {
    await page.goto(`${origin}/nhu-cau-sac-xe`);
    const notice = page.getByRole('region', { name: 'Đo lường quảng cáo Meta' });
    await expect(notice).toBeVisible();
    expect(pixelLoads).toBe(0);
    await notice.getByRole('button', { name: allowAds ? 'Đồng ý' : 'Không đồng ý', exact: true }).click();
    await expect(notice).toBeHidden();
    if (allowAds) await expect.poll(pixelEvents).toEqual([['PageView']]);
    await page.getByRole('button', { name: /Đăng ký thông tin nhu cầu sạc/ }).click();
    const address = page.locator('[data-field-key="address"] input');
    const submit = page.locator('form.dynamic-form button[type="submit"]');
    await submit.click();
    await expect(page.getByText('Vui lòng kiểm tra các trường bắt buộc')).toBeVisible();
    await address.fill('Địa chỉ thử');
    await submit.click();
    await expect.poll(() => geocodes).toBe(1);
    await expect(submit).toHaveText('Đang gửi...');
    await expect(submit).toBeDisabled();
    await expect(submit.locator('.animate-spin')).toBeVisible();
    await submit.locator('..').dispatchEvent('submit');
    releaseGeocode();
    await expect.poll(() => saves).toBe(1);
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    releaseSave();
    await expect(page.getByText('Không thể lưu bản thử')).toBeVisible();
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveText('Gửi thông tin đi');
    await expect(address).toHaveValue('Địa chỉ thử');
    expect(geocodes).toBe(1);
    expect(saves).toBe(1);
    expect(await pixelEvents()).toEqual(allowAds ? [['PageView']] : []);
    await submit.click();
    await expect(page.getByText('Cảm ơn bạn đã chia sẻ!')).toBeVisible();
    expect(saves).toBe(2);
    await expect.poll(pixelEvents).toEqual(allowAds ? [['PageView'], ['Lead']] : []);
    expect(pixelLoads).toBe(allowAds ? 1 : 0);

    await page.reload();
    const settings = page.getByRole('button', { name: 'Cài đặt đo lường quảng cáo' });
    await expect(settings).toBeVisible();
    await expect(notice).toBeHidden();
    if (allowAds) {
      await expect.poll(pixelEvents).toEqual([['PageView']]);
      await page.goto(`${origin}/login`);
      await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
      await expect(settings).toHaveCount(0);
      expect(pixelLoads).toBe(2);
      await page.goBack();
      await expect(settings).toBeVisible();
      await expect.poll(pixelEvents).toEqual([['PageView']]);
      const loadsBeforeRevocation = pixelLoads;
      await settings.click();
      await notice.getByRole('button', { name: 'Không đồng ý', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.pixelCalls.at(-1))).toEqual(['consent', 'revoke']);
      await page.reload();
      await expect(settings).toBeVisible();
      expect(pixelLoads).toBe(loadsBeforeRevocation);
    }
    const loadsBeforeLogin = pixelLoads;
    await page.goto(`${origin}/login`);
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    await expect(settings).toHaveCount(0);
    expect(pixelLoads).toBe(loadsBeforeLogin);
  } finally {
    releaseGeocode();
    releaseSave();
  }
});
}

// FE-06: form khách nặc danh chia sẻ điểm sạc xe điện (kế hoạch 78).
// Quy ước: không ảnh, không tracking code, không status; 1 SĐT gửi được
// nhiều record; SĐT bắt buộc ở validator, cột DB nullable. Yêu cầu backend
// đã chạy migration 165 + routes evReports (xem plan 78).
async function login(request) {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@station.com', password: '123456' }
  });
  const json = await res.json();
  return json.data.token;
}

test.describe('FE-06 guest EV charging reports (anonymous, same phone, 2 locations)', () => {
  test('gps mode shows map before form, manual mode shows form before map', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Đăng ký nhu cầu vị trí sạc xe điện' })).toBeVisible();
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });

    const mapBox = page.locator('.evr-map-box');
    // Chờ lớp renderer (maplibre hoặc leaflet) sẵn sàng bên trong khung bản đồ
    await expect(page.locator('.maplibregl-canvas, .leaflet-container')).toBeVisible({ timeout: 30000 });
    // GPS: các ô vị trí (Tỉnh/Xã/Địa chỉ) nằm DƯỚI bản đồ
    const locField = page.locator('[data-field-key="province"]');
    await expect(locField).toBeVisible();
    const mapY = (await mapBox.boundingBox()).y;
    const locY = (await locField.boundingBox()).y;
    expect(mapY, 'gps: bản đồ nằm trên ô vị trí').toBeLessThan(locY);

    await page.getByRole('button', { name: 'Nhập địa chỉ' }).click();
    await expect(mapBox).toBeVisible({ timeout: 20000 });
    await expect(locField).toBeVisible();
    const locY2 = (await locField.boundingBox()).y;
    const mapY2 = (await mapBox.boundingBox()).y;
    expect(locY2, 'manual: ô vị trí nằm trên bản đồ').toBeLessThan(mapY2);
    expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
  });

  test('manual mode filters wards by province like DynamicForm cascading', async ({ page }) => {
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Nhập địa chỉ' }).click();

    const province = page.locator('[data-field-key="province"]');
    await province.locator('.dynamic-field-select .form-control').click();
    await province.locator('.dynamic-select-dropdown').getByText('Thành phố Hà Nội', { exact: true }).click({ timeout: 15000 });

    const ward = page.locator('[data-field-key="ward"]');
    await ward.locator('.dynamic-field-select .form-control').click();
    await expect(ward.locator('.dynamic-select-dropdown').getByText('Phường Hoàn Kiếm', { exact: true })).toBeVisible({ timeout: 15000 });
    await ward.locator('.dynamic-select-dropdown').getByText('Phường Hoàn Kiếm', { exact: true }).click();

    await province.locator('.dynamic-field-select .form-control').click();
    await province.locator('.dynamic-select-dropdown').getByText('Tp Hồ Chí Minh', { exact: true }).click();
    await expect(ward.locator('.dynamic-field-select .form-control')).toHaveText(/-- Chọn --/);
  });

  test('brand select keeps search box fixed while scrolling options', async ({ page }) => {
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });
    const field = page.locator('[data-field-key="hang_xe"]');
    await field.locator('.dynamic-field-select .form-control').click();
    const dropdown = field.locator('.dynamic-select-dropdown');
    await expect(dropdown).toBeVisible();
    const searchInput = dropdown.locator('input[placeholder="Tìm kiếm..."]');
    await expect(searchInput).toBeVisible();
    const scroller = dropdown.locator('div.overflow-auto');
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(300);
    const inputBox = await searchInput.boundingBox();
    const dropBoxAfter = await dropdown.boundingBox();
    expect(Math.abs(inputBox.y - dropBoxAfter.y) < 40, 'ô tìm kiếm vẫn dính đầu dropdown khi cuộn').toBe(true);
  });

  test('manual mode full submit shows thank-you', async ({ page, request }) => {
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Nhập địa chỉ' }).click();

    await page.locator('[data-field-key="full_name"] input').fill('E2E Browser');
    await page.locator('[data-field-key="phone"] input').fill('0903456789');

    const brand = page.locator('[data-field-key="hang_xe"]');
    await brand.locator('.dynamic-field-select .form-control').click();
    await brand.locator('.dynamic-select-dropdown').getByText('VinFast', { exact: true }).click();

    const group = page.locator('[data-field-key="nhom_phuong_tien"]');
    await group.getByText(/Xe cá nhân\/Gia đình/).click();
    await group.getByText(/Xe kinh doanh dịch vụ/).click();

    const province = page.locator('[data-field-key="province"]');
    await province.locator('.dynamic-field-select .form-control').click();
    await province.locator('.dynamic-select-dropdown').getByText('Tp Hồ Chí Minh', { exact: true }).click({ timeout: 15000 });

    const mapSurface = page.locator('.maplibregl-canvas, .leaflet-container');
    await expect(mapSurface).toBeVisible({ timeout: 30000 });
    await mapSurface.click({ position: { x: 200, y: 150 } });
    await expect(page.getByText(/Vĩ độ:/)).toBeVisible({ timeout: 15000 });

    // Câu hỏi hợp tác lắp đặt trạm sạc là BẮT BUỘC (migration 170):
    // chưa trả lời -> chặn khi lưu
    const link = page.locator('[data-field-key="hop_tac_lap_tram"]');
    await expect(link.locator('label'), 'nhãn câu hỏi hợp tác').toContainText(/hợp tác/i);
    await page.getByRole('button', { name: 'Lưu thông tin' }).click();
    await expect(link.locator('.field-error')).toHaveText(/là bắt buộc/);

    await link.locator('.dynamic-field-select .form-control').click();
    await link.locator('.dynamic-select-dropdown').getByText('Có', { exact: true }).click();

    await page.getByRole('button', { name: 'Lưu thông tin' }).click();
    await expect(page.getByText('Cảm ơn bạn đã chia sẻ!')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Gửi thêm vị trí khác' })).toBeVisible();

    // Dọn record vừa tạo qua form khách (form khách không tự tạo tracking code)
    const token = await login(request);
    const auth = { Authorization: `Bearer ${token}` };
    const list = await request.get(`${API}/api/ev-reports/admin/list?search=E2E Browser`, { headers: auth });
    for (const row of (await list.json()).data || []) {
      await request.delete(`${API}/api/ev-reports/admin/${row.id}`, { headers: auth });
    }
  });

  test('brand "Khác" reveals free-text input and is required', async ({ page }) => {
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Nhập địa chỉ' }).click();

    const brand = page.locator('[data-field-key="hang_xe"]');
    await brand.locator('.dynamic-field-select .form-control').click();
    await brand.locator('.dynamic-select-dropdown').getByText('Khác (nhập tay)', { exact: true }).click();

    const freeText = brand.locator('input[placeholder="Nhập hãng xe bạn đang sử dụng"]');
    await expect(freeText, 'chọn Khác thì hiện ô nhập tay').toBeVisible();

    // Có vị trí + thiếu tên hãng -> chặn khi lưu
    const mapSurface = page.locator('.maplibregl-canvas, .leaflet-container');
    await expect(mapSurface).toBeVisible({ timeout: 30000 });
    await mapSurface.click({ position: { x: 200, y: 150 } });
    await expect(page.getByText(/Vĩ độ:/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Lưu thông tin' }).click();
    await expect(brand.locator('.field-error')).toHaveText(/Vui lòng nhập hãng xe/);

    // Chọn lại hãng trong data list -> ô nhập tay ẩn
    await brand.locator('.dynamic-field-select .form-control').click();
    await brand.locator('.dynamic-select-dropdown').getByText('VinFast', { exact: true }).click();
    await expect(freeText).toHaveCount(0);
  });

  test('nearby preview shows stations and proposal markers, and distinguishes load errors', async ({ page }) => {
    const origin = process.env.E2E_BASE_URL || 'http://localhost:5173';
    await page.route('**/*', route =>
      new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
    await page.route('**/api/**', route =>
      route.fulfill({ json: { success: true, data: [] } }));
    await page.route('**/api/map-configs?*', route =>
      route.fulfill({ json: { success: true, data: { renderer: 'leaflet' } } }));
    await page.route('**/api/geocode/search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            found: true,
            results: [
              { name: 'Thạch Hà', formatted: 'Thạch Hà, Hà Tĩnh, Việt Nam', lat: 18.352, lon: 105.901 }
            ]
          }
        })
      })
    );
    const requests = [];
    let responseMode = 'populated';
    await page.route('**/api/ev-reports/nearby-stations', route => {
      requests.push(route.request().postDataJSON());
      if (responseMode === 'error') {
        return route.fulfill({ status: 500, json: { success: false } });
      }
      return route.fulfill({ json: { success: true, data: responseMode === 'empty' ? [] : [
        { id: 'station:1', source: 'station', status: 'ACTIVE', name: 'Trạm 1',
          address: 'Hà Tĩnh', latitude: 18.38, longitude: 105.80, distance_m: 11000 },
        { id: 'proposal:1', source: 'proposal', status: 'DEPLOYING',
          latitude: 18.42, longitude: 106.0, distance_m: 13000 },
      ] } });
    });

    await page.goto(`${origin}/nhu-cau-sac-xe`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Kiểm tra trạm sạc ở gần bạn/ }).click();
    const searchBox = page.getByPlaceholder(/nhập địa chỉ cần xem trạm sạc/i);
    const openFromAddress = async query => {
      await searchBox.fill(query);
      await page.getByText('Thạch Hà, Hà Tĩnh, Việt Nam', { exact: true }).click();
    };
    await openFromAddress('Thạch Hà');

    const modal = page.locator('.location-map-modal');
    await expect(modal.locator('.location-map-toolbar')).toContainText('Bán kính 50 km');
    await expect(modal.locator('.location-map-toolbar')).toContainText('2 trạm lân cận');
    expect(requests[0]).toEqual({ latitude: 18.352, longitude: 105.901 });
    const markers = modal.locator('.leaflet-marker-pane .leaflet-marker-icon[role="button"]:not(.location-point-icon)');
    await expect(markers).toHaveCount(2);
    await markers.nth(1).click();
    const proposalPopup = modal.locator('.leaflet-popup-content').filter({ hasText: 'Nguồn: Đề xuất' });
    await expect(proposalPopup).toContainText(/triển khai/i);
    await expect(proposalPopup).toContainText('13.00 km');
    await expect(proposalPopup).not.toContainText('Địa chỉ');
    await markers.first().click();
    const stationPopup = modal.locator('.leaflet-popup-content').filter({ hasText: 'Trạm 1' });
    await expect(stationPopup).toContainText(/hoạt động/i);
    await expect(stationPopup).toContainText('Hà Tĩnh');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();

    responseMode = 'error';
    await openFromAddress('Thạch Hà, Hà Tĩnh');
    await expect(modal.getByRole('alert')).toContainText('Không tải được trạm sạc lân cận');
    await expect(modal.getByText(/Không có trạm sạc nào/)).toHaveCount(0);
    await modal.getByRole('button', { name: 'Close', exact: true }).click();

    responseMode = 'empty';
    await openFromAddress('Địa chỉ tại Thạch Hà');
    await expect(modal.getByText('Không có trạm sạc nào trong bán kính 50 km.')).toBeVisible();
    await expect(modal.getByRole('alert')).toHaveCount(0);
  });

  test('admin ev-reports header links to the guest form', async ({ page, request }) => {
    const token = await login(request);
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.goto('/admin/ev-reports', { waitUntil: 'domcontentloaded' });
    const link = page.getByRole('link', { name: /Thêm nhu cầu sạc xe/ });
    await expect(link).toBeVisible({ timeout: 20000 });
    await expect(link).toHaveAttribute('href', '/nhu-cau-sac-xe');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('map marker popup shows charging need + sender name/phone', async ({ page, request }) => {
    const token = await login(request);
    const mockReport = {
      id: 999001,
      latitude: 21.036,
      longitude: 105.816,
      address: 'Số 1 Tràng Thi, Phường Hoàn Kiếm, Thành phố Hà Nội',
      province: 'Thành phố Hà Nội',
      ward: 'Phường Hoàn Kiếm',
      hang_xe: 'MockBrand',
      full_name: 'Mock Sender',
      phone: '0912345678'
    };
    // Popup marker đọc từ dữ liệu API (đã đăng nhập mới có tên/SĐT) -> mock để
    // kiểm tra phần render mà không tốn quota guest submit.
    await page.route(
      (url) => url.pathname === '/api/ev-reports',
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [mockReport] }) });
      }
    );
    // Ghim renderer leaflet + tắt cluster để marker là 1 divIcon đúng toạ độ
    await page.route(
      (url) => url.pathname === '/api/map-configs' && url.searchParams.get('entity') === 'stations',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 1, name: 'e2e', entity: 'stations', renderer: 'leaflet', tile_provider_id: 'leaflet-osm',
              tile_mode: 'proxy', retina: 0, api_key: '', default_mode: 'streets', label_field: 'name',
              center_lat: mockReport.latitude, center_lng: mockReport.longitude, default_zoom: 15,
              show_boundaries: false, show_province_labels: false, show_cluster: 0, cluster_radius: 70, cluster_max_zoom: 18
            }
          })
        });
      }
    );

    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.goto('/map', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 40000 });

    // Lớp "Nhu cầu sạc xe" mặc định ẩn -> bật trong bộ lọc
    await page.locator('.map-filter-toggle').click();
    const evBox = page.getByLabel('Nhu cầu sạc xe');
    await expect(evBox).toBeVisible({ timeout: 20000 });
    if (!(await evBox.isChecked())) await evBox.check();
    await page.locator('.map-filter-toggle').click();

    const hasRuntime = await page
      .waitForFunction(() => !!window.__mapRuntime, null, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasRuntime, 'MapCanvas chỉ expose __mapRuntime trên dev server');

    await page.evaluate(([lat, lng]) => { window.__mapRuntime.setView([lat, lng], 15); }, [mockReport.latitude, mockReport.longitude]);
    await page.waitForTimeout(2000);

    // Marker nằm đúng tâm bản đồ -> bấm tâm để mở popup
    const box = await page.locator('.leaflet-container').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toBeVisible({ timeout: 15000 });
    await expect(popup).toContainText('Nhu cầu sạc: MockBrand');
    await expect(popup).toContainText('Người gửi: Mock Sender');
    await expect(popup).toContainText('SĐT: 0912345678');
    await expect(popup.locator('a[href="tel:0912345678"]')).toBeVisible();
    await expect(popup).toContainText('Địa chỉ: Số 1 Tràng Thi, Phường Hoàn Kiếm, Thành phố Hà Nội');
  });

  test('manual find flies map to typed address area for pin adjust', async ({ page }) => {
    await page.route('**/api/geocode/search', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { found: true, results: [{ lat: 21.03, lon: 105.85, formatted: 'Mock, Hoàn Kiếm', name: 'Mock' }] } })
      });
    });
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Nhập địa chỉ' }).click();

    const province = page.locator('[data-field-key="province"]');
    await province.locator('.dynamic-field-select .form-control').click();
    await province.locator('.dynamic-select-dropdown').getByText('Thành phố Hà Nội', { exact: true }).click({ timeout: 15000 });
    const ward = page.locator('[data-field-key="ward"]');
    await ward.locator('.dynamic-field-select .form-control').click();
    await ward.locator('.dynamic-select-dropdown').getByText('Phường Hoàn Kiếm', { exact: true }).click();
    await page.locator('[data-field-key="address"] textarea').fill('Số 1 Tràng Thi');

    await page.getByRole('button', { name: 'Tìm vị trí trên bản đồ' }).click();
    await expect(page.getByText(/Vĩ độ: 21\.03/)).toBeVisible({ timeout: 15000 });
  });

  test('gps auto-selects province/ward/address from datalist via reverse', async ({ page, context }) => {
    await page.route('**/api/geocode/reverse', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { found: true, address: 'Mock addr, Hoàn Kiếm', admin: { province: 'Thành phố Hà Nội', xa_phuong: 'Phường Hoàn Kiếm', ma_tinh: 'HNO', vung_mien: 'Bắc' } } })
      });
    });
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 21.0285, longitude: 105.8542 });
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Lấy vị trí của tôi' }).click();
    await expect(page.getByText(/Vĩ độ: 21\.0285/)).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-field-key="province"]')).toContainText('Thành phố Hà Nội', { timeout: 15000 });
    await expect(page.locator('[data-field-key="ward"]')).toContainText('Phường Hoàn Kiếm', { timeout: 15000 });
  });

  test('gps button sets coords chip and hides lat/lng inputs', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 21.0285, longitude: 105.8542 });
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Lấy vị trí của tôi' }).click();
    await expect(page.getByText(/Vĩ độ: 21\.0285/)).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-field-key="latitude"]')).toHaveCount(0);
    await expect(page.locator('[data-field-key="longitude"]')).toHaveCount(0);
  });

  test('same phone submits 2 locations, then edit + proposal + delete', async ({ request }) => {
    const token = await login(request);
    const auth = { Authorization: `Bearer ${token}` };
    const stamp = Date.now();
    const phone = '09' + String(stamp).slice(-8);
    const base = {
      full_name: `E2E Khach ${stamp}`,
      phone,
      province: 'Tp Hồ Chí Minh',
      nhom_phuong_tien: ['Xe cá nhân/Gia đình', 'Xe vận tải hàng hóa'],
      hop_tac_lap_tram: 'Có'
    };

    // 1. Gửi thiếu SĐT -> 400 (SĐT bắt buộc ở validator)
    const missing = await request.post(`${API}/api/ev-reports/guest`, {
      data: { ...base, phone: undefined, latitude: 18.352, longitude: 105.901, hang_xe: 'VinFast' }
    });
    expect(missing.status(), 'thiếu SĐT phải 400').toBe(400);

    // 1b. Nhóm phương tiện là multiselect BẮT BUỘC (migration 168):
    //     mảng rỗng -> 400 (không được coi là "đã trả lời").
    // Lưu ý: guest submit limiter 5 request/giờ/IP, nên giữ số lần POST tối thiểu.
    const emptyGroup = await request.post(`${API}/api/ev-reports/guest`, {
      data: { ...base, nhom_phuong_tien: [], latitude: 18.352, longitude: 105.901, hang_xe: 'VinFast' }
    });
    expect(emptyGroup.status(), 'mảng rỗng phải 400').toBe(400);

    // 2. Cùng SĐT gửi 2 vị trí khác nhau -> cả 2 đều 201
    const r1 = await request.post(`${API}/api/ev-reports/guest`, {
      data: { ...base, latitude: 18.352, longitude: 105.901, hang_xe: 'VinFast' }
    });
    // Hãng xe tự nhập ngoài data list dm_hang_xe vẫn lưu được
    const r2 = await request.post(`${API}/api/ev-reports/guest`, {
      data: { ...base, latitude: 18.362, longitude: 105.911, hang_xe: 'Geely (tự nhập)' }
    });
    expect(r1.ok(), 'gửi record 1').toBeTruthy();
    expect(r2.ok(), 'gửi record 2 cùng SĐT').toBeTruthy();
    const id1 = (await r1.json()).data.id;
    const id2 = (await r2.json()).data.id;
    expect(id1).not.toBe(id2);

    // 2b. Lưu đúng mảng nhiều nhóm + hãng tự nhập
    const list2b = await request.get(`${API}/api/ev-reports/admin/list?search=E2E Khach ${stamp}`, { headers: auth });
    const row2 = ((await list2b.json()).data || []).find((r) => r.id === id2);
    const cd2 = typeof row2.custom_data === 'string' ? JSON.parse(row2.custom_data) : row2.custom_data || {};
    expect(cd2.nhom_phuong_tien, 'lưu mảng nhóm phương tiện').toEqual(base.nhom_phuong_tien);
    expect(cd2.hang_xe, 'lưu hãng xe tự nhập').toBe('Geely (tự nhập)');
    expect(cd2.hop_tac_lap_tram, 'lưu câu trả lời hợp tác lắp trạm').toBe('Có');

    // 3. Admin thấy cả 2 trong danh sách
    const list = await request.get(`${API}/api/ev-reports/admin/list?search=E2E Khach ${stamp}`, { headers: auth });
    expect(list.ok(), 'admin list').toBeTruthy();
    const ids = ((await list.json()).data || []).map((r) => r.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);

    // 4. Public không lộ PII, không có status
    const pub = await request.get(`${API}/api/ev-reports`);
    expect(pub.ok(), 'public list').toBeTruthy();
    const pubRows = (await pub.json()).data || [];
    const mine = pubRows.filter((r) => r.id === id1 || r.id === id2);
    expect(mine.length, 'public thấy 2 record').toBe(2);
    expect('full_name' in mine[0] || 'phone' in mine[0] || 'status' in mine[0], 'public không PII/status').toBe(false);

    // 4b. Đã đăng nhập -> trả thêm tên/SĐT (popup marker hiện người gửi)
    const authList = await request.get(`${API}/api/ev-reports`, { headers: auth });
    const authRows = (await authList.json()).data || [];
    const authMine = authRows.find((r) => r.id === id1);
    expect(authMine.full_name, 'đăng nhập thấy tên người gửi').toBe(`E2E Khach ${stamp}`);
    expect(authMine.phone, 'đăng nhập thấy SĐT người gửi').toBe(phone);

    // 5. Admin sửa địa chỉ record 1
    const upd = await request.put(`${API}/api/ev-reports/admin/${id1}`, {
      headers: auth, data: { address: `E2E updated ${stamp}` }
    });
    expect(upd.ok(), 'admin update').toBeTruthy();
    expect((await upd.json()).data.address, 'địa chỉ đã đổi').toBe(`E2E updated ${stamp}`);

    // 6. Tạo đề xuất từ record 1 rồi xóa đề xuất
    const cp = await request.post(`${API}/api/ev-reports/admin/${id1}/create-proposal`, { headers: auth });
    expect(cp.ok(), 'tạo đề xuất từ vị trí').toBeTruthy();
    const pid = (await cp.json()).data.id;
    expect((await cp.json()).data.owner_phone, 'prefill SĐT').toBe(phone);
    const delP = await request.delete(`${API}/api/admin/proposals/${pid}`, { headers: auth });
    expect(delP.ok(), 'xóa đề xuất test').toBeTruthy();

    // 7. Xóa cả 2 record (tự dọn sau test)
    for (const id of [id1, id2]) {
      const del = await request.delete(`${API}/api/ev-reports/admin/${id}`, { headers: auth });
      expect(del.ok(), `xóa record ${id}`).toBeTruthy();
    }
    const list2 = await request.get(`${API}/api/ev-reports/admin/list?search=E2E Khach ${stamp}`, { headers: auth });
    const ids2 = ((await list2.json()).data || []).map((r) => r.id);
    expect(ids2, 'đã dọn sạch').toEqual([]);
  });
});
