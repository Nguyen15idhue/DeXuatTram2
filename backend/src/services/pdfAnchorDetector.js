// backend/src/services/pdfAnchorDetector.js
// Dò chuoi nhan (label) da chen trong PDF bang pdf-parse (custom pagerender)
// tra ve toa do tuyet doi da chuan hoa 0..1 (pos_x tu trai, pos_y tu tren).
//
// Ky thuat do toa do: label nam trong o co vien, text canh GIUA theo ca 2 truc
// (w:jc=center + w:vAlign=center) nen TAM cua text == TAM cua o. Chi can lay tam
// text roi lay di o la ra goc o (khong phu thuoc vao metrics font/baseline).
const pdfParse = require('pdf-parse');

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

// Bo dau tieng Viet + thuong hoa. 'd'/'D' xu ly rieng vi khong bi NFD phan ra.
const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

// Khoang cach tu baseline den TAM duong thang (don vi em). Times New Roman:
// ascent 0.891 / descent 0.216 / lineGap 0.044 -> tam duong thang ~0.33 em.
const LINE_CENTER_EM = 0.33;
// Viền ô w:sz=4 = 0.5pt: text bat dau sau viền nên lay me trai text - 0.5pt.
const BOX_BORDER_PT = 0.5;

const readPageSize = (pageData) => {
  if (Array.isArray(pageData.view) && pageData.view.length === 4) {
    const width = Number(pageData.view[2]) - Number(pageData.view[0]);
    const height = Number(pageData.view[3]) - Number(pageData.view[1]);
    if (width > 0 && height > 0) return { width, height };
  }
  if (typeof pageData.getViewport === 'function') {
    for (const arg of [1, { scale: 1 }]) {
      try {
        const viewport = pageData.getViewport(arg);
        if (viewport && Number(viewport.width) > 0 && Number(viewport.height) > 0) {
          return { width: Number(viewport.width), height: Number(viewport.height) };
        }
      } catch (e) { /* thu cach khac */ }
    }
  }
  return null;
};

/**
 * Doc toa do tung tu trong PDF.
 * Moi trang: { width, height (diem), items: [{ str, x, y, w, h }] }
 * x/y goc duoi-trai (chuan PDF); h la co chu (font size).
 */
const readPages = async (pdfBuffer) => {
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) throw invalid('Tệp PDF không hợp lệ');
  const pages = [];
  await pdfParse(pdfBuffer, {
    pagerender: async (pageData) => {
      const size = readPageSize(pageData);
      const content = await pageData.getTextContent();
      const items = [];
      for (const item of content.items || []) {
        if (typeof item.str !== 'string' || !item.str.trim()) continue;
        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const height = Number(item.height) || Math.abs(Number(transform[3]) || 0) || 0;
        items.push({
          str: item.str,
          x: Number(transform[4]) || 0,
          y: Number(transform[5]) || 0,
          w: Number(item.width) || 0,
          h: height
        });
      }
      pages.push({
        width: size ? size.width : 0,
        height: size ? size.height : 0,
        items
      });
      return '';
    }
  });
  return pages;
};

// Noi cac item thanh 1 chuoi va ghi lao vi tri moi item de doi lai toa do.
const buildIndex = (page) => {
  let full = '';
  const spans = [];
  page.items.forEach((item, index) => {
    if (index > 0) full += ' ';
    const start = full.length;
    full += normalizeText(item.str);
    spans.push({ start, end: full.length, index });
  });
  return { full, spans };
};

/**
 * Tim label trong PDF.
 * @param {Buffer} pdfBuffer
 * @param {Array<{anchor_token:string,label:string,box_width?:number,box_height?:number}>} anchors
 * @returns {Promise<Array<{anchor_token,label,page,pos_x,pos_y,box_width,box_height,found}>>}
 */
const detectAnchors = async (pdfBuffer, anchors = []) => {
  const list = (Array.isArray(anchors) ? anchors : []).filter((item) => item && item.label);
  if (!list.length) return [];

  const pages = await readPages(pdfBuffer);
  const indexed = pages.map(buildIndex);

  return list.map((anchor) => {
    const needle = normalizeText(anchor.label);
    const boxWidthRatio = clamp01(anchor.box_width);
    const boxHeightRatio = clamp01(anchor.box_height);
    if (!needle) return { ...anchor, found: false, box_width: boxWidthRatio, box_height: boxHeightRatio };

    const occurrences = indexed.reduce((count, { full }) => {
      let at = full.indexOf(needle);
      while (at >= 0) {
        count += 1;
        at = full.indexOf(needle, at + needle.length);
      }
      return count;
    }, 0);
    if (occurrences > 1 || list.filter((item) => normalizeText(item.label) === needle).length > 1) {
      return { ...anchor, found: false, reason: 'ambiguous_label', box_width: boxWidthRatio, box_height: boxHeightRatio };
    }
    for (let pageIndex = 0; pageIndex < indexed.length; pageIndex += 1) {
      const { full, spans } = indexed[pageIndex];
      const at = full.indexOf(needle);
      if (at < 0) continue;

      const page = pages[pageIndex];
      const size = page;
      if (!(size.width > 0) || !(size.height > 0)) {
        return { ...anchor, found: false, reason: 'missing_page_size', box_width: boxWidthRatio, box_height: boxHeightRatio };
      }

      const lastChar = at + needle.length - 1;
      const matched = spans
        .filter((span) => span.end > at && span.start <= lastChar)
        .map((span) => page.items[span.index])
        .filter(Boolean);
      if (!matched.length) continue;

      const xMin = Math.min(...matched.map((item) => item.x));
      // Tam duong thang (goc duoi-trai): baseline + do cao den tam duong thang.
      const baselineY = Math.max(...matched.map((item) => item.y));
      const fontHeight = Math.max(...matched.map((item) => item.h));
      const centerY = baselineY + LINE_CENTER_EM * fontHeight;

      const boxHeightPt = boxHeightRatio * size.height;
      // Text canh TRAI o -> me trai text == me trai o (tru viền 0.5pt).
      const boxLeftPt = xMin - BOX_BORDER_PT;
      // Text canh GIUA doc -> tam text == tam o.
      const boxTopFromBottomPt = centerY + boxHeightPt / 2;

      return {
        anchor_token: anchor.anchor_token,
        label: anchor.label,
        page: pageIndex + 1,
        // pos_y tinh tu MEP TREN (dong xu ly cua signedDocumentService)
        pos_x: clamp01(boxLeftPt / size.width),
        pos_y: clamp01((size.height - boxTopFromBottomPt) / size.height),
        box_width: boxWidthRatio,
        box_height: boxHeightRatio,
        found: true
      };
    }
    return { ...anchor, found: false, box_width: boxWidthRatio, box_height: boxHeightRatio };
  });
};

module.exports = { detectAnchors, normalizeText, readPages };
