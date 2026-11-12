const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { PDFDocument } = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'pdf-lib'));
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const scenario of ['repair', 'admin', 'intact', 'failure']) {
  test(`signature recovery on detail page: ${scenario}`, async ({ page }) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 800]);
    const pdfBytes = Buffer.from(await pdf.save());
    const errors = [];
    page.on('pageerror', cause => errors.push(cause.message));
    let repaired = false;
    let posted = 0;
    let statusCalls = 0;
    const signer = { id: 21, user_id: 7, document_id: 11, status: 'SIGNED', signature_id: 99,
      full_name: 'Historical Signer', signed_at: '2026-11-11T00:00:00Z',
      page: 1, pos_x: 0.1, pos_y: 0.2, box_width: 0.5, box_height: 0.25 };
    const file = { id: 101, original_name: 'test.pdf', mime_type: 'application/pdf' };
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const apiPath = url.pathname;
      if (apiPath.endsWith('/files/101/preview')) return route.fulfill({ contentType: 'application/pdf', body: pdfBytes });
      if (apiPath.includes('/signature-image/')) {
        return route.fulfill({ contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      }
      let data = [];
      if (apiPath.endsWith('/auth/me')) data = { user: { id: 1, role: scenario === 'admin' ? 'ADMIN' : 'SUPER_ADMIN', full_name: 'Test' } };
      else if (apiPath.endsWith('/admin/proposal-signatures/501')) data = {
        id: 501, ma_de_xuat: 'TEST', status: 'SIGNATURE_PENDING', owner_name: 'Test',
        signer_total: 1, signer_signed: 1, can_sign: false, signers: [signer], custom_data: {},
        report_files: [file], documents: [{ id: 11, conversion_status: 'READY', signing_file: file,
          source_file: file, signers: [signer], can_sign: false }]
      };
      else if (apiPath.endsWith('/signature-repair/21')) {
        if (request.method() === 'POST') {
          posted++;
          expect(request.postDataJSON()).toEqual({ reason: 'Approved recovery' });
          if (scenario === 'failure') {
            return route.fulfill({ status: 409, contentType: 'application/json',
              body: JSON.stringify({ success: false, message: 'Ảnh đã được phục hồi bởi phiên khác' }) });
          }
          repaired = true;
          data = { config_id: 21 };
        } else {
          statusCalls++;
          data = { can_repair: scenario !== 'intact' && !repaired, repaired_at: repaired ? '2026-11-12T00:00:00Z' : null };
        }
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.addInitScript(() => localStorage.setItem('token', 'repair-ui-test'));
    await page.goto('/admin/proposals/trinh-ky/501');
    await expect(page.getByRole('heading', { name: /Người ký/ })).toBeVisible({ timeout: 20000 });
    const action = page.getByRole('button', { name: 'Lấy chữ ký mới nhất' });
    if (['admin', 'intact'].includes(scenario)) {
      if (scenario === 'intact') await expect.poll(() => statusCalls).toBeGreaterThan(0);
      await expect(action).toHaveCount(0);
      expect(posted).toBe(0);
      if (scenario === 'admin') expect(statusCalls).toBe(0);
    } else {
      await action.click();
      const dialog = page.locator('.modal-box').filter({ hasText: 'Phục hồi ảnh chữ ký bị mất' });
      await expect(dialog.getByRole('button', { name: 'Xác nhận phục hồi' })).toBeDisabled();
      await dialog.getByLabel('Lý do phục hồi chữ ký').fill('Approved recovery');
      await dialog.getByRole('button', { name: 'Xác nhận phục hồi' }).click();
      if (scenario === 'failure') {
        await expect(dialog.getByRole('alert')).toHaveText('Ảnh đã được phục hồi bởi phiên khác');
      } else {
        await expect(dialog).toHaveCount(0);
        await expect(page.getByText(/Ảnh phục hồi từ chữ ký mới:/)).toBeVisible();
        await expect(action).toHaveCount(0);
        expect(signer.signed_at).toBe('2026-11-11T00:00:00Z');
      }
      expect(posted).toBe(1);
    }
    expect(errors).toEqual([]);
  });
}
