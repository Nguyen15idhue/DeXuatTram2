const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = 'http://signature-completion.test';
const build = path.resolve(process.env.SIGNATURE_COMPLETION_BUILD_DIR || 'dist');

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'SALES']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      let completed = false;
      let attempted = 0;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem('token', 'mock-completion-only'));
      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/')) {
          if (url.origin !== BASE) return route.abort();
          let filename = path.resolve(build, `.${decodeURIComponent(url.pathname)}`);
          assert.ok(filename.startsWith(`${build}${path.sep}`));
          if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename = path.join(build, 'index.html');
          const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
          return route.fulfill({ contentType: mime[path.extname(filename)] || 'application/octet-stream', body: fs.readFileSync(filename) });
        }
        const endpoint = url.pathname.replace(/^\/api/, '');
        let data = [];
        let meta = {};
        let total = 0;
        if (endpoint === '/auth/me') data = { user: { id: 1, full_name: 'UI fixture', role, custom_data: role === 'ADMIN' ? { department: 'Back Office' } : {} } };
        else if (endpoint === '/assistant/status') data = { enabled: false };
        else if (endpoint.includes('/notifications')) data = { unread_count: 0, notifications: [] };
        else if (endpoint === '/admin/proposal-signatures/71/complete-signing') {
          assert.equal(role, 'SUPER_ADMIN');
          assert.equal(request.method(), 'POST');
          assert.deepEqual(request.postDataJSON(), { reason: 'Đã kiểm tra hồ sơ ký ngoài hệ thống' });
          attempted++;
          if (attempted === 1) return route.fulfill({ status: 409, json: { success: false, message: 'Hồ sơ đang được xử lý ký; vui lòng thử lại' } });
          completed = true;
          data = { id: 71, status: 'SIGNATURE_PENDING', sign_status: 'DONE' };
        } else if (endpoint === '/admin/proposal-signatures') {
          data = [{ id: 71, ma_de_xuat: 'TEST_MANUAL_71', status: 'SIGNATURE_PENDING', signer_total: 0, signer_signed: 0, sign_status: completed ? 'DONE' : 'PENDING' }];
          total = 1;
          meta = { isSuperAdmin: role === 'SUPER_ADMIN', isAdmin: role !== 'SALES', isManager: role !== 'SALES', isBackOffice: role === 'ADMIN' };
        } else if (endpoint === '/admin/charging-stations/task-counts') data = { total: 0, counts: {} };
        else if (request.method() !== 'GET') throw new Error(`Unexpected mutation ${endpoint}`);
        return route.fulfill({ json: { success: true, data, meta, pagination: { total, page: 1, limit: 20, totalPages: 1 } } });
      });
      await page.goto(`${BASE}/admin/proposals/trinh-ky?tab=all`);
      await page.getByRole('button', { name: 'TEST_MANUAL_71', exact: true }).waitFor();
      const action = page.getByRole('button', { name: 'Đã hoàn tất ký', exact: true });
      assert.equal(await action.count(), role === 'SUPER_ADMIN' ? 1 : 0);
      if (role === 'SUPER_ADMIN') {
        await action.click();
        const dialog = page.locator('dialog').filter({ hasText: 'Xác nhận đã hoàn tất ký' });
        const confirm = dialog.getByRole('button', { name: 'Đã hoàn tất ký', exact: true });
        assert.ok(await confirm.isDisabled());
        await dialog.locator('textarea').fill('Đã kiểm tra hồ sơ ký ngoài hệ thống');
        await confirm.click();
        await dialog.getByText('Hồ sơ đang được xử lý ký; vui lòng thử lại', { exact: true }).waitFor();
        await confirm.click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await action.count(), 0);
        const row = page.locator('tr').filter({ hasText: 'TEST_MANUAL_71' });
        await row.getByText('Đã hoàn thành', { exact: true }).waitFor();
        await row.getByRole('button', { name: 'Upload file đã ký', exact: true }).waitFor();
        assert.equal(attempted, 2);
      } else assert.equal(attempted, 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS SUPER_ADMIN-only completion, reason required, explicit failure/retry, DONE with no configs, upload remains available; ADMIN/SALES hidden; no runtime errors');
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
