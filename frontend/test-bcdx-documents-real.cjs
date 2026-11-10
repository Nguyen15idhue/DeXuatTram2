const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const BASE = process.env.BCDX_BASE_URL || 'http://localhost:5173';
const API = process.env.BCDX_API_URL || `${BASE}/api`;
const prefix = process.env.BCDX_FIXTURE_PREFIX || `bcdx-ui-${crypto.randomUUID()}`;
const runFixture = (action) => JSON.parse(execFileSync('docker',
  ['exec', '-i', '-w', '/app', 'station-backend', 'node'], {
    encoding: 'utf8',
    input: `
const pool = require('./src/utils/db');
const fs = require('fs/promises');
const path = require('path');
const prefix = ${JSON.stringify(prefix)};
(async () => {
  try {
    if (${JSON.stringify(action)} === 'inspect') {
      const [rows] = await pool.query("SELECT q.status,q.attempt_count,q.last_synced_at FROM proposal_sheet_sync_queue q JOIN station_proposals p ON p.id=q.proposal_id JOIN users u ON u.id=p.user_id WHERE u.email=?", [prefix+'@example.invalid']);
      console.log(JSON.stringify(rows));
      return;
    }
    if (${JSON.stringify(action)} === 'cleanup') {
      const connection = await pool.getConnection();
      const paths = [];
      try {
        await connection.beginTransaction();
        const [users] = await connection.query('SELECT id FROM users WHERE email=?', [prefix+'@example.invalid']);
        if (users.length) {
          const userId = users[0].id;
          const [files] = await connection.query('SELECT id, storage_key FROM files WHERE uploaded_by=?', [userId]);
          paths.push(...files.map(file => path.join('/app/storage/uploads', file.storage_key)));
          const [signatures] = await connection.query('SELECT file_path FROM signatures WHERE user_id=?', [userId]);
          paths.push(...signatures.map(signature => signature.file_path));
          const [proposals] = await connection.query('SELECT id FROM station_proposals WHERE user_id=?', [userId]);
          for (const proposal of proposals) {
            await connection.query('DELETE FROM charging_stations WHERE proposal_id=?', [proposal.id]);
            await connection.query('DELETE FROM notifications WHERE entity_type=? AND entity_id=?', ['station_proposals', proposal.id]);
            await connection.query('DELETE FROM proposal_signature_configs WHERE proposal_id=?', [proposal.id]);
            await connection.query('DELETE FROM proposal_report_documents WHERE proposal_id=?', [proposal.id]);
            await connection.query('DELETE FROM proposal_requests WHERE proposal_id=?', [proposal.id]);
            await connection.query('DELETE FROM proposal_activity_logs WHERE proposal_id=?', [proposal.id]);
            await connection.query('DELETE FROM station_proposals WHERE id=?', [proposal.id]);
            await connection.query('DELETE FROM proposal_sheet_sync_queue WHERE proposal_id=?', [proposal.id]);
          }
          await connection.query('DELETE FROM notifications WHERE user_id=?', [userId]);
          await connection.query('DELETE FROM notifications WHERE created_by=?', [userId]);
          await connection.query('DELETE FROM signatures WHERE user_id=?', [userId]);
          if (files.length) await connection.query('DELETE FROM files WHERE id IN (?)', [files.map(file=>file.id)]);
          await connection.query('DELETE FROM users WHERE id=?', [userId]);
        }
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
      for (const filename of paths) await fs.unlink(filename).catch(()=>{});
      console.log('null');
      return;
    }
    const [result] = await pool.query("INSERT INTO users(full_name,email,password,role,status,custom_data) VALUES (?,?,'not-a-login-password','SUPER_ADMIN','ACTIVE','{}')", [prefix,prefix+'@example.invalid']);
    const userId = result.insertId;
    const { PDFDocument } = require('pdf-lib');
    const pdf = await PDFDocument.create(); pdf.addPage([595,842]);
    const bytes = Buffer.from(await pdf.save());
    const sources = [];
    for (let index=0; index<2; index++) {
      const key = prefix+'-'+index+'.pdf';
      await fs.writeFile(path.join('/app/storage/uploads',key),bytes);
      const [file] = await pool.query("INSERT INTO files(original_name,storage_key,mime_type,size,uploaded_by,status) VALUES (?,?,'application/pdf',?,?,'active')", [key,key,bytes.length,userId]);
      sources.push({id:file.insertId,original_name:key,mime_type:'application/pdf'});
    }
    const signaturePath=path.join('/app/storage/uploads',prefix+'-signature.png');
    require('child_process').execFileSync('convert',['-size','160x64','xc:white','-stroke','blue','-strokewidth','3','-draw','line 15,45 145,15',signaturePath]);
    await pool.query('INSERT INTO signatures(user_id,file_path,file_url) VALUES (?,?,?)',[userId,signaturePath,'/api/admin/signatures/test/image']);
    const connection=await pool.getConnection();
    let proposalId;
    try {
      await connection.beginTransaction();
      const [proposal]=await connection.query("INSERT INTO station_proposals(user_id,latitude,longitude,owner_name,owner_phone,status,custom_data) VALUES (?,0,0,?,'0900000000','PROPOSAL_REPORT_CREATING',?)",
        [userId,prefix,JSON.stringify({ma_de_xuat:prefix,file_bc_dx:sources,file_bc_dx_sources:sources})]);
      proposalId=proposal.insertId;
      await connection.query('DELETE FROM proposal_sheet_sync_queue WHERE proposal_id=?',[proposalId]);
      await connection.query("INSERT INTO proposal_sheet_sync_queue(proposal_id,status,requested_version,synced_version,operation,next_attempt_at) VALUES (?,'PROCESSING',1,0,'UPSERT',DATE_ADD(NOW(),INTERVAL 1 DAY))",[proposalId]);
      await connection.commit();
    } catch(error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    const [lists]=await pool.query('SELECT data FROM data_list_rows WHERE list_id=18 ORDER BY sort_order,id LIMIT 1');
    const pole=typeof lists[0].data==='string'?JSON.parse(lists[0].data):lists[0].data;
    console.log(JSON.stringify({userId,proposalId,sources,pole,token:require('./src/services/authService').generateToken(userId,prefix+'@example.invalid','SUPER_ADMIN'),pdf:bytes.toString('base64')}));
  } finally { await pool.end(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
`
  }));

