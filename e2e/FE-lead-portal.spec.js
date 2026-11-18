const { test, expect } = require('@playwright/test');
const base = process.env.E2E_BASE_URL || 'http://localhost:5173';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`lead portal keeps map and lead actions in the user layout (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('token', 'lead-portal-fixture'));
    const user = { id: 501, role: 'MKT', full_name: 'Khách thử nghiệm', lead_portal: true };
    const lead = {
      id: 17, full_name: 'Lead mẫu', lead_code: 'LD-000017',
      consultation_status: 'SUCCESS', custom_data: {},
      permissions: { can_view: true, can_consult: true, can_assign: true, can_write_general: true }
    };
    await page.route('**/api/**', async (route) => {
      const { pathname } = new URL(route.request().url());
      const data = pathname === '/api/auth/me' ? { user }
        : pathname === '/api/admin/leads/17' ? lead
          : pathname === '/api/admin/leads' ? [lead] : [];
      await route.fulfill({ json: { success: true, data, pagination: { total: 1, totalPages: 1, page: 1 } } });
    });

    await page.goto(`${base}/admin/reports`);
    await expect(page).toHaveURL(/\/map$/);
    if (viewport.width < 1024) await page.getByRole('button', { name: 'Mở menu' }).click();
    await expect(page.getByRole('link', { name: /Trang quản lý|Admin Panel|Hồ sơ/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Khách hàng' }).click();
    await expect(page).toHaveURL(/\/leads(?:\?.*)?$/);
    await expect(page.getByRole('button', { name: 'Thêm Lead' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Nhập Excel' })).toBeVisible();

    const detail = page.waitForRequest(req => new URL(req.url()).pathname === '/api/admin/leads/17');
    await page.goto(`${base}/leads/view=17`);
    await detail;
    await expect(page.getByRole('button', { name: 'Đóng', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo đề xuất', exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/leads\/view=17/);
  });
}
