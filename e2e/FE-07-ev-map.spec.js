const { test, expect } = require('@playwright/test');

const API = process.env.E2E_API_URL || 'http://localhost:3000';
const FE = process.env.E2E_BASE_URL || 'http://localhost:5173';

// FE-07: lớp nhu cầu sạc xe trên map (kế hoạch 78).
// Mặc định ẩn; tick checkbox "Nhu cầu sạc xe" mới hiện marker (không status).
// Seed 1 record dùng chung cho cả describe (tiết kiệm budget guest 5/h), dọn ở afterAll.
async function login(request) {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@station.com', password: '123456' }
  });
  expect(res.ok(), 'login admin').toBeTruthy();
  return (await res.json()).data.token;
}

async function setToken(page, token) {
  await page.goto(`${FE}/login`);
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.removeItem('remember_until');
  }, token);
}

test.describe('FE-07 ev reports map layer (hidden by default, checkbox shows all)', () => {
  let seedId = null;
  const seedName = `FE07 Seed ${Date.now()}`;

  // Local cấu hình bản đồ đang là MapLibre: marker vẽ bằng symbol layer trên
  // canvas nên KHÔNG có phần tử DOM để đếm. Ép renderer Leaflet cho test này
  // (giữ nguyên provider/tile thật, chỉ đổi renderer) để đếm marker qua DOM.
  test.beforeEach(async ({ page, request }) => {
    const res = await request.get(`${API}/api/map-configs?entity=stations`);
    const json = res.ok() ? await res.json() : { data: {} };
    const data = { ...(json.data || {}), renderer: 'leaflet' };
    await page.route('**/api/map-configs*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data })
      })
    );
  });

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/api/ev-reports/guest`, {
      data: { full_name: seedName, phone: '0909990001', latitude: 21.03, longitude: 105.85, hang_xe: 'VinFast', province: 'Thành phố Hà Nội', nhom_phuong_tien: ['Xe cá nhân/Gia đình'], hop_tac_lap_tram: 'Không' }
    });
    expect(res.ok(), 'seed row').toBeTruthy();
    seedId = (await res.json()).data.id;
  });

  test.afterAll(async ({ request }) => {
    if (!seedId) return;
    const token = await login(request);
    await request.delete(`${API}/api/ev-reports/admin/${seedId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  });

  test('/map hides ev layer by default, checkbox shows markers', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await setToken(page, await login(page.request));
    await page.goto(`${FE}/map`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).not.toBeEmpty();

    const filterToggle = page.locator('.map-filter-toggle');
    await expect(filterToggle).toBeVisible({ timeout: 15000 });
    await filterToggle.click();

    const evCheck = page.locator('label.map-filter-check:has-text("Nhu cầu sạc xe") input');
    await expect(evCheck).toBeVisible();
    await expect(evCheck).not.toBeChecked();

    const markersBefore = await page.locator('.leaflet-marker-icon').count();

    await evCheck.check();
    await page.waitForTimeout(1500);
    const markersAfter = await page.locator('.leaflet-marker-icon').count();
    expect(markersAfter, `marker tăng sau khi bật lớp (trước=${markersBefore}, sau=${markersAfter})`).toBeGreaterThan(markersBefore);

    await evCheck.uncheck();
    await page.waitForTimeout(1500);
    const markersOff = await page.locator('.leaflet-marker-icon').count();
    expect(markersOff, `marker giảm sau khi tắt lớp (bật=${markersAfter}, tắt=${markersOff})`).toBeLessThan(markersAfter);

    expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
  });

  test('/admin/ev-reports lists rows and opens view popup', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const token = await login(page.request);
    await setToken(page, token);
    await page.goto(`${FE}/admin/ev-reports`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Quản lý nhu cầu sạc xe' })).toBeVisible({ timeout: 15000 });

    await page.locator('input[placeholder*="Tìm theo tên"]').fill(seedName);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Tìm' }).first().click();
    const row = page.locator(`tr:has-text("${seedName}")`);
    await expect(row).toBeVisible({ timeout: 15000 });

    // Cột câu trả lời liên kết lắp đặt trạm sạc (migration 171) có trong bảng
    const linkCol = page.locator('.dynamic-table-container thead th').filter({ hasText: /lắp đặt trạm sạc/i });
    await expect(linkCol).toHaveCount(1, { timeout: 15000 });

    // "Không" -> badge màu mặc định (xám nâu #666666)
    const linkCell = row.locator('td').nth(5);
    await expect(linkCell).toContainText('Không');
    await expect(linkCell.locator('span[style]')).toHaveCSS('background-color', 'rgb(102, 102, 102)');

    // "Có" -> badge xanh lá (#16a34a)
    const upd = await page.request.put(`${API}/api/ev-reports/admin/${seedId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { hop_tac_lap_tram: 'Có' }
    });
    expect(upd.ok(), 'doi cau tra loi sang Co').toBeTruthy();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('input[placeholder*="Tìm theo tên"]').fill(seedName);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Tìm' }).first().click();
    const rowCo = page.locator(`tr:has-text("${seedName}")`);
    await expect(rowCo).toBeVisible({ timeout: 15000 });
    const cellCo = rowCo.locator('td').nth(5);
    await expect(cellCo).toContainText('Có');
    await expect(cellCo.locator('span[style]')).toHaveCSS('background-color', 'rgb(22, 163, 74)');

    await rowCo.getByRole('button', { name: 'Xem' }).click();
    await expect(page.locator('.popup-detail, .legacy-modal')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.popup-detail, .legacy-modal').getByText('VinFast').first()).toBeVisible({ timeout: 15000 });
    // Câu hỏi liên kết lắp đặt trạm sạc (migration 170) hiện trong popup xem/sửa
    await expect(
      page.locator('.popup-detail, .legacy-modal').locator('[data-field-key="hop_tac_lap_tram"]')
    ).toContainText('Có', { timeout: 15000 });

    expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
  });
});
