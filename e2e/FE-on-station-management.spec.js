const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });
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

for (const stage of ['khoi-tao-hop-dong', 'xay-dung-ha-tang', 'giao-tru', 'lap-tru', 'nghiem-thu']) {
  test(`exports ON Excel with active filters on ${stage}`, async ({ page }) => {
    await setup(page, 'CTV');
    let queries;
    await page.route(/\/api\/admin\/charging-stations\/export\?/, async route => {
      queries = Object.fromEntries(new URL(route.request().url()).searchParams);
      expect(route.request().headers().authorization).toBe('Bearer ui-on-management');
      await route.fulfill({
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers: { 'content-disposition': 'attachment; filename="on-fixture.xlsx"' },
        body: 'mock download'
      });
    });
    await page.goto(`/admin/on-tram/${stage}?tab=completed`);
    await page.getByPlaceholder(/Tìm mã trạm/).fill('Hà Nội');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('on-fixture.xlsx');
    expect(queries).toEqual({ stage, tab: 'completed', search: 'Hà Nội' });
  });
}

test('admin can cancel queued ON Sheet jobs with confirmation even when Sheet is disabled', async ({ page }) => {
  await setup(page, 'ADMIN');
  let requests = 0;
  const queue = { pending: 0, processing: 0, failed: 65, cancelled: 0, done: 5 };
  await page.route('**/api/admin/on-station-sheet-sync/**', async route => {
    if (route.request().url().endsWith('/cancel')) {
      expect(route.request().method()).toBe('POST');
      requests++;
      queue.failed = 0;
      queue.cancelled = 65;
      return route.fulfill({ json: { success: true, data: { cancelled: 65 }, message: 'Đã hủy 65 mục đồng bộ' } });
    }
    return route.fulfill({ json: { success: true, data: { configured: false, queue } } });
  });
  await page.goto('/admin/on-tram/thong-tin-chung');
  await expect(page.getByRole('button', { name: 'Đồng bộ Sheet trạm ON', exact: true })).toBeDisabled();
  const cancel = page.getByRole('button', { name: 'Hủy đồng bộ đang chờ', exact: true });
  await cancel.click();
  await expect(page.getByText('Hiện có 65 mục đang chờ hoặc thất bại.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  expect(requests).toBe(0);
  await cancel.click();
  await page.getByRole('button', { name: 'Xác nhận hủy đồng bộ', exact: true }).click();
  await expect(page.getByText('Đã hủy đồng bộ: 65', { exact: true })).toBeVisible();
  await expect(page.getByText('Có 65 mục đồng bộ chưa thành công.', { exact: true })).toHaveCount(0);
  await expect(cancel).toHaveCount(0);
  expect(requests).toBe(1);
});

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
    else if (pathname.endsWith('/activity')) data = [{
      id: 1, action: 'installation_updated', actor_name: 'Setup lịch sử',
      created_at: '2026-11-16T08:00:00+07:00', reject_reason: 'Đã bắt đầu lắp',
      pole_name: 'DC60', export_id: 8, changed_fields: { installation_status: { old: 'NOT', new: 'DOING' } }
    }];
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
    await expect(page.getByText('Trạng thái quy trình: 3. Đang lắp đặt', { exact: true })).toBeVisible();
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
  await expect(page.getByText('3. Đang lắp đặt', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa lắp đặt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thao tác khác TEST-501' }).click();
  await page.getByRole('menuitem', { name: 'Đổi trạng thái', exact: true }).click();
  const modal = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Đổi trạng thái ON trạm' }) });
  await expect(modal.locator('select option')).toHaveText([
    'Chọn trạng thái', '1. Đang hoàn thiện thủ tục', '2. Đang giao hàng', '3. Đang lắp đặt',
    '4. Đang nghiệm thu', '5. Đang cấu hình', '6. Đang hoạt động', 'Đã hủy'
  ]);
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

test('detail history numbers workflow codes without numbering substatuses or rewriting saved text', async ({ page }) => {
  const { errors } = await setup(page);
  await page.route('**/api/admin/charging-stations/501', route => route.fulfill({ json: {
    success: true, data: { ...station, timeline: [
      { id: 1, action: 'status_changed', from_status: 'INSTALLING', to_status: 'CONFIGURING',
        changed_fields: { status: { old: 'INSTALLING', new: 'CONFIGURING' },
          sub_status: { old: 'NOT_CONFIGURED', new: 'CONFIGURING' } } },
      { id: 2, action: 'status_changed', from_status: 'ONBOARDING', to_status: 'DELIVERING' },
      { id: 3, action: 'updated', changed_fields: { note: { label: 'Ghi chú', old: null, new: 'Đang lắp đặt' } } }
    ] }
  } }));
  await page.goto('/admin/on-tram/thong-tin-chung/501');
  await expect(page.getByText('3. Đang lắp đặt', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa lắp đặt', { exact: true })).toBeVisible();
  await expect(page.getByText('Trạng thái quy trình: 3. Đang lắp đặt → 5. Đang cấu hình', { exact: false })).toBeVisible();
  await expect(page.getByText('Trạng thái chi tiết: Chưa cấu hình → Đang cấu hình', { exact: false })).toBeVisible();
  await expect(page.getByText('Trạng thái quy trình: 1. Đang hoàn thiện thủ tục → 2. Đang giao hàng', { exact: true })).toBeVisible();
  await expect(page.getByText('Ghi chú: — → Đang lắp đặt', { exact: true })).toBeVisible();
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
    await expect(modal.getByText('DC60 · Supplier A · 1 trụ', { exact: true })).toBeVisible();
    await expect(modal.getByRole('cell', { name: 'Setup lịch sử', exact: true })).toBeVisible();
    await expect(modal.getByRole('cell', { name: 'Đã bắt đầu lắp', exact: true })).toBeVisible();
    expect(await modal.evaluate(element => {
      const history = element.querySelector('section[aria-label="Lịch sử thay đổi trạng thái"]');
      const buttons = [...element.querySelectorAll('button')].filter(button => ['Hủy', 'Lưu'].includes(button.textContent.trim()));
      return history === history.parentElement.lastElementChild && buttons.length === 2
        && buttons.every(button => button.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    expect(await modal.locator('.modal-box').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(1000);
    const status = modal.getByLabel('Trạng thái phần 11');
    await expect(status.locator('option[value=DONE]')).not.toBeDisabled();
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
