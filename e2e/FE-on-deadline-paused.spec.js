const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://127.0.0.1:5174' });

test('ON station pages hide deadlines and extension controls without hiding business status', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'on-deadline-fixture'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path === '/api/auth/me') data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'Tester', custom_data: {} } };
    if (['/api/admin/charging-stations', '/api/admin/charging-finance/stations'].includes(path)) data = [{
      id: 501, proposal_id: 601, ma_tram: 'ON-PAUSED-TEST', ma_de_xuat: 'DX-TEST',
      status: 'ONBOARDING', contract_status: 'NOT', payment_status: 'NOT',
      deposit_status: 'NOT_RECEIVED', infra_power_status: 'NOT', infra_site_status: 'NOT',
      contract_deadline_at: '2020-01-01 10:00:00', finance_deadline_at: '2020-01-01 10:00:00',
      deadline_extension_count: 0, can_extend_deadline: true, deployments: [],
      fulfillment: { items: [] }
    }];
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
  });
  for (const path of ['/admin/on-tram/thong-tin-chung', '/admin/on-tram/khoi-tao-hop-dong', '/admin/tai-chinh']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'ON-PAUSED-TEST', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Quá hạn', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Gia hạn/ })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Mốc 15 ngày' })).toHaveCount(0);
    await expect(page.getByText('Hạn xử lý: 15 ngày từ khi tạo ON trạm')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
