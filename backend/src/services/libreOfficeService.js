// backend/src/services/libreOfficeService.js
// Chuyen file Word (.doc/.docx) sang PDF bang LibreOffice headless.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { PDFDocument } = require('pdf-lib');
const { promisify } = require('util');
const crypto = require('crypto');
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');

const TIMEOUT_MS = 60000;
const CONVERSION_VERSION = 'writer-pdf-v2';
const runFile = promisify(execFile);
const fontHashes = new Map();
let conversionTail = Promise.resolve();

const getConversionSignature = async () => {
  const [office, fonts] = await Promise.all([
    runFile('soffice', ['--version'], { timeout: TIMEOUT_MS, windowsHide: true }),
    runFile('fc-list', ['--format', '%{file}|%{family}|%{style}\n'], { timeout: TIMEOUT_MS, windowsHide: true }),
  ]);
  const fontEntries = fonts.stdout.trim().split('\n').filter(Boolean).sort().map((entry) => {
    const filename = entry.split('|')[0];
    const stat = fs.statSync(filename);
    let cached = fontHashes.get(filename);
    if (!cached || cached.size !== stat.size || cached.mtimeMs !== stat.mtimeMs) {
      cached = { size: stat.size, mtimeMs: stat.mtimeMs, hash: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') };
      fontHashes.set(filename, cached);
    }
    return `${entry}|${cached.hash}`;
  });
  return crypto.createHash('sha256').update([CONVERSION_VERSION, office.stdout.trim(), ...fontEntries].join('\n')).digest('hex');
};

const checkDocumentFonts = async (inputBuffer, ext) => {
  if (ext !== '.docx') return [];
  const warnings = [];
  const zip = new PizZip(inputBuffer);
  const families = new Set();
  for (const name of Object.keys(zip.files).filter((name) => /^word\/(?:document|styles|header\d+|footer\d+)\.xml$/.test(name))) {
    const document = new DOMParser().parseFromString(zip.file(name).asText(), 'application/xml');
    const nodes = document.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'rFonts');
    for (let index = 0; index < nodes.length; index += 1) {
      for (const attribute of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
        const value = nodes[index].getAttribute(`w:${attribute}`);
        if (value) families.add(value);
      }
    }
  }
  for (const family of families) {
    const match = await runFile('fc-match', ['--format', '%{family}', '--', family], { timeout: TIMEOUT_MS, windowsHide: true });
    if (!match.stdout.split(',').some((value) => value.trim().toLowerCase() === family.toLowerCase())) {
      console.warn(`[Word preview] Missing font "${family}"; substituted with "${match.stdout.trim()}". Pagination may differ from Microsoft Word.`);
      warnings.push(`Thiếu font "${family}", dùng "${match.stdout.trim()}"; phân trang có thể khác Word.`);
    }
    return warnings;
  }
};

const performConversion = async (inputBuffer, inputExt = '.docx') => {
  const ext = inputExt.toLowerCase().startsWith('.') ? inputExt.toLowerCase() : '.' + inputExt.toLowerCase();
  if (!['.doc', '.docx'].includes(ext)) throw new Error('Chỉ chuyển đổi Word DOC/DOCX sang PDF');
  if (!Buffer.isBuffer(inputBuffer) || !inputBuffer.length || inputBuffer.length > 20 * 1024 * 1024) {
    throw new Error('File Word phải có nội dung và không vượt quá 20 MB');
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-'));
  const inName = 'input' + ext;
  const inPath = path.join(tmpDir, inName);
  const outPath = path.join(tmpDir, 'input.pdf');

  try {
    const fontWarnings = await checkDocumentFonts(inputBuffer, ext);
    fs.writeFileSync(inPath, inputBuffer);

    await new Promise((resolve, reject) => {
      execFile(
        'soffice',
        [`-env:UserInstallation=${pathToFileURL(path.join(tmpDir, 'profile')).href}`,
          '--headless', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', tmpDir, inPath],
        { timeout: TIMEOUT_MS, windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error('LibreOffice convert failed: ' + (err.message || stderr || stdout)));
            return;
          }
          resolve();
        }
      );
    });

    if (!fs.existsSync(outPath)) {
      throw new Error('LibreOffice khong tao duoc file PDF');
    }
    const pdfBuffer = fs.readFileSync(outPath);
    if (pdfBuffer.length > 20 * 1024 * 1024 || pdfBuffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('File PDF chuyển đổi không hợp lệ hoặc vượt quá 20 MB');
    }
    const pdf = await PDFDocument.load(pdfBuffer);
    if (pdf.getPageCount() < 1) throw new Error('File PDF chuyển đổi không có trang');
    return { pdfBuffer, fontWarnings };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

const convertToPdf = (inputBuffer, inputExt) => {
  const result = conversionTail.then(() => performConversion(inputBuffer, inputExt));
  conversionTail = result.then(() => undefined, () => undefined);
  return result;
};

module.exports = { convertToPdf, getConversionSignature };
