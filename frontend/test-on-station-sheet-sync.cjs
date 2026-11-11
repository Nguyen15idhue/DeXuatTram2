const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: __dirname, server: { host: '127.0.0.1', port: 0, open: false } });
  let browser;
  let role = 'SUPER_ADMIN';
  let failStatus = false;
  let failSync = false;
  let syncCalls = 0;
  const status = {
    configured: true, activeProposals: 3, tabName: 'ON',
    queue: { pending: 0, processing: 0, failed: 2 },
    recentErrors: [{ proposal_id: 800, last_error: 'Đề xuất 800: thiếu bảng trụ chốt BCĐX' }],
  };
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me')) {
        return route.fulfill({ json: { success: true, data: { user: { id: 7, full_name: 'Sheet fixture', role } } } });
      }
      if (path.includes('/on-station-sheet-sync/')) {
        if (route.request().method() === 'POST') {
          syncCalls++;
          return route.fulfill({ json: failSync
            ? { success: false, message: 'Sensitive backend failure' }
            : { success: true, message: 'Đã xếp đồng bộ Sheet trạm ON', data: {} } });
        }
        return route.fulfill({ json: failStatus
          ? { success: false, message: 'Sensitive status failure' }
          : { success: true, data: status } });
      }
      return route.fulfill({ json: { success: true, data: { enabled: false } } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/login`);
    await page.evaluate(async () => {
      localStorage.setItem('token', 'sheet-fixture-only');
      document.getElementById('root').style.display = 'none';
      const main = await (await fetch('/src/main.jsx')).text();
      const reactUrl = main.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
      const domUrl = main.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1];
      const [{ default: React }, { default: ReactDOM }, { AuthProvider }, { default: SyncButton }] = await Promise.all([
        import(reactUrl), import(domUrl), import('/src/contexts/AuthContext.jsx'),
        import('/src/components/admin/OnStationSheetSyncButton.jsx'),
      ]);
      const host = document.createElement('div');
      host.id = 'sheet-fixture';
      document.body.appendChild(host);
      const root = ReactDOM.createRoot(host);
      let sequence = 0;
      window.mountSheet = () => root.render(React.createElement(AuthProvider, { key: ++sequence },
        React.createElement(SyncButton)));
      window.mountSheet();
    });
    const fixture = page.locator('#sheet-fixture');
    await fixture.getByRole('button', { name: 'Đồng bộ Sheet trạm ON', exact: true }).waitFor();
    await fixture.getByRole('alert').filter({ hasText: 'Có 2 mục đồng bộ chưa thành công' }).waitFor();
    assert.equal(await fixture.getByText('Đề xuất 800', { exact: false }).count(), 0);
    await fixture.getByRole('button').click();
    await fixture.getByText('Đã xếp đồng bộ Sheet trạm ON', { exact: true }).waitFor();
    assert.equal(syncCalls, 1);
    failSync = true;
    await fixture.getByRole('button', { name: 'Đồng bộ Sheet trạm ON', exact: true }).click();
    await fixture.getByText('Không thể bắt đầu đồng bộ Sheet trạm ON.', { exact: false }).waitFor();
    assert.equal((await fixture.innerText()).includes('Sensitive backend failure'), false);
    failStatus = true;
    await page.evaluate(() => window.mountSheet());
    await fixture.getByRole('alert').filter({ hasText: 'Không tải được trạng thái đồng bộ' }).waitFor();
    assert.equal((await fixture.innerText()).includes('Sensitive status failure'), false);
    failStatus = false;
    role = 'SALES';
    await page.evaluate(() => window.mountSheet());
    await page.waitForTimeout(1000);
    assert.equal(await fixture.getByRole('button').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: generic errors, sync API, hidden technical details, admin-only button, no runtime errors');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
