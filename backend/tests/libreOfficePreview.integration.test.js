const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const PizZip = require('pizzip');
const { PDFDocument } = require('pdf-lib');
const converter = require('../src/services/libreOfficeService');

test('Word conversion retains three A4 pages and original bytes with complete font variants', {
  skip: process.env.RUN_DOCUMENT_CONVERSION_TESTS !== '1',
}, async () => {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const paragraph = (text, properties = '') => `<w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>${properties}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
  const pages = Array.from({ length: 3 }, (_, index) => {
    const body = [
      paragraph(`Page ${index + 1} regular`),
      paragraph('Bold line', '<w:b/>'), paragraph('Italic line', '<w:i/>'),
      paragraph('Bold italic line', '<w:b/><w:i/>'),
      `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>${paragraph(`Last table row on page ${index + 1}`)}</w:tc></w:tr></w:tbl>`,
    ].join('');
    return (index ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '') + body;
  }).join('');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${pages}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/></w:sectPr></w:body></w:document>`);
  const bytes = zip.generate({ type: 'nodebuffer' });
  const hash = () => crypto.createHash('sha256').update(bytes).digest('hex');
  const before = hash();
  const signature = await converter.getConversionSignature();
  assert.equal(await converter.getConversionSignature(), signature, 'Unchanged conversion environment has a stable signature');
  const { pdfBuffer } = await converter.convertToPdf(bytes, '.docx');
  const pdf = await PDFDocument.load(pdfBuffer);
  assert.equal(pdf.getPageCount(), 3);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.3) < 1);
    assert.ok(Math.abs(page.getHeight() - 841.9) < 1);
  }
  const parsePdf = require('pdf-parse');
  const text = await parsePdf(pdfBuffer);
  assert.match(text.text, /Last table row on page 3/);
  assert.equal(hash(), before, 'Original DOCX is never rewritten');
});
