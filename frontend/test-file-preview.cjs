const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const BASE = process.env.FILE_PREVIEW_BASE_URL || 'http://127.0.0.1:5187';

function pdf() {
  let text = '%PDF-1.4\n';
  const offsets = [];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << >> /Contents 5 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  objects.forEach((value, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${value}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const downloads = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (/\/files\/\d+\/download$/.test(path)) downloads.push(path);
    if (path.endsWith('/preview')) {
      if (path.includes('/99/')) {
        return route.fulfill({ status: 404, json: { success: false, message: 'Không tìm thấy file' } });
      }
      return route.fulfill({ contentType: 'application/pdf', body: pdf() });
    }
    return route.fulfill({ json: { success: true, data: { enabled: false } } });
  });
  try {
    await page.goto(`${BASE}/login`);
    await page.evaluate(async () => {
      const source = await (await fetch('/src/main.jsx')).text();
      const reactUrl = source.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
      const domUrl = source.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1];
      const [{ default: React }, { default: ReactDOM }, { AuthProvider }, { default: FileViewer }] = await Promise.all([
        import(reactUrl), import(domUrl), import('/src/contexts/AuthContext.jsx'), import('/src/components/dynamic/FileViewer.jsx'),
      ]);
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = ReactDOM.createRoot(host);
      window.mountFilePreview = (id, mime = 'application/pdf', inline = false) => root.render(
        React.createElement(React.StrictMode, null,
          React.createElement(AuthProvider, null, React.createElement(FileViewer, {
            file: { id, mime_type: mime, original_name: 'Preview test' },
            fullScreen: !inline, inline, inlineHeight: inline ? 600 : null, onClose: () => root.render(null),
          }))),
      );
      window.mountFilePreview(1);
    });
    const viewer = page.getByLabel('Trình xem PDF', { exact: true });
    const canvas = viewer.locator('canvas');
    await page.waitForFunction(() => document.querySelector('[aria-label="Trình xem PDF"] canvas')?.width > 0);
    await viewer.getByText('Trang 1 / 2', { exact: true }).waitFor();
    const fitWidth = await canvas.evaluate(element => element.getBoundingClientRect().width);
    assert.ok(fitWidth > 1100, 'PDF fills fullscreen viewer width');
    const centerOffset = await canvas.evaluate(element => {
      const canvas = element.getBoundingClientRect();
      const viewport = element.parentElement.parentElement.getBoundingClientRect();
      return Math.abs((canvas.left + canvas.right) / 2 - (viewport.left + viewport.right) / 2);
    });
    assert.ok(centerOffset < 2, 'PDF is centered');
    await viewer.getByLabel('Phóng to PDF', { exact: true }).click();
    await page.waitForFunction(width => document.querySelector('[aria-label="Trình xem PDF"] canvas').getBoundingClientRect().width > width * 1.2, fitWidth);
    assert.ok(await canvas.evaluate(element => {
      const viewport = element.parentElement.parentElement;
      return viewport.scrollWidth > viewport.clientWidth && viewport.scrollHeight > viewport.clientHeight;
    }), 'Zoomed PDF can scroll in both directions');
    await viewer.getByLabel('Vừa chiều rộng', { exact: true }).click();
    await viewer.getByText('100%', { exact: true }).waitFor();
    await viewer.getByLabel('Trang sau', { exact: true }).click();
    await viewer.getByText('Trang 2 / 2', { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[aria-label="Trình xem PDF"] canvas');
      return canvas.width > canvas.height;
    });
    await viewer.getByLabel('Phóng to PDF', { exact: true }).evaluate(button => {
      for (let i = 0; i < 10; i++) setTimeout(() => button.click(), i * 10);
    });
    await viewer.getByText('500%', { exact: true }).waitFor();
    await viewer.getByLabel('Vừa chiều rộng', { exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[aria-label="Trình xem PDF"] canvas');
      return canvas.getBoundingClientRect().width < 390;
    });
    await viewer.getByLabel('Phóng to PDF', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await viewer.getByRole('alert').count(), 0);
    await page.evaluate(() => window.mountFilePreview(2, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true));
    await viewer.getByText('Trang 1 / 2', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Trình xem PDF"] canvas')?.width > 0);
    await page.evaluate(() => window.mountFilePreview(99));
    await viewer.getByRole('alert').waitFor();
    await page.evaluate(() => window.mountFilePreview(3));
    await viewer.getByText('Trang 1 / 2', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Trình xem PDF"] canvas')?.width > 0);
    assert.equal(await viewer.getByRole('alert').count(), 0);
    assert.deepEqual(downloads, [], 'PDF/Word preview does not fetch original files redundantly');
    assert.deepEqual(errors, []);
    console.log('PASS: PDF fit/center, zoom/scroll, rapid zoom, paging, mobile, inline Word, load error/recovery, no redundant downloads');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
