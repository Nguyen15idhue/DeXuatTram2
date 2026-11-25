const { test, expect } = require('@playwright/test');
const { createRequire } = require('node:module');
const backendRequire = createRequire(require.resolve('../backend/package.json'));
const PizZip = backendRequire('pizzip');

const wordBuffer = (text) => {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
};

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5187' });

test('xem thử mẫu không gửi duyệt và bỏ bản xem thử khi sửa dữ liệu', async ({ page }) => {
  const mutations = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/generation-preview')) {
      mutations.push({ path, data: request.postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'X-Preview-Warnings': encodeURIComponent(JSON.stringify(['Kiểm tra phông chữ'])) },
        body: '%PDF-1.4\n%%EOF'
      });
      return;
    }
    if (request.method() !== 'GET') mutations.push({ path, method: request.method() });
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.endsWith('/generation-options')) data = {
      templates: [{ id: 10, name: 'Mẫu NQ_LK',
        fields: [{ key: 'ten', label: 'Tên pháp nhân', type: 'text', value: 'Tên cũ' }],
        input_fields: [{ key: 'note', label: 'Nội dung bổ sung', type: 'textarea', required: true, value: 'Mặc định' }]
      }]
    };
    else if (path.endsWith('/admin/proposal-reports')) data = [{
      id: 4, ma_de_xuat: 'DX-4', status: 'PROPOSAL_REPORT_CREATING', can_upload: true,
      custom_data: {}, chot_so_luong_tru: []
    }];
    else if (path.endsWith('/filter-options')) data = { owners: [], managers: [], provinces: [], models: [], regions: [] };
    else if (path.endsWith('/views')) data = [{ id: 8, entity: 'station_proposals', usage: 'table', status: 'active' }];
    else if (path.endsWith('/assistant/status')) data = {};
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data, pagination: { page: 1, total: 1, totalPages: 1, limit: 20 } })
    });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  await page.goto('/admin/proposals/lap-to-trinh?tab=all');
  await page.getByRole('button', { name: 'Xem thử mẫu' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Bản xem thử chưa lưu dữ liệu', { exact: false })).toBeVisible();
  await dialog.getByLabel('Mẫu BCĐX').selectOption('10');
  await dialog.getByLabel('Tên pháp nhân').fill('Tên mới');
  await expect(dialog.getByLabel('Nội dung bổ sung (bắt buộc)')).toHaveValue('Mặc định');
  await dialog.getByLabel('Nội dung bổ sung (bắt buộc)').fill('Nội dung riêng\nDòng hai');
  await dialog.getByRole('button', { name: 'Xem thử PDF' }).click();
  await expect(dialog.locator('iframe[title="Xem thử BCĐX"]')).toBeVisible();
  await expect(dialog.getByText('Kiểm tra phông chữ')).toBeVisible();
  expect(mutations).toEqual([{ path: '/api/admin/proposal-reports/4/generation-preview', data: {
    template_id: 10, values: { ten: 'Tên mới' }, inputs: { note: 'Nội dung riêng\nDòng hai' }
  } }]);
  await dialog.getByLabel('Nội dung bổ sung (bắt buộc)').fill('Nội dung khác');
  await expect(dialog.locator('iframe[title="Xem thử BCĐX"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('cấu hình trường nhập BCĐX và xem Word thật kèm cảnh báo mà không lỗi z', async ({ page }) => {
  const errors = [];
  const saves = [];
  const template = { id: 10, name: 'Mẫu cấu hình', file_id: 7, status: 'active', mapping: {} };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/files/7/download')) {
      await route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: wordBuffer('{report_note}') });
      return;
    }
    if (path.endsWith('/admin/proposals/reports')) {
      expect(request.postDataJSON()).toEqual({ proposalIds: [1272], templateId: 10 });
      await route.fulfill({
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        headers: { 'X-Preview-Warnings': encodeURIComponent(JSON.stringify(['#1272 Chưa cấu hình: extra'])) },
        body: wordBuffer('Bản thật [Chưa cấu hình: extra]')
      });
      return;
    }
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.endsWith('/documents/templates')) data = [template];
    else if (path.endsWith('/documents/templates/10')) {
      if (request.method() === 'PUT') {
        saves.push(request.postDataJSON());
        template.mapping = saves.at(-1).mapping;
      }
      data = template;
    } else if (path.endsWith('/documents/templates/10/tokens')) data = [{ token: '{report_note}', kind: 'scalar' }];
    else if (path.endsWith('/assistant/status')) data = {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  await page.goto('/admin/documents');
  await page.getByRole('button', { name: 'Gán trường', exact: true }).click();
  await page.getByRole('button', { name: 'Người dùng nhập', exact: true }).click();
  await page.getByLabel('Nhãn report_note', { exact: true }).fill('Nội dung BCĐX');
  await page.getByLabel('Kiểu report_note', { exact: true }).selectOption('textarea');
  await page.getByLabel('Mặc định report_note', { exact: true }).fill('Nội dung mẫu');
  await page.getByLabel('Bắt buộc khi hoàn thiện BCĐX').check();
  await page.getByRole('button', { name: 'Lưu mapping', exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].mapping.tokens.report_note).toEqual({
    source: 'input', label: 'Nội dung BCĐX', type: 'textarea', required: true, defaultValue: 'Nội dung mẫu'
  });
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.locator('.dxp-doc article')).toBeVisible();
  await page.getByRole('button', { name: 'Dữ liệu thật', exact: true }).click();
  await page.getByPlaceholder('ID đề xuất (vd 596)').fill('1272');
  await page.getByRole('button', { name: 'Xem với dữ liệu', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('#1272 Chưa cấu hình: extra');
  await expect(page.locator('.dxp-doc article')).toContainText('Bản thật');
  expect(errors).toEqual([]);
});

