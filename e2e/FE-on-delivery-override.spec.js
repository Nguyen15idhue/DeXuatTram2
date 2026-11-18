const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

const setup = async (page, role = 'SUPER_ADMIN', { rejected = false, cancelled = false, legacy = false, early = false, shipments = false } = {}) => {
  const updates = [];
  const installationUpdates = [];
  const portions = [];
  const errors = [];
  const earlyRequests = [];
  const shipmentUpdates = [];
  const station = {
    id: 501, ma_tram: 'ON-DELIVERY-501', status: cancelled ? 'CANCELLED' : 'DELIVERING',
    sub_status: 'NOT_DELIVERED', proposal_id: 77, edit_token: 'delivery-version-1',
    workflow_override: { existing_flag: true, ...(legacy ? { delivery_completed: true } : {}) },
    permissions: { setup: true, back_office: true },
    contract_status: early ? 'DONE' : 'NOT',
    can_request_early_delivery: early,
    delivery_missing_items: ['Hạ tầng'],
    fulfillment: { items: [], shipments: [], shipping_options: [],
      pole_requirements: [{ pole_id: 1, name: 'Fixture DC60', committed_quantity: 2,
        exported_quantity: 0, received_quantity: 0, returned_quantity: 0 }],
      totals: { committed: 2, received: 0, exported: 0, returned: 0, operating: 0, remaining: 2 } }
  };
  if (shipments) {
    station.fulfillment.totals.exported = 2;
    station.fulfillment.shipments = [
      { id: 81, transport_status: 'SHIPPING', items: [{ id: 91, pole_name: 'Fixture DC60', quantity: 2 }] },
      { id: 82, transport_status: 'RETURNED', items: [{ id: 92, pole_name: 'Fixture DC60', quantity: 1 }] }
    ];
  }
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'delivery-fixture'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    let data = [];
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: 1, role, custom_data: { department: 'Back Office' } } };
    else if (url.pathname.endsWith('/charging-stations/task-counts')) {
      const delivery = !cancelled
        && station.fulfillment.totals.received < station.fulfillment.totals.committed ? 1 : 0;
      const installation = portions.length && station.installation_status !== 'DONE' ? 1 : 0;
      data = { counts: { delivery, installation }, total: delivery + installation };
    } else if (url.pathname.endsWith('/charging-stations')) {
      const tab = url.searchParams.get('tab');
      const installation = url.searchParams.get('stage') === 'lap-tru';
      const complete = installation ? station.installation_status === 'DONE'
        : station.fulfillment.totals.received >= station.fulfillment.totals.committed;
      data = (tab === 'all' || (tab === 'completed' ? complete : !complete))
        && (!installation || portions.length) ? [station] : [];
    } else if (url.pathname.endsWith('/501/delivery/early-request') && method === 'POST') {
      earlyRequests.push(route.request().postDataJSON());
      station.can_request_early_delivery = false;
      station.early_delivery_requested = 1;
      data = station;
    } else if (url.pathname.endsWith('/charging-stations/501') && method === 'PUT') {
      updates.push(route.request().postDataJSON());
      if (rejected) return route.fulfill({ status: 409, json: {
        success: false, message: 'Dữ liệu ON trạm đã thay đổi; hãy tải lại trước khi lưu'
      } });
      station.workflow_override.delivery_completed = true;
      station.edit_token = 'delivery-version-2';
      station.status = 'INSTALLING';
      station.sub_status = 'NOT_INSTALLED';
      station.installation_status = 'NOT';
      station.fulfillment.totals.received = 2;
      station.fulfillment.totals.exported = 2;
      station.fulfillment.totals.remaining = 0;
      Object.assign(station.fulfillment.pole_requirements[0], { received_quantity: 2, exported_quantity: 2 });
      portions.push({ id: 700, export_id: 81, pole_name: 'Fixture DC60', quantity: 2,
        stage: 'INSTALLING', sub_status: 'NOT_INSTALLED', installation_status: 'NOT', installation_version: 0 });
      data = station;
    } else if (url.pathname.endsWith('/501/shipments/81/status') && method === 'PUT') {
      const body = route.request().postDataJSON();
      shipmentUpdates.push(body);
      if (rejected) return route.fulfill({ status: 409, json: { success: false, message: 'Phiếu giao đã thay đổi' } });
      station.fulfillment.shipments[0].transport_status = body.status;
      data = station.fulfillment.shipments[0];
    } else if (url.pathname.endsWith('/charging-stations/501')) data = station;
    else if (url.pathname.endsWith('/501/fulfillment')) data = station.fulfillment;
    else if (url.pathname.endsWith('/501/deployments')) data = portions;
    else if (url.pathname.endsWith('/501/installation') && method === 'PUT') {
      const body = route.request().postDataJSON();
      installationUpdates.push(body);
      expect(body.items[0].id).toBe(700);
      expect(body.items[0].expected_version).toBe(portions[0].installation_version);
      portions[0].installation_status = body.items[0].status;
      portions[0].installation_note = body.items[0].note;
      portions[0].installation_version++;
      station.installation_status = body.items[0].status;
      data = portions;
    }
    if (['PUT', 'POST', 'PATCH', 'DELETE'].includes(method)) {
      expect(['/api/admin/charging-stations/501', '/api/admin/charging-stations/501/installation',
        '/api/admin/charging-stations/501/delivery/early-request', '/api/admin/charging-stations/501/shipments/81/status']).toContain(url.pathname);
      expect(method).toBe(url.pathname.endsWith('/early-request') ? 'POST' : 'PUT');
    }
    await route.fulfill({ json: { success: true, data,
      pagination: { page: 1, total: Array.isArray(data) ? data.length : 1, totalPages: 1 } } });
  });
  return { station, updates, installationUpdates, errors, earlyRequests, shipmentUpdates };
};

