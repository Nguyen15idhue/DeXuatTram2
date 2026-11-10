// backend/src/services/libreOfficeService.js
// Chuyen file Word (.doc/.docx) sang PDF bang LibreOffice headless.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { PDFDocument } = require('pdf-lib');

const TIMEOUT_MS = 60000;
let conversionTail = Promise.resolve();

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
    fs.writeFileSync(inPath, inputBuffer);

    await new Promise((resolve, reject) => {
      execFile(
        'soffice',
        [`-env:UserInstallation=${pathToFileURL(path.join(tmpDir, 'profile')).href}`,
          '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, inPath],
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
    return { pdfBuffer };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

const convertToPdf = (inputBuffer, inputExt) => {
  const result = conversionTail.then(() => performConversion(inputBuffer, inputExt));
  conversionTail = result.then(() => undefined, () => undefined);
  return result;
};

module.exports = { convertToPdf };
