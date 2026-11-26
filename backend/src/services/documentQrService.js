// backend/src/services/documentQrService.js
// Chèn ảnh QR vào docx TRƯỚC khi render docxtemplater:
// thay nguyên đoạn chứa token {qr_*} bằng một run <w:drawing><wp:inline>.
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const PizZip = require('pizzip');
const qrHelper = require('../utils/qrHelper');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EMU_PER_CM = 360000;
const QR_TOKEN_RE = /^\{qr_[a-z0-9_]+\}$/i;

const parser = new DOMParser();
const serializer = new XMLSerializer();

const DEFAULTS = Object.freeze({
  sizeCm: 4,
  widthPx: 600,
  margin: 1,
  ecLevel: 'M'
});

const collectParagraphs = (root) => {
  const out = [];
  const walk = (node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      if (n.nodeName === 'w:p') out.push(n);
      else walk(n);
    }
  };
  walk(root);
  return out;
};

const paragraphText = (p) => (p.textContent || '').replace(/\s+/g, '').trim();

const nextRelationshipId = (relsXml) => {
  const ids = (relsXml.match(/Id="rId(\d+)"/g) || [])
    .map((raw) => Number(raw.replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n));
  return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
};

const nextDrawingId = (xml) => {
  const ids = (xml.match(/<wp:docPr[^>]*\sid="(\d+)"/g) || [])
    .map((raw) => Number((raw.match(/id="(\d+)"/) || [])[1]))
    .filter((n) => Number.isFinite(n));
  return (ids.length ? Math.max(...ids) : 0) + 1;
};

const buildDrawingXml = ({ relationshipId, docPrId, emu, name }) => `
<w:drawing xmlns:w="${W_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}" xmlns:r="${R_NS}">
  <wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="${emu}" cy="${emu}"/>
    <wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:docPr id="${docPrId}" name="${name}"/>
    <wp:cNvGraphicFramePr/>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic>
          <pic:nvPicPr>
            <pic:cNvPr id="0" name="${name}"/>
            <pic:cNvPicPr/>
          </pic:nvPicPr>
          <pic:blipFill>
            <a:blip r:embed="${relationshipId}"/>
            <a:stretch><a:fillRect/></a:stretch>
          </pic:blipFill>
          <pic:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="${emu}" cy="${emu}"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing>`;

/**
 * Thay đoạn chứa token QR bằng ảnh QR trong zip docx (mutate tại chỗ).
 * @param {object} zip PizZip đã đọc
 * @param {object} options { token, url, sizeCm, widthPx, margin, ecLevel }
 * @returns {Promise<{applied:boolean, reason?:string}>}
 *          reason: 'no_token' | 'not_alone' | 'no_body'
 */
const applyQrImages = async (zip, options = {}) => {
  const token = String(options.token || '').trim();
  const url = String(options.url || '').trim();
  if (!token || !url) return { applied: false, reason: 'no_token' };

  const docEntry = zip.file('word/document.xml');
  if (!docEntry) return { applied: false, reason: 'no_body' };

  const xml = docEntry.asText();
  const doc = parser.parseFromString(xml, 'text/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) return { applied: false, reason: 'no_body' };

  const marker = `{${token}}`;
  const target = collectParagraphs(body).find((p) => paragraphText(p) === marker);
  if (!target) return { applied: false, reason: 'no_token' };

  const png = await qrHelper.generateQrPngBuffer(
    url,
    Math.max(120, Number(options.widthPx) || DEFAULTS.widthPx),
    { margin: Number.isFinite(Number(options.margin)) ? Number(options.margin) : DEFAULTS.margin,
      errorCorrectionLevel: options.ecLevel || DEFAULTS.ecLevel }
  );

  const mediaName = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  zip.file(`word/media/${mediaName}`, png);

  const ctPath = '[Content_Types].xml';
  const ctXml = zip.file(ctPath).asText();
  if (!ctXml.includes('Extension="png"')) {
    zip.file(ctPath, ctXml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  }

  const relsPath = 'word/_rels/document.xml.rels';
  const relsEntry = zip.file(relsPath);
  const relsXml = relsEntry
    ? relsEntry.asText()
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const relationshipId = nextRelationshipId(relsXml);
  const rel = `<Relationship Id="${relationshipId}" Type="${R_NS}/image" Target="media/${mediaName}"/>`;
  zip.file(relsPath, relsXml.replace('</Relationships>', `${rel}</Relationships>`));

  const emu = Math.max(1, Math.round((Number(options.sizeCm) || DEFAULTS.sizeCm) * EMU_PER_CM));
  const runXml = `<w:r xmlns:w="${W_NS}">${buildDrawingXml({
    relationshipId, docPrId: nextDrawingId(xml), emu, name: 'QR'
  }).trim()}</w:r>`;
  const runNode = parser.parseFromString(runXml, 'text/xml').documentElement;
  const imported = doc.importNode(runNode, true);

  for (let n = target.firstChild; n;) {
    const next = n.nextSibling;
    if (!(n.nodeType === 1 && n.nodeName === 'w:pPr')) target.removeChild(n);
    n = next;
  }
  target.appendChild(imported);

  zip.file('word/document.xml', serializer.serializeToString(doc));
  return { applied: true };
};

/** Tìm token QR có trong danh sách token của template (auto-detect). */
const detectQrToken = (tokens = []) => {
  for (const item of tokens) {
    const raw = typeof item === 'string' ? item : item?.token;
    if (typeof raw !== 'string') continue;
    const match = QR_TOKEN_RE.exec(raw.trim());
    if (match) return raw.trim().replace(/[{}]/g, '');
  }
  return null;
};

module.exports = { applyQrImages, detectQrToken, DEFAULTS, QR_TOKEN_RE };
