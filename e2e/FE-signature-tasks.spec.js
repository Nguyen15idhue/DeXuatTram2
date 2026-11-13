const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const scenario of ['signer', 'finance', 'backoffice', 'superadmin', 'finance-mobile']) {
  test(`signature task tabs and chairman upload privileges: ${scenario}`, async ({ page }) => {
    const finance = scenario.startsWith('finance');
    const handler = finance || scenario === 'backoffice';
    const superAdmin = scenario === 'superadmin';
    const role = superAdmin ? 'SUPER_ADMIN' : 'SALES';
    if (scenario.endsWith('mobile')) await page.setViewportSize({ width: 390, height: 844 });
    const requests = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let data = [];
      let meta;
      let pagination;
      if (path.endsWith('/auth/me')) data = { user: { id: 1, role, full_name: 'Fixture',
        custom_data: { department: finance ? 'Phòng Tài chính và Kế toán' : scenario === 'backoffice' ? 'Back Office' : '' } } };
      else if (path.endsWith('/admin/proposal-signatures')) {
        requests.push(url.searchParams.toString());
        meta = { isFinance: finance, isSuperAdmin: superAdmin, isBackOffice: scenario === 'backoffice',
          isManager: superAdmin || scenario === 'backoffice', can_handle_chairman: handler || superAdmin, can_view_chairman_tab: !handler };
        const tab = url.searchParams.get('tab');
        data = [{ id: 501, ma_de_xuat: 'SIGNED-501', status: 'SIGNATURE_PENDING', sign_status: 'DONE', custom_data: {}, can_sign: false }];
        if (tab === 'pending' && !handler && !superAdmin) data = [{ ...data[0], sign_status: 'DOING', can_sign: true }];
        pagination = { page: 1, total: 1, totalPages: 1 };
      } else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, meta, pagination }) });
    });
    await page.addInitScript(() => localStorage.setItem('token', 'signature-tasks-fixture'));
    await page.goto(`/admin/proposals/trinh-ky${finance ? '?tab=chairman' : ''}`);
    await expect(page.getByRole('tab', { name: 'Các đề xuất cần thực hiện', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Đề xuất trình chủ tịch', exact: true })).toHaveCount(handler ? 0 : 1);
    if (handler) await expect(page).not.toHaveURL(/tab=chairman/);
    const upload = page.getByRole('button', { name: 'Upload file chủ tịch', exact: true });
    if (handler || superAdmin) {
      await expect(upload).toBeVisible();
      await upload.click();
      await expect(page.getByRole('heading', { name: /Upload file/ })).toBeVisible();
      await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    } else {
      await expect(upload).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Ký duyệt', exact: true })).toBeVisible();
    }
    await expect(page.getByLabel('Lọc công việc ký cá nhân')).toHaveValue('');
    await page.getByRole('tab', { name: 'Các đề xuất đã hoàn thành', exact: true }).click();
    await expect(upload).toHaveCount(0);
    await page.getByRole('tab', { name: 'Tất cả đề xuất', exact: true }).click();
    await expect(upload).toHaveCount(handler || superAdmin ? 1 : 0);
    expect(requests.some(params => params.includes('tab=completed'))).toBe(true);
    expect(requests.some(params => params.includes('tab=all'))).toBe(true);
    expect(errors).toEqual([]);
  });
}
