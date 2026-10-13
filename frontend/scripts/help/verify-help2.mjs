import { chromium } from 'playwright';
import { login, goto } from './shared.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await login(page);
await goto(page, '/huong-dan', 1500);

const out = {};
out.faqTocButton = await page.getByRole('button', { name: /Câu hỏi thường gặp/ }).count();
out.deXuatCuaToiToc = await page.getByRole('button', { name: /Đề xuất của tôi/ }).count();

// open "Đề xuất của tôi" -> G39 must render
await page.getByRole('button', { name: /Đề xuất của tôi/ }).first().click();
await page.waitForTimeout(400);
out.G39 = await page.locator('#G39').count();
out.G39img = await page.evaluate(() => {
  const img = document.querySelector('#G39 img');
  return img ? { src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0 } : null;
});

// open FAQ -> Q01..Q09
await page.getByRole('button', { name: /Câu hỏi thường gặp/ }).first().click();
await page.waitForTimeout(400);
out.faqSteps = await page.locator('[id^="Q0"]').count();
out.faqCountBadge = await page.getByRole('button', { name: /Câu hỏi thường gặp/ }).first().innerText();

// images of new steps exist
for (const src of ['/help/admin-data/g40_excel-bo-cot.jpg', '/help/admin-data/g42_gan-ma-ns.jpg', '/help/admin-data/f42_link-huy.jpg']) {
  out['img' + src.split('/').pop()] = await page.evaluate(async (s) => {
    const r = await fetch(s); const b = await r.blob(); return r.ok && b.size > 1000;
  }, src).catch(() => false);
}

// flows tab: select F2, check G39 resolved card
await page.getByRole('tab', { name: /II\. Luồng/ }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Vòng đời đề xuất/ }).first().click();
await page.waitForTimeout(400);
out.flowF2hasG39 = await page.locator('text=Đề xuất mô hình NQ_LK').count();

console.log(JSON.stringify({ ...out, pageErrors: errors }, null, 2));
await browser.close();
