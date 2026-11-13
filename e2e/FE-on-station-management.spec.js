const { test, expect } = require('@playwright/test');
const station = {
  id: 501, ma_tram: 'TEST-501', proposal_id: 77, status: 'INSTALLING', sub_status: 'NOT_INSTALLED',
  contract_status: 'NOT', infra_power_status: 'NOT', infra_site_status: 'NOT', payment_status: 'DOING',
  deposit_status: 'RECEIVED', edit_token: 'fixture-token', installation_status: 'DOING',
  proposal: { id: 77, custom_data: {} }, permissions: { back_office: true, setup: true, request_early: true },
  contract_files: [], images: [], timeline: [], deployments: [], can_mark_on_station_active: true,
  fulfillment: { items: [], totals: { committed: 2, remaining: 2 }, needs_review: false }
};
const portion = { id: 11, export_id: 8, export_item_id: 9, quantity: 1, pole_name: 'DC60',
  supplier_name: 'Supplier A', stage: 'INSTALLING', sub_status: 'NOT_INSTALLED', installation_status: 'NOT', installation_version: 2 };
const input = (root, label) => root.locator('.form-control').filter({ hasText: label }).locator('input');
const select = (root, label) => root.locator('.form-control').filter({ hasText: label }).locator('select');

async function setup(page, role = 'SUPER_ADMIN') {
  const errors = [];
  const mutations = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let data = {};
    if (request.method() !== 'GET') {
      mutations.push({ path: pathname, data: request.postDataJSON() });
      data = station;
    } else if (pathname.endsWith('/auth/me')) {
      data = { user: { id: 1, full_name: 'UI Fixture', role, custom_data: { department: 'Phòng Setup và Vận hành' } } };
    } else if (pathname.endsWith('/users/options/all')) data = [];
    else if (pathname.endsWith('/shipping-carriers')) data = [{ id: 1, name: 'Carrier A', active: 1, used: 0 }];
    else if (pathname.endsWith('/501/deployments')) data = [portion];
    else if (pathname.endsWith('/501/fulfillment')) data = {
      items: [{ id: 1, commitment_id: 1, pole_id: 1, name: 'DC60', committed_quantity: 2, remaining_quantity: 2 }],
      pole_requirements: [{ pole_id: 1, name: 'DC60', committed_quantity: 2, remaining_quantity: 2 }],
      shipping_options: [
        { id: '1:1', pole_id: 1, supplier_id: 1, supplier_name: 'Supplier A', stock_quantity: 5, remaining_quantity: 2 },
        { id: '1:2', pole_id: 1, supplier_id: 2, supplier_name: 'Supplier B', stock_quantity: 3, remaining_quantity: 2 }
      ],
      shipments: [{ id: 8, carrier: 'Carrier A', transport_status: 'SHIPPING', items: [{ id: 9, name: 'DC60', quantity: 2, received_quantity: 0 }] }],
      totals: { committed: 2, remaining: 2 }
    };
    else if (pathname.endsWith('/charging-stations/501')) data = station;
    else if (pathname.endsWith('/charging-stations')) data = [station];
    else if (/\/warehouse\/|\/suppliers/.test(pathname)) data = [];
    if (role === 'SALES' && pathname.endsWith('/charging-stations/501')) data = { ...station, permissions: { setup: true } };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data,
      pagination: { page: 1, total: 1, totalPages: 1 } }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-on-management'));
  return { errors, mutations };
}

for (const width of [1366, 390]) {
  test(`overview opens full edit page and saves one audited payload at ${width}px`, async ({ page }) => {
    const { errors, mutations } = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/on-tram/thong-tin-chung');
    await page.getByRole('button', { name: 'Thao tác khác TEST-501' }).click();
    await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
    await expect(page).toHaveURL(/\/501\/edit$/);
    await expect(page.getByRole('heading', { name: 'Sửa ON trạm · TEST-501' })).toBeVisible();
    await expect(input(page, 'Mã trạm trên CMS')).toBeVisible();
    await select(page, 'Trạng thái hợp đồng').selectOption('DONE');
    await page.locator('label').filter({ hasText: /^Lý do điều chỉnh/ }).locator('textarea').fill('Điều chỉnh hồ sơ');
    await page.getByRole('button', { name: 'Lưu thông tin', exact: true }).click();
    await expect(page).toHaveURL(/\/thong-tin-chung\/501$/);
    const saved = mutations.find(item => item.path.endsWith('/charging-stations/501'));
    expect(saved.data.contract_status).toBe('DONE');
    expect(saved.data.expected_token).toBe('fixture-token');
    expect(saved.data).not.toHaveProperty('id');
    expect(saved.data).not.toHaveProperty('ma_tram');
    expect(errors).toEqual([]);
  });
}

