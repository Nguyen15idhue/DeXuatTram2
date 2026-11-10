const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const pathModule = require('node:path');

const BASE = process.env.BCDX_BASE_URL || 'http://localhost:5173';
const file = (id, name, mime_type = 'application/pdf') => ({ id, name, original_name: name, mime_type });
const sources = [file(11, 'BCDX.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), file(12, 'Phu luc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')];
const documents = sources.map((source, index) => ({
  id: index + 1, proposal_id: 701, source_file_id: source.id, source_file: source,
  pdf_file_id: source.id + 10, pdf_file: file(source.id + 10, `${source.name}.pdf`),
  signing_file_id: source.id + 10, signing_file: file(source.id + 10, `${source.name}.pdf`),
  conversion_status: 'READY', has_config: false, has_signed: false
}));
const proposal = { id: 701, ma_de_xuat: 'TEST_BCDX_701', owner_name: 'UI fixture', status: 'PROPOSAL_REPORT_CREATING',
  custom_data: { file_bc_dx: documents.map(document => document.signing_file), file_bc_dx_sources: sources },
  chot_so_luong_tru: [{ mo_hinh: 'LK', so_luong: 1, loai_tru: 'DC60', gia_chot: 100 }] };
const signer = (id, document_id) => ({ id, document_id, user_id: 7, full_name: 'Người ký thử', status: 'PENDING', page: 1, pos_x: 0.1, pos_y: 0.1, box_width: 0.3, box_height: 0.2 });

function pdf() {
  let text = '%PDF-1.4\n';
  const offsets = [0];
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
  objects.forEach((value, index) => { offsets.push(text.length); text += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = text.length;
  text += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  let prepared = false;
  let retried = false;
  let configured;
  let uploaded;
  let finalized;
  let uploadId = 90;
  const signed = new Set();
  let withdrawalDenied = false;
  let legacy = false;
  let unsupported = false;
  let processing = false;
  let approvalConversion = 'READY';
  let approvalPolls = 0;
  const signBodies = [];
  const exportQueries = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'mock-only-no-real-user'));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      if (!process.env.BCDX_BUILD_DIR || url.origin !== BASE) return route.continue();
      const root = pathModule.resolve(process.env.BCDX_BUILD_DIR);
      let filename = pathModule.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!filename.startsWith(`${root}${pathModule.sep}`)) return route.abort();
      if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename = pathModule.join(root, 'index.html');
      const types = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      return route.fulfill({ contentType: types[pathModule.extname(filename)] || 'application/octet-stream', body: fs.readFileSync(filename) });
    }
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const ok = data => route.fulfill({ json: { success: true, data } });
    if (path === '/auth/me') return ok({ user: { id: 7, full_name: 'UI fixture', role: 'SUPER_ADMIN', custom_data: {} } });
    if (path.startsWith('/files/') && path !== '/files/upload') return route.fulfill({ contentType: 'application/pdf', body: pdf() });
    if (path === '/files/upload') return ok(file(++uploadId, `final-${uploadId}.pdf`));
    if (path === '/data-lists/18') return ok({ columns_config: [{ key: 'ten' }, { key: 'gia' }], rows: [{ data: { ten: 'DC60', gia: 100 } }] });
    if (path === '/admin/proposal-reports/701/documents/prepare') {
      prepared = true;
      assert.deepEqual(request.postDataJSON().files, [{ id: 11 }, { id: 12 }]);
      return ok({ documents: [documents[0], { ...documents[1], conversion_status: 'FAILED', conversion_error: 'mock conversion failed' }] });
    }
    if (path.endsWith('/documents/2/convert')) {
      retried = true;
      return ok({ documents: [{ ...documents[1], conversion_status: 'FAILED', conversion_error: 'mock conversion failed again' }] });
    }
    if (path.endsWith('/documents/1/convert')) { approvalConversion = 'READY'; return ok({ documents: [documents[0]] }); }
    if (path.endsWith('/documents')) {
      if (approvalConversion === 'PENDING' && ++approvalPolls > 1) approvalConversion = 'FAILED';
      return ok({ documents: [{ ...documents[0], conversion_status: approvalConversion,
        ...(approvalConversion !== 'READY' ? { signing_file: file(11, 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), conversion_error: approvalConversion === 'FAILED' ? 'background conversion failed' : null } : {}) }, documents[1]] });
    }
    if (path === '/admin/proposal-reports/701' && method === 'PUT') {
      uploaded = request.postDataJSON();
      return ok({ id: 701 });
    }
    if (path === '/admin/proposal-reports/701') return ok({ proposal, permissions: { canUpload: true }, fieldDefinitions: [] });
    if (path === '/admin/proposal-approvals/701/signer-candidates') return ok({ candidates: [{ id: 7, full_name: 'Người ký thử', category: 'Test' }] });
    if (path === '/admin/proposal-approvals/701/signature-config' && method === 'PUT') {
      configured = request.postDataJSON();
      return ok({ id: 701 });
    }
    if (path === '/admin/proposal-approvals/701/signature-config') return ok({
      documents: unsupported ? [{ ...documents[0], source_file: file(11, 'legacy.doc', 'application/msword'), signing_file: file(11, 'legacy.doc', 'application/msword'), conversion_status: 'FAILED', conversion_error: 'unsupported .doc', has_config: true }] : processing ? [{ ...documents[0], conversion_status: 'PROCESSING' }] : documents,
      signers: [], can_withdraw: false
    });
    if (path === '/admin/proposal-approvals/701/signature-config/withdraw') {
      withdrawalDenied = true;
      return route.fulfill({ status: 403, json: { success: false, message: 'Không thể thu hồi sau khi đã ký' } });
    }
    if (path === '/admin/proposal-approvals/701') return ok({
      ...proposal, status: 'PROPOSAL_REPORT_REVIEWING',
      permissions: { canConfigure: true, canRequestUpdate: true, canReject: true }
    });
    if (path === '/admin/proposal-signatures/701/sign') {
      signBodies.push(request.postDataJSON());
      signed.add(request.postDataJSON().document_id);
      return ok({ id: 701 });
    }
    if (path === '/admin/proposal-signatures/701/signed-file') {
      finalized = request.postDataJSON();
      return ok({ id: 701 });
    }
    if (path === '/admin/proposal-signatures/701') {
      if (legacy) return ok({ ...proposal, status: 'SIGNATURE_PENDING', report_files: [documents[0].signing_file],
        signers: [signer(101)], my_config: signer(101), has_signature: true, can_sign: true, sign_status: 'PENDING', signer_total: 1, signer_signed: 0 });
      const docs = documents.map(document => {
        const config = { ...signer(100 + document.id, document.id), status: signed.has(document.id) ? 'SIGNED' : 'PENDING' };
        return { ...document, signers: [config], can_sign: !signed.has(document.id), my_config: config };
      });
      return ok({ ...proposal, status: 'SIGNATURE_PENDING', documents: docs, signers: docs.flatMap(document => document.signers),
        report_files: documents.map(document => document.signing_file), has_signature: true, can_sign: true,
        can_upload_signed: true, can_withdraw: true, sign_status: signed.size === 2 ? 'DONE' : 'PENDING', signer_total: 2, signer_signed: signed.size });
    }
    if (path.endsWith('/signed-document')) {
      exportQueries.push(url.search);
      return route.fulfill({ contentType: 'application/zip', body: Buffer.from('mock zip') });
    }
    return ok([]);
  });
  try {
    await page.goto(`${BASE}/admin/proposals/lap-to-trinh/701`);
    await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    const modal = page.locator('dialog.modal-open');
    const submit = modal.getByRole('button', { name: 'Tải lên và gửi duyệt' });
    assert.equal(await modal.getByRole('button', { name: 'Chuẩn bị PDF', exact: true }).count(), 0);
    assert.equal(await modal.getByRole('checkbox').count(), 0);
    assert.equal(await submit.isEnabled(), true);
    await submit.click();
    await page.waitForFunction(() => !document.querySelector('dialog.modal-open'));
    assert.equal(uploaded.accept_conversion_failure, undefined);
    assert.equal(prepared, false);
    assert.equal(retried, false);
    assert.deepEqual(uploaded.files.map(file => file.id), [11, 12]);
    console.log('PASS Word submits immediately with original sources, no prepare button or failure-consent gate');

    approvalConversion = 'PENDING';
    await page.goto(`${BASE}/admin/proposals/duyet-bcdx/701`);
    await page.getByText('Chưa chuyển đổi', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cấu hình ký', exact: true }).isDisabled(), true);
    await page.getByText('background conversion failed', { exact: true }).waitFor();
    assert.equal(approvalPolls > 1, true);
    assert.equal(await page.getByRole('button', { name: 'Cấu hình ký', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Chuyển sang PDF', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Cấu hình ký' && !button.disabled));
    console.log('PASS approval polls background failure, keeps config locked, and retry enables PDF configuration');

    await page.goto(`${BASE}/admin/proposals/duyet-bcdx/701/cau-hinh-ky`);
    await page.getByRole('button', { name: 'Thêm ô ký', exact: true }).click();
    await page.getByRole('combobox', { name: 'Tài liệu cấu hình ký' }).selectOption('22');
    await page.getByRole('button', { name: 'Thêm ô ký', exact: true }).click();
    await page.getByRole('combobox', { name: 'Tài liệu cấu hình ký' }).selectOption('21');
    assert.equal(await page.getByRole('button', { name: 'Đã thêm', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Xác nhận trình ký', exact: true }).click();
    await page.waitForURL('**/duyet-bcdx/701');
    assert.deepEqual(configured.documents.map(document => [document.document_id, document.file_id, document.signers[0].user_id]), [[1, 21, 7], [2, 22, 7]]);
    console.log('PASS per-document drafts retained and same signer allowed across documents');

    await page.goto(`${BASE}/admin/proposals/trinh-ky/701`);
    await page.getByRole('button', { name: 'Thu hồi cấu hình ký', exact: true }).click();
    await page.getByText('Không thể thu hồi sau khi đã ký', { exact: true }).waitFor();
    assert.equal(withdrawalDenied, true);
    assert.equal(await page.getByText('Đã thu hồi cấu hình ký', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Ký ngay', exact: true }).click();
    await page.getByRole('combobox', { name: 'Tài liệu cần ký' }).selectOption('2');
    await page.getByRole('button', { name: 'Ký ngay', exact: true }).click();
    await page.getByText('Hoàn tất ký 2/2 tài liệu', { exact: true }).waitFor();
    assert.deepEqual([...signed], [1, 2]);
    const zipDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải tất cả (ZIP)', exact: true }).click();
    await zipDownload;
    assert.equal(exportQueries.at(-1), '?all=1');
    await page.getByRole('button', { name: 'Upload file chủ tịch đã ký', exact: true }).click();
    const finalModal = page.locator('dialog.modal-open');
    const confirm = finalModal.getByRole('button', { name: 'Xác nhận upload', exact: true });
    assert.equal(await confirm.isDisabled(), true);
    const inputs = finalModal.locator('input[type=file]');
    await inputs.nth(0).setInputFiles({ name: 'final-1.pdf', mimeType: 'application/pdf', buffer: pdf() });
    await finalModal.getByText('final-91.pdf', { exact: true }).waitFor();
    assert.equal(await confirm.isDisabled(), true);
    await inputs.nth(1).setInputFiles({ name: 'final-2.pdf', mimeType: 'application/pdf', buffer: pdf() });
    await finalModal.getByText('final-92.pdf', { exact: true }).waitFor();
    await confirm.click();
    await page.waitForFunction(() => !document.querySelector('dialog.modal-open'));
    assert.deepEqual(finalized, { documents: [{ document_id: 1, file_id: 91 }, { document_id: 2, file_id: 92 }] });
    legacy = true;
    await page.goto(`${BASE}/admin/proposals/ky-bcdx/701`);
    await page.getByRole('button', { name: 'Ký ngay', exact: true }).click();
    assert.deepEqual(signBodies.at(-1), {});
    assert.equal(await page.getByRole('combobox', { name: 'Tài liệu cần ký' }).count(), 0);
    console.log('PASS legacy single-file signing payload retained');

    processing = true;
    await page.goto(`${BASE}/admin/proposals/duyet-bcdx/701/cau-hinh-ky`);
    await page.getByText('Đang chuyển PDF', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Thêm ô ký', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Chuyển sang PDF', exact: true }).isDisabled(), true);
    console.log('PASS PROCESSING cannot be configured or converted twice from the UI');
    processing = false;
    unsupported = true;
    await page.goto(`${BASE}/admin/proposals/duyet-bcdx/701/cau-hinh-ky`);
    await page.getByText('unsupported .doc', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Thêm ô ký', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Chuyển sang PDF', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Xác nhận trình ký', exact: true }).isDisabled(), true);
    console.log('PASS .doc signing and conversion of configured documents blocked');
    assert.deepEqual(errors, []);
    console.log('PASS denied withdrawal, individual signing, all-document final upload gate, no runtime errors; all APIs mocked');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
