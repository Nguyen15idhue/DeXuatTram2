const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: __dirname, server: { host: '127.0.0.1', port: 0, open: false } });
  let browser;
  let user;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP', 'MKT']) {
      user = { id: 7, full_name: 'Login fixture', role, department: 'Trung tâm KD miền Bắc' };
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        const data = path.endsWith('/auth/login') ? { token: 'mock-login-token', user }
          : path.endsWith('/auth/me') ? { user } : { enabled: false };
        return route.fulfill({ json: { success: true, data } });
      });
      await page.goto(`${base}/login`);
      await page.evaluate(async () => {
        localStorage.removeItem('token');
        document.getElementById('root').style.display = 'none';
        const main = await (await fetch('/src/main.jsx')).text();
        const login = await (await fetch('/src/pages/auth/LoginPage.jsx')).text();
        const reactUrl = main.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
        const domUrl = main.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1];
        const routerUrl = login.match(/from "([^"]*react-router-dom[^"]*)"/)[1];
        const [{ default: React }, { default: ReactDOM }, { BrowserRouter, Routes, Route, useNavigate }, { AuthProvider },
          { default: LoginPage }, { default: PublicLayout }, { default: UserHeader }, { default: UserSidebar }] = await Promise.all([
          import(reactUrl), import(domUrl), import(routerUrl), import('/src/contexts/AuthContext.jsx'),
          import('/src/pages/auth/LoginPage.jsx'), import('/src/layouts/PublicLayout.jsx'),
          import('/src/components/layout/UserHeader.jsx'), import('/src/components/layout/UserSidebar.jsx'),
        ]);
        const host = document.createElement('div');
        host.id = 'login-fixture';
        document.body.appendChild(host);
        const root = ReactDOM.createRoot(host);
        const Navigation = () => {
          window.navigateFixture = useNavigate();
          return null;
        };
        let version = 0;
        window.mountLogin = () => {
          history.replaceState(null, '', '/login');
          root.render(React.createElement(AuthProvider, { key: ++version },
            React.createElement(BrowserRouter, null, React.createElement(Navigation), React.createElement(Routes, null,
              React.createElement(Route, { element: React.createElement(PublicLayout) },
                React.createElement(Route, { path: '/login', element: React.createElement(LoginPage) })),
              React.createElement(Route, { path: '/map', element: React.createElement(React.Fragment, null,
                React.createElement(UserHeader), React.createElement(UserSidebar, { isOpen: true, onClose: () => {} })) }),
              ...['/admin/proposals', '/admin/leads'].map((path) =>
                React.createElement(Route, { key: path, path, element: React.createElement('div', { 'data-destination': path }, path) })),
            ))));
        };
        window.mountLogin();
      });
      const fixture = page.locator('#login-fixture');
      await fixture.locator('input[autocomplete="username"]').fill('fixture@example.invalid');
      await fixture.locator('input[autocomplete="current-password"]').fill('mock-password');
      await fixture.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      const expected = role === 'MKT' ? '/admin/leads' : '/admin/proposals';
      await page.waitForURL('**/map');
      await page.setViewportSize({ width: 1280, height: 900 });
      const desktop = fixture.locator('header').getByRole('link', { name: 'Admin Panel', exact: true });
      const mobile = fixture.locator('aside').locator('a').filter({ hasText: 'Admin Panel' });
      assert.equal(await desktop.getAttribute('href'), expected);
      assert.equal(await mobile.getAttribute('href'), expected);
      await desktop.click();
      await fixture.locator(`[data-destination="${expected}"]`).waitFor();
      assert.equal(new URL(page.url()).pathname, expected);
      await page.evaluate(() => window.navigateFixture('/map'));
      await page.waitForURL('**/map');
      await page.setViewportSize({ width: 390, height: 844 });
      await mobile.click();
      await fixture.locator(`[data-destination="${expected}"]`).waitFor();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${role}: login stays /map; desktop and mobile Admin Panel open ${expected}`);
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