test('ngày hệ thống trong mẫu không yêu cầu gán trường hoặc thêm vào form', async ({ page }) => {
  const errors = [];
  const validations = [];
  const template = { id: 10, name: 'Mẫu ngày tự động', status: 'active', mapping: {} };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.endsWith('/documents/templates')) data = [template];
    else if (path.endsWith('/documents/templates/10')) data = template;
    else if (path.endsWith('/documents/templates/10/tokens')) data = [
      ...[
        ['today_day', 'Ngày hiện tại (giờ Việt Nam)'],
        ['today_month', 'Tháng hiện tại (giờ Việt Nam)'],
        ['today_year', 'Năm hiện tại (giờ Việt Nam)']
      ].map(([name, label]) => ({ token: `{${name}}`, kind: 'scalar', system_label: label })),
      { token: '{customer_name}', kind: 'scalar' }
    ];
    else if (path.endsWith('/documents/templates/10/validate')) {
      validations.push(request.postDataJSON());
      data = { valid: false, errors: ['Token "{customer_name}" trong file chưa được bind'] };
    } else if (path.endsWith('/assistant/status')) data = {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  await page.goto('/admin/documents');
  await page.getByRole('button', { name: 'Gán trường', exact: true }).click();
  for (const label of ['Ngày', 'Tháng', 'Năm']) {
    await expect(page.getByText(`Tự động: ${label} hiện tại (giờ Việt Nam) — không cần gán trường`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('— chưa gán —', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Kiểm tra', exact: true }).click();
  await expect(page.getByText('Token "{customer_name}" trong file chưa được bind', { exact: false })).toBeVisible();
  expect(validations).toHaveLength(1);
  expect(validations[0].mapping.tokens).toEqual({});
  expect(errors).toEqual([]);
});

test('cấu hình công thức tổng liên bảng và tỷ lệ, kiểm tra vòng rồi xem dữ liệu thật', async ({ page }) => {
  const formulaEngine = backendRequire('./src/services/documentFormula');
  const renderer = backendRequire('./src/services/documentRendering');
  const errors = [];
  const template = { id: 10, name: 'Mẫu công thức', file_id: 7, status: 'active', mapping: {
    tokens: {},
    loops: {
      chi_phi_khac: { source: 'field', table: 'other', columns: { cost: 'cost' }, footers: [{ id: 'tong', formula: 'SUM(cost)' }] },
      chi_phi_tru: { source: 'field', table: 'poles', columns: { cost: 'cost' }, footers: [{ id: 'tong', formula: 'SUM(cost)' }] }
    }
  } };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/files/7/download')) {
      await route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: wordBuffer('{total}; {percent}%') });
      return;
    }
    if (path.endsWith('/admin/proposals/reports')) {
      const result = renderer.renderDocument({
        zip: new PizZip(wordBuffer('{total}; {percent}%')),
        mapping: template.mapping, data: {},
        numericData: { chi_phi_khac_f_tong_value: 1000000, chi_phi_tru_f_tong_value: 3000000 }
      });
      await route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: result.buffer });
      return;
    }
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (path.endsWith('/documents/templates')) data = [template];
    else if (path.endsWith('/documents/templates/10')) {
      if (request.method() === 'PUT') template.mapping = request.postDataJSON().mapping;
      data = template;
    } else if (path.endsWith('/documents/templates/10/tokens')) data = ['total', 'percent'].map((name) => ({ token: `{${name}}`, kind: 'scalar' }));
    else if (path.endsWith('/documents/templates/10/validate')) {
      try {
        formulaEngine.scalarPlan(request.postDataJSON().mapping);
        data = { valid: true, errors: [] };
      } catch (cause) {
        data = { valid: false, errors: [cause.message] };
      }
    } else if (path.endsWith('/assistant/status')) data = {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.addInitScript(() => localStorage.setItem('token', 'ui-test-token'));
  await page.goto('/admin/documents');
  await page.getByRole('button', { name: 'Gán trường', exact: true }).click();
  await page.getByRole('button', { name: 'Công thức BCĐX', exact: true }).first().click();
  await page.getByLabel('Công thức total', { exact: true }).fill('total + 1');
  await page.getByRole('button', { name: 'Kiểm tra', exact: true }).click();
  await expect(page.getByText('Công thức BCĐX tham chiếu vòng tại "total"', { exact: false })).toBeVisible();
  await page.getByLabel('Công thức total', { exact: true }).fill('chi_phi_khac_f_tong_value + chi_phi_tru_f_tong_value');
  await page.getByRole('button', { name: 'Công thức BCĐX', exact: true }).click();
  await page.getByLabel('Công thức percent', { exact: true }).fill('chi_phi_tru_f_tong_value / total * 100');
  await page.getByLabel('Thập phân percent', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Kiểm tra', exact: true }).click();
  await expect(page.getByText('Mapping hợp lệ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu mapping', exact: true }).click();
  await expect.poll(() => template.mapping.tokens.percent?.decimalPlaces).toBe(2);
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.locator('.dxp-doc article')).toBeVisible();
  await page.getByRole('button', { name: 'Dữ liệu thật', exact: true }).click();
  await page.getByPlaceholder('ID đề xuất (vd 596)').fill('1272');
  await page.getByRole('button', { name: 'Xem với dữ liệu', exact: true }).click();
  await expect(page.locator('.dxp-doc article')).toContainText('4.000.000; 75,00%');
  expect(errors).toEqual([]);
});
