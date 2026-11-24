const { test, expect } = require('@playwright/test');

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5187' });

test('xem thử mẫu không gửi duyệt và bỏ bản xem thử khi sửa dữ liệu', async ({ page }) => {
  const mutations = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/generation-preview')) {
      mutations.push({ path, data: request.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'X-Preview-Warnings': encodeURIComponent(JSON.stringify(['Kiểm tra phông chữ'])) },
        body: '%PDF-1.4\n%%EOF'
      });
      return;
    }
    if (request.method() !== 'GET') mutations.push({ path, method: request.method() });
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.endsWith('/generation-options')) data = {
      templates: [{ id: 10, name: 'Mẫu NQ_LK', fields: [{ key: 'ten', label: 'Tên pháp nhân', type: 'text', value: 'Tên cũ' }] }]
    };
    else if (path.endsWith('/admin/proposal-reports')) data = [{
      id: 4, ma_de_xuat: 'DX-4', status: 'PROPOSAL_REPORT_CREATING', can_upload: true,
      custom_data: {}, chot_so_luong_tru: []
    }];
    else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], provinces: [], models: [], regions: [] };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/assistant/status')) data = {};
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data, pagination: { page: 1, total: 1, totalPages: 1, limit: 20 } })
    });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  await page.goto('/admin/proposals/lap-to-trinh?tab=all');
  await page.getByRole('button', { name: 'Xem thử mẫu' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Bản xem thử chưa lưu dữ liệu', { exact: false })).toBeVisible();
  await dialog.getByLabel('Mẫu BCĐX').selectOption('10');
  await dialog.getByLabel('Tên pháp nhân').fill('Tên mới');
  await dialog.getByRole('button', { name: 'Xem thử PDF' }).click();
  await expect(dialog.locator('iframe[title="Xem thử BCĐX"]')).toBeVisible();
  await expect(dialog.getByText('Kiểm tra phông chữ')).toBeVisible();
  expect(mutations).toEqual([{ path: '/api/admin/proposal-reports/4/generation-preview', data: {
    template_id: 10, values: { ten: 'Tên mới' }
  } }]);
  await dialog.getByLabel('Tên pháp nhân').fill('Tên khác');
  await expect(dialog.locator('iframe[title="Xem thử BCĐX"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
