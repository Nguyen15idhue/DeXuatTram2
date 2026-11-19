const { test, expect } = require('@playwright/test');
const { HEADERS } = require('../backend/src/services/cmsReportService');

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5175' });

const setup = async (page, { role = 'ADMIN', configured = true, runError = false, partial = false, sheetError = false } = {}) => {
  let started = false;
  let statusReads = 0;
  const posts = [];
  const errors = [];
  const cmsRequests = [];
  page.on('pageerror', cause => errors.push(cause.message));
  await page.addInitScript(() => localStorage.setItem('token', 'cms-ui-fixture'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname === '/api/auth/me') data = { user: { id: 1, role, full_name: 'CMS Tester', custom_data: {} } };
    if (url.pathname.startsWith('/api/admin/cms-reports')) cmsRequests.push(url.pathname);
    if (url.pathname.endsWith('/cms-reports/status')) {
      if (started) statusReads++;
      const completed = statusReads > 1;
      data = {
        configured, message: configured ? '' : 'Thiếu cấu hình: CMS_API_KEY',
        yesterday: '2026-11-16', headers: HEADERS,
        schedule: '07:00 Asia/Ho_Chi_Minh — ngày hôm trước',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/cms-fixture/edit',
        run: started ? {
          from: '2026-11-16', to: '2026-11-16', status: completed ? (sheetError ? 'FAILED' : partial ? 'PARTIAL' : 'SUCCESS') : 'RUNNING',
          processed: completed && !sheetError ? 1 : 0, totalDays: 1,
          phase: completed ? 'Đã kết thúc' : 'Đang xử lý 2026-11-16',
          startedAt: '2026-11-17T00:00:00Z', finishedAt: completed ? '2026-11-17T00:00:05Z' : null,
          rows: completed && !sheetError ? [['2026-11-16', '2026-11-17T00:00:00Z',
            10, 5, 15, 12, 3, 20, 10, 30, 2, 2, 2, 30, 15, 3, 3, 3,
            100000, 50000, 150000, 100, '2026-11-17T00:00:05Z',
            'Đã loại 1 phiên FINISHED thiếu thời gian kết thúc khỏi tất cả chỉ số phiên sạc', 11]] : [],
          errors: !completed ? [] : sheetError
            ? [{ message: 'Ngày báo cáo 2026-10-01 bị trùng tại ô A2 và A4.' }]
            : partial ? [{ date: '2026-11-15', message: 'CMS dữ liệu thiếu' }] : []
        } : null
      };
    }
    if (url.pathname.endsWith('/cms-reports/run')) {
      posts.push(route.request().postDataJSON());
      if (runError) {
        await route.fulfill({ status: 409, json: { success: false, message: 'Đang có lượt thống kê CMS chạy' } });
        return;
      }
      started = true;
      await route.fulfill({ status: 202, json: { success: true, data: { id: 'cms-run' } } });
      return;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  return { posts, errors, cmsRequests };
};

for (const role of ['ADMIN', 'SUPER_ADMIN']) {
  test(`${role} can export a day/range and see progress, warnings and Sheet link`, async ({ page }) => {
    const { posts, errors } = await setup(page, { role });
    await page.goto('/admin/cms-reports');
    await expect(page.getByRole('heading', { name: 'Thống kê phiên sạc CMS', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mở Google Sheet' })).toHaveAttribute('href', /cms-fixture/);
    await expect(page.getByLabel('Ngày báo cáo', { exact: true })).toHaveValue('2026-11-16');
    if (role === 'SUPER_ADMIN') {
      await page.getByLabel('Chế độ lấy dữ liệu').selectOption('range');
      await page.getByLabel('Từ ngày', { exact: true }).fill('2026-11-10');
      await page.getByLabel('Đến ngày', { exact: true }).fill('2026-11-16');
    }
    const start = page.getByRole('button', { name: 'Lấy dữ liệu và xuất Google Sheet' });
    await start.click();
    await expect(start).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Lượt gần nhất: Thành công' })).toBeVisible({ timeout: 15000 });
    await expect(start).toBeEnabled();
    expect(posts).toEqual([{ from: role === 'SUPER_ADMIN' ? '2026-11-10' : '2026-11-16', to: '2026-11-16' }]);
    await expect(page.getByRole('cell', { name: '2026-11-16', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Đã loại 1 phiên FINISHED/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tháng báo cáo' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '11', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const role of ['SALES', 'CTV', 'NPP', 'MKT']) {
  test(`${role} cannot open CMS reporting or see its navigation link`, async ({ page }) => {
    const { cmsRequests, errors } = await setup(page, { role });
    await page.goto('/admin/cms-reports');
    await expect(page).not.toHaveURL(/\/admin\/cms-reports$/);
    await expect(page.getByRole('heading', { name: 'Thống kê phiên sạc CMS', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Thống kê phiên sạc CMS', exact: true })).toHaveCount(0);
    expect(cmsRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('missing configuration disables export and a rejected run is shown explicitly', async ({ page }) => {
  const first = await setup(page, { configured: false });
  await page.goto('/admin/cms-reports');
  await expect(page.getByRole('alert')).toContainText('Thiếu cấu hình: CMS_API_KEY');
  await expect(page.getByRole('button', { name: 'Lấy dữ liệu và xuất Google Sheet' })).toBeDisabled();
  expect(first.posts).toEqual([]);
  await page.unroute('**/api/**');
  const second = await setup(page, { runError: true });
  await page.reload();
  await page.getByRole('button', { name: 'Lấy dữ liệu và xuất Google Sheet' }).click();
  await expect(page.getByRole('alert')).toContainText('Đang có lượt thống kê CMS chạy');
  expect(second.errors).toEqual([]);
});

test('per-day failures remain visible alongside successful Sheet rows', async ({ page }) => {
  await setup(page, { partial: true });
  await page.goto('/admin/cms-reports');
  await page.getByRole('button', { name: 'Lấy dữ liệu và xuất Google Sheet' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt gần nhất: Một phần bị lỗi' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('alert')).toContainText('2026-11-15: CMS dữ liệu thiếu');
  await expect(page.getByRole('cell', { name: '2026-11-16', exact: true })).toBeVisible();
});

test('a Sheet validation error points to the affected cells before any report is written', async ({ page }) => {
  await setup(page, { sheetError: true });
  await page.goto('/admin/cms-reports');
  await page.getByRole('button', { name: 'Lấy dữ liệu và xuất Google Sheet' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('bị trùng tại ô A2 và A4');
  await expect(alert).toContainText('Lượt này chưa ghi báo cáo. Hãy xử lý lỗi trên trước khi chạy lại.');
  await expect(page.getByRole('table')).toHaveCount(0);
});
