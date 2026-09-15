import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = 'http://localhost:5173';
export const API = 'http://localhost:3000';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

let TOKEN = null;

export async function login(page, { email = 'admin@station.com', password = '123456' } = {}) {
  const res = await page.request.post(`${API}/api/auth/login`, { data: { email, password } });
  const json = await res.json();
  if (!json || !json.success || !json.data) throw new Error('login that bai');
  TOKEN = json.data.token;
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), TOKEN);
  return json.data.user;
}

async function applyToken(page) {
  if (!TOKEN) return;
  await page.evaluate((t) => localStorage.setItem('token', t), TOKEN).catch(() => {});
}

export async function goto(page, path, waitMs = 1200) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const lost = TOKEN && !(await page.evaluate(() => !!localStorage.getItem('token')).catch(() => true));
    if (!lost) break;
    await applyToken(page);
  }
  await page.waitForTimeout(waitMs);
}

export function createRunner({ laneId, imageDir }) {
  const outDir = join(ROOT, 'frontend', 'public', 'help', imageDir);
  mkdirSync(outDir, { recursive: true });
  const results = [];

  const run = async (id, title, fn) => {
    try {
      await fn();
      results.push({ id, title, ok: true });
      console.log(`[${laneId}] OK  ${id} ${title}`);
    } catch (e) {
      results.push({ id, title, ok: false, error: e.message });
      console.error(`[${laneId}] FAIL ${id} ${title}: ${e.message}`);
    }
  };

  const shot = async (page, fileName) => {
    const file = join(outDir, fileName);
    await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
    return file;
  };

  const finish = () => {
    const status = {
      lane: laneId,
      imageDir,
      at: new Date().toISOString(),
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok),
      results,
    };
    writeFileSync(join(ROOT, 'docs', '5', `41.status.${laneId}.json`), JSON.stringify(status, null, 2), 'utf8');
    console.log(`[${laneId}] DONE ok=${status.ok}/${status.total}`);
  };

  return { run, shot, finish, outDir };
}
