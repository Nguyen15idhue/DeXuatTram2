const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const pool = require('../utils/db');
const fileService = require('./fileService');

const xmlEscape = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const invalidDocument = (message) => Object.assign(new Error(message), { statusCode: 400 });

const readSignature = async (signer) => {
  const [rows] = await pool.query(
    'SELECT file_path FROM signatures WHERE id = ? LIMIT 1',
    [signer.signature_id]
  );
  const filePath = rows[0]?.file_path;
  if (!filePath || !fs.existsSync(filePath)) {
    throw Object.assign(new Error(`Không tìm thấy ảnh chữ ký của ${signer.full_name || 'người ký'}`), { statusCode: 404 });
  }
  let bytes;
  try {
    bytes = await sharp(filePath).rotate().png().toBuffer();
  } catch {
    throw invalidDocument(`Ảnh chữ ký của ${signer.full_name || 'người ký'} không hợp lệ`);
  }
  return { bytes, extension: 'png', contentType: 'image/png' };
};

exports.validateSignature = async (signatureId) => readSignature({ signature_id: signatureId });

const stampPdf = async (source, signers) => {
  let pdf;
  try {
    pdf = await PDFDocument.load(source);
  } catch {
    throw invalidDocument('Không đọc được file PDF BCĐX');
  }
  for (const signer of signers) {
    const pageIndex = Number(signer.page) - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
      throw invalidDocument(`Trang ký của ${signer.full_name || 'người ký'} không tồn tại trong file PDF`);
    }
    const page = pdf.getPage(pageIndex);
    const signature = await readSignature(signer);
    const image = await pdf.embedPng(signature.bytes);
    const { width, height } = page.getSize();
    const x = clamp(signer.pos_x) * width;
    const boxWidth = Math.min(clamp(signer.box_width), 1 - clamp(signer.pos_x)) * width;
    const boxHeight = Math.min(clamp(signer.box_height), 1 - clamp(signer.pos_y)) * height;
    const y = height - (clamp(signer.pos_y) * height) - boxHeight;
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.drawImage(image, {
      x: x + (boxWidth - drawWidth) / 2,
      y: y + (boxHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight
    });
  }
  return Buffer.from(await pdf.save());
};

const imageDrawing = ({ relationshipId, signer, imageId, pageWidth, pageHeight }) => {
  const width = Math.max(1, Math.round(clamp(signer.box_width) * pageWidth));
  const height = Math.max(1, Math.round(clamp(signer.box_height) * pageHeight));
  const x = Math.round(clamp(signer.pos_x) * pageWidth);
  const y = Math.round(clamp(signer.pos_y) * pageHeight);
  const name = xmlEscape(`Chữ ký ${signer.full_name || signer.user_id}`);
  return `<w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${imageId}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${x * 635}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${y * 635}</wp:posOffset></wp:positionV><wp:extent cx="${width * 635}" cy="${height * 635}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${imageId}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imageId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width * 635}" cy="${height * 635}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
};

const stampDocx = async (source, signers) => {
  let zip;
  try {
    zip = await JSZip.loadAsync(source);
  } catch {
    throw invalidDocument('Không đọc được cấu trúc file DOCX BCĐX');
  }
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw Object.assign(new Error('File Word không có cấu trúc DOCX hợp lệ'), { statusCode: 400 });
  }
  let documentXml = await documentFile.async('string');
  const paragraphs = [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)];
  if (paragraphs.length === 0) {
    throw Object.assign(new Error('Không tìm thấy nội dung trong file Word'), { statusCode: 400 });
  }
  const pageSize = documentXml.match(/<w:pgSz\b[^>]*>/)?.[0] || '';
  const pageWidth = Number(pageSize.match(/\bw:w="(\d+)"/)?.[1] || 11906);
  const pageHeight = Number(pageSize.match(/\bw:h="(\d+)"/)?.[1] || 16838);
  const maxPage = Math.max(1, ...signers.map((signer) => Number(signer.page) || 1));
  let relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  if (!relsXml) {
    relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  }
  let nextRelId = Math.max(0, ...[...relsXml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]))) + 1;
  let nextImageId = Math.max(0, ...[...documentXml.matchAll(/<wp:docPr[^>]*id="(\d+)"/g)].map((match) => Number(match[1]))) + 1;
  const additions = new Map();
  let contentTypesXml = await zip.file('[Content_Types].xml')?.async('string');

  for (const signer of signers) {
    const signature = await readSignature(signer);
    const extension = signature.extension;
    const imagePath = `word/media/signature-${signer.id}.${extension}`;
    const relationshipId = `rId${nextRelId++}`;
    const imageId = nextImageId++;
    zip.file(imagePath, signature.bytes);
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature-${signer.id}.${extension}"/></Relationships>`
    );
    if (contentTypesXml && !new RegExp(`<Default[^>]*Extension="${extension}"`, 'i').test(contentTypesXml)) {
      contentTypesXml = contentTypesXml.replace(
        '</Types>',
        `<Default Extension="${extension}" ContentType="${signature.contentType}"/></Types>`
      );
    }
    const requestedPage = Math.max(1, Number(signer.page) || 1);
    const pageProgress = maxPage > 1 ? (requestedPage - 1) / (maxPage - 1) : 0;
    let paragraphIndex = Math.min(paragraphs.length - 1, Math.round(pageProgress * (paragraphs.length - 1)));
    let renderedPage = 1;
    for (let index = 0; index < paragraphs.length; index++) {
      if (renderedPage >= requestedPage) {
        paragraphIndex = index;
        break;
      }
      const paragraph = paragraphs[index][0];
      const explicitBreaks = (paragraph.match(/<w:lastRenderedPageBreak\b|<w:br\b[^>]*w:type="page"/g) || []).length;
      renderedPage += explicitBreaks;
    }
    const paragraph = paragraphs[paragraphIndex][0];
    additions.set(paragraph, `${additions.get(paragraph) || ''}${imageDrawing({
      relationshipId,
      signer,
      imageId,
      pageWidth,
      pageHeight
    })}`);
  }

  for (const [paragraph, drawings] of additions) {
    documentXml = documentXml.replace(paragraph, paragraph.replace('</w:p>', `${drawings}</w:p>`));
  }
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relsXml);
  if (contentTypesXml) zip.file('[Content_Types].xml', contentTypesXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

exports.build = async ({ reportFileId, signedFileId, signers }) => {
  const fileId = signedFileId || reportFileId;
  const fileData = await fileService.getFilePath(fileId);
  if (!fileData) {
    throw Object.assign(new Error('Không tìm thấy file BCĐX'), { statusCode: 404 });
  }
  const source = await fs.promises.readFile(fileData.filePath);
  if (signedFileId || !signers.length) {
    return { ...fileData.file, bytes: source };
  }

  const extension = path.extname(fileData.file.original_name || '').toLowerCase();
  let bytes;
  if (extension === '.pdf' || fileData.file.mime_type === 'application/pdf') {
    bytes = await stampPdf(source, signers);
  } else if (extension === '.docx' || fileData.file.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    bytes = await stampDocx(source, signers);
  } else {
    throw Object.assign(new Error('Ký trực tiếp chỉ hỗ trợ file BCĐX định dạng PDF hoặc DOCX'), { statusCode: 400 });
  }
  return { ...fileData.file, bytes };
};
