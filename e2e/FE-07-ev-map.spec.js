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

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/api/ev-reports/guest`, {
      data: { full_name: seedName, phone: '0909990001', latitude: 21.03, longitude: 105.85, hang_xe: 'VinFast', province: 'Thành phố Hà Nội' }
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

    await row.getByRole('button', { name: 'Xem' }).click();
    await expect(page.locator('.popup-detail, .legacy-modal')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.popup-detail, .legacy-modal').getByText('VinFast').first()).toBeVisible({ timeout: 15000 });

    expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
  });
});
