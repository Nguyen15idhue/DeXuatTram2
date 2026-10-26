const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const JSZip = require('jszip');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const pool = require('../utils/db');
const fileService = require('./fileService');
const signerTextLayout = require('../../assets/signatureTextLayout.json');

const execFileAsync = promisify(execFile);
const IMAGE_HEIGHT_RATIO = signerTextLayout.imageHeightRatio;
const PDF_POINTS_PER_CSS_PIXEL = 0.75;
const SIGNATURE_BLOCK_MARKER = 'TMT-EGREEN-SIGNATURE-BLOCK-V3';
const IMAGE_CONVERT_TIMEOUT_MS = 15000;
const MAX_CONVERTED_IMAGE_BYTES = 32 * 1024 * 1024;

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
  const fontDirectories = [
    process.env.SIGNATURE_FONT_DIR,
    ...(process.platform === 'win32' ? ['C:\\Windows\\Fonts'] : []),
    '/usr/share/fonts/truetype/msttcorefonts'
  ].filter(Boolean);
  const findFont = (fileNames) => {
    for (const directory of fontDirectories) {
      for (const fileName of fileNames) {
        const candidate = path.join(directory, fileName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return path.join(fontDirectories[0] || '/app/signature-fonts', fileNames[0]);
  };
  return {
    regular: process.env.SIGNATURE_FONT_REGULAR || findFont([
      'times.ttf',
      'Times_New_Roman.ttf',
      'Times New Roman.ttf'
    ]),
    bold: process.env.SIGNATURE_FONT_BOLD || findFont([
      'timesbd.ttf',
      'Times_New_Roman_Bold.ttf',
      'Times New Roman Bold.ttf'
    ])
  };
};

const getSignerFonts = async (pdf) => {
  const paths = fontPaths();
  const fonts = {};
  pdf.registerFontkit(fontkit);
  for (const font of ['regular', 'bold']) {
    const filePath = paths[font];
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Không tìm thấy font Times New Roman (${font}). Hãy mount thư mục font hợp lệ vào SIGNATURE_FONT_DIR hoặc cấu hình SIGNATURE_FONT_${font.toUpperCase()}.`
      );
    }
    const fontBytes = await fs.promises.readFile(filePath);
    fonts[font] = {
      metrics: fontkit.create(fontBytes),
      embedded: await pdf.embedFont(fontBytes, { subset: true })
    };
  }
  return fonts;
};

const fitSignerSegment = (font, value, separator, fontSizePt, maxWidthPt) => {
  const text = String(value || '').normalize('NFC');
  const completeText = text ? `${text}${separator}` : '';
  const completeWidth = font.widthOfTextAtSize(completeText, fontSizePt);
  if (completeWidth <= maxWidthPt) {
    return { text: completeText, width: completeWidth, truncated: false };
  }

  let visible = Array.from(text);
  while (visible.length > 0) {
    const candidate = `${visible.join('')}…`;
    const width = font.widthOfTextAtSize(candidate, fontSizePt);
    if (width <= maxWidthPt) return { text: candidate, width, truncated: true };
    visible = visible.slice(0, -1);
  }

  const ellipsisWidth = font.widthOfTextAtSize('…', fontSizePt);
  return ellipsisWidth <= maxWidthPt
    ? { text: '…', width: ellipsisWidth, truncated: true }
    : { text: '', width: 0, truncated: true };
};

const parseColor = (hex) => {
  const value = String(hex || '').replace(/^#/, '');
  if (!/^[\da-f]{6}$/i.test(value)) {
    throw new Error(`Màu chữ ký không hợp lệ: ${hex}`);
  }
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255
  );
};

const drawSignerDetails = (page, signer, box, pageWidth, pageHeight, fonts) => {
  const textByKey = {
    title: signer.signer_title || '',
    name: signer.full_name || '',
    time: formatSignedTime(signer.signed_at) || 'Thời gian ký'
  };
  const widthPoints = box.width * pageWidth;
  const textAreaHeight = box.height * pageHeight * (1 - IMAGE_HEIGHT_RATIO);
  const leftPadding = signerTextLayout.leftPaddingPx * PDF_POINTS_PER_CSS_PIXEL;
  const rightPadding = signerTextLayout.rightPaddingPx * PDF_POINTS_PER_CSS_PIXEL;
  const topPadding = signerTextLayout.topPaddingPx * PDF_POINTS_PER_CSS_PIXEL;
  const textWidth = Math.max(0, widthPoints - leftPadding - rightPadding);
  const lineFont = fonts.regular.metrics;
  const maxFontSize = Math.max(...signerTextLayout.segments.map((segment) => segment.fontSizePt));
  const lineMetricHeight = ((lineFont.ascent - lineFont.descent) / lineFont.unitsPerEm)
    * maxFontSize;
  const baselineFromTop = topPadding
    + (signerTextLayout.lineHeightPt - lineMetricHeight) / 2
    + (lineFont.ascent / lineFont.unitsPerEm) * maxFontSize;
  const boxBottom = pageHeight - (box.posY * pageHeight) - (box.height * pageHeight);
  const baselineY = boxBottom + textAreaHeight - baselineFromTop;
  const startX = box.posX * pageWidth + leftPadding;
  let textCursorX = startX;

  for (const segment of signerTextLayout.segments) {
    const font = fonts[segment.font];
    const maxWidth = textWidth - (textCursorX - startX);
    if (maxWidth <= 0) break;
    const { text, width, truncated } = fitSignerSegment(
      font.embedded,
      textByKey[segment.key],
      segment.separatorAfter,
      segment.fontSizePt,
      maxWidth
    );
    if (text) {
      page.drawText(text, {
        x: textCursorX,
        y: baselineY,
        size: segment.fontSizePt,
        font: font.embedded,
        color: parseColor(segment.color)
      });
    }
    textCursorX += width;
    if (truncated) break;
  }
};

const convertSignatureImage = async (filePath) => {
  const inputPath = `${path.resolve(filePath)}[0]`;
  const { stdout } = await execFileAsync('convert', [
    '-limit', 'thread', '1',
    '-limit', 'memory', '64MiB',
    '-limit', 'map', '128MiB',
    '-limit', 'disk', '256MiB',
    inputPath,
    '-auto-orient',
    '-strip',
    '-resize', '2048x2048>',
    'png:-'
  ], {
    encoding: 'buffer',
    maxBuffer: MAX_CONVERTED_IMAGE_BYTES,
    timeout: IMAGE_CONVERT_TIMEOUT_MS
  });
  if (!Buffer.isBuffer(stdout) || stdout.length === 0) {
    throw invalidDocument('Không thể chuyển đổi ảnh chữ ký');
  }
  return stdout;
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
    bytes = await convertSignatureImage(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Không tìm thấy ImageMagick trong image backend', { cause: error });
    }
    if (error.killed || error.code === 'ETIMEDOUT') {
      throw new Error('Xử lý ảnh chữ ký vượt quá thời gian cho phép', { cause: error });
    }
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
  const fonts = await getSignerFonts(pdf);
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
    drawSignerDetails(
      page,
      signer,
      box,
      width,
      height,
      fonts
    );
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
    title: signer.signer_title || '',
    name: signer.full_name || '',
    time: formatSignedTime(signer.signed_at) || 'Thời gian ký'
  };
  const runs = signerTextLayout.segments.map((segment) => {
    const text = textByKey[segment.key] || '';
    const value = text ? `${text}${segment.separatorAfter}` : '';
    const fontSize = Math.round(segment.fontSizePt * 2);
    const fontFamily = xmlEscape(signerTextLayout.fontFamily);
    return `<w:r><w:rPr><w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:eastAsia="${fontFamily}" w:cs="${fontFamily}"/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/><w:lang w:val="vi-VN"/>${segment.font === 'bold' ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`;
  }).join('');
  const lineHeightTwips = Math.round(signerTextLayout.lineHeightPt * 20);
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
