const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8');

async function render(size, outName, opts = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:${opts.bg || 'transparent'};overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`;
  await page.setContent(html);
  await page.waitForTimeout(250);
  const buf = await page.screenshot({ omitBackground: opts.bg ? false : true, type: 'png' });
  fs.writeFileSync(path.join(PUBLIC, outName), buf);
  await browser.close();
  console.log(`${outName} = ${buf.length} bytes`);
}

function packIco(items, outName) {
  const images = items.map((it) => ({ size: it.size, data: fs.readFileSync(path.join(PUBLIC, it.path)) }));
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + count * 16;
  const entries = [];
  images.forEach((img) => {
    const size = img.size >= 256 ? 0 : img.size;
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0);
    e.writeUInt8(size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.data.length;
    entries.push(e);
  });
  const out = Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
  fs.writeFileSync(path.join(PUBLIC, outName), out);
  console.log(`${outName} = ${out.length} bytes (${count} images)`);
}

(async () => {
  await render(180, 'apple-touch-icon.png', { bg: '#ffffff' });
  await render(64, 'favicon-64.png', { bg: '#ffffff' });
  await render(32, 'favicon-32.png', { bg: '#ffffff' });
  await render(16, 'favicon-16.png', { bg: '#ffffff' });
  packIco([
    { path: 'favicon-16.png', size: 16 },
    { path: 'favicon-32.png', size: 32 },
    { path: 'favicon-64.png', size: 64 },
  ], 'favicon.ico');
})();
