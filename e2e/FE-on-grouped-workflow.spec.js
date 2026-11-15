const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

const report = base => ({ file: { id: base, original_name: 'report.pdf', mime_type: 'application/pdf' },
  images: [1, 2].map(offset => ({ id: base + offset, original_name: `photo-${offset}.png`, mime_type: 'image/png' })),
  note: 'Shared report' });
const makePortion = (id, changes = {}) => ({ id, export_id: id, quantity: 1, pole_id: 1, commitment_id: 1,
  pole_name: 'DC 120kW', supplier_name: 'Meter', stage: 'CONFIGURING', installation_status: 'DONE',
  shipment_status: 'DELIVERED', acceptance_status: 'NOT', workflow_version: 2,
  acceptance_reports: { EQUIPMENT: report(11), INFRASTRUCTURE: report(21) }, ...changes });
const fixture = async (page, { stage, department = 'Phòng Setup và Vận hành', portions = [], shipments = [] }) => {
  const updates = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const station = { id: 501, ma_tram: 'ON-501', proposal_id: 77, status: 'CONFIGURING',
    contract_status: 'DONE', infra_power_status: 'DONE', infra_site_status: 'DONE',
    deposit_status: 'RECEIVED', payment_status: 'DOING', cms_station_code: 'CMS-501',
    chot_so_luong_tru: [{ mo_hinh: 'LK', loai_tru: 'DC 120kW', so_luong: 3 }],
    permissions: { setup: department.includes('Setup'), back_office: department.includes('Back Office') } };
  const summary = { items: [{ commitment_id: 1, committed_quantity: 3 }],
    totals: { committed: 3, operating: 1 }, shipments,
    pole_requirements: [{ pole_id: 1, name: 'DC 120kW', committed_quantity: 3,
      exported_quantity: 3, received_quantity: 1, returned_quantity: 0 }], shipping_options: [] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let data = {};
    if (pathname.endsWith('/auth/me')) data = { user: { id: 2, role: 'ADMIN', custom_data: { department } } };
    else if (pathname.endsWith('/charging-stations')) data = [{ ...station, deployments: portions, fulfillment: summary }];
    else if (pathname.endsWith('/charging-stations/501')) data = station;
    else if (pathname.endsWith('/fulfillment')) data = summary;
    else if (pathname.endsWith('/deployments')) data = portions;
    else if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      updates.push({ pathname, body });
      if (pathname.endsWith('/acceptance')) {
        for (const item of body.items) {
          const row = portions.find(portion => portion.id === item.id);
          row.acceptance_status = { 'acceptance-passed': 'PASSED', 'acceptance-failed': 'FAILED', 'acceptance-reset': 'NOT' }[body.action];
          row.workflow_version++;
        }
      } else if (pathname.endsWith('/on-station')) {
        for (const item of body.items) portions.find(row => row.id === item.id).stage = 'OPERATING';
      } else if (pathname.endsWith('/status')) shipments[0].transport_status = body.status;
      data = portions;
    }
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } } });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'grouped-test'));
  await page.goto(`/admin/on-tram/${stage}?tab=all`);
  return { updates, errors };
};

test('delivery shows compact tables and changes a whole multi-type shipment through the status modal', async ({ page }) => {
  const shipments = [{ id: 10, transport_status: 'SHIPPING', items: [
    { id: 1, pole_id: 1, name: 'DC 120kW', supplier_name: 'Meter', quantity: 2 },
    { id: 2, pole_id: 2, name: 'DC 60kW', supplier_name: 'Other', quantity: 1 }
  ] }];
  const { updates, errors } = await fixture(page, { stage: 'giao-tru', department: 'Phòng Back Office', shipments });
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Quy mô trụ giao', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Số lượng chốt', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Tồn kho', exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Chốt: /)).toHaveCount(0);
  await page.getByRole('button', { name: /Đang vận chuyển/ }).click();
  await expect(page.getByLabel('Trạng thái vận chuyển')).toBeVisible();
  await page.getByLabel('Trạng thái vận chuyển').selectOption('DELIVERED');
  await page.getByLabel('Lý do / Ghi chú').fill('Received all poles');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0]).toMatchObject({ pathname: '/api/admin/charging-stations/501/shipments/10/status',
    body: { status: 'DELIVERED', expected_status: 'SHIPPING', reason: 'Received all poles' } });
  expect(updates[0].body.items).toBeUndefined();
  await page.getByRole('button', { name: /Đã giao hàng thành công/ }).click();
  await page.getByLabel('Trạng thái vận chuyển').selectOption('RETURN_PENDING');
  await page.getByLabel('Lý do / Ghi chú').fill('Return entire order');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => updates.length).toBe(2);
  expect(updates[1].body).toMatchObject({ status: 'RETURN_PENDING', expected_status: 'DELIVERED' });
  expect(errors).toEqual([]);
});

