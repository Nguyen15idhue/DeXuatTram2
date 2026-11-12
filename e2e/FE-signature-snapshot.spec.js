const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { PDFDocument } = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'pdf-lib'));

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const missing of [false, true]) {
  test(`signed overlay ${missing ? 'explicitly reports missing historical image' : 'renders preserved historical image without offering to sign again'}`, async ({ page }) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 800]);
    const pdfBytes = Buffer.from(await pdf.save());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const signer = {
      id: 21, user_id: 1, document_id: 11, status: 'SIGNED', signature_id: 99,
      full_name: 'Historical Signer', signed_at: '2026-11-11T00:00:00Z',
      page: 1, pos_x: 0.1, pos_y: 0.2, box_width: 0.5, box_height: 0.25
    };
    const file = { id: 101, original_name: 'historical.pdf', mime_type: 'application/pdf' };
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const apiPath = url.pathname;
      if (apiPath.includes('/signature-image/')) {
        return route.fulfill(missing
          ? { status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Missing image' }) }
          : { contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      }
      if (apiPath.endsWith('/files/101/preview')) {
        return route.fulfill({ contentType: 'application/pdf', body: pdfBytes });
      }
      let data = [];
      if (apiPath.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
      else if (apiPath.endsWith('/admin/proposal-signatures/501')) data = {
        id: 501, ma_de_xuat: 'TEST-SNAPSHOT', status: 'SIGNATURE_PENDING', owner_name: 'Test',
        signer_total: 1, signer_signed: 1, has_signature: false, can_sign: false, signers: [signer],
        report_files: [file], documents: [{ id: 11, conversion_status: 'READY', signing_file: file,
          source_file: file, signers: [signer], can_sign: false }]
      };
      else if (apiPath.endsWith('/assistant/status')) data = {};
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.addInitScript(() => localStorage.setItem('token', 'snapshot-ui-test'));
    await page.goto('/admin/proposals/ky-bcdx/501');
    const overlay = page.locator('[data-signer-overlay-id="21"]');
    await expect(overlay).toBeVisible({ timeout: 20000 });
    if (missing) {
      await expect(overlay.getByRole('alert')).toHaveText('Không tải được ảnh chữ ký đã ký');
    } else {
      const image = overlay.getByRole('img', { name: 'Chữ ký Historical Signer' });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    }
    await expect(overlay.getByText('Chờ ký', { exact: true })).toHaveCount(0);
    await expect(overlay.getByRole('button', { name: 'Ký ngay' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
