const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const BASE = process.env.ESIGN_BASE_URL || 'http://localhost:5173';
const prefix = `esign-regression-${crypto.randomUUID()}`;
const fixture = (action) => JSON.parse(execFileSync('docker',
  ['exec', '-i', '-w', '/app', 'station-backend', 'node'], {
    encoding: 'utf8',
    input: `
const pool = require('./src/utils/db');
(async () => {
  try {
    const prefix = ${JSON.stringify(prefix)};
    if (${JSON.stringify(action)} === 'cleanup') {
      const [users] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [prefix + '%@example.invalid']);
      for (const user of users) {
        const [signatures] = await pool.query('SELECT id FROM signatures WHERE user_id = ?', [user.id]);
        for (const signature of signatures) await require('./src/services/signatureService').remove(signature.id, {id:user.id,role:'SALES'});
        await pool.query('DELETE FROM users WHERE id = ?', [user.id]);
      }
      console.log('[]');
      return;
    }
    const users = [];
    for (const role of ['SALES', 'ADMIN']) {
      const email = prefix + '-' + role + '@example.invalid';
      const [result] = await pool.query(
        "INSERT INTO users (full_name,email,password,role,status,custom_data) VALUES (?,?,'not-a-login-password',?,'ACTIVE','{}')",
        [prefix + '-' + role, email, role]);
      users.push({role,token:require('./src/services/authService').generateToken(result.insertId,email,role)});
    }
    const [signatures] = await pool.query('SELECT id,file_path FROM signatures');
    const missingImages = signatures.filter(row => !row.file_path || !require('fs').existsSync(row.file_path))
      .map(row => '/api/admin/signatures/' + row.id + '/image');
    console.log(JSON.stringify({users,missingImages}));
  } finally { await pool.end(); }
})().catch(err=>{console.error(err.message);process.exitCode=1;});
`
  }));

async function main() {
  let browser;
  try {
    const { users, missingImages } = fixture('create');
    browser = await chromium.launch({ headless: true });
    for (const user of users) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      const notFound = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('response', response => {
        if (response.status() === 404) notFound.push(new URL(response.url()).pathname);
      });
      await page.goto(`${BASE}/login`);
      await page.evaluate(token => localStorage.setItem('token', token), user.token);
      await page.goto(`${BASE}/admin/e-sign`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('heading', { name: 'Quản lý Chữ ký số', exact: true }).waitFor();
      if (user.role === 'ADMIN') {
        await page.getByRole('tab', { name: 'Chữ ký của tôi', exact: true }).click();
      }
      await page.getByText('Bạn chưa có chữ ký số.', { exact: false }).waitFor();
      await page.locator('input[type="file"]').first().setInputFiles({
        name: 'signature.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
      });
      await page.getByRole('button', { name: 'Lưu chữ ký', exact: true }).click();
      const image = page.getByRole('img', { name: new RegExp(`^Chữ ký của ${prefix}`) });
      await image.waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await image.evaluate(element => element.complete && element.naturalWidth > 0), true);
      await page.reload();
      await page.waitForLoadState('networkidle');
      if (user.role === 'ADMIN') await page.getByRole('tab', { name: 'Chữ ký của tôi', exact: true }).click();
      await page.getByRole('img', { name: new RegExp(`^Chữ ký của ${prefix}`) }).waitFor();
      await page.getByRole('button', { name: 'Xóa', exact: true }).click();
      await page.getByRole('button', { name: 'Xóa', exact: true }).last().click();
      await page.getByText('Bạn chưa có chữ ký số.', { exact: false }).waitFor();
      assert.deepEqual(errors, [], `${user.role} runtime errors`);
      const expectedMissingImages = user.role === 'ADMIN' ? missingImages : [];
      assert.deepEqual(notFound.filter(path => !expectedMissingImages.includes(path)), [],
        `${user.role} unexpected missing resources`);
      console.log(`PASS ${user.role}: empty view, upload, image, reload, delete; no runtime errors or unexpected 404`);
      await context.close();
    }
    if (missingImages.length) {
      console.log(`Existing signatures with missing stored files: ${missingImages.length}; restore uploads or re-upload those signatures.`);
    }
  } finally {
    if (browser) await browser.close();
    fixture('cleanup');
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
