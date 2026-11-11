const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: __dirname, server: { host: '127.0.0.1', port: 0, open: false } });
  let browser;
  let submitted;
  const source = { id: 11, original_name: 'report.pdf', mime_type: 'application/pdf' };
  const proposal = {
    id: 701, ma_de_xuat: 'TDT_HNO_0001', user_id: 7, user_name: 'Owner fixture',
    owner_department: 'Phòng đề xuất thử', status: 'PROPOSAL_REPORT_CREATING',
    nguoi_phu_trach: { id: 8, label: 'Assigned fixture' },
    custom_data: { file_bc_dx: [source], mo_hinh_dau_tu: 'TDT' },
    chot_so_luong_tru: [{ mo_hinh: 'NQ_LK', so_luong: 2, loai_tru: 'DC60', gia_chot: 100 }],
  };
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/^\/api/, '');
      const ok = data => route.fulfill({ json: { success: true, data } });
      if (path === '/auth/me') return ok({ user: { id: 7, full_name: 'Owner fixture', role: 'SUPER_ADMIN' } });
      if (path === '/admin/proposals') return route.fulfill({ json: {
        success: true, data: [proposal], pagination: { page: 1, total: 1, totalPages: 1, limit: 25 }
      } });
      if (path === '/views') return ok([{ id: 8 }]);
      if (path.includes('/dynamic/station_proposals/view/')) {
        return ok({ fields: [
          { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', visible: true },
          { key: 'nguoi_de_xuat', field_key: 'nguoi_de_xuat', label: 'Người đề xuất', visible: true },
          { key: 'nguoi_phu_trach', field_key: 'nguoi_phu_trach', label: 'Người phụ trách', type: 'user', visible: true }
        ] });
      }
      if (path === '/data-lists/18') return ok({
        columns_config: [{ key: 'ten' }, { key: 'gia' }],
        rows: [{ data: { ten: 'DC60', gia: 100 } }]
      });
      if (path === '/admin/proposal-reports/701' && request.method() === 'PUT') {
        submitted = request.postDataJSON();
        return ok({ id: 701, mo_hinh_dau_tu: 'LK', status: 'PROPOSAL_REPORT_REVIEWING' });
      }
      if (path === '/admin/proposal-approvals/701') return ok(proposal);
      if (path.endsWith('/signer-candidates')) return ok({ candidates: [
        { id: 1, full_name: 'Director fixture', category: 'Tổng giám đốc', chuc_vu: 'Tổng giám đốc' },
        { id: 2, full_name: 'Finance fixture', category: 'Phòng Tài chính' },
        { id: 3, full_name: 'Back Office fixture', category: 'Back Office' },
        { id: 7, full_name: 'Owner fixture', category: 'Người đề xuất' },
        { id: 8, full_name: 'Assigned fixture', category: 'Người phụ trách' },
        { id: 9, full_name: 'Manager fixture', category: 'Người quản lý' },
      ] });
      if (path.endsWith('/signature-config')) return ok({ documents: [], signers: [] });
      if (path === '/assistant/status') return ok({ enabled: false });
      if (path.includes('sheet-sync')) return ok({ configured: false });
      if (path.includes('countdown') || path.includes('lifecycle')) return ok({});
      return ok([]);
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/login`);
    await page.evaluate(async () => {
      localStorage.setItem('token', 'proposal-mock-only');
      document.getElementById('root').style.display = 'none';
      const main = await (await fetch('/src/main.jsx')).text();
      const app = await (await fetch('/src/App.jsx')).text();
      const reactUrl = main.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
      const domUrl = main.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1];
      const routerUrl = app.match(/from "([^"]*react-router-dom[^"]*)"/)[1];
      const [{ default: React }, { default: ReactDOM }, { MemoryRouter, Routes, Route }, { AuthProvider }, { default: Proposals }, { default: ReportModal }, { default: Signing }] = await Promise.all([
        import(reactUrl), import(domUrl), import(routerUrl), import('/src/contexts/AuthContext.jsx'),
        import('/src/pages/admin/AdminProposalsPage.jsx'),
        import('/src/components/admin/ProposalReportUpdateModal.jsx'),
        import('/src/pages/admin/ProposalSignatureConfigPage.jsx'),
      ]);
      const host = document.createElement('div');
      host.id = 'proposal-fixture';
      document.body.appendChild(host);
      const root = ReactDOM.createRoot(host);
      let sequence = 0;
      window.mountProposal = (kind, record) => {
        const path = kind === 'signing' ? '/admin/proposals/duyet-bcdx/701/cau-hinh-ky' : '/admin/proposals';
        const content = kind === 'report'
          ? React.createElement(ReportModal, { open: true, record, onClose() {}, onSaved(data) { window.savedReport = data; } })
          : kind === 'signing'
            ? React.createElement(Routes, null, React.createElement(Route, { path: '/admin/proposals/duyet-bcdx/:id/cau-hinh-ky', element: React.createElement(Signing) }))
            : React.createElement(Proposals);
        root.render(React.createElement(AuthProvider, { key: ++sequence },
          React.createElement(MemoryRouter, { initialEntries: [path] }, content)));
      };
      window.mountProposal('table');
    });
    const fixture = page.locator('#proposal-fixture');
    await fixture.getByRole('button', { name: 'Assigned fixture', exact: true }).waitFor();
    const headers = await fixture.locator('thead th').allTextContents();
    const department = headers.findIndex(text => text.includes('Phòng ban đề xuất'));
    assert.ok(department >= 0);
    assert.match(headers[department + 1], /Người phụ trách/);
    assert.equal(headers.filter(text => text.includes('Người phụ trách')).length, 1);
    await page.evaluate(record => window.mountProposal('report', record), proposal);
    const model = fixture.locator('tbody select').first();
    await model.waitFor();
    await fixture.getByText('Cần sửa hoặc tách dòng thành LK/NQ trước khi gửi duyệt.').waitFor();
    const send = fixture.getByRole('button', { name: 'Tải lên và gửi duyệt', exact: true });
    await send.click();
    await fixture.getByText('Dòng 1: vui lòng sửa hoặc tách NQ_LK thành các dòng LK/NQ', { exact: true }).waitFor();
    assert.equal(submitted, undefined);
    assert.equal(await model.locator('option[value="NQ_LK"]:not(:disabled)').count(), 0);
    assert.deepEqual(await model.locator('option:not(:disabled)').evaluateAll(options => options.map(option => option.value)), ['', 'TDT', 'LK', 'NQ']);
    await model.selectOption('LK');
    await send.click();
    await page.waitForFunction(() => window.savedReport?.mo_hinh_dau_tu === 'LK');
    assert.equal(submitted.chot_so_luong_tru[0].mo_hinh, 'LK');
    assert.equal(submitted.chot_so_luong_tru[0].so_luong, 2);
    await page.evaluate(() => window.mountProposal('signing'));
    for (const name of ['Director fixture', 'Finance fixture', 'Back Office fixture', 'Owner fixture', 'Assigned fixture', 'Manager fixture']) {
      await fixture.getByText(name, { exact: true }).first().waitFor();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: actual proposal column order/no duplicates, legacy NQ_LK blocked, three choices, report submit API, six signing groups, no runtime errors');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
