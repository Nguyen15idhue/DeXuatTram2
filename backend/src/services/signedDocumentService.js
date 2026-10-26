const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const sharp = require('sharp');
const pool = require('../utils/db');
const fileService = require('./fileService');
const signerTextLayout = require('../../assets/signatureTextLayout.json');

const IMAGE_HEIGHT_RATIO = signerTextLayout.imageHeightRatio;
const SIGNER_TEXT_DENSITY = 288;
const PDF_POINTS_PER_CSS_PIXEL = 0.75;
const SIGNATURE_BLOCK_MARKER = 'TMT-EGREEN-SIGNATURE-BLOCK-V3';

const xmlEscape = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const invalidDocument = (message) => Object.assign(new Error(message), { statusCode: 400 });

const signerBox = (signer) => {
  const posX = clamp(signer.pos_x);
  const width = Math.min(
    1 - posX,
    Math.max(
      0,
      signer.box_width !== null
        && signer.box_width !== undefined
        && Number.isFinite(Number(signer.box_width))
        ? Number(signer.box_width)
        : 0.25
    )
  );
  const height = Math.min(
    1,
    Math.max(
      0,
      signer.box_height !== null
        && signer.box_height !== undefined
        && Number.isFinite(Number(signer.box_height))
        ? Number(signer.box_height)
        : 0.25
    )
  );
  const posY = Math.min(1 - height, clamp(signer.pos_y));
  return {
    posX,
    posY: Math.min(posY, 1 - height),
    width,
    height
  };
};

const formatSignedTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false
  });
};

const fontPaths = () => {
  const fontDirectory = path.join(__dirname, '..', '..', 'assets', 'fonts');
  return {
    regular: path.join(fontDirectory, 'NotoSans-Regular.ttf'),
    bold: path.join(fontDirectory, 'NotoSans-SemiBold.ttf')
  };
};

const getSignerFonts = async () => {
  const paths = fontPaths();
  const fonts = {};
  for (const font of ['regular', 'bold']) {
    const filePath = paths[font];
    if (!fs.existsSync(filePath)) {
      throw new Error(`Không tìm thấy font Unicode: ${path.basename(filePath)}`);
    }
    const fontBytes = await fs.promises.readFile(filePath);
    fonts[font] = fontkit.create(fontBytes);
  }
  return fonts;
};

const fitSignerSegment = (font, value, separator, fontSizePx, maxWidthPx) => {
  const text = String(value || '').normalize('NFC');
  const completeText = text ? `${text}${separator}` : '';
  const completeRun = font.layout(completeText);
  const maxWidth = Math.max(0, maxWidthPx) * font.unitsPerEm / fontSizePx;
  if (completeRun.advanceWidth <= maxWidth) {
    return { run: completeRun, truncated: false };
  }

  let visible = Array.from(text);
  while (visible.length > 0) {
    const candidate = `${visible.join('')}…`;
    const run = font.layout(candidate);
    if (run.advanceWidth <= maxWidth) return { run, truncated: true };
    visible = visible.slice(0, -1);
  }

  const ellipsis = font.layout('…');
  return ellipsis.advanceWidth <= maxWidth
    ? { run: ellipsis, truncated: true }
    : { run: font.layout(''), truncated: true };
};

const createSignerDetailsImage = async (signer, widthPoints, heightPoints, fonts) => {
  const widthPx = widthPoints / PDF_POINTS_PER_CSS_PIXEL;
  const heightPx = heightPoints / PDF_POINTS_PER_CSS_PIXEL;
  const textByKey = {
    name: signer.full_name || '',
    time: formatSignedTime(signer.signed_at) || 'Thời gian ký'
  };
  const textWidthPx = Math.max(
    0,
    widthPx - signerTextLayout.leftPaddingPx - signerTextLayout.rightPaddingPx
  );
  const lineFont = fonts.regular;
  const lineMetricHeight = ((lineFont.ascent - lineFont.descent) / lineFont.unitsPerEm)
    * signerTextLayout.fontSizePx;
  const baselineY = signerTextLayout.topPaddingPx
    + (signerTextLayout.lineHeightPx - lineMetricHeight) / 2
    + (lineFont.ascent / lineFont.unitsPerEm) * signerTextLayout.fontSizePx;
  let textCursorX = signerTextLayout.leftPaddingPx;
  const paths = [];
  for (const segment of signerTextLayout.segments) {
    const font = fonts[segment.font];
    const maxWidthPx = textWidthPx - (textCursorX - signerTextLayout.leftPaddingPx);
    if (maxWidthPx <= 0) break;
    const { run, truncated } = fitSignerSegment(
      font,
      textByKey[segment.key],
      segment.separatorAfter,
      segment.fontSizePx,
      maxWidthPx
    );
    const scale = segment.fontSizePx / font.unitsPerEm;
    let glyphCursorX = 0;
    const glyphPaths = run.glyphs.map((glyph, index) => {
      const position = run.positions[index];
      const markup = `<path d="${glyph.path.toSVG()}" transform="translate(${glyphCursorX + position.xOffset} ${position.yOffset})"/>`;
      glyphCursorX += position.xAdvance;
      return markup;
    }).join('');
    paths.push(`<g fill="${segment.color}" transform="translate(${textCursorX} ${baselineY}) scale(${scale} ${-scale})">${glyphPaths}</g>`);
    textCursorX += run.advanceWidth * scale;
    if (truncated) break;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}px" height="${heightPx}px" viewBox="0 0 ${widthPx} ${heightPx}">${paths.join('')}</svg>`;
  return sharp(Buffer.from(svg), { density: SIGNER_TEXT_DENSITY }).png().toBuffer();
};

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

