const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { PDFDocument } = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'pdf-lib'));

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5187' });

test('GĐKV chọn, thay, xóa và căn ô ký trên PDF xem thử trước khi gửi duyệt', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  pdf.addPage([600, 800]);
  const bytes = Buffer.from(await pdf.save());
  let submitted;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const req = route.request();
    const name = new URL(req.url()).pathname;
    let data = [];
    if (name.endsWith('/auth/me')) data = { user: { id: 1, role: 'SALES', full_name: 'GĐKV Test' } };
    else if (name.endsWith('/admin/proposal-reports')) data = [{ id: 4, ma_de_xuat: 'DX-4', status: 'PROPOSAL_REPORT_CREATING', can_upload: true, custom_data: {} }];
    else if (name.endsWith('/generation-options')) data = {
      templates: [{ id: 10, name: 'Mẫu', fields: [], input_fields: [] }],
      draft: { chot_so_luong_tru: [{ mo_hinh: 'LK', so_luong: 1, loai_tru: 'DC60' }], ngay_du_kien_on: '2026-12-01', revision: 'r' }
    };
    else if (name.endsWith('/generation-draft')) data = { chot_so_luong_tru: [{ mo_hinh: 'LK', so_luong: 1, loai_tru: 'DC60' }], revision: 'r' };
    else if (name.endsWith('/generation-preview')) data = {
      pdf: bytes.toString('base64'), proof: 'proof', warnings: [], blocking: [],
      signature_anchors: { anchors: [{ anchor_token: 'sign_gdkv', found: true, user_id: 7, user_name: 'Signer One',
        page: 1, pos_x: 0.1, pos_y: 0.2, box_width: 0.3, box_height: 0.15 }],
        candidates: [{ id: 7, full_name: 'Signer One' }, { id: 8, full_name: 'Signer Two' }, { id: 9, full_name: 'Signer Three' }] }
    };
    else if (name.endsWith('/generate')) {
      submitted = req.postData();
      data = { id: 4, status: 'PROPOSAL_REPORT_REVIEWING' };
    } else if (name.endsWith('/filter-options')) data = { owners: [], managers: [], provinces: [], models: [], regions: [] };
    else if (name.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (name.endsWith('/assistant/status')) data = {};
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, pagination: { page: 1, total: 1, totalPages: 1, limit: 20 } }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'report-preview-test'));
  await page.goto('/admin/proposals/lap-to-trinh?tab=all');
  await page.getByRole('button', { name: 'Xem thử mẫu' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mẫu BCĐX').selectOption('10');
  await dialog.getByRole('button', { name: 'Lưu trụ, ngày ON và xem thử PDF' }).click();
  const overlay = dialog.locator('[data-signer-overlay-id="7"]');
  await expect(overlay).toBeVisible();
  await dialog.getByLabel('Chọn người ký').selectOption('9');
  await dialog.getByRole('button', { name: 'Thêm người ký' }).click();
  await dialog.getByRole('button', { name: 'Lưu trụ, ngày ON và xem thử PDF' }).click();
  await expect(dialog.locator('[data-signer-overlay-id="9"]')).toHaveCount(0);
  await expect(overlay).toBeVisible();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 65, { steps: 5 });
  await page.mouse.up();
  expect(parseFloat(await overlay.evaluate(node => node.style.left))).toBeGreaterThan(10);
  const widthBefore = parseFloat(await overlay.evaluate(node => node.style.width));
  const handle = await overlay.locator('span.cursor-nwse-resize').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 30, handle.y + 20, { steps: 4 });
  await page.mouse.up();
  expect(parseFloat(await overlay.evaluate(node => node.style.width))).toBeGreaterThan(widthBefore);
  await dialog.getByLabel('Chọn người ký').selectOption('8');
  await dialog.getByRole('button', { name: 'Thêm người ký' }).click();
  await expect(dialog.locator('[data-signer-overlay-id="8"]')).toBeVisible();
  await dialog.getByLabel('Trang ký của Signer Two').fill('2');
  await expect(dialog.locator('[data-proposal-overlay-page="2"] [data-signer-overlay-id="8"]')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Người ký Signer One', exact: true }).selectOption('9');
  await expect(dialog.locator('[data-signer-overlay-id="7"]')).toHaveCount(0);
  await expect(dialog.locator('[data-signer-overlay-id="9"]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Xóa người ký Signer Two' }).click();
  await expect(dialog.locator('[data-signer-overlay-id="8"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Xác nhận gửi duyệt' }).click();
  await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
  await expect.poll(() => submitted).toContain('"user_id":9');
  expect(submitted).not.toContain('"user_id":8');
  expect(submitted).toContain('"anchor_token":null');
  expect(Number(submitted.match(/"pos_x":([0-9.]+)/)[1])).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});
