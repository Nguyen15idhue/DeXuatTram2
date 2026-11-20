const { test, expect } = require('@playwright/test');

for (const role of ['SUPER_ADMIN', 'SALES']) {
  test(`lead Sheet button respects role ${role}`, async ({ page }) => {
    const origin = new URL(process.env.E2E_BASE_URL || 'http://localhost:5173').origin;
    await page.addInitScript(() => localStorage.setItem('token', 'lead-sheet-fixture'));
    await page.route('**/*', route =>
      new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
    let runs = 0;
    let finish = false;
    await page.route('**/api/**', route => {
      const { pathname } = new URL(route.request().url());
      let data = [];
      if (pathname === '/api/auth/me') data = { user: {
        id: 1, role, full_name: 'Kiểm thử', custom_data: { department: 'Kênh Nhà phân phối' }
      } };
      if (pathname === '/api/admin/leads/task-counts') data = { counts: {} };
      if (pathname === '/api/admin/leads/sheet-sync/status') {
        data = { configured: true, pending: runs && !finish ? 2 : 0, failed: 0,
          run: runs ? { pending: finish ? 0 : 2, total: 2, synced: finish ? 2 : 0 } : null };
      }
      if (pathname === '/api/admin/leads/sheet-sync') {
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual({});
        data = { id: ++runs };
      }
      return route.fulfill({ json: { success: true, data } });
    });
    await page.goto(`${origin}/admin/leads?tab=all`);
    await expect(page.getByRole('heading', { name: 'Quản lý khách hàng' })).toBeVisible();
    const button = page.getByRole('button', { name: 'Đồng bộ Google Sheet', exact: true });
    if (role !== 'SUPER_ADMIN') {
      await expect(button).toHaveCount(0);
      expect(runs).toBe(0);
      return;
    }
    await button.click();
    await expect(page.getByText('không áp dụng bộ lọc đang xem', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Đồng bộ', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Đang đồng bộ 0/2' })).toBeDisabled();
    finish = true;
    await expect(page.getByText('Đã đồng bộ: 2', { exact: false })).toBeVisible({ timeout: 8000 });
    expect(runs).toBe(1);
  });
}
