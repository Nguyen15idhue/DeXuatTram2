const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const retry of [false, true]) {
test(`contract modal defaults today, validates dates and uploads multiple files${retry ? ' with retry' : ''}`, async ({ page }) => {
  const errors = [];
  let uploaded = 0;
  let uploadFailed = false;
  const completed = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url());
    let data = {};
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (pathname.endsWith('/charging-stations')) data = [{
      id: 501, ma_tram: 'ON-501', proposal_id: 77, status: 'ONBOARDING',
      contract_status: 'DOING', can_update_contract: true
    }];
    else if (pathname.endsWith('/files/upload')) {
      if (retry && uploaded === 1 && !uploadFailed) {
        uploadFailed = true;
        return route.fulfill({ status: 500, contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Upload interrupted' }) });
      }
      data = { id: 100 + ++uploaded };
    }
    else if (pathname.endsWith('/contract/complete')) {
      completed.push(route.request().postDataJSON());
    }
    await route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'contract-test'));
  await page.goto('/admin/on-tram/khoi-tao-hop-dong');
  await page.getByRole('button', { name: 'Tải file hợp đồng', exact: true }).click();
  const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  await expect(page.getByRole('textbox', { name: 'Ghi chú', exact: true })).toBeVisible();
  await expect(page.getByLabel('Ngày hiệu lực hợp đồng', { exact: true })).toHaveValue(today);
  await page.locator('#contract-files').setInputFiles([
    { name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') },
    { name: 'annex.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('mock docx') }
  ]);
  await page.getByLabel('Ngày hiệu lực hợp đồng', { exact: true }).fill('2026-11-12');
  await page.getByRole('button', { name: 'Xác nhận tải lên' }).click();
  await expect(page.getByText('Vui lòng nhập ngày hiệu lực và ngày hết hạn hợp đồng')).toBeVisible();
  await page.getByLabel('Ngày hết hạn hợp đồng', { exact: true }).fill('2026-11-12');
  await page.getByRole('button', { name: 'Xác nhận tải lên' }).click();
  await expect(page.getByText('Ngày hết hạn hợp đồng phải sau ngày hiệu lực hợp đồng')).toBeVisible();
  expect(uploaded).toBe(0);
  await page.getByLabel('Ngày hết hạn hợp đồng', { exact: true }).fill('2027-11-12');
  await page.getByRole('textbox', { name: 'Ghi chú', exact: true }).fill('Hợp đồng và phụ lục');
  await page.getByRole('button', { name: 'Xác nhận tải lên' }).click();
  if (retry) {
    await expect(page.getByText('Upload interrupted')).toBeVisible();
    expect(uploaded).toBe(1);
    await page.getByRole('button', { name: 'Xác nhận tải lên' }).click();
  }
  await expect(page.locator('#contract-files')).toHaveCount(0);
  expect(uploaded).toBe(2);
  expect(completed).toEqual([{
    file_ids: [101, 102], contract_effective_date: '2026-11-12',
    contract_expiry_date: '2027-11-12', contract_note: 'Hợp đồng và phụ lục'
  }]);
  expect(errors).toEqual([]);
});
}

test('contract detail displays every attachment and saved dates and note', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url());
    let data = {};
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN' } };
    else if (pathname.endsWith('/charging-stations/501')) data = {
      id: 501, ma_tram: 'ON-501', proposal_id: 77, status: 'ONBOARDING', contract_status: 'DONE',
      contract_effective_date: '2026-11-12', contract_expiry_date: '2027-11-12',
      contract_note: 'Hợp đồng và phụ lục',
      contract_files: [
        { id: 101, original_name: 'contract.pdf', mime_type: 'application/pdf' },
        { id: 102, original_name: 'annex.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
      ]
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'contract-detail-test'));
  await page.goto('/admin/on-tram/khoi-tao-hop-dong/501');
  await expect(page.getByRole('button', { name: 'contract.pdf', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'annex.docx', exact: true })).toBeVisible();
  await expect(page.locator('div').filter({ has: page.locator('dt', { hasText: 'Ngày hiệu lực hợp đồng' }) }).filter({ hasText: '12/11/2026' }).last()).toBeVisible();
  await expect(page.getByText('12/11/2027', { exact: true })).toBeVisible();
  await expect(page.getByText('Hợp đồng và phụ lục', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
