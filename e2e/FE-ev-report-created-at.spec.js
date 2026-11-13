const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173', timezoneId: 'Asia/Ho_Chi_Minh' });

for (const configuredDate of [false, true]) {
  test(`EV demand creation time displays once and sorts correctly: existing column ${configuredDate}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('token', 'ev-demand-fixture'));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'Tester', custom_data: {} } };
      else if (path.endsWith('/views')) data = [{ id: 80, entity: 'ev_charging_reports', usage: 'table', status: 'active' }];
      else if (path.endsWith('/dynamic/ev_charging_reports/view/80')) data = {
        view: { frozen_columns: 2 },
        fields: [{ key: 'full_name', label: 'Họ và tên', type: 'text', visible: true },
          ...(configuredDate ? [{ key: 'created_at', label: 'Ngày tạo', type: 'datetime', visible: true, sortable: true }] : [])]
      };
      else if (path.endsWith('/ev-reports/admin/list')) data = [
        { id: 1, full_name: 'Nhu cầu mới', created_at: '2026-11-13T06:40:00+07:00' },
        { id: 2, full_name: 'Nhu cầu cũ', created_at: '2026-11-12T15:30:00+07:00' }
      ];
      else if (path.endsWith('/google-sheet/status')) data = { configured: false, lastRun: null };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.goto('/admin/ev-reports');
    const header = page.getByRole('columnheader', { name: /Thời gian tạo nhu cầu/ });
    await expect(header).toHaveCount(1);
    await expect(page.getByText('13/11/2026 06:40:00', { exact: true })).toBeVisible();
    await expect(page.getByText('12/11/2026 15:30:00', { exact: true })).toBeVisible();
    await header.click();
    await expect(page.locator('tbody tr').first()).toContainText('Nhu cầu cũ');
    await header.click();
    await expect(page.locator('tbody tr').first()).toContainText('Nhu cầu mới');
    expect(errors).toEqual([]);
  });
}
