const { test, expect } = require('@playwright/test');

const API = process.env.E2E_API_URL || 'http://localhost:3000';
const FE = process.env.E2E_BASE_URL || 'http://localhost:5173';

// FE-04: designer báo cáo RGL (giữ lại). Không để lại dữ liệu test (restore layout cuối).
async function login(request, email, password = 'Test1234!') {
  const res = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  return (await res.json()).data.token;
}

async function setToken(page, token) {
  await page.goto(`${FE}/login`);
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.removeItem('remember_until');
  }, token);
}

test.describe('FE-04 report designer (RGL)', () => {
  test('BE: PUT /config giữ id+layout, size lạ vẫn 400', async ({ request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    const auth = { Authorization: `Bearer ${token}` };
    const before = await (await request.get(`${API}/api/admin/reports/config`, { headers: auth })).json();
    expect(before.success).toBeTruthy();

    const widgets = before.data.widgets.map((w, i) => (i === 0
      ? { ...w, layout: { x: 0, y: 0, w: 12, h: 6 } }
      : w));
    const saved = await request.put(`${API}/api/admin/reports/config`, { headers: auth, data: { widgets } });
    expect(saved.ok(), 'PUT layout').toBeTruthy();
    const body = await saved.json();
    expect(body.data.widgets[0].layout, 'server giữ layout').toMatchObject({ x: 0, y: 0, w: 12, h: 6 });
    expect(body.data.widgets[0].id, 'server giữ id').toBeTruthy();

    const bad = await request.put(`${API}/api/admin/reports/config`, {
      headers: auth, data: { widgets: [{ metric: 'lead_funnel', chart: 'nope' }] }
    });
    expect(bad.status(), 'chart lạ -> 400').toBe(400);

    await request.put(`${API}/api/admin/reports/config`, { headers: auth, data: { widgets: before.data.widgets } });
  });

  test('FE: 17 widget migrate đủ, kéo-thả + Lưu giữ vị trí, non-SUPER không Cài đặt', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    const auth = { Authorization: `Bearer ${token}` };
    const before = await (await request.get(`${API}/api/admin/reports/config`, { headers: auth })).json();
    try {
      await setToken(page, token);
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${FE}/admin/reports`);
      await expect(page.getByRole('heading', { name: 'Báo cáo' })).toBeVisible();
      const cards = page.locator('.react-grid-layout .react-grid-item');
      await expect(cards.first()).toBeVisible({ timeout: 15000 });
      expect(await cards.count(), 'đủ 17 widget seed').toBe(before.data.widgets.length);

      await page.getByRole('button', { name: 'Cài đặt' }).click();
      await page.waitForTimeout(800);
      const grip = page.locator('.report-widget-drag').first();
      const box = await grip.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + 500, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Lưu' }).click();
      await expect(page.getByText('Đã lưu giao diện báo cáo')).toBeVisible({ timeout: 15000 });

      const after = await (await request.get(`${API}/api/admin/reports/config`, { headers: auth })).json();
      expect(after.data.widgets[0].layout.y, 'layout đã đổi sau kéo').not.toBe(before.data.widgets[0].layout?.y ?? 0);

      await page.reload();
      await expect(page.locator('.react-grid-layout .react-grid-item').first()).toBeVisible({ timeout: 15000 });
      expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
    } finally {
      await request.put(`${API}/api/admin/reports/config`, { headers: auth, data: { widgets: before.data.widgets } });
    }
  });

  test('FE: MKT xem được, không có nút Cài đặt; mobile không tràn ngang', async ({ page, request }) => {
    const token = await login(request, 'mkt.test@station.com');
    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await expect(page.getByRole('heading', { name: 'Báo cáo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cài đặt' })).toHaveCount(0);
    await expect(page.locator('.react-grid-layout .react-grid-item').first()).toBeVisible({ timeout: 15000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'mobile không tràn ngang').toBeLessThanOrEqual(1);
  });
});
