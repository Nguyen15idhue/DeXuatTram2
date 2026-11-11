const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: __dirname, server: { host: '127.0.0.1', port: 0, open: false } });
  let browser;
  let state = 'OPERATING';
  let deadline = '2020-01-01 00:00:00';
  let extensionCount = 0;
  const mutations = [];
  try {
    if (!process.env.ON_DEADLINE_BASE_URL) await server.listen();
    const base = process.env.ON_DEADLINE_BASE_URL || `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('token', 'deadline-mock-only'));
    await page.route('**/api/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/^\/api/, '');
      let data = [];
      const record = {
        id: 1, proposal_id: 11, ma_tram: 'ON-DEADLINE', ma_de_xuat: 'LK_TEST_11',
        status: state, sub_status: state === 'OPERATING' ? 'ACTIVE' : null,
        contract_status: 'NOT', infra_power_status: 'NOT', infra_site_status: 'NOT',
        payment_status: 'DOING', deposit_status: 'NOT_RECEIVED', owner_name: 'Deadline fixture',
        contract_deadline_at: deadline, infra_deadline_at: deadline, finance_deadline_at: deadline,
        deadline_extension_count: extensionCount, permissions: { back_office: true, finance: true },
      };
      if (request.method() !== 'GET') mutations.push(path);
      if (path === '/auth/me') data = { user: { id: 7, role: 'SUPER_ADMIN', full_name: 'Deadline fixture' } };
      else if (path === '/assistant/status') data = { enabled: false };
      else if (path === '/admin/charging-stations' || path === '/admin/charging-finance/stations') data = [record];
      else if (path.includes('/task-counts')) data = { counts: {}, total: 0 };
      else if (path.includes('notifications')) data = { unread_count: 0, notifications: [] };
      return route.fulfill({ json: { success: true, data, pagination: { page: 1, totalPages: 1, total: 1 } } });
    });
    const routes = [
      '/admin/on-tram/khoi-tao-hop-dong', '/admin/on-tram/thong-tin-chung',
      '/admin/on-tram/xay-dung-ha-tang', '/admin/tai-chinh'
    ];
    const table = () => page.locator('table').first();
    const goto = async (path, tab = 'all') => {
      await page.goto(`${base}${path}?tab=${tab}`);
      await table().getByRole('link', { name: 'ON-DEADLINE', exact: true }).waitFor();
    };
    for (const path of routes) {
      for (const tab of ['need', 'completed', 'all']) {
        deadline = tab === 'completed' ? '2099-01-01 00:00:00' : '2020-01-01 00:00:00';
        extensionCount = tab === 'all' ? 3 : 0;
        await goto(path, tab);
        const text = await table().innerText();
        assert.doesNotMatch(text, /Quá hạn|Còn \d|Gia hạn|Hết lượt gia hạn/, `${path}?tab=${tab}`);
        assert.equal(await table().locator('[title*="2020"], [title*="2099"]').count(), 0);
      }
    }
    state = 'ONBOARDING';
    extensionCount = 0;
    for (const path of routes) {
      deadline = '2020-01-01 00:00:00';
      await goto(path);
      assert.match(await table().innerText(), /Quá hạn/, `Unchanged expired deadline: ${path}`);
      deadline = '2099-01-01 00:00:00';
      await goto(path);
      assert.match(await table().innerText(), /Còn \d/, `Unchanged future deadline: ${path}`);
    }
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    console.log('PASS: operating stations have no deadline/expiry/extension on four screens and three tabs; onboarding countdown unchanged; no API mutations or runtime errors');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
