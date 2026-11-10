// backend/src/services/documentSignatureBoxService.js
// Thay anchor token {sig_*} trong docx XML bang box inline (viền nhạt + text xam).
// Va chen anh chu ky vao box khi ky.
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const PizZip = require('pizzip');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const parser = new DOMParser();
const serializer = new XMLSerializer();

// ---------- replaceAnchorWithBox ----------
const replaceAnchorWithBox = (xml, anchorToken, boxText, boxWidthTwips, boxHeightTwips) => {
  const doc = parser.parseFromString(xml, 'text/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) return xml;

  const paragraphs = [];
  const collect = (node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.nodeName === 'w:p') paragraphs.push(n);
      else if (n.nodeType === 1) collect(n);
    }
  };
  collect(body);

  let changed = false;
  for (const p of paragraphs) {
    const text = (p.textContent || '');
    if (!text.includes(anchorToken)) continue;

    const w = boxWidthTwips || 3000;
    const h = boxHeightTwips || 700;

    const tbl = doc.createElementNS(W_NS, 'w:tbl');
    const tblPr = doc.createElementNS(W_NS, 'w:tblPr');
    const tblBorders = doc.createElementNS(W_NS, 'w:tblBorders');
    for (const side of ['top', 'left', 'bottom', 'right']) {
      const e = doc.createElementNS(W_NS, 'w:' + side);
      e.setAttribute('w:val', 'single');
      e.setAttribute('w:sz', '4');
      e.setAttribute('w:space', '0');
      e.setAttribute('w:color', '999999');
      tblBorders.appendChild(e);
    }
    tblPr.appendChild(tblBorders);
    const tblW = doc.createElementNS(W_NS, 'w:tblW');
    tblW.setAttribute('w:w', String(w));
    tblW.setAttribute('w:type', 'dxa');
    tblPr.appendChild(tblW);
    tbl.appendChild(tblPr);

    const tblGrid = doc.createElementNS(W_NS, 'w:tblGrid');
    const gridCol = doc.createElementNS(W_NS, 'w:gridCol');
    gridCol.setAttribute('w:w', String(w));
    tblGrid.appendChild(gridCol);
    tbl.appendChild(tblGrid);

    const tr = doc.createElementNS(W_NS, 'w:tr');
    const trPr = doc.createElementNS(W_NS, 'w:trPr');
    const trH = doc.createElementNS(W_NS, 'w:trHeight');
    trH.setAttribute('w:val', String(h));
    trH.setAttribute('w:hRule', 'atLeast');
    trPr.appendChild(trH);
    tr.appendChild(trPr);

    const tc = doc.createElementNS(W_NS, 'w:tc');
    const tcPr = doc.createElementNS(W_NS, 'w:tcPr');
    const tcW = doc.createElementNS(W_NS, 'w:tcW');
    tcW.setAttribute('w:w', String(w));
    tcW.setAttribute('w:type', 'dxa');
    tcPr.appendChild(tcW);
    tc.appendChild(tcPr);

    const newP = doc.createElementNS(W_NS, 'w:p');
    const pPr = doc.createElementNS(W_NS, 'w:pPr');
    const jc = doc.createElementNS(W_NS, 'w:jc');
    jc.setAttribute('w:val', 'center');
    pPr.appendChild(jc);
    const spacing = doc.createElementNS(W_NS, 'w:spacing');
    spacing.setAttribute('w:before', '40');
    spacing.setAttribute('w:after', '40');
    pPr.appendChild(spacing);
    newP.appendChild(pPr);

    const run = doc.createElementNS(W_NS, 'w:r');
    const rPr = doc.createElementNS(W_NS, 'w:rPr');
    const sz = doc.createElementNS(W_NS, 'w:sz');
    sz.setAttribute('w:val', '16');
    rPr.appendChild(sz);
    const color = doc.createElementNS(W_NS, 'w:color');
    color.setAttribute('w:val', '808080');
    rPr.appendChild(color);
    const i = doc.createElementNS(W_NS, 'w:i');
    rPr.appendChild(i);
    run.appendChild(rPr);
    const t = doc.createElementNS(W_NS, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = boxText || 'Ký: ...';
    run.appendChild(t);
    newP.appendChild(run);
    tc.appendChild(newP);
    tr.appendChild(tc);
    tbl.appendChild(tr);

    const parent = p.parentNode;
    parent.replaceChild(tbl, p);
    changed = true;
  }

  if (!changed) return xml;
  return serializer.serializeToString(doc);
};

