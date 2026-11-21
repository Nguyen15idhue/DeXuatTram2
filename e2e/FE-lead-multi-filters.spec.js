const { test, expect } = require('@playwright/test');
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`lead filters support CRM classification, multiple selections and export (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('token', 'lead-filter-fixture'));
    const queries = [];
    const exports = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const fields = [
      { key: 'lead_code', field_key: 'lead_code', label: 'Mã Lead', type: 'text', visible: true },
      { key: 'customer_classification', field_key: 'customer_classification', label: 'Phân loại khách hàng', type: 'select', visible: true, filterable: true,
        options: [{ value: 'ut1', label: 'ƯT1_Tiềm năng' }, { value: 'ut2', label: 'ƯT2_Quan tâm' }] },
      { key: 'source', label: 'Nguồn', type: 'select', options: [{ value: 'CRM', label: 'CRM' }, { value: 'Khác', label: 'Khác' }] },
      { key: 'province', label: 'Tỉnh', type: 'select', options: [{ value: 'Hà Nội', label: 'Hà Nội' }, { value: 'Đà Nẵng', label: 'Đà Nẵng' }] },
      { key: 'sales_outcome', label: 'Kết quả', type: 'select', options: [{ value: 'SUCCESS', label: 'Thành công' }] }
    ];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === '/api/admin/excel/export/leads') {
        exports.push(url.searchParams);
        return route.fulfill({
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          headers: { 'content-disposition': 'attachment; filename="leads.xlsx"' },
          body: 'mock download'
        });
      }
      let data = [];
      if (path === '/api/auth/me') data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'Quản trị' } };
      else if (path === '/api/field-definitions/entity/leads') data = fields;
      else if (path === '/api/views') data = [{ id: 8, entity: 'leads', usage: 'table', status: 'active' }];
      else if (path === '/api/dynamic/leads/view/8') data = { fields, allFields: fields };
      else if (path === '/api/admin/excel/views') data = [{ id: 28, name: 'Danh sách Lead đầy đủ', usage: 'excel_full' }];
      else if (path === '/api/admin/leads/assignee-options') data = [{ id: 10, full_name: 'Người A', department: 'Phòng A, B' }, { id: 11, full_name: 'Người B', department: 'Phòng C' }];
      else if (path === '/api/admin/leads') {
        queries.push(url.searchParams);
        data = [{ id: 17, lead_code: 'LD-000017', customer_classification: 'Tiềm năng', custom_data: {} }];
      } else if (path.endsWith('/assistant/status')) data = {};
      await route.fulfill({ json: { success: true, data, pagination: { total: 1, totalPages: 1, page: 1, limit: 100 } } });
    });
    const choose = async (label, selections) => {
      const control = page.getByRole('button', { name: label, exact: true });
      await control.click();
      const dropdown = control.locator('..');
      for (const [term, option] of selections) {
        await dropdown.getByPlaceholder('Tìm kiếm...').fill(term);
        await dropdown.getByText(option, { exact: true }).click();
      }
      await control.click();
    };
    await page.goto(`${base}/admin/leads?tab=all`);
    await page.locator('button').filter({ hasText: 'Bộ lọc' }).first().click();
    await choose('Tất cả phân loại KH', [['tiem nang', 'Tiềm năng'], ['quan tam', 'Quan tâm']]);
    await choose('Tất cả nguồn', [['crm', 'CRM'], ['khac', 'Khác']]);
    await choose('Tất cả phòng ban', [['phong a', 'Phòng A, B']]);
    const latest = () => queries.at(-1);
    await expect.poll(() => latest()?.getAll('filter_customer_classification')).toEqual(['Tiềm năng', 'Quan tâm']);
    await expect.poll(() => latest()?.getAll('filter_source')).toEqual(['CRM', 'Khác']);
    expect(latest().getAll('filter_assigned_department')).toEqual(['Phòng A, B']);
    if (viewport.width >= 768) {
      await page.getByPlaceholder('Lọc toàn bộ...').fill('ut1');
      await expect.poll(() => latest()?.get('customer_classification')).toBe('ut1');
    }
    if (viewport.width < 768) {
      await page.locator('dialog').getByRole('button', { name: 'Áp dụng', exact: true }).last().click();
    }
    await page.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Danh sách Lead đầy đủ/ }).click();
    await download;
    expect(exports[0].getAll('filter_customer_classification')).toEqual(['Tiềm năng', 'Quan tâm']);
    expect(exports[0].getAll('filter_source')).toEqual(['CRM', 'Khác']);
    expect(exports[0].getAll('filter_assigned_department')).toEqual(['Phòng A, B']);
    if (viewport.width >= 768) expect(exports[0].get('customer_classification')).toBe('ut1');
    if (viewport.width < 768) await page.locator('button').filter({ hasText: 'Bộ lọc' }).first().click();
    const filterArea = viewport.width < 768 ? page.locator('dialog') : page;
    await filterArea.getByRole('button', { name: 'Xóa lọc', exact: true }).last().click();
    await expect.poll(() => latest()?.getAll('filter_customer_classification')).toEqual([]);
    expect(errors).toEqual([]);
  });
}
