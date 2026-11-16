const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

const report = base => ({ file: { id: base, original_name: 'report.pdf', mime_type: 'application/pdf' },
  images: [1, 2].map(offset => ({ id: base + offset, original_name: `photo-${offset}.png`, mime_type: 'image/png' })),
  note: 'Shared report' });
const makePortion = (id, changes = {}) => ({ id, export_id: id, quantity: 1, pole_id: 1, commitment_id: 1,
  pole_name: 'DC 120kW', supplier_name: 'Meter', stage: 'CONFIGURING', installation_status: 'DONE',
  shipment_status: 'DELIVERED', acceptance_status: 'NOT', workflow_version: 2,
  acceptance_reports: { EQUIPMENT: report(11), INFRASTRUCTURE: report(21) }, ...changes });
const expectHistoryBelowActions = async modal => {
  const history = modal.getByRole('region', { name: 'Lịch sử thay đổi trạng thái' });
  await expect(history).toBeVisible();
  expect(await modal.evaluate(element => {
    const section = element.querySelector('section[aria-label="Lịch sử thay đổi trạng thái"]');
    const buttons = [...element.querySelectorAll('button')].filter(button => ['Hủy', 'Lưu'].includes(button.textContent.trim()));
    return buttons.length === 2 && !section.closest('form') && section === section.parentElement.lastElementChild
      && buttons.every(button => button.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  expect(await modal.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(1000);
};
const fixture = async (page, { stage, department = 'Phòng Setup và Vận hành', portions = [], shipments = [], committedQuantity = 3 }) => {
  const updates = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const station = { id: 501, ma_tram: 'ON-501', proposal_id: 77, status: 'CONFIGURING',
    contract_status: 'DONE', infra_power_status: 'DONE', infra_site_status: 'DONE',
    deposit_status: 'RECEIVED', payment_status: 'DOING', cms_station_code: 'CMS-501',
    chot_so_luong_tru: [{ mo_hinh: 'LK', loai_tru: 'DC 120kW', so_luong: committedQuantity }],
    permissions: { setup: department.includes('Setup'), back_office: department.includes('Back Office') } };
  const summary = { items: [{ commitment_id: 1, committed_quantity: committedQuantity }],
    totals: { committed: committedQuantity, operating: 1 }, shipments,
    pole_requirements: [{ pole_id: 1, name: 'DC 120kW', committed_quantity: 3,
      exported_quantity: 3, received_quantity: 1, returned_quantity: 0 }], shipping_options: [] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let data = {};
    if (pathname.endsWith('/auth/me')) data = { user: { id: 2, role: 'ADMIN', custom_data: { department } } };
    else if (pathname.endsWith('/charging-stations')) data = [{ ...station, deployments: portions, fulfillment: summary }];
    else if (pathname.endsWith('/charging-stations/501')) data = { ...station, fulfillment: summary };
    else if (pathname.endsWith('/fulfillment')) data = summary;
    else if (pathname.endsWith('/deployments')) data = portions;
    else if (pathname.endsWith('/activity')) data = [{
      id: 1, action: stage === 'on-tram' ? 'portion_complete_configuration' : 'shipment_status_changed',
      actor_name: 'Người cập nhật lịch sử', created_at: '2026-11-16T08:00:00+07:00',
      pole_name: 'DC 120kW', export_id: 99, reject_reason: 'Lịch sử bước đang xem',
      changed_fields: stage === 'on-tram'
        ? { on_quantity: { old: 1, new: 2 }, on_event_date: '2026-11-15', on_event_kind: 'ON',
          integration_status: { old: 'DOING', new: 'DOING' } }
        : stage === 'nghiem-thu' ? { acceptance_status: { old: 'NOT', new: 'FAILED' } }
          : { transport_status: { old: 'SHIPPING', new: 'DELIVERED' } }
    }];
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
        for (const item of body.items) {
          const row = portions.find(portion => portion.id === item.id);
          row.stage = 'OPERATING';
          row.on_quantity = item.on_quantity;
          row.on_date ||= item.on_date;
          row.workflow_version++;
        }
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
  await expectHistoryBelowActions(page.locator('.modal-box').filter({ has: page.getByLabel('Trạng thái vận chuyển') }));
  await expect(page.getByRole('cell', { name: 'Lịch sử bước đang xem', exact: true })).toBeVisible();
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
  await expectHistoryBelowActions(page.locator('.modal-box').filter({ has: page.getByLabel('Trạng thái nghiệm thu') }));
  await expect(page.getByRole('cell', { name: 'Người cập nhật lịch sử', exact: true })).toBeVisible();
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

test('ON opens all rows directly, supports corrections and skips uninstalled poles', async ({ page }) => {
  const { updates, errors } = await fixture(page, { stage: 'on-tram', portions: [
    makePortion(1), makePortion(2, { installation_status: 'NOT' }), makePortion(3, { stage: 'OPERATING', on_date: '2026-11-15' })
  ] });
  await expect(page.getByRole('button', { name: /Đã tích hợp một phần/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Trạng thái ON trạm', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Hành động' })).toHaveCount(0);
  await page.getByRole('button', { name: /Đã tích hợp một phần/ }).click();
  await expect(page.getByRole('heading', { name: /Triển khai ON trạm/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cập nhật ON trạm', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Số lượng ON: 1 → 2/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'ON: 2026-11-15', exact: true })).toBeVisible();
  await expect(page.getByLabel('Số lượng ON 3:1:')).toBeEnabled();
  await expect(page.getByLabel('Số lượng ON 2:1:')).toBeDisabled();
  await expect(page.getByLabel('Ngày ON 1:1:')).toHaveValue('');
  await page.getByLabel('Số lượng ON 1:1:').fill('1');
  await page.getByLabel('Ngày ON 1:1:').fill('2026-11-16');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].body).toMatchObject({ cms_station_code: 'CMS-501',
    items: [{ id: 1, expected_version: 2, on_quantity: 1, on_date: '2026-11-16' }] });
  expect(errors).toEqual([]);
});

test('ON cumulative quantities clear the date and bulk confirmation applies only eligible quantities', async ({ page }) => {
  const { updates, errors } = await fixture(page, { stage: 'on-tram', committedQuantity: 5,
    portions: [makePortion(1, { quantity: 3, on_quantity: 1, stage: 'OPERATING', on_date: '2026-11-14' }),
      makePortion(2, { quantity: 2, installation_status: 'NOT' })] });
  await page.getByRole('button', { name: /Đã tích hợp một phần/ }).click();
  await expect(page.getByRole('heading', { name: 'Cập nhật ON trạm', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Triển khai ON trạm/ })).toHaveCount(0);
  await expect(page.getByLabel('Ngày ON 1:1:')).toHaveValue('2026-11-14');
  await page.getByLabel('Số lượng ON 1:1:').fill('2');
  await expect(page.getByLabel('Ngày ON 1:1:')).toHaveValue('');
  await expect(page.getByText('Đang tích hợp', { exact: true })).toBeVisible();
  await page.getByText('Xác nhận đã tích hợp ON tất cả', { exact: true }).click();
  await expect(page.getByLabel('Số lượng ON 1:1:')).toHaveValue('3');
  await expect(page.getByLabel('Số lượng ON 2:1:')).toHaveValue('0');
  await page.getByLabel('Ngày ON cho tất cả').fill('2026-11-16');
  await expect(page.getByLabel('Ngày ON 1:1:')).toHaveValue('2026-11-16');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].body.items).toEqual([{ id: 1, expected_version: 2, on_quantity: 3, on_date: '2026-11-16', note: null }]);
  await expect(page.getByRole('button', { name: /Đã tích hợp xong/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Đã tích hợp một phần/ }).click();
  await expect(page.getByLabel('Ngày ON 1:1:')).toHaveValue('2026-11-14');
  await page.getByLabel('Số lượng ON 1:1:').fill('0');
  await expect(page.getByLabel('Ngày ON 1:1:')).toHaveValue('');
  await page.getByLabel('Ngày ON 1:1:').fill('2026-11-17');
  await expect(page.getByLabel('Lý do / Ghi chú ON')).toHaveAttribute('required', '');
  await page.getByLabel('Lý do / Ghi chú ON').fill('Correct mistaken count');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => updates.length).toBe(2);
  expect(updates[1].body).toMatchObject({ reason: 'Correct mistaken count',
    items: [{ id: 1, on_quantity: 0, on_date: '2026-11-17' }] });
  expect(errors).toEqual([]);
});

test('ON orders older received shipments first and places history below form actions', async ({ page }) => {
  const { errors } = await fixture(page, { stage: 'on-tram', portions: [
    makePortion(3, { export_item_id: 3 }), makePortion(2, { export_item_id: 2, installation_status: 'NOT' })
  ], shipments: [
    { id: 1, transport_status: 'SHIPPING', items: [{ id: 1, pole_id: 1, name: 'DC 120kW', quantity: 1 }] },
    { id: 3, transport_status: 'DELIVERED', items: [{ id: 3, pole_id: 1, name: 'DC 120kW', quantity: 1 }] },
    { id: 2, transport_status: 'DELIVERED', items: [{ id: 2, pole_id: 1, name: 'DC 120kW', quantity: 1 }] }
  ] });
  await page.getByRole('button', { name: /Chưa tích hợp/ }).click();
  const modal = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Cập nhật ON trạm', exact: true }) });
  await expectHistoryBelowActions(modal);
  await expect.poll(() => modal.locator('input[aria-label^="Số lượng ON"]').evaluateAll(inputs =>
    inputs.map(input => input.getAttribute('aria-label')))).toEqual(['Số lượng ON 2:1:', 'Số lượng ON 3:1:', 'Số lượng ON 1:1:']);
  await expect(modal.locator('form').getByRole('button', { name: 'Hủy', exact: true })).toBeVisible();
  await expect(modal.locator('form').getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
  const history = modal.getByRole('region', { name: 'Lịch sử thay đổi trạng thái' });
  await expect(history).toBeVisible();
  expect(await history.evaluate(section =>
    !section.closest('form') && !!(section.previousElementSibling?.tagName === 'FORM'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await modal.evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await expect(modal.getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