test('assigned user requests early delivery from the overview menu', async ({ page }) => {
  const { station, earlyRequests } = await setup(page, 'SALES', { early: true });
  await page.goto('/admin/on-tram/thong-tin-chung');
  await page.getByRole('button', { name: `Thao tác khác ${station.ma_tram}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Cập nhật trụ chốt' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Đề xuất đi trụ sớm' }).click();
  await expect(page.getByText('Chưa hoàn thành: Hạ tầng.')).toBeVisible();
  await page.getByLabel('Ngày giao mong muốn').fill('2027-01-15');
  await page.getByLabel('Lý do đề xuất').fill('Cần giao trước');
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
  expect(earlyRequests).toHaveLength(0);
  await page.getByRole('checkbox', { name: /Tôi xác nhận/ }).check();
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
  await expect(page.getByRole('heading', { name: 'Đề xuất đi trụ sớm' })).toHaveCount(0);
  expect(earlyRequests).toEqual([{ desired_delivery_date: '2027-01-15', reason: 'Cần giao trước', accept_missing: true }]);
  await expect(page.getByRole('button', { name: `Thao tác khác ${station.ma_tram}` })).toHaveCount(0);
});

for (const legacy of [false, true]) {
test(`SUPER_ADMIN receives all poles and continues installation, legacy marker=${legacy}`, async ({ page }) => {
  const { station, updates, installationUpdates, errors } = await setup(page, 'SUPER_ADMIN', { legacy });
  await page.goto('/admin/on-tram/giao-tru');
  const need = page.getByRole('tab', { name: /Trạm sạc cần thực hiện/ });
  await expect(need.locator('.badge')).toHaveText('1');
  await expect(page.getByRole('link', { name: station.ma_tram })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Trạng thái quy trình', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đổi trạng thái', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đổi trạng thái Giao trụ' })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByLabel('Lý do hoàn thành Giao trụ').fill('   ');
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByText('Lý do bắt buộc từ 3–5000 ký tự')).toBeVisible();
  expect(updates).toEqual([]);
  await page.getByLabel('Lý do hoàn thành Giao trụ').fill('Xác nhận giao hàng xong');
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đổi trạng thái Giao trụ' })).toHaveCount(0);
  await expect(need.locator('.badge')).toHaveCount(0);
  await need.click();
  await expect(page.getByRole('link', { name: station.ma_tram })).toHaveCount(0);
  expect(updates).toEqual([{ delivery_completed: true, expected_token: 'delivery-version-1', reason: 'Xác nhận giao hàng xong' }]);
  expect(station.status).toBe('INSTALLING');
  expect(station.sub_status).toBe('NOT_INSTALLED');
  expect(station.fulfillment.totals.received).toBe(2);
  await page.getByRole('tab', { name: 'Trạm sạc đã hoàn thành', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đã giao hàng thành công', exact: true })).toBeVisible();
  await expect(page.getByText('Xác nhận giao trực tiếp', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Xác nhận giao trực tiếp', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Đã giao hàng thành công/ }).click();
  await expect(page.getByText(/SUPER_ADMIN xác nhận giao trực tiếp bằng phiếu xuất nội bộ/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Đã giao', exact: true })).toBeVisible();
  await page.goto('/admin/on-tram/lap-tru');
  await expect(page.getByRole('tab', { name: /Trạm sạc cần thực hiện/ }).locator('.badge')).toHaveText('1');
  for (const [label, status] of [['Chưa lắp trụ', 'DOING'], ['Đang lắp trụ', 'DONE']]) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await expect(page.getByRole('heading', { name: /Fixture DC60/ })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await page.getByLabel('Trạng thái phần 700').selectOption(status);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Lắp trụ ·/ })).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: station.ma_tram })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Trạm sạc cần thực hiện/ }).locator('.badge')).toHaveCount(0);
  expect(installationUpdates.map(body => body.items[0].status)).toEqual(['DOING', 'DONE']);
  expect(errors).toEqual([]);
});
}

for (const role of ['ADMIN', 'SALES']) {
  test(`${role} cannot see manual delivery completion`, async ({ page }) => {
    const { updates, errors } = await setup(page, role);
    await page.goto('/admin/on-tram/giao-tru?tab=all');
    await expect(page.getByRole('link', { name: 'ON-DELIVERY-501' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đổi trạng thái', exact: true })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Hành động', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Chưa giao/ }).click();
    await expect(page.getByRole('heading', { name: /Triển khai/ })).toBeVisible();
    expect(updates).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('conflicts stay visible without falsely showing success', async ({ page }) => {
  const { station, updates, errors } = await setup(page, 'SUPER_ADMIN', { rejected: true });
  await page.goto('/admin/on-tram/giao-tru?tab=all');
  await page.getByRole('button', { name: 'Đổi trạng thái', exact: true }).click();
  await page.getByLabel('Lý do hoàn thành Giao trụ').fill('Xác nhận giao xong');
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByText('Dữ liệu ON trạm đã thay đổi; hãy tải lại trước khi lưu')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đổi trạng thái Giao trụ' })).toBeVisible();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Trạm sạc cần thực hiện/ }).locator('.badge')).toHaveText('1');
  expect(station.workflow_override.delivery_completed).toBeUndefined();
  expect(updates).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('cancelled stations cannot be manually marked as delivered', async ({ page }) => {
  await setup(page, 'SUPER_ADMIN', { cancelled: true });
  await page.goto('/admin/on-tram/giao-tru?tab=all');
  await expect(page.getByRole('link', { name: 'ON-DELIVERY-501' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đổi trạng thái', exact: true })).toHaveCount(0);
});

test('SUPER_ADMIN changes only the selected shipment with a required reason and no backwards transitions', async ({ page }) => {
  const { station, shipmentUpdates, updates, errors } = await setup(page, 'SUPER_ADMIN', { shipments: true });
  await page.goto('/admin/on-tram/giao-tru');
  await page.getByRole('button', { name: 'Đổi trạng thái', exact: true }).click();
  await page.getByLabel('Phiếu giao', { exact: true }).selectOption('81');
  const statuses = page.getByLabel('Trạng thái vận chuyển', { exact: true });
  await expect(statuses.locator('option[value="NOT_SHIPPED"]')).toHaveAttribute('disabled', '');
  await expect(statuses.locator('option[value="SHIPPING"]')).toHaveAttribute('disabled', '');
  await statuses.selectOption('FAILED');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  expect(shipmentUpdates).toEqual([]);
  await page.getByLabel('Lý do / Ghi chú', { exact: true }).fill('Không liên hệ được');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đổi trạng thái Giao trụ' })).toHaveCount(0);
  expect(shipmentUpdates).toEqual([{ status: 'FAILED', expected_status: 'SHIPPING', reason: 'Không liên hệ được', request_id: expect.any(String) }]);
  expect(station.fulfillment.shipments[1].transport_status).toBe('RETURNED');
  expect(updates).toEqual([]);
  await expect(page.getByRole('button', { name: /Giao thất bại/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('delivery summary preserves partial receipts and pending returns across multiple shipments', async ({ page }) => {
  const { station, errors } = await setup(page, 'SUPER_ADMIN', { shipments: true });
  station.fulfillment.totals.received = 1;
  await page.goto('/admin/on-tram/giao-tru?tab=all');
  await expect(page.getByRole('button', { name: 'Đã giao một phần', exact: true })).toBeVisible();
  station.fulfillment.totals.received = 2;
  station.fulfillment.shipments[0].transport_status = 'RETURN_PENDING';
  await page.reload();
  await expect(page.getByRole('button', { name: 'Có chuyến chờ hoàn hàng', exact: true })).toBeVisible();
  station.fulfillment.totals.received = 0;
  station.fulfillment.totals.returned = 2;
  station.fulfillment.shipments[0].transport_status = 'RETURNED';
  await page.reload();
  await expect(page.getByRole('button', { name: 'Đã hoàn', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('shipment conflict preserves the selected shipment and displays the error', async ({ page }) => {
  const { station, errors } = await setup(page, 'SUPER_ADMIN', { shipments: true, rejected: true });
  await page.goto('/admin/on-tram/giao-tru');
  await page.getByRole('button', { name: 'Đổi trạng thái', exact: true }).click();
  await page.getByLabel('Phiếu giao', { exact: true }).selectOption('81');
  await page.getByLabel('Trạng thái vận chuyển', { exact: true }).selectOption('DELIVERED');
  await page.getByLabel('Lý do / Ghi chú', { exact: true }).fill('Xác nhận đã nhận');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Phiếu giao đã thay đổi');
  await expect(page.getByLabel('Phiếu giao', { exact: true })).toHaveValue('81');
  expect(station.fulfillment.shipments[0].transport_status).toBe('SHIPPING');
  expect(errors).toEqual([]);
});
