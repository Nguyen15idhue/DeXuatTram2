const test = require('node:test');
const assert = require('node:assert/strict');

const pdfPath = require.resolve('pdf-parse');
require(pdfPath);
const original = require.cache[pdfPath].exports;
let pages = [];
require.cache[pdfPath].exports = async (_buffer, options) => {
  for (const page of pages) await options.pagerender(page);
};
const { detectAnchors } = require('../src/services/pdfAnchorDetector');
require.cache[pdfPath].exports = original;

const page = (labels, view = [0, 0, 600, 800]) => ({
  view,
  getTextContent: async () => ({ items: labels.map((str, index) => ({
    str, transform: [1, 0, 0, 10, 80, 500 - index * 30], width: 100, height: 10
  })) })
});
const anchor = { anchor_token: 'sign_gdkv', label: 'Ký GĐKV', box_width: 0.3, box_height: 0.1 };

test('only unique labels on pages with known dimensions are located', async () => {
  pages = [page(['Ký GĐKV'])];
  const [found] = await detectAnchors(Buffer.from('test'), [anchor]);
  assert.equal(found.found, true);
  assert.equal(found.page, 1);
  assert.ok(found.pos_x > 0 && found.pos_x < 1);
  pages = [page(['Ký GĐKV', 'Ký GĐKV'])];
  assert.equal((await detectAnchors(Buffer.from('test'), [anchor]))[0].reason, 'ambiguous_label');
  pages = [page(['Ký GĐKV'], [])];
  assert.equal((await detectAnchors(Buffer.from('test'), [anchor]))[0].reason, 'missing_page_size');
});
