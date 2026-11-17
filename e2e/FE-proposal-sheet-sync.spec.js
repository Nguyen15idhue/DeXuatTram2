const { test, expect } = require('@playwright/test');

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('proposal sync displays queue errors and starts a manual run', async ({ page }) => {
  const errors = [];
  let running = false;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'proposal-sheet-fixture'));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'ADMIN', full_name: 'Tester', custom_data: {} } };
    if (url.pathname.endsWith('/proposal-sheet-sync/daily')) {
      running = true;
      data = { id: 1, status: 'QUEUED', total_count: 5, synced_count: 0 };
    } else if (url.pathname.endsWith('/proposal-sheet-sync/status')) {
      data = {
        configured: true, pendingCount: 2, failedCount: 1,
        lastError: 'Header không khớp',
        activeRun: running ? { id: 1, status: 'RUNNING', total_count: 5, synced_count: 2 } : null,
        recentRuns: [{ id: 1, status: running ? 'RUNNING' : 'FAILED', total_count: 5, synced_count: 2 }]
      };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/proposals');
  await expect(page.getByRole('status').filter({ hasText: 'Google Sheets' })).toContainText('Đang chờ: 2', { timeout: 20000 });
  await expect(page.getByText('Lỗi đồng bộ: Header không khớp')).toBeVisible();
  await page.getByRole('button', { name: 'Đồng bộ cuối ngày' }).click();
  await expect(page.getByRole('button', { name: 'Đang đồng bộ 2/5' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('status request errors are visible and prevent starting a run', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'proposal-sheet-fixture'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/proposal-sheet-sync/status')) {
      return route.fulfill({ status: 500, json: { success: false, message: 'Không thể tải trạng thái' } });
    }
    const data = path.endsWith('/auth/me')
      ? { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'Tester', custom_data: {} } }
      : [];
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/proposals');
  await expect(page.getByText('Không thể tải trạng thái')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đồng bộ cuối ngày' })).toBeDisabled();
});

test('sales users do not see or request the sync controls', async ({ page }) => {
  let statusRequests = 0;
  await page.addInitScript(() => localStorage.setItem('token', 'proposal-sheet-fixture'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/proposal-sheet-sync/status')) statusRequests++;
    const data = path.endsWith('/auth/me')
      ? { user: { id: 2, role: 'SALES', full_name: 'Tester', custom_data: {} } }
      : [];
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/proposals');
  await expect(page.getByRole('heading', { name: 'Quản lý Đề xuất' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Đồng bộ cuối ngày' })).toHaveCount(0);
  expect(statusRequests).toBe(0);
});
