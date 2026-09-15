import { chromium } from 'playwright';
import { login, goto } from './shared.mjs';
import { annotate, clearMarks } from './annotate.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 768 } });
const page = await ctx.newPage();
await login(page);
await goto(page, '/my-proposals', 2000);
await annotate(page, [{ text: 'trùng', shape: 'box', label: '1' }]);
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'help', 'user');
mkdirSync(outDir, { recursive: true });
await page.screenshot({ path: join(outDir, 'g12b_check-trung.jpg'), type: 'jpeg', quality: 82 });
await clearMarks(page);
console.log('DONE g12b_check-trung.jpg');
await browser.close();