const stampPdf = async (source, signers, { includeImages = true } = {}) => {
  let pdf;
  try {
    pdf = await PDFDocument.load(source);
  } catch {
    throw invalidDocument('Không đọc được file PDF BCĐX');
  }
  const fonts = await getSignerFonts();
  const keywords = String(pdf.getKeywords() || '')
    .split(/\s+/)
    .filter(Boolean);
  pdf.setKeywords([...new Set([...keywords, SIGNATURE_BLOCK_MARKER])]);
  for (const signer of signers) {
    const pageIndex = Number(signer.page) - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
      throw invalidDocument(`Trang ký của ${signer.full_name || 'người ký'} không tồn tại trong file PDF`);
    }
    const page = pdf.getPage(pageIndex);
    const { width, height } = page.getSize();
    const box = signerBox(signer);
    if (includeImages) {
      const signature = await readSignature(signer);
      const image = await pdf.embedPng(signature.bytes);
      const boxWidth = box.width * width;
      const boxHeight = box.height * height * IMAGE_HEIGHT_RATIO;
      const imageLeftPadding = signerTextLayout.leftPaddingPx * PDF_POINTS_PER_CSS_PIXEL;
      const imageRightPadding = signerTextLayout.rightPaddingPx * PDF_POINTS_PER_CSS_PIXEL;
      const top = box.posY * height;
      const bottom = height - top - boxHeight;
      const availableImageWidth = Math.max(0, boxWidth - imageLeftPadding - imageRightPadding);
      const scale = Math.min((availableImageWidth * 0.88) / image.width, boxHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      page.drawImage(image, {
        x: box.posX * width + imageLeftPadding,
        y: bottom,
        width: drawWidth,
        height: drawHeight
      });
    }
    const textAreaHeight = box.height * height * (1 - IMAGE_HEIGHT_RATIO);
    const textImageBytes = await createSignerDetailsImage(
      signer,
      box.width * width,
      textAreaHeight,
      fonts
    );
    const textImage = await pdf.embedPng(textImageBytes);
    const boxBottom = height - (box.posY * height) - (box.height * height);
    page.drawImage(textImage, {
      x: box.posX * width,
      y: boxBottom,
      width: box.width * width,
      height: textAreaHeight
    });
  }
  return Buffer.from(await pdf.save());
};

