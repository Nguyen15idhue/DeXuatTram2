const { test, expect } = require('@playwright/test');

const API = process.env.E2E_API_URL || 'http://localhost:3000';

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

  test('manual mode full submit shows thank-you', async ({ page }) => {
    await page.goto('/nhu-cau-sac-xe', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Họ và tên')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Nhập địa chỉ' }).click();

    await page.locator('[data-field-key="full_name"] input').fill('E2E Browser');
    await page.locator('[data-field-key="phone"] input').fill('0903456789');

    const brand = page.locator('[data-field-key="hang_xe"]');
    await brand.locator('.dynamic-field-select .form-control').click();
    await brand.locator('.dynamic-select-dropdown').getByText('VinFast', { exact: true }).click();

    const province = page.locator('[data-field-key="province"]');
    await province.locator('.dynamic-field-select .form-control').click();
    await province.locator('.dynamic-select-dropdown').getByText('Tp Hồ Chí Minh', { exact: true }).click({ timeout: 15000 });

    const mapSurface = page.locator('.maplibregl-canvas, .leaflet-container');
    await expect(mapSurface).toBeVisible({ timeout: 30000 });
    await mapSurface.click({ position: { x: 200, y: 150 } });
    await expect(page.getByText(/Vĩ độ:/)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Lưu thông tin' }).click();
    await expect(page.getByText('Cảm ơn bạn đã chia sẻ!')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Gửi thêm vị trí khác' })).toBeVisible();
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
      province: 'Tp Hồ Chí Minh'
    };

    // 1. Gửi thiếu SĐT -> 400 (SĐT bắt buộc ở validator)
    const missing = await request.post(`${API}/api/ev-reports/guest`, {
      data: { ...base, phone: undefined, latitude: 18.352, longitude: 105.901, hang_xe: 'VinFast' }
    });
    expect(missing.status(), 'thiếu SĐT phải 400').toBe(400);

    // 2. Cùng SĐT gửi 2 vị trí khác nhau -> cả 2 đều 201
    const r1 = await request.post(`${API}/api/ev-reports/guest`, {
      data: { ...base, latitude: 18.352, longitude: 105.901, hang_xe: 'VinFast' }
    });
    const r2 = await request.post(`${API}/api/ev-reports/guest`, {
      data: { ...base, latitude: 18.362, longitude: 105.911, hang_xe: 'Yadea' }
    });
    expect(r1.ok(), 'gửi record 1').toBeTruthy();
    expect(r2.ok(), 'gửi record 2 cùng SĐT').toBeTruthy();
    const id1 = (await r1.json()).data.id;
    const id2 = (await r2.json()).data.id;
    expect(id1).not.toBe(id2);

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