// ---------- insertSignatureIntoDocx ----------
const readImageDims = (buf) => {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), ext: 'png', mime: 'image/png' };
  }
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), ext: 'jpeg', mime: 'image/jpeg' };
      }
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  }
  return { w: 200, h: 80, ext: 'png', mime: 'image/png' };
};

const insertSignatureIntoDocx = (docxBuffer, boxText, imageBuffer, signerName, signedAt) => {
  const zip = new PizZip(docxBuffer);
  const dims = readImageDims(imageBuffer);
  const maxW = 2160;
  const scale = Math.min(1, maxW / dims.w);
  const imgW = Math.round(dims.w * scale);
  const imgH = Math.round(dims.h * scale);
  const emuW = imgW * 9525;
  const emuH = imgH * 9525;

  // Add image to zip
  const imgName = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${dims.ext}`;
  const imgPath = `word/media/${imgName}`;
  zip.file(imgPath, imageBuffer);

  // Update content types
  const ctPath = '[Content_Types].xml';
  const ctXml = zip.file(ctPath).asText();
  if (!ctXml.includes(`Extension="${dims.ext}"`)) {
    const override = `<Default Extension="${dims.ext}" ContentType="${dims.mime}"/>`;
    zip.file(ctPath, ctXml.replace('</Types>', override + '</Types>'));
  }

  // Update rels
  const relsPath = 'word/_rels/document.xml.rels';
  const relsXml = zip.file(relsPath).asText();
  const rId = 'rId' + ((relsXml.match(/rId\d+/g) || []).length + 100);
  const rel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>`;
  zip.file(relsPath, relsXml.replace('</Relationships>', rel + '</Relationships>'));

  // Parse document.xml fresh
  const docXml = zip.file('word/document.xml').asText();
  const doc = new DOMParser().parseFromString(docXml, 'text/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) return docxBuffer;

  const tables = [];
  const collect = (node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.nodeName === 'w:tbl') tables.push(n);
      else if (n.nodeType === 1) collect(n);
    }
  };
  collect(body);

  const target = tables.find((t) => (t.textContent || '').includes(boxText));
  if (!target) return docxBuffer;

  const parent = target.parentNode;

  // Build new table with image + text
  const newTbl = doc.createElementNS(W_NS, 'w:tbl');
  const tblPr = doc.createElementNS(W_NS, 'w:tblPr');
  const tblBorders = doc.createElementNS(W_NS, 'w:tblBorders');
  for (const side of ['top', 'left', 'bottom', 'right']) {
    const e = doc.createElementNS(W_NS, 'w:' + side);
    e.setAttribute('w:val', 'single'); e.setAttribute('w:sz', '4'); e.setAttribute('w:space', '0'); e.setAttribute('w:color', '999999');
    tblBorders.appendChild(e);
  }
  tblPr.appendChild(tblBorders);
  const tblW = doc.createElementNS(W_NS, 'w:tblW');
  tblW.setAttribute('w:w', '3000'); tblW.setAttribute('w:type', 'dxa');
  tblPr.appendChild(tblW);
  newTbl.appendChild(tblPr);

  const tblGrid = doc.createElementNS(W_NS, 'w:tblGrid');
  const gridCol = doc.createElementNS(W_NS, 'w:gridCol');
  gridCol.setAttribute('w:w', '3000');
  tblGrid.appendChild(gridCol);
  newTbl.appendChild(tblGrid);

  const tr = doc.createElementNS(W_NS, 'w:tr');
  const tc = doc.createElementNS(W_NS, 'w:tc');
  const tcPr = doc.createElementNS(W_NS, 'w:tcPr');
  const tcW = doc.createElementNS(W_NS, 'w:tcW');
  tcW.setAttribute('w:w', '3000'); tcW.setAttribute('w:type', 'dxa');
  tcPr.appendChild(tcW);
  tc.appendChild(tcPr);

  // Image paragraph
  const pImg = doc.createElementNS(W_NS, 'w:p');
  const pPr = doc.createElementNS(W_NS, 'w:pPr');
  const jc = doc.createElementNS(W_NS, 'w:jc');
  jc.setAttribute('w:val', 'center');
  pPr.appendChild(jc);
  pImg.appendChild(pPr);

  const run = doc.createElementNS(W_NS, 'w:r');
  const drawing = doc.createElementNS(W_NS, 'w:drawing');
  const inlineEl = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'wp:inline');
  inlineEl.setAttribute('distT', '0'); inlineEl.setAttribute('distB', '0'); inlineEl.setAttribute('distL', '0'); inlineEl.setAttribute('distR', '0');
  const extent = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'wp:extent');
  extent.setAttribute('cx', String(emuW)); extent.setAttribute('cy', String(emuH));
  inlineEl.appendChild(extent);
  const docPr = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'wp:docPr');
  docPr.setAttribute('id', '1'); docPr.setAttribute('name', 'Signature');
  inlineEl.appendChild(docPr);
  const graphic = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:graphic');
  const graphicData = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:graphicData');
  graphicData.setAttribute('uri', 'http://schemas.openxmlformats.org/drawingml/2006/picture');
  const pic = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic:pic');
  const nvPicPr = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic:nvPicPr');
  const cNvPr = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic:cNvPr');
  cNvPr.setAttribute('id', '0'); cNvPr.setAttribute('name', 'sig.png');
  nvPicPr.appendChild(cNvPr);
  const cNvPicPr = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic:cNvPicPr');
  nvPicPr.appendChild(cNvPicPr);
  pic.appendChild(nvPicPr);
  const blipFill = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic:blipFill');
  const blip = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:blip');
  blip.setAttribute('r:embed', rId);
  blip.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
  blipFill.appendChild(blip);
  const stretch = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:stretch');
  const fillRect = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:fillRect');
  stretch.appendChild(fillRect);
  blipFill.appendChild(stretch);
  pic.appendChild(blipFill);
  const spPr = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic:spPr');
  const xfrm = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:xfrm');
  const off = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:off');
  off.setAttribute('x', '0'); off.setAttribute('y', '0');
  xfrm.appendChild(off);
  const ext2 = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:ext');
  ext2.setAttribute('cx', String(emuW)); ext2.setAttribute('cy', String(emuH));
  xfrm.appendChild(ext2);
  spPr.appendChild(xfrm);
  const prstGeom = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:prstGeom');
  prstGeom.setAttribute('prst', 'rect');
  const avLst = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:avLst');
  prstGeom.appendChild(avLst);
  spPr.appendChild(prstGeom);
  pic.appendChild(spPr);
  graphicData.appendChild(pic);
  graphic.appendChild(graphicData);
  inlineEl.appendChild(graphic);
  drawing.appendChild(inlineEl);
  run.appendChild(drawing);
  pImg.appendChild(run);
  tc.appendChild(pImg);

  // text lines
  const timeStr = signedAt ? new Date(signedAt).toLocaleString('vi-VN') : '';
  const lines = [`Đã ký bởi: ${signerName}`, `Đã ký lúc: ${timeStr}`];
  for (const ln of lines) {
    const p2 = doc.createElementNS(W_NS, 'w:p');
    const pPr2 = doc.createElementNS(W_NS, 'w:pPr');
    const jc2 = doc.createElementNS(W_NS, 'w:jc');
    jc2.setAttribute('w:val', 'center');
    pPr2.appendChild(jc2);
    p2.appendChild(pPr2);
    const r2 = doc.createElementNS(W_NS, 'w:r');
    const rPr2 = doc.createElementNS(W_NS, 'w:rPr');
    const sz2 = doc.createElementNS(W_NS, 'w:sz');
    sz2.setAttribute('w:val', '16');
    rPr2.appendChild(sz2);
    r2.appendChild(rPr2);
    const t2 = doc.createElementNS(W_NS, 'w:t');
    t2.setAttribute('xml:space', 'preserve');
    t2.textContent = ln;
    r2.appendChild(t2);
    p2.appendChild(r2);
    tc.appendChild(p2);
  }

  tr.appendChild(tc);
  newTbl.appendChild(tr);
  parent.replaceChild(newTbl, target);

  const newXml = new XMLSerializer().serializeToString(doc);
  zip.file('word/document.xml', newXml);
  return zip.generate({ type: 'nodebuffer' });
};

module.exports.replaceAnchorWithBox = replaceAnchorWithBox;
module.exports.insertSignatureIntoDocx = insertSignatureIntoDocx;
module.exports.readImageDims = readImageDims;
