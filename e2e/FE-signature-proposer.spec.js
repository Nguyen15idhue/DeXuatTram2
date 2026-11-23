const { test, expect } = require('@playwright/test');

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const scenario of [
  { name: 'selected proposer', proposer: { id: 8, label: 'Selected proposer' }, user_id: 7, user_name: 'Creator', expected: 'Selected proposer' },
  { name: 'creator fallback', proposer: null, user_id: 7, user_name: 'Creator', expected: 'Creator' },
  { name: 'missing proposer name', proposer: { id: 8 }, user_id: 7, user_name: 'Creator', expected: 'User #8' },
  { name: 'guest', proposer: null, user_id: null, user_name: null, expected: 'Khách' }
]) {
  test(`signature detail displays ${scenario.name}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('token', 'signature-proposer-fixture'));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'Tester' } };
      if (path.endsWith('/admin/proposal-signatures/501')) data = {
        id: 501, status: 'SIGNATURE_PENDING', ma_de_xuat: 'DX-501',
        user_id: scenario.user_id, user_name: scenario.user_name, owner_name: 'Contact',
        initial_proposal_data: { nguoi_de_xuat: scenario.proposer },
        custom_data: {}, documents: [], signers: [], report_files: []
      };
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/admin/proposals/trinh-ky/501');
    const proposer = page.getByText('Người đề xuất', { exact: true }).locator('..');
    await expect(proposer).toHaveText(`Người đề xuất${scenario.expected}`);
    expect(errors).toEqual([]);
  });
}
