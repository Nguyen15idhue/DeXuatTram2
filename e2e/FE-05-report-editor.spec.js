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
  test('khung + tabs + panel 2 tab dọc + 3 mini-tab + chọn widget', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);

    await expect(page.locator('.re-toolbar')).toBeVisible();
    await expect(page.locator('.re-panel')).toBeVisible();
    await expect(page.locator('.re-ptab')).toHaveCount(2);
    await expect(page.locator('.re-widget').first()).toBeVisible({ timeout: 15000 });

    await page.locator('.re-widget').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('.re-panel .re-minitab')).toHaveCount(3);
    await expect(page.locator('.re-phead')).toContainText('Cấu hình —');

    // chuyển sang tab Nguồn dữ liệu → 4 dataset
    await page.locator('.re-ptab').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('.re-ds-item')).toHaveCount(4);

    expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
  });

  test('thêm/nhân bản/xóa/undo', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);
    const count = () => page.locator('.re-widget').count();
    const start = await count();

    await page.locator('.re-menu-wrap .re-tbtn').click();
    await page.getByRole('button', { name: 'Thẻ KPI' }).click();
    await page.waitForTimeout(400);
    expect(await count()).toBe(start + 1);

    await page.getByRole('button', { name: 'Nhân bản' }).click();
    await page.waitForTimeout(300);
    expect(await count()).toBe(start + 2);

    await page.locator('.re-config-foot .re-btn.danger').click();
    await page.waitForTimeout(300);
    expect(await count()).toBe(start + 1);

    await page.locator('.re-tbtn[title^="Hoàn tác"]').click();
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
      const count = () => page.locator('.re-widget').count();
      const start = await count();

      await page.locator('.re-menu-wrap .re-tbtn').click();
      await page.getByRole('button', { name: 'Bảng dữ liệu' }).click();
      await page.waitForTimeout(400);
      expect(await count()).toBe(start + 1);
      await expect(page.locator('.re-status')).toContainText('Chưa lưu');

      await page.locator('.re-tbtn.re-primary').click();
      await page.waitForTimeout(2000);
      await expect(page.locator('.re-status')).toContainText('Đã lưu');

      page.on('dialog', (d) => d.accept().catch(() => {}));
      await page.reload();
      await page.waitForTimeout(3000);
      expect(await count()).toBe(start + 1);
    } finally {
      await deleteReport(request, token, id);
    }
  });

  test('view mode ẩn công cụ; mobile không tràn', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);

    await page.getByRole('button', { name: /Xem|Chỉnh sửa/ }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('.re-tbtn.re-primary')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'mobile không tràn ngang').toBeLessThanOrEqual(1);
  });

  test('control filter áp vào chart cùng nguồn', async ({ page, request }) => {
    const token = await login(request, 'admin@station.com', '123456');
    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);

    // tạo control select cho region
    await page.locator('.re-menu-wrap .re-tbtn').click();
    await page.getByRole('button', { name: 'Bộ lọc danh mục' }).click();
    await page.waitForTimeout(400);
    // chọn widget control vừa thêm → set field qua config (đã mặc định region)
    const reqs = [];
    page.on('request', (r) => { if (r.url().includes('/builder/preview')) reqs.push(r.postData() || ''); });
    const sel = page.locator('.re-widget .re-control select').first();
    await sel.selectOption('Bắc');
    await page.waitForTimeout(1500);
    const chartReq = reqs.filter((b) => b.includes('"dimension":"stage"'));
    expect(chartReq.some((b) => b.includes('region') && b.includes('Bắc')), 'chart nhận filter control').toBe(true);
  });

  test('non-SUPER chỉ xem, BE chặn ghi', async ({ page, request }) => {
    const token = await login(request, 'mkt.test@station.com');
    const put = await request.put(`${API}/api/admin/reports/builder/dashboards/11`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'x', widgets: [{ id: 'w1', type: 'chart', dataSourceId: 'leads', dataConfig: { dimension: 'stage', metric: 'id', agg: 'count' }, visualConfig: { chartType: 'bar' } }] },
    });
    expect(put.status(), 'MKT PUT dashboard -> 403').toBe(403);

    await setToken(page, token);
    await page.goto(`${FE}/admin/reports`);
    await page.waitForTimeout(3000);
    await expect(page.locator('.re-toolbar')).toBeVisible();
    await expect(page.locator('.re-tbtn.re-primary')).toHaveCount(0);
    await expect(page.locator('.re-panel')).toHaveCount(0);
    await expect(page.locator('.re-tab')).toHaveCount(0);
  });
});