test('overview status modal exposes all statuses and requires CMS/date for ON', async ({ page }) => {
  const { errors, mutations } = await setup(page);
  await page.goto('/admin/on-tram/thong-tin-chung');
  await page.getByRole('button', { name: 'Thao tác khác TEST-501' }).click();
  await page.getByRole('menuitem', { name: 'Đổi trạng thái', exact: true }).click();
  const modal = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Đổi trạng thái ON trạm' }) });
  expect(await modal.locator('select option').count()).toBe(8);
  await modal.locator('select').selectOption('OPERATING');
  await modal.locator('textarea').fill('Hoàn tất bằng ghi đè');
  await expect(modal.getByRole('button', { name: 'Xác nhận', exact: true })).toBeDisabled();
  await input(modal, 'Mã trạm trên CMS').fill('CMS-TEST');
  await input(modal, 'Ngày ON thực tế').fill('2026-11-13');
  await modal.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(modal).toBeHidden();
  expect(mutations.find(item => item.path.endsWith('/status')).data).toMatchObject({
    to_status: 'OPERATING', expected_token: 'fixture-token', cms_station_code: 'CMS-TEST', on_date: '2026-11-13'
  });
  expect(errors).toEqual([]);
});

test('shipping groups poles with supplier/carrier selectors and accepts future export dates', async ({ page }) => {
  const { errors, mutations } = await setup(page);
  await page.goto('/admin/on-tram/giao-tru');
  await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
  await expect(page.getByRole('button', { name: 'Đã nhận đơn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xuất trụ theo số lượng', exact: true }).click();
  const modal = page.locator('body > .modal').filter({ has: page.getByRole('heading', { name: 'Tạo phiếu xuất kho', exact: true }) });
  await input(modal, 'Số lượng').fill('1');
  await select(modal, 'Nhà cung cấp').selectOption('2');
  await select(modal, 'Đơn vị vận chuyển').selectOption('1');
  await input(modal, 'Ngày xuất kho').fill('2027-01-01');
  await modal.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(modal).toBeHidden();
  const payload = mutations.find(item => item.path.endsWith('/shipments')).data;
  expect(payload).toMatchObject({ carrier_id: '1', export_date: '2027-01-01',
    items: [{ pole_id: 1, supplier_id: 2, quantity: 1 }] });
  expect(payload.request_id).toBeTruthy();
  expect(errors).toEqual([]);
});

for (const role of ['SUPER_ADMIN', 'SALES']) {
  test(`installation badge opens received portions with status/note and saves for ${role}`, async ({ page }) => {
    const { errors, mutations } = await setup(page, role);
    await page.goto('/admin/on-tram/lap-tru');
    await expect(page.getByRole('columnheader', { name: 'Trạng thái quy trình', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Trạng thái lắp trụ', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Các phần trụ / thao tác' })).toHaveCount(0);
    await page.getByRole('button', { name: /Đang lắp trụ/ }).click();
    const modal = page.locator('body > .modal').filter({ has: page.getByRole('heading', { name: 'Lắp trụ · TEST-501' }) });
    await expect(modal.getByText('Phiếu #8 · Phần #11 · DC60 · Supplier A · 1 trụ')).toBeVisible();
    const status = modal.getByLabel('Trạng thái phần 11');
    if (role === 'SALES') await expect(status.locator('option[value=DONE]')).toHaveAttribute('disabled', '');
    await status.selectOption('DOING');
    await input(modal, 'Ghi chú').fill('Đang triển khai');
    await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(modal).toBeHidden();
    expect(mutations.find(item => item.path.endsWith('/installation')).data.items).toEqual([
      { id: 11, status: 'DOING', note: 'Đang triển khai', expected_version: 2 }
    ]);
    expect(errors).toEqual([]);
  });
}

test('SUPER_ADMIN manages carriers without exposing an unsupported Excel export', async ({ page }) => {
  const { errors, mutations } = await setup(page);
  await page.goto('/admin/kho?tab=carriers');
  await expect(page.getByRole('tab', { name: 'Đơn vị vận chuyển', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xuất Excel', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Thêm đơn vị vận chuyển', exact: true }).click();
  const modal = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Thêm đơn vị vận chuyển', exact: true }) });
  await input(modal, 'Tên đơn vị vận chuyển').fill('Carrier B');
  await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(modal).toBeHidden();
  expect(mutations.find(item => item.path.endsWith('/shipping-carriers')).data).toMatchObject({ name: 'Carrier B', active: true });
  expect(errors).toEqual([]);
});
