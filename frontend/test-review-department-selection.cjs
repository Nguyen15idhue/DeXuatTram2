const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: __dirname, server: { host: '127.0.0.1', port: 0, open: false } });
  let browser;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', (route) => route.fulfill({ json: { success: true, data: { enabled: false } } }));
    await page.goto(`${base}/login`);
    await page.evaluate(async () => {
      const source = await (await fetch('/src/main.jsx')).text();
      const reactUrl = source.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
      const domUrl = source.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1];
      const [{ default: React }, { default: ReactDOM }, { default: Dialog }] = await Promise.all([
        import(reactUrl), import(domUrl), import('/src/components/admin/ReviewActionDialog.jsx'),
      ]);
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = ReactDOM.createRoot(host);
      window.confirmed = [];
      window.mountReview = (isOpen, allowQH = true, allowPL = true) => root.render(
        React.createElement(React.StrictMode, null, React.createElement(Dialog, {
          isOpen, allowQH, allowPL, showDepartmentSelection: true,
          title: 'Yêu cầu chấm điểm lại', confirmText: 'Tạo yêu cầu',
          onClose: () => window.mountReview(false),
          onConfirm: (reason, options) => window.confirmed.push({ reason, ...options }),
        })),
      );
      window.mountReview(true);
    });
    const dialog = page.locator('dialog.modal-open');
    const reason = dialog.locator('textarea');
    const select = dialog.locator('select');
    const confirm = dialog.getByRole('button', { name: 'Tạo yêu cầu', exact: true });
    await select.waitFor();
    assert.equal(await select.inputValue(), '');
    assert.equal(await confirm.isDisabled(), true);
    await reason.fill('Lý do cần chấm lại');
    assert.equal(await confirm.isDisabled(), true);
    await select.selectOption('QH');
    assert.equal(await confirm.isEnabled(), true);
    await reason.fill('   ');
    assert.equal(await confirm.isDisabled(), true);
    await reason.fill('  Chấm lại Quy hoạch  ');
    await confirm.click();
    assert.deepEqual(await page.evaluate(() => window.confirmed), [{ reason: 'Chấm lại Quy hoạch', departments: ['QH'] }]);
    await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.evaluate(() => window.mountReview(true));
    await select.waitFor();
    assert.equal(await select.inputValue(), '');
    assert.equal(await reason.inputValue(), '');
    for (const [allowQH, allowPL, value] of [[true, false, 'QH'], [false, true, 'PL'], [true, true, 'BOTH']]) {
      await page.evaluate(([qh, pl]) => window.mountReview(true, qh, pl), [allowQH, allowPL]);
      await page.waitForFunction(() => document.querySelector('dialog select')?.value === '');
      assert.equal(await confirm.isDisabled(), true);
      assert.equal(await select.locator('option[value="QH"]').count(), Number(allowQH));
      assert.equal(await select.locator('option[value="PL"]').count(), Number(allowPL));
      await reason.fill('Yêu cầu đánh giá lại');
      assert.equal(await confirm.isDisabled(), true);
      await select.selectOption(value);
      await confirm.click();
      const last = await page.evaluate(() => window.confirmed.at(-1));
      assert.deepEqual(last.departments, value === 'BOTH' ? ['QH', 'PL'] : [value]);
    }
    await page.evaluate(() => window.mountReview(true, false, false));
    await dialog.getByText('Chưa có phòng nào chấm điểm để yêu cầu chấm lại.', { exact: true }).waitFor();
    await reason.fill('Không có phòng hợp lệ');
    assert.equal(await confirm.isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS empty default, reason+department required, reopen reset, QH/PL/BOTH payloads, unscored departments excluded, no runtime errors');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
