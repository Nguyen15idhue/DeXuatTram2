const { test, expect } = require('@playwright/test');

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 640 }]) {
  test(`delivery action dialogs escape parent clipping at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const station = { id: 501, ma_tram: 'TEST-501', proposal_id: 77, status: 'ONBOARDING' };
    const items = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1, name: `DC120-${index + 1}`, model: 'LK',
      pole_id: index + 1, supplier_id: 1, supplier_name: 'Supplier A',
      committed_quantity: 2, remaining_quantity: 2, stock_quantity: 5
    }));
    await page.route('**/api/**', async (route) => {
      const { pathname } = new URL(route.request().url());
      let data = {};
      let pagination;
      if (pathname.endsWith('/auth/me')) {
        data = { user: { id: 501, full_name: 'UI Test', role: 'SUPER_ADMIN' } };
      } else if (pathname.endsWith('/501/fulfillment')) {
        data = { items, pole_requirements: items, shipping_options: items, totals: { committed: 28, remaining: 28 }, shipments: [] };
      } else if (pathname.endsWith('/501/deployments')) {
        data = [];
      } else if (pathname.endsWith('/charging-stations/501')) {
        data = station;
      } else if (pathname.endsWith('/charging-stations')) {
        data = [station];
        pagination = { page: 1, totalPages: 1, total: 1 };
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data, pagination })
      });
    });
    await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
    await page.goto('/admin/on-tram/giao-tru');
    await page.getByRole('button', { name: 'Các phần trụ / thao tác' }).click();
    const parent = page.locator('.modal-box').filter({
      has: page.getByRole('heading', { name: 'Triển khai · TEST-501', exact: true })
    });
    await expect(parent).toBeVisible();
    await expect(parent.getByText('DC120-14', { exact: true })).toBeVisible();
    await page.setViewportSize(viewport);

    for (const [button, title] of [
      ['Xuất trụ theo số lượng', 'Tạo phiếu xuất kho'],
      ['Đề xuất giao sớm', 'Đề xuất giao trụ sớm']
    ]) {
      await parent.getByRole('button', { name: button, exact: true }).click();
      const child = page.locator('body > .modal').filter({
        has: page.getByRole('heading', { name: title, exact: true })
      });
      await expect(child).toBeVisible();
      expect(await child.locator('..').evaluate((element) => element.tagName)).toBe('BODY');
      await expect.poll(() => child.evaluate((element) => {
        const box = element.querySelector('.modal-box');
        const bounds = box.getBoundingClientRect();
        const parentModal = document.querySelector('.modal:not(body > .modal)');
        return bounds.top >= 0 && bounds.bottom <= innerHeight + 1
          && bounds.left >= 0 && bounds.right <= innerWidth + 1
          && Number(getComputedStyle(element).zIndex) > Number(getComputedStyle(parentModal).zIndex);
      })).toBe(true);

      const submit = child.getByRole('button', { name: 'Xác nhận', exact: true });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      if (title === 'Tạo phiếu xuất kho') {
        expect(await child.locator('.modal-box').evaluate((element) => (
          element.scrollHeight > element.clientHeight && element.scrollTop > 0
        ))).toBe(true);
      }
      await child.getByRole('button', { name: 'Đóng', exact: true }).click();
      await expect(child).toHaveCount(0);
      await expect(parent).toBeVisible();

      await parent.getByRole('button', { name: button, exact: true }).click();
      await expect(child).toBeVisible();
      await child.locator('.modal-backdrop').click({ position: { x: 2, y: 2 } });
      await expect(child).toHaveCount(0);
      await expect(parent).toBeVisible();
    }

    await parent.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(parent).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
