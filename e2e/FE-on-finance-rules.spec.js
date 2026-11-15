const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('finance requires evidence and deposit before payment/refund; deposit saves opt-in', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const station = { id: 501, ma_tram: 'ON-501', proposal_id: 77, requires_deposit: true,
    status: 'OPERATING', sub_status: 'ACTIVE', mo_hinh_dau_tu: 'LK', deposit_status: 'NOT_RECEIVED',
    payment_status: 'NOT', deposit_total: 0, payment_total: 0, refund_total: 0,
    fulfillment: { totals: { committed: 2, operating: 2 } },
    permissions: { finance: true } };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let data = {};
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN' } };
    else if (pathname.endsWith('/charging-finance/stations')) data = [station];
    else if (pathname.endsWith('/charging-finance/invoices')) data = [];
    else if (pathname.endsWith('/files/upload')) data = { id: 11 };
    else if (pathname.endsWith('/stations/501/invoices')) {
      const body = request.postDataJSON();
      requests.push(body);
      Object.assign(station, { deposit_total: body.amount, deposit_refund_required: body.deposit_refund_required ? 1 : 0,
        deposit_status: 'RECEIVED' });
    }
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } } });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'finance-test'));
  await page.goto('/admin/tai-chinh?tab=all');
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi nhận hóa đơn', exact: true }).click();
  const select = page.getByLabel('Loại hóa đơn', { exact: true });
  await expect(select.locator('option')).toHaveText(['Tiền cọc']);
  await page.getByLabel('Xác nhận đề xuất cần hoàn cọc').check();
  await page.getByLabel('Số tiền (₫)').fill('200');
  const evidence = page.locator('input[type="file"]');
  await expect(evidence).toHaveJSProperty('required', true);
  await page.getByRole('button', { name: 'Lưu hóa đơn', exact: true }).click();
  expect(requests).toEqual([]);
  await evidence.setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.getByRole('button', { name: 'Lưu hóa đơn', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ invoice_type: 'DEPOSIT', amount: 200, evidence_file_id: 11, deposit_refund_required: true });
  await expect(page.getByRole('button', { name: 'Ghi nhận hóa đơn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ghi nhận hóa đơn', exact: true }).click();
  await expect(select.locator('option')).toHaveText(['Tiền cọc', 'Hoàn cọc', 'Thanh toán']);
  await select.selectOption('DEPOSIT');
  await expect(page.getByLabel('Xác nhận đề xuất cần hoàn cọc')).toBeChecked();
  expect(errors).toEqual([]);
});

