const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const role of ['SUPER_ADMIN', 'SALES', 'ADMIN']) {
  test(`${role} infrastructure cells, modal and transition permissions`, async ({ page }) => {
    const updates = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const station = { id: 501, ma_tram: 'ON-501', proposal_id: 77, status: 'DELIVERING',
      infra_power_status: 'NOT', infra_site_status: 'DOING' };
    await page.route('**/api/**', async route => {
      const { pathname } = new URL(route.request().url());
      let data = {};
      if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role, custom_data: { department: 'Back Office' } } };
      else if (pathname.endsWith('/charging-stations')) data = [station];
      else if (/\/infrastructure\/(power|site)\/status$/.test(pathname)) {
        updates.push({ pathname, body: route.request().postDataJSON() });
        const type = pathname.includes('/power/') ? 'power' : 'site';
        station[`infra_${type}_status`] = updates.at(-1).body.status;
      }
      await route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } }) });
    });
    await page.addInitScript(() => localStorage.setItem('token', 'infra-test'));
    await page.goto('/admin/on-tram/xay-dung-ha-tang?tab=all');
    await expect(page.getByText('ON-501', { exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Hành động', exact: true })).toHaveCount(0);
    if (role === 'ADMIN') {
      await expect(page.getByRole('button', { name: /^Hạ tầng điện:/ })).toHaveCount(0);
      expect(updates).toEqual([]);
      return;
    }
    for (const [type, title, label, old, target] of [
      ['power', 'Hạ tầng điện', 'Trạng thái điện', 'NOT', role === 'SUPER_ADMIN' ? 'DONE' : 'DOING'],
      ['site', 'Hạ tầng mặt bằng', 'Trạng thái mặt bằng', 'DOING', role === 'SUPER_ADMIN' ? 'NOT' : 'DONE']
    ]) {
      await page.getByRole('button', { name: new RegExp(`^${title}:`) }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      const select = page.getByLabel(label, { exact: true });
      if (role === 'SALES') {
        for (const value of ['NOT', 'DOING', 'DONE']) {
          await expect(select.locator(`option[value="${value}"]`)).toHaveJSProperty('disabled', value !== target);
        }
      }
      await select.selectOption(target);
      const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
      await expect(page.getByLabel('Ngày', { exact: true })).toHaveValue(today);
      await page.getByLabel('Ngày', { exact: true }).fill('');
      await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(page.getByText('Vui lòng nhập ngày thực hiện')).toBeVisible();
      await page.getByLabel('Ngày', { exact: true }).fill('2026-11-10');
      await page.getByLabel('Ghi chú', { exact: true }).fill(`Update ${type}`);
      await page.getByRole('button', { name: 'Hủy', exact: true }).click();
      expect(updates.length).toBe(type === 'power' ? 0 : 1);
      await page.getByRole('button', { name: new RegExp(`^${title}:`) }).click();
      await select.selectOption(target);
      await page.getByLabel('Ngày', { exact: true }).fill('2026-11-10');
      await page.getByLabel('Ghi chú', { exact: true }).fill(`Update ${type}`);
      await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
      expect(updates.at(-1)).toEqual({
        pathname: `/api/admin/charging-stations/501/infrastructure/${type}/status`,
        body: { status: target, expected_status: old, date: '2026-11-10', note: `Update ${type}` }
      });
    }
    expect(errors).toEqual([]);
  });
}