async function main() {
  let browser;
  try {
    const fixture = runFixture('create');
    const sheetGuard = runFixture('inspect');
    assert.equal(sheetGuard.length, 1);
    assert.equal(sheetGuard[0].status, 'PROCESSING');
    assert.equal(sheetGuard[0].last_synced_at, null);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text()); });
    page.on('response', async response => { if (response.status() >= 400) console.error('HTTP failure:', response.status(), response.url(), (await response.text()).slice(0, 250)); });
    await page.addInitScript(token => localStorage.setItem('token', token), fixture.token);
    const request = async (path, method = 'GET', body) => {
      const response = await page.request.fetch(`${API}${path}`, {
        method, headers: { Authorization: `Bearer ${fixture.token}` }, ...(body ? { data: body } : {})
      });
      const json = await response.json();
      assert.equal(json.success, true, `${method} ${path}: ${JSON.stringify(json)}`);
      return json;
    };
    const id = fixture.proposalId;
    await page.goto(`${BASE}/admin/proposals/lap-to-trinh/${id}`);
    await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    const modal = page.locator('dialog.modal-open');
    await modal.getByRole('button', { name: 'Chuẩn bị PDF', exact: true }).click();
    await modal.getByText('PDF sẵn sàng', { exact: true }).nth(1).waitFor();
    const tableRow = modal.locator('tbody tr').first();
    await tableRow.locator('select').nth(0).selectOption('LK');
    await tableRow.locator('input[type=number]').fill('1');
    await tableRow.locator('select').nth(1).selectOption(String(fixture.pole.ten));
    await modal.getByRole('button', { name: 'Tải lên và gửi duyệt', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
    let documents = (await request(`/admin/proposal-reports/${id}/documents`)).data.documents;
    assert.equal(documents.length, 2);
    assert.ok(documents.every(document => document.conversion_status === 'READY'));
    for (const document of documents) {
      const fileResponse = await page.request.get(`${API}/files/${document.signing_file_id}/download`, { headers: { Authorization: `Bearer ${fixture.token}` } });
      assert.equal(fileResponse.status(), 200, await fileResponse.text());
    }
    console.log('PASS real UI + API: prepare two PDFs, upload originals, report transition');

    await page.goto(`${BASE}/admin/proposals/duyet-bcdx/${id}/cau-hinh-ky`);
    const candidateRow = page.locator('div.flex.items-center.gap-2.rounded.border.px-2.py-2').filter({ hasText: prefix });
    await candidateRow.getByRole('button', { name: 'Thêm ô ký', exact: true }).click();
    await page.getByRole('combobox', { name: 'Tài liệu cấu hình ký' }).selectOption(String(documents[1].signing_file_id));
    await candidateRow.getByRole('button', { name: 'Thêm ô ký', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận trình ký', exact: true }).click();
    await page.waitForURL(`**/duyet-bcdx/${id}`);
    const config = (await request(`/admin/proposal-approvals/${id}/signature-config`)).data;
    assert.equal(config.signers.length, 2);
    assert.deepEqual(config.signers.map(signer => Number(signer.user_id)), [fixture.userId, fixture.userId]);
    console.log('PASS real UI + API: one signer configured independently for both documents');

    await page.goto(`${BASE}/admin/proposals/trinh-ky/${id}`);
    try { await page.getByRole('button', { name: 'Ký ngay', exact: true }).click(); }
    catch (error) { console.error('Signing UI:', await page.locator('body').innerText()); throw error; }
    await page.getByRole('combobox', { name: 'Tài liệu cần ký' }).selectOption(String(documents[1].id));
    await page.getByRole('button', { name: 'Ký ngay', exact: true }).click();
    await page.getByText('Hoàn tất ký 2/2 tài liệu', { exact: true }).waitFor();
    const signedDetail = (await request(`/admin/proposal-signatures/${id}`)).data;
    assert.ok(signedDetail.documents.every(document => document.signers.every(signer => signer.status === 'SIGNED')));
    const zip = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải tất cả (ZIP)', exact: true }).click();
    const download = await zip;
    assert.ok(download.suggestedFilename().endsWith('.zip'));
    assert.equal(await download.failure(), null);
    console.log('PASS real UI + API: sign both documents and download signed ZIP');

    await page.getByRole('button', { name: 'Upload file chủ tịch đã ký', exact: true }).click();
    const finalModal = page.locator('dialog.modal-open');
    const confirm = finalModal.getByRole('button', { name: 'Xác nhận upload', exact: true });
    assert.equal(await confirm.isDisabled(), true);
    for (let index = 0; index < 2; index++) {
      await finalModal.locator('input[type=file]').nth(index).setInputFiles({
        name: `${prefix}-final-${index}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(fixture.pdf, 'base64')
      });
      await finalModal.getByText(`${prefix}-final-${index}.pdf`, { exact: true }).waitFor();
    }
    await confirm.click();
    await finalModal.waitFor({ state: 'hidden' });
    const completed = (await request(`/admin/proposal-signatures/${id}`)).data;
    assert.equal(completed.status, 'APPROVED');
    assert.ok(completed.documents.every(document => document.signed_file_id));
    const finalGuard = runFixture('inspect');
    assert.equal(finalGuard[0].status, 'PROCESSING');
    assert.equal(finalGuard[0].attempt_count, 0);
    assert.equal(finalGuard[0].last_synced_at, null);
    assert.deepEqual(errors, []);
    console.log('PASS real UI + API: final upload maps every document, APPROVED, no runtime errors');
  } finally {
    if (browser) await browser.close();
    runFixture('cleanup');
  }
}
if (process.env.BCDX_CLEANUP_ONLY === '1') runFixture('cleanup');
else main().catch(error => { console.error(error); process.exitCode = 1; });