test('contract summaries cover partial payments and refunds; Back Office reuses existing files', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const records = [
    { deposit_total: 0, payment_total: 0, label: 'Chưa nhận cọc' },
    { deposit_total: 100, payment_total: 0, label: 'Đã nhận cọc' },
    { deposit_total: 100, payment_total: 100, label: 'Đang thanh toán' },
    { deposit_total: 100, payment_total: 900, label: 'Đã thanh toán toàn bộ' },
    { deposit_total: 100, payment_total: 900, deposit_refund_required: 1, label: 'Đã thanh toán - Chờ hoàn cọc' },
    { deposit_total: 100, payment_total: 1000, refund_total: 100, deposit_refund_required: 1, label: 'Đã thanh toán - Đã hoàn cọc' },
    { deposit_total: 100, payment_total: 900, refund_total: 100, deposit_refund_required: 1, label: 'Đang thanh toán' }
  ].map((row, index) => ({ id: 501 + index, ma_tram: `ON-${501 + index}`, proposal_id: 77,
    status: 'OPERATING', sub_status: 'ACTIVE', contract_status: 'DONE', contract_amount: 1000,
    contract_effective_date: '2026-11-01', contract_expiry_date: '2027-11-01',
    contract_files: [{ id: 11 }, { id: 12 }], permissions: { back_office: true }, ...row }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let data = {};
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'ADMIN', custom_data: { department: 'Back Office' } } };
    else if (pathname.endsWith('/charging-stations')) data = records;
    else if (pathname.endsWith('/contract/complete')) requests.push(request.postDataJSON());
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: records.length, totalPages: 1 } } });
  });

  await page.addInitScript(() => localStorage.setItem('token', 'contract-test'));
  await page.goto('/admin/on-tram/khoi-tao-hop-dong?tab=all');
  const rows = page.locator('.on-station-table tbody tr');
  await expect(rows).toHaveCount(records.length);
  for (let index = 0; index < records.length; index++) await expect(rows.nth(index)).toContainText(records[index].label);
  await expect(page.getByRole('columnheader', { name: 'Hạ tầng điện', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Hạ tầng mặt bằng', exact: true })).toHaveCount(0);
  const indexHeader = page.getByRole('columnheader', { name: 'STT', exact: true });
  const codeHeader = page.getByRole('columnheader', { name: 'Mã trạm', exact: true });
  expect((await indexHeader.boundingBox()).width).toBeCloseTo(40, 0);
  expect((await codeHeader.boundingBox()).width).toBeCloseTo(110, 0);
  expect(await codeHeader.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.paddingTop, style.paddingLeft];
  })).toEqual(['4px', '6px']);
  await expect(codeHeader).toHaveClass(/dt-frozen/);
  await page.locator('.dynamic-table-container .overflow-x-auto').evaluate(element => { element.scrollLeft = 200; });
  expect((await codeHeader.boundingBox()).x - (await indexHeader.boundingBox()).x).toBeCloseTo(40, 0);
  await rows.first().getByRole('button', { name: 'Hợp đồng: Đã ký xong', exact: true }).click();
  const select = page.getByLabel('Trạng thái hợp đồng', { exact: true });
  for (const status of ['NOT', 'DOING', 'DONE']) await expect(select.locator(`option[value="${status}"]`)).toBeEnabled();
  await expect(page.getByText('Giữ 2 file hợp đồng đã lưu.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ file_ids: [11, 12], expected_status: 'DONE' });
  expect(errors).toEqual([]);
});

test('Setup resets acceptance after ON and confirms again using retained reports', async ({ page }) => {
  const requests = [];
  const station = { id: 501, ma_tram: 'ON-501', proposal_id: 77, status: 'OPERATING', sub_status: 'ACTIVE',
    permissions: { setup: true, back_office: false }, fulfillment: { totals: { committed: 1, operating: 1 } } };
  const report = (base) => ({ file: { id: base, original_name: 'report.pdf', mime_type: 'application/pdf' },
    images: [1, 2].map(offset => ({ id: base + offset, original_name: `photo-${offset}.png`, mime_type: 'image/png' })),
    note: 'Retained note' });
  const portion = { id: 31, export_id: 1, quantity: 1, pole_name: 'DC120', stage: 'OPERATING',
    installation_status: 'DONE', acceptance_status: 'PASSED', workflow_version: 5,
    acceptance_reports: { EQUIPMENT: report(11), INFRASTRUCTURE: report(21) } };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let data = {};
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'ADMIN',
      custom_data: { department: 'Phòng Setup và Vận hành' } } };
    else if (pathname.endsWith('/charging-stations')) data = [station];
    else if (pathname.endsWith('/charging-stations/501')) data = station;
    else if (pathname.endsWith('/fulfillment')) data = station.fulfillment;
    else if (pathname.endsWith('/deployments')) data = [portion];
    else if (pathname.endsWith('/deployments/31/actions')) {
      const body = request.postDataJSON();
      requests.push(body);
      portion.acceptance_status = body.action === 'acceptance-reset' ? 'NOT' : 'PASSED';
      portion.workflow_version++;
      data = [portion];
    }
    await route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } } });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'acceptance-test'));
  await page.goto('/admin/on-tram/nghiem-thu?tab=all');
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await page.getByRole('button', { name: 'Chuyển về Chưa nghiệm thu', exact: true }).click();
  await page.locator('form').last().getByRole('textbox').fill('Recheck installation');
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ action: 'acceptance-reset', expected_version: 5, reason: 'Recheck installation' });
  await page.getByRole('button', { name: 'Nghiệm thu đạt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nghiệm thu lắp đặt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ action: 'acceptance-passed', expected_version: 6,
    equipment: { file_id: 11, image_ids: [12, 13], note: 'Retained note' },
    infrastructure: { file_id: 21, image_ids: [22, 23], note: 'Retained note' } });
  expect(portion.stage).toBe('OPERATING');
});