const imageDrawing = ({ relationshipId, signer, imageId, pageWidth, pageHeight }) => {
  const box = signerBox(signer);
  const width = Math.max(1, Math.round(box.width * pageWidth));
  const height = Math.max(1, Math.round(box.height * IMAGE_HEIGHT_RATIO * pageHeight));
  const x = Math.round(box.posX * pageWidth);
  const y = Math.round(box.posY * pageHeight);
  const name = xmlEscape(`Chữ ký ${signer.full_name || signer.user_id}`);
  return `<w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${imageId}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${x * 635}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${y * 635}</wp:posOffset></wp:positionV><wp:extent cx="${width * 635}" cy="${height * 635}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${imageId}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imageId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width * 635}" cy="${height * 635}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
};

const textDrawing = ({ signer, drawingId, pageWidth, pageHeight }) => {
  const box = signerBox(signer);
  const x = Math.round(box.posX * pageWidth);
  const y = Math.round((box.posY + box.height * IMAGE_HEIGHT_RATIO) * pageHeight);
  const width = Math.max(1, Math.round(box.width * pageWidth));
  const height = Math.max(1, Math.round(box.height * (1 - IMAGE_HEIGHT_RATIO) * pageHeight));
  const textByKey = {
    name: signer.full_name || '',
    time: formatSignedTime(signer.signed_at) || 'Thời gian ký'
  };
  const runs = signerTextLayout.segments.map((segment) => {
    const text = textByKey[segment.key] || '';
    const value = text ? `${text}${segment.separatorAfter}` : '';
    const fontSize = Math.round(segment.fontSizePx * 1.5);
    return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="${fontSize}"/>${segment.font === 'bold' ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`;
  }).join('');
  const lineHeightTwips = Math.round(
    signerTextLayout.lineHeightPx * PDF_POINTS_PER_CSS_PIXEL * 20
  );
  const paragraphs = `<w:p><w:pPr><w:jc w:val="left"/><w:spacing w:before="0" w:after="0" w:line="${lineHeightTwips}" w:lineRule="exact"/></w:pPr>${runs}</w:p>`;
  const drawingName = xmlEscape(`Thông tin người ký ${signer.full_name || signer.user_id}`);
  const inset = Math.round(signerTextLayout.leftPaddingPx * PDF_POINTS_PER_CSS_PIXEL * 20);
  return `<w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${drawingId}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${x * 635}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${y * 635}</wp:posOffset></wp:positionV><wp:extent cx="${width * 635}" cy="${height * 635}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${drawingId}" name="${drawingName}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width * 635}" cy="${height * 635}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr><wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx><wps:bodyPr wrap="none" lIns="${inset}" rIns="${inset}" tIns="0" bIns="0" anchor="t"/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
};

const stampDocx = async (source, signers, { includeImages = true } = {}) => {
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
    let imageMarkup = '';
    if (includeImages) {
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
      imageMarkup = imageDrawing({
        relationshipId,
        signer,
        imageId,
        pageWidth,
        pageHeight
      });
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
    additions.set(paragraph, `${additions.get(paragraph) || ''}${imageMarkup}${textDrawing({
      signer,
      drawingId: nextImageId++,
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

const normalizedText = (value) => String(value || '')
  .normalize('NFC')
  .replace(/\s+/g, '')
  .toLocaleLowerCase('vi-VN');

const hasSignerDetails = (text, signer) => {
  const content = normalizedText(text);
  return [
    signer.full_name,
    formatSignedTime(signer.signed_at) || 'Thời gian ký'
  ].every((value) => content.includes(normalizedText(value)));
};

const hasPdfSignatureBlock = async (source) => {
  let pdf;
  try {
    pdf = await PDFDocument.load(source);
  } catch {
    throw invalidDocument('Không thể kiểm tra file PDF đã tải lên');
  }
  return String(pdf.getKeywords() || '')
    .split(/\s+/)
    .includes(SIGNATURE_BLOCK_MARKER);
};

const xmlUnescape = (value) => String(value || '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const findMissingDocxDetails = async (source, signers) => {
  let zip;
  try {
    zip = await JSZip.loadAsync(source);
  } catch {
    throw invalidDocument('Không đọc được cấu trúc file DOCX đã tải lên');
  }
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw invalidDocument('File Word không có cấu trúc DOCX hợp lệ');
  const text = [...documentXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => xmlUnescape(match[1]))
    .join(' ');
  return signers.filter((signer) => !hasSignerDetails(text, signer));
};

exports.build = async ({ reportFileId, signedFileId, signers }) => {
  const fileId = signedFileId || reportFileId;
  const fileData = await fileService.getFilePath(fileId);
  if (!fileData) {
    throw Object.assign(new Error('Không tìm thấy file BCĐX'), { statusCode: 404 });
  }
  const source = await fs.promises.readFile(fileData.filePath);
  if (!signers.length) {
    return { ...fileData.file, bytes: source };
  }

  const extension = path.extname(fileData.file.original_name || '').toLowerCase();
  const isPdf = extension === '.pdf' || fileData.file.mime_type === 'application/pdf';
  const isDocx = extension === '.docx' || fileData.file.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (!isPdf && !isDocx) {
    throw Object.assign(new Error('Ký trực tiếp chỉ hỗ trợ file BCĐX định dạng PDF hoặc DOCX'), { statusCode: 400 });
  }

  let signersToStamp = signers;
  let includeImages = true;
  if (signedFileId) {
    includeImages = false;
    signersToStamp = isPdf
      ? (await hasPdfSignatureBlock(source) ? [] : signers)
      : await findMissingDocxDetails(source, signers);
    if (signersToStamp.length === 0) {
      return { ...fileData.file, bytes: source };
    }
  }

  let bytes;
  if (isPdf) bytes = await stampPdf(source, signersToStamp, { includeImages });
  else bytes = await stampDocx(source, signersToStamp, { includeImages });
  return { ...fileData.file, bytes };
};
