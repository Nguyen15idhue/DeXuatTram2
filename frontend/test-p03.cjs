const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const fs = require('fs');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' - ' + detail : ''}`);
}
async function upload(token, name, mime, buf) {
  const blob = new Blob([buf], { type: mime });
  const fd = new FormData();
  fd.append('file', blob, name);
  const r = await fetch(`${API}/api/files/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}
async function main() {
  const login = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@station.com', password: '123456' }) }).then(r => r.json());
  const token = login.data?.token;
  check('BE login', !!token);
  for (const [n, m, b] of [['e.svg','image/svg+xml','<svg/>'], ['e.html','text/html','<x>'], ['e.exe','application/x-msdownload','MZ'], ['e.js','application/javascript','x'], ['e.php','application/x-php','<?php']]) {
    const r = await upload(token, n, m, Buffer.from(b));
    check(`BE block ${n}`, r.status === 400, `status=${r.status}`);
  }
  const pngSig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0,0]);
  const okPng = await upload(token, 'ok.png', 'image/png', pngSig);
  check('BE allow real png + safe ext', okPng.status === 201 && /\.png$/.test(okPng.body.data?.storage_key || ''), JSON.stringify(okPng.body.data?.storage_key));
  const fake = await upload(token, 'fake.png', 'image/png', Buffer.from('MZ-fake'));
  check('BE block fake png content', fake.status === 400, `status=${fake.status}`);
  if (okPng.body.data?.id) await fetch(`${API}/api/files/${okPng.body.data.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/profile`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const body = await page.content();
  check('FE /profile loads', body.length > 3000, `len=${body.length}`);
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\nTOTAL ${results.length}, FAILED ${failed.length}`);
  fs.writeFileSync('test-p03-results.json', JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
