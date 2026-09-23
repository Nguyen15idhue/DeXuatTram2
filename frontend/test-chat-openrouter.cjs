const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const r = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'user2@example.com', password: '123456' } });
  const tok = (await r.json()).data.token;
  await ctx.addInitScript((t) => localStorage.setItem('token', t), tok);
  await ctx.route('**/api/assistant/ask', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        answer: '## Cách hủy đề xuất\n\n1. Mở danh sách đề xuất.\n2. Bấm menu **3 chấm**.\n\nNguồn: #huy-de-xuat-cancelled',
        sources: [{ slug: 'huy-de-xuat-cancelled', id: 'huy-de-xuat-cancelled', title: 'Hủy đề xuất', images: ['/help/user/g15_xoa-de-xuat.jpg'], route: '/my-proposals' }],
        knowledge: [],
        provider: 'openrouter',
        model: 'nex-agi/nex-n2.5-mini:free',
        latencyMs: 1877,
      },
    }),
  }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my-proposals`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('button[title="Hỏi trợ lý hướng dẫn"]'), null, { timeout: 30000 });
  await page.click('button[title="Hỏi trợ lý hướng dẫn"]');
  await page.waitForTimeout(500);
  await page.fill('input[placeholder="Nhập câu hỏi..."]', 'Lam sao de huy de xuat?');
  await page.click('.chat + div button.btn-primary, .p-3.border-t button.btn-primary');
  await page.waitForFunction(() => !document.querySelector('.chat-bubble .loading-dots') && document.querySelectorAll('.chat-bubble').length >= 2, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const chip = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.chat-bubble')].pop();
    const badges = [...b.querySelectorAll('.badge')].map((x) => x.innerText.trim());
    return {
      badges,
      strong: b.querySelectorAll('strong').length,
      ol: b.querySelectorAll('ol').length,
      thumb: b.querySelectorAll('a[href*="/huong-dan#"] img').length,
      card: b.querySelectorAll('a[href*="/huong-dan#"]').length,
    };
  });
  check('chip shows OpenRouter', chip.badges.includes('OpenRouter'), chip.badges.join(','));
  check('markdown rendered (strong)', chip.strong > 0, String(chip.strong));
  check('ordered list rendered', chip.ol > 0, String(chip.ol));
  check('source card + thumbnail', chip.card > 0 && chip.thumb > 0, `cards=${chip.card} thumbs=${chip.thumb}`);
  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
