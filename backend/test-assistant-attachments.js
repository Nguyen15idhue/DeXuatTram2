const attachments = require('./src/services/assistant/attachments');
const ExcelJS = require('exceljs');

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

const fake = (name, mimetype, buffer, size) => ({
  originalname: name,
  mimetype,
  size: size !== undefined ? size : buffer.length,
  buffer,
});

const pngBuf = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const pdfBuf = () => Buffer.from('%PDF-1.4\n%EOF', 'utf8');

async function expectThrow(name, fn, code) {
  try {
    await fn();
  } catch (e) {
    check(name, !code || e.statusCode === code, e.statusCode ? `status=${e.statusCode}` : e.message);
    return;
  }
  check(name, false, 'khong throw');
}

async function main() {
  check('mac dinh 5MB', attachments.maxBytes() === 5 * 1024 * 1024);
  check('mac dinh 3 file', attachments.maxFiles() === 3);

  check('allowed png', attachments.allowed('a.png', 'image/png') === true);
  check('allowed pdf', attachments.allowed('a.pdf', 'application/pdf') === true);
  check('allowed docx', attachments.allowed('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') === true);
  check('allowed xlsx', attachments.allowed('a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') === true);
  check('allowed csv', attachments.allowed('a.csv', 'text/csv') === true);
  check('allowed txt', attachments.allowed('a.txt', 'text/plain') === true);
  check('chan exe', attachments.allowed('a.exe', 'application/octet-stream') === false);
  check('chan svg', attachments.allowed('a.svg', 'image/svg+xml') === false);
  check('chan double-ext', attachments.allowed('a.pdf.exe', 'application/octet-stream') === false);
  check('chan js', attachments.allowed('a.js', 'application/javascript') === false);

  const img = await attachments.processOne(fake('anh.png', 'image/png', pngBuf()));
  check('anh tra base64', img.kind === 'image' && !!img.base64);

  const pdf = await attachments.processOne(fake('tai-lieu.pdf', 'application/pdf', pdfBuf()));
  check('pdf kind dung', pdf.kind === 'pdf' && !!pdf.base64);

  const txt = await attachments.processOne(fake('ghi-chu.txt', 'text/plain', Buffer.from('Noi dung de xuat tram moi', 'utf8')));
  check('txt boc text', txt.kind === 'doc' && txt.text.includes('tram moi'));

  const csv = await attachments.processOne(fake('bang.csv', 'text/csv', Buffer.from('ten,gia\nTram A,100', 'utf8')));
  check('csv boc text', csv.kind === 'doc' && csv.text.includes('Tram A'));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DuLieu');
  ws.addRow(['Ten', 'Gia']);
  ws.addRow(['Tram B', 200]);
  const xbuf = await wb.xlsx.writeBuffer();
  const xls = await attachments.processOne(fake('bang.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from(xbuf)));
  check('xlsx boc text', xls.kind === 'doc' && xls.text.includes('Tram B') && xls.text.includes('DuLieu'));

  await expectThrow('docx gia bao 400', () => attachments.processOne(fake('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))), 400);
  await expectThrow('exe bi chan', () => attachments.processOne(fake('a.exe', 'application/octet-stream', Buffer.from([0x4d, 0x5a, 0x90, 0x00]))), 400);
  await expectThrow('qua dung luong', () => attachments.processOne(fake('big.png', 'image/png', pngBuf(), 99 * 1024 * 1024)), 400);
  await expectThrow('file rong', () => attachments.processOne(fake('e.txt', 'text/plain', Buffer.alloc(0))), 400);
  await expectThrow('sai magic', () => attachments.processOne(fake('fake.pdf', 'application/pdf', Buffer.from('hello world, not pdf', 'utf8'))), 400);
  await expectThrow('doc cu huong dan doi', () => attachments.processOne(fake('cu.doc', 'application/msword', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00]))), 400);

  await expectThrow('qua so file', () => attachments.processFiles([
    fake('1.txt', 'text/plain', Buffer.from('a', 'utf8')),
    fake('2.txt', 'text/plain', Buffer.from('b', 'utf8')),
    fake('3.txt', 'text/plain', Buffer.from('c', 'utf8')),
    fake('4.txt', 'text/plain', Buffer.from('d', 'utf8')),
  ]), 400);
  check('rong tra null', (await attachments.processFiles([])) === null);

  const multi = await attachments.processFiles([
    fake('anh.png', 'image/png', pngBuf()),
    fake('ghi-chu.txt', 'text/plain', Buffer.from('Xin chao', 'utf8')),
  ]);
  check('multi co inlines', multi.inlines.length === 1 && multi.inlines[0].mime === 'image/png');
  check('multi co docText', multi.docText.includes('Xin chao'));
  check('multi types', multi.types.includes('image') && multi.types.includes('doc'));

  await new Promise((resolve) => {
    attachments.fileFilter(null, { originalname: 'a.exe', mimetype: 'application/octet-stream' }, (err) => {
      check('fileFilter chan exe', !!err);
      resolve();
    });
  });

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
