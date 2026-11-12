const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXV0AAAAASUVORK5CYII=', 'base64');
const file = (name, mimeType, buffer = Buffer.from('fixture')) => ({ name, mimeType, buffer });

async function setup(page, { failSecond = false } = {}) {
  const uploads = [];
  const payloads = [];
  const errors = [];
  const stored = [];
  let failed = false;
  let finished = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'chairman-fixture'));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let data = [];
    let meta;
    let pagination;
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'Tester', custom_data: {} } };
    else if (path.endsWith('/admin/proposal-signatures')) {
      data = [{ id: 501, ma_de_xuat: 'BCDX-501', status: finished ? 'APPROVED' : 'SIGNATURE_PENDING',
        sign_status: finished ? 'CEO_SIGNED' : 'DONE', custom_data: {}, can_sign: false }];
      meta = { isSuperAdmin: true, isManager: true, can_handle_chairman: true, can_view_chairman_tab: true };
      pagination = { page: 1, total: 1, totalPages: 1 };
    } else if (path.endsWith('/admin/proposal-signatures/501')) {
      data = { id: 501, ma_de_xuat: 'BCDX-501', owner_name: 'Tester', custom_data: {}, documents: [], signers: [],
        status: finished ? 'APPROVED' : 'SIGNATURE_PENDING', sign_status: finished ? 'CEO_SIGNED' : 'DONE',
        signed_file_id: finished ? stored[0]?.id : null, can_upload_signed: !finished,
        chairman_files: finished ? stored : [], report_files: [] };
    } else if (path.endsWith('/files/upload')) {
      const body = request.postDataBuffer().toString('latin1');
      const name = /filename="([^"]+)"/.exec(body)?.[1];
      uploads.push(name);
      if (failSecond && name === 'report.docx' && !failed) {
        failed = true;
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Upload report.docx lỗi' }) });
      }
      const mime = name.endsWith('.png') ? 'image/png' : name.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
      data = { id: 100 + stored.length, original_name: name, mime_type: mime, size: 100 };
      stored.push(data);
    } else if (path.endsWith('/signed-file')) {
      payloads.push(request.postDataJSON());
      finished = true;
      data = { id: 501, status: 'APPROVED', signed_file_id: stored[0]?.id, chairman_files: stored };
    } else if (path.endsWith('/chairman-files')) {
      const selected = stored.find(item => String(item.id) === url.searchParams.get('file_id'));
      const name = selected?.original_name || 'chairman-files.zip';
      return route.fulfill({ contentType: selected?.mime_type || 'application/zip',
        headers: { 'Content-Disposition': `attachment; filename="${name}"` }, body: selected ? png : Buffer.from('PK-fixture') });
    } else if (/\/files\/\d+\/(download|image)/.test(path)) {
      return route.fulfill({ contentType: 'image/png', body: png });
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, meta, pagination }) });
  });
  await page.goto('/admin/proposals/trinh-ky?tab=chairman');
  await page.getByRole('button', { name: 'Upload file chủ tịch', exact: true }).click();
  await expect(page.locator('input[type=file]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Xác nhận upload' })).toBeDisabled();
  return { uploads, payloads, errors, stored };
}

for (const mobile of [false, true]) {
  test(`shared mixed-file upload preserves successful uploads and retries only failures: ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const fixture = await setup(page, { failSecond: true });
    await page.locator('input[type=file]').setInputFiles([
      file('photo.png', 'image/png', png),
      file('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ]);
    await expect(page.getByText('Đã chọn 1/20 file.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xác nhận upload' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'photo.png', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Thử tải lại các file còn lỗi' }).click();
    await expect(page.getByText('Đã chọn 2/20 file.', { exact: false })).toBeVisible();
    expect(fixture.uploads).toEqual(['photo.png', 'report.docx', 'report.docx']);
    await page.locator('input[type=file]').setInputFiles(file('final.pdf', 'application/pdf'));
    await expect(page.getByText('Đã chọn 3/20 file.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'photo.png', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Phóng to ảnh' })).toBeVisible();
    await page.locator('.legacy-modal').getByRole('button', { name: '✕', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận upload' }).click();
    await expect.poll(() => fixture.payloads.length).toBe(1);
    expect(fixture.payloads[0]).toEqual({ files: [{ id: 100 }, { id: 101 }, { id: 102 }] });
    await page.goto('/admin/proposals/trinh-ky/501');
    await expect(page.getByRole('heading', { name: 'File BCĐX chủ tịch đã ký (3)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload file chủ tịch đã ký', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tải nguyên bản', exact: true })).toHaveCount(3);
    const originalDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải nguyên bản', exact: true }).first().click();
    expect((await originalDownload).suggestedFilename()).toBe('photo.png');
    const zipDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải tất cả file chủ tịch (ZIP)' }).click();
    expect((await zipDownload).suggestedFilename()).toBe('chairman-files.zip');
    expect(fixture.errors).toEqual([]);
  });
}

test('enforces max 20 files and exact 10MB; rejects unsupported types before API upload', async ({ page }) => {
  const fixture = await setup(page);
  const input = page.locator('input[type=file]');
  await input.setInputFiles(Array.from({ length: 21 }, (_, index) => file(`${index}.pdf`, 'application/pdf')));
  await expect(page.getByText('Chỉ được tải tối đa 20 file', { exact: true })).toBeVisible();
  expect(fixture.uploads).toEqual([]);
  await input.setInputFiles(file('too-big.pdf', 'application/pdf', Buffer.alloc(10 * 1024 * 1024 + 1)));
  await expect(page.getByText('File "too-big.pdf" vượt quá 10MB', { exact: true })).toBeVisible();
  await input.setInputFiles(file('script.svg', 'image/svg+xml'));
  await expect(page.getByText('File "script.svg" không đúng định dạng được chấp nhận', { exact: true })).toBeVisible();
  expect(fixture.uploads).toEqual([]);
  await input.setInputFiles(file('boundary.pdf', 'application/pdf', Buffer.alloc(10 * 1024 * 1024)));
  await expect(page.getByText('Đã chọn 1/20 file.', { exact: false })).toBeVisible();
  await input.setInputFiles(Array.from({ length: 19 }, (_, index) => file(`${index}.pdf`, 'application/pdf')));
  await expect(page.getByText('Đã chọn 20/20 file.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận upload' })).toBeEnabled();
  await input.setInputFiles(file('over-count.pdf', 'application/pdf'));
  await expect(page.getByText('Chỉ được tải tối đa 20 file', { exact: true })).toBeVisible();
  expect(fixture.uploads.length).toBe(20);
  expect(fixture.errors).toEqual([]);
});
