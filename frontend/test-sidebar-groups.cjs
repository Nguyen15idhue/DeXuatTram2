const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: __dirname, server: { host: '127.0.0.1', port: 0, open: false } });
  let browser;
  let user = { id: 7, full_name: 'Sidebar fixture', role: 'SUPER_ADMIN' };
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith('/auth/me') ? { user }
        : path.endsWith('/task-counts') && path.includes('charging-stations')
          ? { total: 6, counts: { contract: 1, infrastructure: 1, delivery: 1, installation: 1, acceptance: 1, on_station: 1, finance: 4 } }
          : { enabled: false, total: 3 };
      return route.fulfill({ json: { success: true, data, pagination: { total: 2 } } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/login`);
    await page.evaluate(async () => {
      localStorage.setItem('token', 'sidebar-mock-only');
      localStorage.removeItem('admin-sidebar-groups-v2');
      localStorage.setItem('admin-sidebar-groups', JSON.stringify(['perms']));
      document.getElementById('root').style.display = 'none';
      const source = await (await fetch('/src/components/layout/AdminSidebar.jsx')).text();
      const main = await (await fetch('/src/main.jsx')).text();
      const reactUrl = main.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
      const domUrl = main.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1];
      const routerUrl = source.match(/from "([^"]*react-router-dom[^"]*)"/)[1];
      const [{ default: React }, { default: ReactDOM }, { BrowserRouter }, { AuthProvider }, { default: Sidebar }] = await Promise.all([
        import(reactUrl), import(domUrl), import(routerUrl), import('/src/contexts/AuthContext.jsx'),
        import('/src/components/layout/AdminSidebar.jsx'),
      ]);
      const host = document.createElement('div');
      host.id = 'sidebar-fixture';
      document.body.appendChild(host);
      const root = ReactDOM.createRoot(host);
      let sequence = 0;
      window.navClicks = 0;
      window.mountSidebar = (path) => {
        history.replaceState(null, '', path);
        root.render(React.createElement(AuthProvider, { key: ++sequence },
          React.createElement(BrowserRouter, null, React.createElement(Sidebar, {
            showBell: false, onNavClick: () => { window.navClicks++; },
          }))));
      };
      window.mountSidebar('/admin/proposals/yeu-cau-cham-diem-lai/701');
    });
    const nav = page.locator('#sidebar-fixture nav');
    const group = (name) => nav.locator(`button[title="${name}"]`);
    try {
      await nav.locator('a[href="/admin/proposals/yeu-cau-cham-diem-lai"]').waitFor();
    } catch (error) {
      console.error('Sidebar fixture:', await page.locator('#sidebar-fixture').textContent(), errors);
      throw error;
    }
    assert.deepEqual(await nav.locator(':scope > div > button').allTextContents(),
      ['Tổng quan', 'Vận hành', 'Khách hàng', 'Hệ thống', 'Khác', 'Trường thông tin', 'Dữ liệu']);
    for (const name of ['Khách hàng', 'Hệ thống', 'Khác', 'Trường thông tin', 'Dữ liệu']) {
      assert.equal(await group(name).getAttribute('aria-expanded'), 'false');
    }
    assert.equal(await group('Vận hành').getAttribute('aria-expanded'), 'true');
    assert.equal(await group('Tổng quan').getAttribute('aria-expanded'), 'true');
    assert.equal(await group('Quản lý Đề xuất').getAttribute('aria-expanded'), 'true');
    assert.ok((await nav.locator('a[href="/admin/proposals/yeu-cau-cham-diem-lai"]').getAttribute('class')).includes('bg-primary'));
    await nav.getByTitle('14 công việc cần thực hiện trong Quản lý Đề xuất', { exact: true }).waitFor();
    await nav.getByTitle('6 công việc cần thực hiện trong Quản lý ON trạm', { exact: true }).waitFor();
    await nav.getByTitle('4 công việc Tài chính ON trạm', { exact: true }).waitFor();
    for (const name of ['Khách hàng', 'Hệ thống', 'Khác', 'Trường thông tin', 'Dữ liệu']) await group(name).click();
    const hrefs = await nav.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    assert.equal(new Set(hrefs).size, hrefs.length);
    assert.equal(hrefs.includes('/admin/reports'), false);
    assert.equal(hrefs.includes('/admin/audit-log'), false);
    assert.equal(await nav.locator('a[href="/admin/roles"]').count(), 1);
    assert.equal(await nav.locator('a[href="/admin/stations"]').textContent(), 'Quản lý quy hoạch');
    assert.deepEqual(await nav.locator('#sidebar-group-overview a').allTextContents(), ['Dashboard', 'Xuất Excel']);
    assert.deepEqual(await nav.locator('#sidebar-group-system a').allTextContents(),
      ['Quản lý Users', 'Quản lý Chữ ký số', 'Quản lý lịch làm việc', 'Phân quyền']);
    await group('Vận hành').click();
    await group('Tổng quan').click();
    assert.equal(await group('Vận hành').getAttribute('aria-expanded'), 'false');
    assert.equal(await group('Tổng quan').getAttribute('aria-expanded'), 'false');
    await page.evaluate(() => window.mountSidebar('/admin/on-tram/giao-tru/701'));
    await nav.locator('a[href="/admin/on-tram/giao-tru"]').waitFor();
    assert.equal(await group('Vận hành').getAttribute('aria-expanded'), 'true');
    assert.equal(await group('Tổng quan').getAttribute('aria-expanded'), 'true');
    assert.equal(await group('Quản lý ON trạm').getAttribute('aria-expanded'), 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    const before = await page.evaluate(() => window.navClicks);
    await nav.locator('a[href="/admin/on-tram/giao-tru"]').click();
    assert.equal(await page.evaluate(() => window.navClicks), before + 1);
    console.log('PASS group order, active deep links, default/persisted expansion, children, unchanged badges, mobile nav callback');

    for (const role of ['ADMIN', 'SALES', 'MKT', 'CTV', 'NPP']) {
      user = { id: 7, full_name: `Sidebar ${role}`, role };
      await page.evaluate(() => { localStorage.removeItem('admin-sidebar-groups-v2'); window.mountSidebar('/admin/e-sign'); });
      await page.locator('#sidebar-fixture').getByText(`Sidebar ${role}`, { exact: true }).waitFor();
      assert.equal(await group('Trường thông tin').count(), 0);
      assert.equal(await group('Dữ liệu').count(), 0);
      for (const button of await nav.locator(':scope > div > button').all()) {
        if (await button.getAttribute('aria-expanded') === 'false') await button.click();
      }
      assert.equal(await nav.locator('a[href="/admin/roles"]').count(), 0);
      assert.equal(await nav.locator('a[href="/admin/leads"]').count(), 0);
      assert.equal(await nav.locator('a[href="/admin/business-calendar"]').count(), 0);
      assert.equal(await nav.locator('a[href="/admin/kho"]').count(), Number(role === 'ADMIN'));
      assert.equal(await nav.locator('a[href="/admin/tai-chinh"]').count(), Number(role === 'ADMIN'));
      if (role === 'MKT') assert.equal(await group('Vận hành').count(), 0);
    }
    user = { id: 7, full_name: 'Back Office fixture', role: 'SALES', department: 'Back Office' };
    await page.evaluate(() => window.mountSidebar('/admin/business-calendar'));
    await page.locator('#sidebar-fixture').getByText('Back Office fixture', { exact: true }).waitFor();
    await nav.locator('a[href="/admin/business-calendar"]').waitFor();
    if (await group('Vận hành').getAttribute('aria-expanded') === 'false') await group('Vận hành').click();
    assert.equal(await nav.locator('a[href="/admin/tai-chinh"]').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS all six roles, empty-group hiding, department access guards, no runtime errors; API fully mocked');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
