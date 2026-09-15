import { chromium } from 'playwright';
import { login, BASE, API } from './shared.mjs';

const out = { super: {}, ctv: {}, images: {} };
const browser = await chromium.launch();

// --- SUPER_ADMIN ---
{
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${BASE}/huong-dan`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  out.super.adminTab = await page.getByRole('tab', { name: /Quản trị/i }).count();
  out.super.userTab = await page.getByRole('tab', { name: 'Người dùng' }).count();
  await page.getByRole('tab', { name: /Quản trị/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  out.super.fieldDefs = await page.getByText('Quản lý trường động').count();
  // image load check (scroll to load lazy images)
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } });
  await page.waitForTimeout(1500);
  out.images = await page.evaluate(() => {
    const imgs = [...document.images];
    return { total: imgs.length, broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')) };
  });
  await ctx.close();
}

// --- CTV (mock /auth/me) ---
{
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 } });
  await ctx.route('**/api/auth/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { user: { id: 1, role: 'CTV', full_name: 'CTV Test' } } }) }));
  await ctx.route('**/api/notifications**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('token', 'dummy'));
  await page.goto(`${BASE}/huong-dan`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  out.ctv.url = page.url();
  out.ctv.adminTab = await page.getByRole('tab', { name: /Quản trị/i }).count();
  out.ctv.userTab = await page.getByRole('tab', { name: 'Người dùng' }).count();
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
