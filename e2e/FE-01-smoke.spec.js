const { test, expect } = require('@playwright/test');

// FE-01 smoke: tất cả routes tồn tại trong App.jsx phải load được, không trắng trang, không pageerror.
// Protected routes chưa login sẽ redirect về /login — vẫn tính pass nếu redirect đúng.
const PUBLIC_ROUTES = ['/login', '/register', '/de-xuat'];
const PROTECTED_ROUTES = [
  '/map',
  '/my-proposals',
  '/profile',
  '/admin',
  '/admin/users',
  '/admin/stations',
  '/admin/proposals',
  '/admin/fields',
  '/admin/forms',
  '/admin/views',
  '/admin/data-lists',
  '/admin/map-config',
  '/admin/roles',
  '/admin/api-configs',
];

test.describe('FE-01 smoke pages', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public ${route} loads without crash`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toBeEmpty();
      expect(errors, `pageerror on ${route}: ${errors.join('; ')}`).toEqual([]);
    });
  }

  for (const route of PROTECTED_ROUTES) {
    test(`protected ${route} loads or redirects to login`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toBeEmpty();
      const url = page.url();
      const ok = url.includes(route) || url.includes('/login');
      expect(ok, `unexpected url ${url} for ${route}`).toBe(true);
      expect(errors, `pageerror on ${route}: ${errors.join('; ')}`).toEqual([]);
    });
  }

  test('root / redirects to /login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });
});
