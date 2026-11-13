const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('deadline warning never leaks into other frozen rows after sorting, refresh, pagination or hover', async ({ page }) => {
  const fields = [
    { id: 1, key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', type: 'text', visible: true, sortable: true },
    { id: 2, key: 'status', field_key: 'status', label: 'Trạng thái', type: 'select', visible: true, options: [{ value: 'PENDING', label: 'Mới đề xuất' }] }
  ];
  let urgent = 1;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = [];
    let pagination;
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'Fixture' } };
    else if (path.includes('/field-definitions/entity/')) data = fields;
    else if (path.includes('/dynamic/station_proposals/view/')) data = { fields, allFields: fields };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/admin/lifecycle-config')) data = { rules: [{ status: 'PENDING', transition: { enabled: true }, supplement: { enabled: false } }] };
    else if (path.endsWith('/admin/proposals')) {
      data = [1, 2, 3, 4].map(id => ({ id, ma_de_xuat: `DX-0${id}`, status: 'PENDING', user_id: 1, custom_data: {},
        transition_deadline_at: new Date(Date.now() + (id === urgent ? 3600000 : 72 * 3600000)).toISOString() }));
      pagination = { page: Number(url.searchParams.get('page') || 1), total: 24, totalPages: 2, limit: 20 };
    } else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], workScopes: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, pagination }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'deadline-fixture'));
  await page.goto('/admin/proposals');
  await expect(page.locator('tbody tr').filter({ hasText: 'DX-01' })).toBeVisible({ timeout: 15000 });
  const check = async () => {
    for (const id of [1, 2, 3, 4]) {
      const row = page.locator('tbody tr').filter({ hasText: `DX-0${id}` });
      await expect(row.locator('td.dt-frozen').first()).toBeVisible();
      const colors = await row.locator('td').evaluateAll(cells => cells.map(cell => getComputedStyle(cell).backgroundColor));
      if (id === urgent) expect(colors.every(color => color === 'rgb(254, 202, 202)')).toBe(true);
      else expect(colors.every(color => color !== 'rgb(254, 202, 202)')).toBe(true);
    }
  };
  await expect.poll(async () => page.locator('tbody tr').first().locator('td.dt-frozen').first().evaluate(cell => getComputedStyle(cell).backgroundColor))
    .toBe('rgb(254, 202, 202)');
  await check();
  await page.getByRole('columnheader', { name: /Mã đề xuất/ }).click();
  await page.getByRole('columnheader', { name: /Mã đề xuất/ }).click();
  await check();
  urgent = 2;
  await page.getByPlaceholder('Tìm theo tên, địa chỉ, SĐT, mã đề xuất...').fill('refreshed');
  await expect.poll(async () => page.locator('tbody tr').filter({ hasText: 'DX-02' }).locator('td').first().evaluate(cell => getComputedStyle(cell).backgroundColor))
    .toBe('rgb(254, 202, 202)');
  await check();
  await page.locator('tbody tr').filter({ hasText: 'DX-03' }).hover();
  await check();
  urgent = 3;
  await page.getByRole('button', { name: 'Sau', exact: true }).click();
  await expect.poll(async () => page.locator('tbody tr').filter({ hasText: 'DX-03' }).locator('td').first().evaluate(cell => getComputedStyle(cell).backgroundColor))
    .toBe('rgb(254, 202, 202)');
  await check();
  urgent = 0;
  await page.getByPlaceholder('Tìm theo tên, địa chỉ, SĐT, mã đề xuất...').fill('deadline extended');
  await expect.poll(async () => page.locator('tbody tr').filter({ hasText: 'DX-03' }).locator('td').first().evaluate(cell => getComputedStyle(cell).backgroundColor))
    .not.toBe('rgb(254, 202, 202)');
  await check();
  await page.locator('.dynamic-table-container').evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await check();
  expect(errors).toEqual([]);
});
