// backend/src/services/libreOfficeService.js
// Chuyen file Word (.doc/.docx) sang PDF bang LibreOffice headless.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TIMEOUT_MS = 60000;

const convertToPdf = async (inputBuffer, inputExt) => {
  const ext = (inputExt || '.docx').toLowerCase().startsWith('.') ? inputExt.toLowerCase() : '.' + inputExt.toLowerCase();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-'));
  const inName = 'input' + ext;
  const inPath = path.join(tmpDir, inName);
  const outPath = path.join(tmpDir, 'input.pdf');

  try {
    fs.writeFileSync(inPath, inputBuffer);

    await new Promise((resolve, reject) => {
      const proc = execFile(
        'soffice',
        ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, inPath],
        { timeout: TIMEOUT_MS, windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error('LibreOffice convert failed: ' + (err.message || stderr || stdout)));
            return;
          }
          resolve();
        }
      );
      // kill if hung
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* noop */ } }, TIMEOUT_MS + 5000);
    });

    if (!fs.existsSync(outPath)) {
      throw new Error('LibreOffice khong tao duoc file PDF');
    }
    const pdfBuffer = fs.readFileSync(outPath);
    return { pdfBuffer };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
};

module.exports = { convertToPdf };
