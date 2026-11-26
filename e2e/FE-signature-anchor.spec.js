const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { PDFDocument } = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'pdf-lib'));

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('dò từng tài liệu và giữ vị trí đã chọn khi dò lại', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  const pdfBytes = Buffer.from(await pdf.save());
  const calls = [];
  let redetect = false;
  const files = [101, 102, 103, 104].map(id => ({ id, original_name: `${id}.pdf`, mime_type: 'application/pdf' }));
  const docs = files.map((file, index) => ({
    id: 11 + index, conversion_status: 'READY', signing_file: file, source_file: file, signers: [],
    has_signature_draft: index === 3
  }));
  const candidates = [
    { id: 7, full_name: 'Signer One', category: 'Người phụ trách' },
    { id: 8, full_name: 'Signer Two', category: 'Back Office' }
  ];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (/\/files\/\d+\/preview$/.test(url.pathname)) return route.fulfill({ contentType: 'application/pdf', body: pdfBytes });
    let data = [];
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (url.pathname.endsWith('/admin/proposal-approvals/501')) data = { id: 501, ma_de_xuat: 'TEST', status: 'PROPOSAL_REPORT_REVIEWING' };
    else if (url.pathname.endsWith('/signer-candidates')) data = { candidates };
    else if (url.pathname.endsWith('/signature-config')) data = { documents: docs, signers: [] };
    else if (url.pathname.endsWith('/signature-anchors')) {
      const id = Number(url.searchParams.get('document_id'));
      calls.push(id);
      if (id === 13 && redetect) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'PDF không sẵn sàng' }) });
      if (id === 13) data = { reason: 'missing_snapshot', anchors: [], candidates };
      else {
        const signer = id === 11 || id === 14 ? candidates[0] : candidates[1];
        data = { candidates, anchors: [{ anchor_token: `sign_${id}`, found: true, user_id: signer.id, user_name: signer.full_name,
          page: id === 11 && redetect ? 2 : 1, pos_x: id === 11 && redetect ? 0.6 : 0.1,
          pos_y: 0.2, box_width: 0.3, box_height: 0.1 }] };
      }
    } else if (url.pathname.endsWith('/assistant/status')) data = {};
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'anchor-ui-test'));
  await page.goto('/admin/proposals/duyet-bcdx/501/cau-hinh-ky');
  await expect(page.getByRole('button', { name: /Signer One.*trang 1/ })).toBeVisible();
  expect([...new Set(calls)].sort()).toEqual([11, 12, 13, 14]);
  redetect = true;
  await page.getByRole('button', { name: 'Cập nhật lại ô ký' }).click();
  await expect(page.getByRole('button', { name: /Signer One.*trang 1/ })).toBeVisible();
  const select = page.getByLabel('Tài liệu cấu hình ký');
  await select.selectOption('102');
  await expect(page.getByRole('button', { name: /Signer Two.*trang 1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Signer One.*trang 1/ })).toHaveCount(0);
  await select.selectOption('103');
  await expect(page.getByText('Tài liệu không có cấu hình mẫu đã lưu; vui lòng chọn người ký và vị trí thủ công.')).toBeVisible();
  await page.getByRole('button', { name: 'Cập nhật lại ô ký' }).click();
  await expect(page.getByText('PDF không sẵn sàng')).toBeVisible();
  await select.selectOption('104');
  await expect(page.getByRole('button', { name: /Signer One.*trang 1/ })).toHaveCount(0);
});
