const { test, expect } = require('@playwright/test');
const path = require('path');
const esbuild = require('../frontend/node_modules/esbuild');

test('contract expected ON date follows the editable day count and is restored after saving', async ({ page }) => {
  const result = await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { BrowserRouter } from 'react-router-dom';
        import { AuthProvider } from './contexts/AuthContext';
        import Tabs from './components/admin/ChargingStationContractTabs';
        createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><Tabs /></AuthProvider></BrowserRouter>);`,
      resolveDir: path.resolve(__dirname, '../frontend/src'), loader: 'jsx'
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{
      name: 'asset-url',
      setup(build) {
        build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'asset-url' }));
        build.onLoad({ filter: /.*/, namespace: 'asset-url' }, () => ({ contents: 'export default "";', loader: 'js' }));
      }
    }],
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': '"test"' }
  });
  const station = {
    id: 501, ma_tram: 'ON-501', status: 'ONBOARDING', contract_status: 'DOING',
    contract_files: [{ id: 12 }], permissions: { back_office: true }
  };
  const submissions = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'contract-expected-test'));
  await page.route('**/contract-expected-test.js', route => route.fulfill({
    contentType: 'application/javascript', body: result.outputFiles[0].text
  }));
  await page.route('**/admin/on-tram/khoi-tao-hop-dong?tab=all', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="root"></div><script src="/contract-expected-test.js"></script></body></html>'
  }));
  await page.route('**/api/**', route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let data = [];
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN' } };
    else if (pathname.endsWith('/contract/complete')) {
      const body = request.postDataJSON();
      submissions.push(body);
      Object.assign(station, body, { contract_status: 'DONE' });
      data = station;
    } else if (pathname.endsWith('/charging-stations')) data = [station];
    return route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } } });
  });
  await page.goto('http://localhost:5173/admin/on-tram/khoi-tao-hop-dong?tab=all');
  await page.getByRole('button', { name: 'Hợp đồng: Đang ký' }).click();
  await page.getByLabel('Trạng thái hợp đồng').selectOption('DONE');
  await page.getByLabel('Ngày hiệu lực hợp đồng').fill('2024-02-28');
  await page.getByLabel('Thời hạn hợp đồng (năm)').fill('1');
  const days = page.getByLabel('Số ngày dự kiến ON trạm');
  await expect(days).toHaveValue('90');
  await expect(page.getByLabel('Ngày dự kiến ON trạm', { exact: true })).toHaveText('28/05/2024');
  await days.fill('2');
  await expect(page.getByLabel('Ngày dự kiến ON trạm', { exact: true })).toHaveText('01/03/2024');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hợp đồng: Đã ký xong' })).toBeVisible();
  expect(submissions[0]).toMatchObject({ expected_on_days: 2, contract_effective_date: '2024-02-28' });
  await page.getByRole('button', { name: 'Hợp đồng: Đã ký xong' }).click();
  await expect(days).toHaveValue('2');
  await expect(page.getByLabel('Ngày dự kiến ON trạm', { exact: true })).toHaveText('01/03/2024');
  expect(errors).toEqual([]);
});
