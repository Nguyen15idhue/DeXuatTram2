const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('Setup ADMIN can update installation while unrelated ADMIN cannot', async ({ page }) => {
  let allowed = true;
  const updates = [];
  const portion = { id: 31, export_id: 1, installation_status: 'NOT', installation_version: 1,
    stage: 'INSTALLING', pole_name: 'DC120', quantity: 1 };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const station = { id: 501, ma_tram: 'ON-501', status: 'INSTALLING', installation_status: 'NOT',
      permissions: { setup: allowed, back_office: false, finance: false, request_early: false } };
    let data = {};
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'ADMIN', custom_data: {
      department: allowed ? 'Phòng Setup và Vận hành' : 'Phòng khác'
    } } };
    else if (pathname.endsWith('/charging-stations')) data = [station];
    else if (pathname.endsWith('/charging-stations/501/deployments')) data = [portion];
    else if (pathname.endsWith('/charging-stations/501/installation')) updates.push(request.postDataJSON());
    else if (pathname.endsWith('/charging-stations/501')) data = station;
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } } });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'setup-test'));
  await page.goto('/admin/on-tram/lap-tru?tab=need');
  await page.getByRole('button', { name: /Chưa lắp trụ/ }).click();
  const select = page.getByLabel('Trạng thái phần 31');
  await expect(select).toBeEnabled();
  await select.selectOption('DOING');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].items[0]).toMatchObject({ id: 31, status: 'DOING', expected_version: 1 });

  allowed = false;
  await page.reload();
  await page.getByRole('button', { name: /Chưa lắp trụ/ }).click();
  await expect(page.getByLabel('Trạng thái phần 31')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
});
