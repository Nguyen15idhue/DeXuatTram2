const { test, expect } = require('@playwright/test');

const API = process.env.E2E_API_URL || 'http://localhost:3000';
const FE = process.env.E2E_BASE_URL || 'http://localhost:5173';

// FE-08: đổi Mode (nền bản đồ) KHÔNG được làm mất layer của app.
// Lỗi cũ: MapLibre bắn 'style.load' ĐỒNG BỘ khi style là object (Vệ tinh/Địa hình/
// Vệ tinh + nhãn) nên listener đăng ký SAU map.setStyle() bị bỏ lỡ → applyAll()
// không chạy → mất toàn bộ marker trạm/đề xuất, cluster, polyline, ranh giới, nhãn.
const MARKER_LAYERS = ['app-unclustered', 'app-marker-glyphs-circle', 'app-marker-glyphs-flat'];

async function login(request) {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email: 'admin@station.com', password: '123456' }
  });
  expect(res.ok(), 'login admin').toBeTruthy();
  return (await res.json()).data.token;
}

async function setToken(page, token) {
  await page.goto(`${FE}/login`);
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.removeItem('remember_until');
  }, token);
}

// Trả [] khi map/style chưa sẵn sàng (StrictMode remount ở dev làm __mapRuntime tạm null,
// và trong lúc setStyle() style cũ đã bị gỡ nên getStyle() có thể trả undefined).
function readAppLayers(page) {
  return page.evaluate(() => {
    const rt = window.__mapRuntime;
    if (!rt || !rt.map) return [];
    const style = rt.map.getStyle();
    if (!style || !Array.isArray(style.layers)) return [];
    return style.layers.map((l) => l.id).filter((id) => id.startsWith('app-'));
  });
}

async function stableAppLayers(page) {
  let prev = null;
  for (let i = 0; i < 40; i++) {
    const ids = await readAppLayers(page);
    if (ids.includes('app-unclustered') && prev && prev.join() === ids.join()) return ids;
    prev = ids;
    await page.waitForTimeout(500);
  }
  return (await readAppLayers(page));
}

// Nền bản đồ thật sự đã đổi chưa: Vệ tinh/Địa hình chỉ có source raster,
// còn Đường phố / Vệ tinh + nhãn có source vector (openmaptiles).
function baseInfo(page) {
  return page.evaluate(() => {
    const rt = window.__mapRuntime;
    if (!rt || !rt.map) return null;
    const style = rt.map.getStyle();
    if (!style || !style.sources) return null;
    const sources = Object.entries(style.sources).filter(([id]) => !id.startsWith('app-'));
    return {
      count: sources.length,
      hasVector: sources.some(([, s]) => s.type === 'vector'),
      hasRaster: sources.some(([, s]) => s.type === 'raster'),
    };
  });
}

async function switchMode(page, label) {
  await page.click('button[title="Chuyển layer"]');
  await page.getByRole('button', { name: label, exact: true }).click();
}

const MODES = [
  { label: 'Vệ tinh', hasVector: false },
  { label: 'Vệ tinh + nhãn', hasVector: true },
  { label: 'Địa hình', hasVector: false },
  { label: 'Đường phố', hasVector: true },
];

test.describe('FE-08 đổi nền bản đồ giữ nguyên layer app', () => {
  test('Vệ tinh / Vệ tinh + nhãn / Địa hình vẫn còn marker + overlay', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await setToken(page, await login(page.request));
    await page.goto(`${FE}/map`, { waitUntil: 'domcontentloaded' });

    const hasRuntime = await page
      .waitForFunction(() => !!window.__mapRuntime, null, { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasRuntime, 'MapCanvas chỉ expose __mapRuntime trên dev server');

    const before = (await stableAppLayers(page)).sort();
    expect(before, 'map phải có layer marker ban đầu').toContain('app-unclustered');

    for (const mode of MODES) {
      await switchMode(page, mode.label);
      await expect
        .poll(async () => {
          const info = await baseInfo(page);
          return info ? info.hasVector : null;
        }, { timeout: 20000, message: `nền bản đồ phải đổi sang "${mode.label}"` })
        .toBe(mode.hasVector);
      await expect
        .poll(async () => {
          const ids = await readAppLayers(page);
          return MARKER_LAYERS.filter((id) => ids.includes(id)).length;
        }, { timeout: 20000, message: `layer marker phải còn sau khi chuyển sang "${mode.label}"` })
        .toBe(MARKER_LAYERS.length);
    }

    expect((await stableAppLayers(page)).sort(), 'tập layer app không đổi sau khi xoay vòng mode').toEqual(before);
    expect(errors, 'không có lỗi runtime').toEqual([]);
  });
});