test('one acceptance group opens directly and saves one shared report for eligible poles across shipments', async ({ page }) => {
  const portions = [makePortion(1), makePortion(2, { pole_id: 2, pole_name: 'DC 60kW', supplier_name: 'Other' }),
    makePortion(3, { installation_status: 'NOT' })];
  const { updates, errors } = await fixture(page, { stage: 'nghiem-thu', portions });
  await expect(page.getByRole('columnheader', { name: 'Quy mô trụ chốt', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Trạng thái quy trình', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Trụ đã ON / chốt', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.getByLabel('Trạng thái nghiệm thu')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Triển khai nghiệm thu/ })).toHaveCount(0);
  await page.getByLabel('Trạng thái nghiệm thu').selectOption('PASSED');
  await expect(page.getByRole('heading', { name: 'Nghiệm thu lắp đặt', exact: true })).toBeVisible();
  await expect(page.getByText('Sẽ cập nhật: 2 trụ.')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Không cập nhật');
  await expect(page.getByRole('heading', { name: 'Nghiệm thu thiết bị', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].body).toMatchObject({ action: 'acceptance-passed', items: [
    { id: 1, expected_version: 2 }, { id: 2, expected_version: 2 }
  ], equipment: { file_id: 11, image_ids: [12, 13] }, infrastructure: { file_id: 21, image_ids: [22, 23] } });
  await expect(page.getByText('Đã nghiệm thu một phần', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mixed acceptance states show grouped rows and require a reason for resetting a group', async ({ page }) => {
  const { updates, errors } = await fixture(page, { stage: 'nghiem-thu',
    portions: [makePortion(1), makePortion(2, { acceptance_status: 'FAILED' }), makePortion(3, { acceptance_status: 'PASSED' })] });
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Triển khai nghiệm thu/ })).toBeVisible();
  await expect(page.locator('.modal-box').getByRole('row')).toHaveCount(4);
  await page.getByRole('button', { name: /Nghiệm thu không đạt/ }).click();
  await page.getByLabel('Trạng thái nghiệm thu').selectOption('NOT');
  await expect(page.getByLabel('Lý do / Ghi chú')).toHaveAttribute('required', '');
  await page.getByLabel('Lý do / Ghi chú').fill('Schedule reinspection');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].body).toMatchObject({ action: 'acceptance-reset', items: [{ id: 2, expected_version: 2 }], reason: 'Schedule reinspection' });
  await expect(page.getByRole('heading', { name: /Triển khai nghiệm thu/ })).toBeVisible();
  await expect(page.locator('.modal-box').getByRole('row')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('ON groups isolate selected status, keep completed poles read-only and skip uninstalled poles', async ({ page }) => {
  const { updates, errors } = await fixture(page, { stage: 'on-tram', portions: [
    makePortion(1), makePortion(2, { installation_status: 'NOT' }), makePortion(3, { stage: 'OPERATING', on_date: '2026-11-15' })
  ] });
  await expect(page.getByText('Đã tích hợp một phần', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Trạng thái ON trạm', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Triển khai ON trạm/ })).toBeVisible();
  await page.getByRole('button', { name: /Đã tích hợp xong/ }).click();
  await expect(page.getByText('Đã ON — chỉ xem', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.getByRole('button', { name: /Chưa tích hợp/ }).click();
  await expect(page.getByLabel('Ngày ON 1')).toBeEnabled();
  await expect(page.getByLabel('Ngày ON 2')).toBeDisabled();
  await expect(page.getByLabel('Ngày ON 3')).toHaveCount(0);
  await page.getByLabel('Ngày ON 1').fill('2026-11-16');
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].body).toMatchObject({ cms_station_code: 'CMS-501',
    items: [{ id: 1, expected_version: 2, on_date: '2026-11-16' }] });
  expect(errors).toEqual([]);
});

test('one ON group opens directly and retains separate ON dates for every portion', async ({ page }) => {
  const { updates, errors } = await fixture(page, { stage: 'on-tram',
    portions: [makePortion(1), makePortion(2), makePortion(3)] });
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cập nhật ON trạm', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Triển khai ON trạm/ })).toHaveCount(0);
  for (const id of [1, 2, 3]) await page.getByLabel(`Ngày ON ${id}`).fill(`2026-11-${13 + id}`);
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].body.items.map(row => row.on_date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
  await expect(page.getByText('Đã tích hợp xong', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
