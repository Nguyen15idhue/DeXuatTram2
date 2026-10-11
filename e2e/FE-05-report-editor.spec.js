const { test, expect } = require('@playwright/test');

const API = process.env.E2E_API_URL || 'http://localhost:3000';
const FE = process.env.E2E_BASE_URL || 'http://localhost:5173';

// FE-05: Dashboard Editor (doc 77). Tài khoản test cần mật khẩu Test1234! cho MKT.
async function login(request, email, password = 'Test1234!') {
  const res = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  return (await res.json()).data.token;
}

async function setToken(page, token) {
  await page.goto(`${FE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), token);
}

async function enterEdit(page) {
  const btn = page.getByRole('button', { name: 'Cài đặt' });
  if (await btn.count() > 0) { await btn.first().click(); await page.waitForTimeout(600); }
}

async function createReport(request, token, name) {
  const res = await request.post(`${API}/api/admin/reports/builder/dashboards`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name, version: 2, page: { title: name, rowHeight: 80 },
      widgets: [{
        id: 'w1', type: 'chart', title: 'Lead theo stage', dataSourceId: 'leads',
        dataConfig: { dimension: 'stage', metric: 'id', agg: 'count', filters: [], sort: 'value_desc', limit: 20 },
        visualConfig: { chartType: 'bar', showLabels: true, numberFormat: 'plain' },
        layout: { x: 0, y: 0, w: 6, h: 5 },
      }],
    },
  });
  expect(res.ok(), 'tạo báo cáo test').toBeTruthy();
  return (await res.json()).data.id;
}

async function deleteReport(request, token, id) {
  try { await request.delete(`${API}/api/admin/reports/builder/dashboards/${id}`, { headers: { Authorization: `Bearer ${token}` } }); } catch { /* ignore */ }
}

test.describe('FE-05 report editor', () => {
  test('mặc định chế độ Xem, không nút back, có tab báo cáo', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);

    await expect(page.getByRole('button', { name: 'Cài đặt' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu' })).toHaveCount(0);
    await expect(page.getByTitle('Quay lại danh sách báo cáo')).toHaveCount(0);
    await expect(page.locator('.re-panel')).toHaveCount(0);

    await expect(page.locator('.tabs .tab')).toContainText(['Báo cáo tổng hợp', 'Báo cáo MKT']);
    await expect(page.locator('.re-widget canvas').first()).toBeVisible({ timeout: 15000 });

    expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
  });

  test('chuyển tab báo cáo đổi nội dung', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);
    const before = await page.locator('.re-widget').count();
    expect(before).toBeGreaterThan(0);
    await page.locator('.tabs .tab', { hasText: 'Báo cáo MKT' }).click();
    await page.waitForTimeout(2500);
    expect(await page.locator('.re-widget').count()).toBeGreaterThan(0);
    expect(await page.locator('.re-widget canvas').count()).toBeGreaterThan(0);
  });

  test('Cài đặt: panel 2 tab dọc + 3 mini-tab + chọn widget + 4 dataset', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);
    await enterEdit(page);

    await expect(page.locator('.re-panel')).toBeVisible();
    await expect(page.locator('.re-ptab')).toHaveCount(2);

    // chọn 1 widget chart (có canvas)
    await page.locator('.re-widget').filter({ has: page.locator('canvas') }).first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('.re-panel .re-minitab')).toHaveCount(3);
    await expect(page.locator('.re-phead')).toContainText('Cấu hình —');

    await page.locator('.re-ptab').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('.re-ds-item')).toHaveCount(4);
  });

  test('thêm/nhân bản/xóa/undo', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);
    await enterEdit(page);
    const count = () => page.locator('.re-widget').count();
    const start = await count();

    await page.getByRole('button', { name: /^Thêm/ }).click();
    await page.getByRole('button', { name: 'Thẻ KPI' }).click();
    await page.waitForTimeout(400);
    expect(await count()).toBe(start + 1);

    await page.getByRole('button', { name: 'Nhân bản' }).click();
    await page.waitForTimeout(300);
    expect(await count()).toBe(start + 2);

    await page.locator('.re-config-foot .re-btn.danger').click();
    await page.waitForTimeout(300);
    expect(await count()).toBe(start + 1);

    await page.getByTitle(/Hoàn tác/).first().click();
    await page.waitForTimeout(300);
    expect(await count()).toBe(start + 2);
  });

  test('lưu + reload khôi phục', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    const name = `E2E Report ${Date.now()}`;
    const id = await createReport(request, token, name);
    try {
      await setToken(page, token);
      await page.goto(`${FE}/admin/reports`);
      await page.waitForTimeout(3000);
      await enterEdit(page);
      const count = () => page.locator('.re-widget').count();
      const start = await count();

      await page.getByRole('button', { name: /^Thêm/ }).click();
      await page.getByRole('button', { name: 'Bảng dữ liệu' }).click();
      await page.waitForTimeout(400);
      expect(await count()).toBe(start + 1);
      await expect(page.getByText('Chưa lưu')).toBeVisible();

      await page.getByRole('button', { name: 'Lưu' }).click();
      await page.waitForTimeout(2000);
      await expect(page.getByText('Đã lưu').first()).toBeVisible();

      page.on('dialog', (d) => d.accept().catch(() => {}));
      await page.reload();
      await page.waitForTimeout(3000);
      expect(await count()).toBe(start + 1);
    } finally {
      await deleteReport(request, token, id);
    }
  });

  test('control filter áp vào chart cùng nguồn', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);
    await enterEdit(page);

    await page.getByRole('button', { name: /^Thêm/ }).click();
    await page.getByRole('button', { name: 'Bộ lọc danh mục' }).click();
    await page.waitForTimeout(500);

    const reqs = [];
    page.on('request', (r) => { if (r.url().includes('/builder/preview')) reqs.push(r.postData() || ''); });
    const sel = page.locator('.re-widget .re-control select').first();
    const opt = await sel.locator('option').nth(1).getAttribute('value');
    await sel.selectOption(opt);
    await page.waitForTimeout(1500);
    const chartReq = reqs.filter((b) => b.includes('"dimension":"stage"'));
    expect(chartReq.some((b) => b.includes('region') && b.includes(opt)), 'chart nhận filter control').toBe(true);
  });

  test('non-SUPER chỉ xem, BE chặn ghi', async ({ page, request }) => {
    const adminToken = await login(request, 'admin@station.com', '123456');
    const list = await (await request.get(`${API}/api/admin/reports/builder/dashboards`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
    const id = list.data[0].id;

    const token = await login(request, 'mkt.test@station.com');
    const put = await request.put(`${API}/api/admin/reports/builder/dashboards/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'x', widgets: [{ id: 'w1', type: 'chart', dataSourceId: 'leads', dataConfig: { dimension: 'stage', metric: 'id', agg: 'count' }, visualConfig: { chartType: 'bar' } }] },
    });
    expect(put.status(), 'MKT PUT dashboard -> 403').toBe(403);

    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3500);
    await expect(page.getByRole('button', { name: 'Cài đặt' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lưu' })).toHaveCount(0);
    await expect(page.locator('.re-panel')).toHaveCount(0);
    expect(await page.locator('.re-widget').count()).toBeGreaterThan(0);
  });
});
