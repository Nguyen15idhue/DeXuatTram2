const { test, expect } = require('@playwright/test');
const path = require('path');
const esbuild = require('../frontend/node_modules/esbuild');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

let bundle;
test.beforeAll(async () => {
  const result = await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { BrowserRouter } from 'react-router-dom';
        import { AuthProvider } from './contexts/AuthContext';
        import Tabs from './components/admin/ChargingStationInfrastructureTabs';
        createRoot(document.getElementById('root')).render(
          <BrowserRouter><AuthProvider><Tabs /></AuthProvider></BrowserRouter>
        );`,
      resolveDir: path.resolve(__dirname, '../frontend/src'),
      loader: 'jsx'
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
  bundle = result.outputFiles[0].text;
});

async function setupPage(page, role, setup) {
  const rows = [
    { id: 501, ma_tram: 'ON-LK', mo_hinh_dau_tu: 'LK', status: 'ONBOARDING',
      infra_power_status: 'DONE', infra_site_status: 'NOT', infra_delivery_confirmation: 'NOT_CONFIRMED',
      infra_delivery_confirmation_exempt: false, permissions: { setup } },
    { id: 502, ma_tram: 'ON-NQ', mo_hinh_dau_tu: 'NQ', status: 'ONBOARDING',
      infra_delivery_confirmation: 'NOT_CONFIRMED', infra_delivery_confirmation_exempt: true, permissions: { setup } },
    { id: 503, ma_tram: 'ON-OLD', mo_hinh_dau_tu: 'TDT', status: 'DELIVERING',
      infra_delivery_confirmation: 'NOT_CONFIRMED', infra_delivery_confirmation_exempt: true, permissions: { setup } },
    { id: 504, ma_tram: 'ON-CANCEL', mo_hinh_dau_tu: 'LK', status: 'CANCELLED',
      infra_delivery_confirmation: 'NOT_CONFIRMED', infra_delivery_confirmation_exempt: false, permissions: { setup } }
  ];
  const updates = [];
  let conflict = false;
  await page.addInitScript(() => localStorage.setItem('token', 'infra-confirm-test'));
  await page.route('**/infra-confirm-test.js', route => route.fulfill({
    contentType: 'application/javascript', body: bundle
  }));
  await page.route('**/admin/on-tram/xay-dung-ha-tang?tab=all', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="root"></div><script src="/infra-confirm-test.js"></script></body></html>'
  }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname.endsWith('/infrastructure-confirmation')) {
      const body = request.postDataJSON();
      updates.push({ method: request.method(), pathname, body });
      if (conflict) {
        rows[0].infra_delivery_confirmation = 'NOT_CONFIRMED';
        conflict = false;
        return route.fulfill({ status: 409, json: { success: false, message: 'Trạng thái đã thay đổi' } });
      }
      rows[0].infra_delivery_confirmation = body.status;
      rows[0].infra_delivery_confirmation_note = body.note;
      return route.fulfill({ json: { success: true } });
    }
    let data = [];
    if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role, custom_data: {} } };
    else if (pathname.endsWith('/charging-stations')) data = rows;
    await route.fulfill({ json: { success: true, data,
      pagination: { page: 1, total: rows.length, totalPages: 1 } } });
  });
  await page.goto('/admin/on-tram/xay-dung-ha-tang?tab=all');
  await expect(page.getByRole('link', { name: 'ON-LK', exact: true })).toBeVisible();
  return { updates, setConflict: () => { conflict = true; } };
}

for (const [role, setup, canConfirm] of [
  ['SALES', true, true], ['SUPER_ADMIN', false, true], ['ADMIN', false, false], ['SALES', false, false]
]) {
  test(`${role} setup=${setup}: confirmation visibility and exemptions`, async ({ page }) => {
    await setupPage(page, role, setup);
    const headers = page.getByRole('columnheader');
    const labels = await headers.allTextContents();
    expect(labels.indexOf('Xác nhận điều kiện đi trụ')).toBe(labels.indexOf('Hạ tầng mặt bằng') + 1);
    const row = name => page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
    await expect(row('ON-NQ').getByText('Không cần xác nhận', { exact: true })).toBeVisible();
    await expect(row('ON-OLD').getByText('Áp dụng quy định cũ', { exact: true })).toBeVisible();
    await expect(row('ON-NQ').getByRole('button', { name: /^Xác nhận điều kiện/ })).toHaveCount(0);
    await expect(row('ON-OLD').getByRole('button', { name: /^Xác nhận điều kiện/ })).toHaveCount(0);
    await expect(row('ON-CANCEL').getByRole('button', { name: /^Xác nhận điều kiện/ })).toHaveCount(0);
    await expect(row('ON-LK').getByRole('button', { name: /^Xác nhận điều kiện/ })).toHaveCount(canConfirm ? 1 : 0);
    if (!canConfirm) await expect(row('ON-LK').getByText('Chưa xác nhận', { exact: true })).toBeVisible();
  });
}

test('confirmation saves and detects stale status without overwriting', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const { updates, setConflict } = await setupPage(page, 'SALES', true);
  const button = () => page.getByRole('button', { name: /^Xác nhận điều kiện đi trụ:/ });
  await button().click();
  await page.getByLabel('Trạng thái xác nhận').selectOption('CONFIRMED');
  await page.getByLabel('Ghi chú (không bắt buộc)').fill('  Đã kiểm tra  ');
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(button()).toHaveText(/Đủ điều kiện đi trụ/);
  expect(updates[0]).toEqual({ method: 'PUT', pathname: '/api/admin/charging-stations/501/infrastructure-confirmation',
    body: { status: 'CONFIRMED', expected_status: 'NOT_CONFIRMED', note: 'Đã kiểm tra' } });
  await button().click();
  await expect(page.getByLabel('Ghi chú (không bắt buộc)')).toHaveValue('Đã kiểm tra');
  await page.getByLabel('Trạng thái xác nhận').selectOption('NOT_CONFIRMED');
  await page.getByLabel('Ghi chú (không bắt buộc)').fill('');
  setConflict();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByText('Trạng thái đã thay đổi')).toBeVisible();
  await expect(button()).toHaveText(/Chưa xác nhận/);
  expect(updates[1].body).toEqual({ status: 'NOT_CONFIRMED', expected_status: 'CONFIRMED', note: '' });
  expect(errors).toEqual([]);
});
