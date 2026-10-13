const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const IN_DIR = process.argv[2];
const OUT_DIR = process.argv[3];

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const textOf = (frag) => [...frag.matchAll(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  .map((m) => m[2]).join('').replace(/\s+/g, ' ').trim();

const splitTables = (xml) => xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
const splitRows = (tbl) => tbl.match(/<w:tr(\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];
const splitCells = (row) => row.match(/<w:tc(\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];
const splitParas = (xml) => xml.match(/<w:p(\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];

const setParaText = (para, text) => {
  let first = true;
  let found = false;
  const out = para.replace(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (m, attrs) => {
    found = true;
    if (first) { first = false; return `<w:t${attrs || ''}>${escXml(text)}</w:t>`; }
    return `<w:t${attrs || ''}></w:t>`;
  });
  if (!found) {
    return para.replace(/<\/w:p>$/, `<w:r><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`);
  }
  return out;
};

const setCellText = (cell, text) => {
  const paras = splitParas(cell);
  if (paras.length === 0) return cell;
  let out = cell.replace(paras[0], () => setParaText(paras[0], text));
  for (let i = 1; i < paras.length; i++) {
    out = out.replace(paras[i], () => setParaText(paras[i], ''));
  }
  return out;
};

const setParaInCell = (cell, re, text) => {
  const paras = splitParas(cell);
  for (const p of paras) {
    if (re.test(textOf(p))) return cell.replace(p, () => setParaText(p, text));
  }
  return cell;
};

const paraReplaceAll = (xml, re, text) => {
  const paras = splitParas(xml);
  let out = xml;
  let n = 0;
  for (const p of paras) {
    if (re.test(textOf(p))) {
      out = out.replace(p, () => setParaText(p, text));
      n++;
    }
  }
  return { xml: out, count: n };
};

const rebuildTable = (tbl, headerCount, loopRows, tailRows) => {
  const rows = splitRows(tbl);
  const head = rows.slice(0, headerCount);
  return tbl.slice(0, tbl.indexOf(rows[0])) + [...head, ...loopRows, ...tailRows].join('') + tbl.slice(tbl.indexOf(rows[rows.length - 1]) + rows[rows.length - 1].length);
};

const joinRow = (sampleRow, cells) => {
  const open = (sampleRow.match(/^<w:tr(\s[^>]*)?>/) || ['<w:tr>'])[0];
  return `${open}${cells.join('')}</w:tr>`;
};

const findTable = (tables, sig) => tables.findIndex((t) => {
  const rows = splitRows(t);
  return rows.length > 0 && textOf(rows[0]).includes(sig);
});

const loadXml = (file) => {
  const zip = new PizZip(fs.readFileSync(file));
  return { zip, xml: zip.file('word/document.xml').asText() };
};

const saveXml = (zip, xml, file) => {
  zip.file('word/document.xml', xml);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zip.generate({ type: 'nodebuffer' }));
};

const tokenizePlanNumbers = (xml) => {
  const paras = splitParas(xml);
  let out = xml;
  const rules = [
    [/486(\s+trụ Tự đầu tư)/, '{const_plan_tdt}$1'],
    [/246(\s+trụ Liên kết)/, '{const_plan_lk}$1'],
    [/511(\s+trụ Nhượng quyền)/, '{const_plan_nq}$1'],
    [/478(\s+trụ NPP)/, '{const_plan_npp}$1'],
  ];
  for (const p of paras) {
    const t = textOf(p);
    let nt = t;
    for (const [re, to] of rules) nt = nt.replace(re, to);
    if (nt !== t) out = out.replace(p, () => setParaText(p, nt));
  }
  return out;
};

const tokenizeDocNumber = (xml) => {
  const paras = splitParas(xml);
  let out = xml;
  for (const p of paras) {
    const t = textOf(p);
    if (/Số:[^/]*\/BCĐX-EGREEN-TMT/.test(t)) {
      out = out.replace(p, () => setParaText(p, 'Số: {const_so_van_ban}'));
    }
  }
  return out;
};

const LUYKE_LOOP = ['{#luy_ke}{stt}', '{loai_hinh}', '{ke_hoach}', '{de_xuat}', '{luy_ke}', '{chenh_lech}{/luy_ke}'];
const LUYKE_TOTAL = ['', '', '{luy_ke_f_kehoach_value}', '', '{luy_ke_f_luyke_value}', ''];

const loopLuyKe = (tables, ti) => {
  const rows = splitRows(tables[ti]);
  const loopCells = splitCells(rows[1]).map((c, i) => setCellText(c, LUYKE_LOOP[i] !== undefined ? LUYKE_LOOP[i] : ''));
  const loopRow = joinRow(rows[1], loopCells);
  const totalCells = splitCells(rows[rows.length - 1]).map((c, i) => setCellText(c, LUYKE_TOTAL[i] !== undefined ? LUYKE_TOTAL[i] : ''));
  return rebuildTable(tables[ti], 1, [loopRow], [joinRow(rows[rows.length - 1], totalCells)]);
};

const signCells = (tables, ti, tgdToken, tgdNameRe) => {
  const nameRe = tgdNameRe || /Nguyễn Huy Phong|Lê Hoàng Hải/;
  const rows = splitRows(tables[ti]);
  const cells = splitCells(rows[0]);
  let t = tables[ti];
  if (cells[1]) {
    const c = setParaInCell(cells[1], /Đỗ Mai Hương/, '{const_signer_ketoan}');
    t = t.replace(cells[1], () => c);
  }
  if (cells[2]) {
    const c = setParaInCell(cells[2], nameRe, tgdToken);
    t = t.replace(cells[2], () => c);
  }
  return t;
};

const addrTable = (tables) => tables.findIndex((x) => {
  const rr = splitRows(x);
  return rr.length === 2 && /Địa chỉ/.test(textOf(rr[0]));
});

function buildTDT(xml) {
  let out = tokenizePlanNumbers(xml);
  out = tokenizeDocNumber(out);
  let r = paraReplaceAll(out, /Giám đốc khu vực khai thác:/, 'Giám đốc khu vực khai thác: {nguoi_phu_trach} - (Miền ………)');
  out = r.xml;
  r = paraReplaceAll(out, /Thời gian lắp đặt:/, 'Thời gian lắp đặt: {thoi_gian_lap_dat}');
  out = r.xml;
  r = paraReplaceAll(out, /Thời gian nghiệm thu/, 'Thời gian nghiệm thu đưa vào khai thác: {thoi_gian_nghiem_thu}');
  out = r.xml;
  r = paraReplaceAll(out, /\(Bằng chữ:/, '(Bằng chữ: )');
  out = r.xml;
  r = paraReplaceAll(out, /Pháp lý đất/, '- Pháp lý đất : {note_phap_ly}');
  out = r.xml;
  r = paraReplaceAll(out, /Thời gian thuê/, '- Thời gian thuê : {thoi_han_thue_dat}');
  out = r.xml;

  let tables = splitTables(out);
  let ti = findTable(tables, 'Địa chỉ lắp đặt');
  {
    const rows = splitRows(tables[ti]);
    let t = tables[ti];
    const vals = [': {address}', ': {dien_tich_mat_bang}', ': {nguon_dien}'];
    for (let i = 0; i < 3; i++) {
      const cells = splitCells(rows[i]);
      const last = cells[cells.length - 1];
      t = t.replace(last, () => setCellText(last, vals[i]));
    }
    out = out.replace(tables[ti], () => t);
  }

  tables = splitTables(out);
  ti = findTable(tables, 'Các khoản mục chi phí đầu tư');
  {
    const rows = splitRows(tables[ti]);
    const filled = splitCells(rows[1]).map((c, i) => setCellText(c, [
      '{#tdt_cost}{stt}', '{khoan_muc}', '{so_luong}', '{don_gia}', '{thanh_tien}{/tdt_cost}'
    ][i]));
    const loopRow = joinRow(rows[1], filled);
    const totalCells = splitCells(rows[rows.length - 1]).map((c, i) => setCellText(c, ['', 'Tổng cộng chi phí', '', '', '{tdt_tong_cong}'][i]));
    const totalRow = joinRow(rows[rows.length - 1], totalCells);
    out = out.replace(tables[ti], () => rebuildTable(tables[ti], 1, [loopRow], [totalRow]));
  }

  tables = splitTables(out);
  ti = findTable(tables, 'Số lượng trụ theo kế hoạch');
  out = out.replace(tables[ti], () => loopLuyKe(tables, ti));

  tables = splitTables(out);
  ti = findTable(tables, 'CHỦ TỊCH HĐQT');
  out = out.replace(tables[ti], () => signCells(tables, ti, '{const_signer_tgd_tdt}', /Lê Hoàng Hải/));

  tables = splitTables(out);
  {
    const at = addrTable(tables);
    if (at >= 0) {
      const rr = splitRows(tables[at]);
      const cells = splitCells(rr[1]);
      let a = tables[at];
      a = a.replace(cells[1], () => setCellText(cells[1], '{address} {link_de_xuat}'));
      out = out.replace(tables[at], () => a);
    }
  }
  return out;
}

function buildNQ(xml) {
  let out = tokenizePlanNumbers(xml);
  out = tokenizeDocNumber(out);
  let r = paraReplaceAll(out, /Giám đốc khu vực khai thác:/, 'Giám đốc khu vực khai thác: {nguoi_phu_trach} – GĐKV Miền …');
  out = r.xml;
  r = paraReplaceAll(out, /Loại trụ sạc:/, 'Loại trụ sạc: ');
  out = r.xml;
  r = paraReplaceAll(out, /Thời gian lắp đặt:/, 'Thời gian lắp đặt: {thoi_gian_lap_dat}.');
  out = r.xml;
  r = paraReplaceAll(out, /Thời gian nghiệm thu/, 'Thời gian nghiệm thu đưa vào khai thác: {thoi_gian_nghiem_thu}.');
  out = r.xml;
  r = paraReplaceAll(out, /với Chủ đầu tư Công ty/, 'với Chủ đầu tư Công ty {nq_ten_khach_hang}.');
  out = r.xml;

  const infoMap = {
    'Tên Khách hàng': ': {nq_ten_khach_hang}',
    'MST': ': {nq_mst}',
    'Đại diện': ': {nq_nguoi_dai_dien}',
    'Địa chỉ lắp đặt': ': {address}',
    'Số điện thoại': ': {nq_sdt}',
    'Số tài khoản': ': {nq_so_tai_khoan}',
    'Diện tích mặt bằng': ': {dien_tich_mat_bang}',
    'Nguồn điện': ': {nguon_dien}',
  };
  {
    const tables = splitTables(out);
    const ti = tables.findIndex((x) => /Tên Khách hàng/.test(textOf(x)));
    if (ti >= 0) {
      const rows = splitRows(tables[ti]);
      let t = tables[ti];
      const rest = { 'Địa chỉ': ': {address}' };
      for (const row of rows) {
        const cells = splitCells(row);
        const label = textOf(cells[0]);
        const text = infoMap[label] || rest[label];
        if (!text || cells.length < 2) continue;
        const last = cells[cells.length - 1];
        t = t.replace(last, () => setCellText(last, text));
      }
      out = out.replace(tables[ti], () => t);
    }
  }

  let tables = splitTables(out);
  let ti = findTable(tables, 'Giá niêm yết');
  {
    const rows = splitRows(tables[ti]);
    const loopCells = splitCells(rows[1]).map((c, i) => setCellText(c, [
      '{#loai_tru_nq}{stt}', '{loai_tru}', 'Trụ', '{gia_niem_yet}', '{gia_uu_dai}', '{so_luong}', '{thanh_tien}', '{/loai_tru_nq}'
    ][i]));
    const loopRow = joinRow(rows[1], loopCells);
    const totalCells = splitCells(rows[rows.length - 1]).map((c, i) => setCellText(c, ['', 'Tổng cộng', '', '', '', '', '{loai_tru_nq_f_tong_value}', ''][i]));
    const totalRow = joinRow(rows[rows.length - 1], totalCells);
    out = out.replace(tables[ti], () => rebuildTable(tables[ti], 1, [loopRow], [totalRow]));
  }

  tables = splitTables(out);
  ti = tables.findIndex((x) => /CHỦ ĐẦU TƯ NHƯỢNG QUYỀN/.test(textOf(x)));
  if (ti >= 0) {
    const rows = splitRows(tables[ti]);
    const cells = splitCells(rows[rows.length - 1]);
    let t = tables[ti];
    t = t.replace(cells[0], () => setCellText(cells[0], '{nq_chia_loi_nhuan_tmt} VNĐ'));
    t = t.replace(cells[1], () => setCellText(cells[1], '{nq_chia_loi_nhuan_nq} VNĐ'));
    out = out.replace(tables[ti], () => t);
  }

  tables = splitTables(out);
  ti = findTable(tables, 'Số lượng trụ theo kế hoạch');
  if (ti >= 0) out = out.replace(tables[ti], () => loopLuyKe(tables, ti));

  tables = splitTables(out);
  ti = findTable(tables, 'CHỦ TỊCH HĐQT');
  if (ti >= 0) out = out.replace(tables[ti], () => signCells(tables, ti, '{const_signer_tgd_nq_lk}'));

  tables = splitTables(out);
  {
    const at = addrTable(tables);
    if (at >= 0) {
      const rr = splitRows(tables[at]);
      const cells = splitCells(rr[1]);
      let a = tables[at];
      a = a.replace(cells[cells.length - 1], () => setCellText(cells[cells.length - 1], '{address} {link_de_xuat}'));
      out = out.replace(tables[at], () => a);
    }
  }
  return out;
}

function buildLK(xml) {
  let out = tokenizePlanNumbers(xml);
  out = tokenizeDocNumber(out);
  let r = paraReplaceAll(out, /Giám đốc khu vực khai thác:/, 'Giám đốc khu vực khai thác: {nguoi_phu_trach} – GĐKV Miền …');
  out = r.xml;
  r = paraReplaceAll(out, /Thời gian lắp đặt:/, 'Thời gian lắp đặt: {thoi_gian_lap_dat}');
  out = r.xml;
  r = paraReplaceAll(out, /Thời gian nghiệm thu/, 'Thời gian nghiệm thu đưa vào khai thác: {thoi_gian_nghiem_thu}');
  out = r.xml;
  r = paraReplaceAll(out, /với Công Ty/, 'với Công Ty {lk_ten_phap_nhan}.');
  out = r.xml;

  const infoMap = {
    'Tên pháp nhân/HKD': ': {lk_ten_phap_nhan}',
    '- MST': ': {lk_mst}',
    '- Người đại diện': ': {lk_nguoi_dai_dien}',
    '- Địa chỉ trên ĐKKD': ': {lk_dia_chi_dkkd}',
    'Số điện thoại': ': {lk_sdt}',
    'Địa chỉ lắp đặt': ': {address}',
    'Diện tích mặt bằng': ': {dien_tich_mat_bang} m2',
    'Nguồn điện': ': {nguon_dien}',
  };
  {
    const tables = splitTables(out);
    const ti = tables.findIndex((x) => /Tên pháp nhân\/HKD/.test(textOf(x)));
    if (ti >= 0) {
      const rows = splitRows(tables[ti]);
      let t = tables[ti];
      for (const row of rows) {
        const cells = splitCells(row);
        const label = textOf(cells[0]);
        const text = infoMap[label];
        if (!text || cells.length < 2) continue;
        const last = cells[cells.length - 1];
        t = t.replace(last, () => setCellText(last, text));
      }
      out = out.replace(tables[ti], () => t);
    }
  }

  let tables = splitTables(out);
  let ti = findTable(tables, 'Chi phí TMT (theo giá bán lẻ)');
  {
    const rows = splitRows(tables[ti]);
    const truIdx = rows.findIndex((row, i) => i > 0 && /^1/.test(textOf(row)) && /Trụ CCS2 60kW/.test(textOf(row)));
    const cpIdx = rows.findIndex((row, i) => i > 0 && /^1/.test(textOf(row)) && /hạ tầng/.test(textOf(row)));
    const truRow = rows[truIdx >= 0 ? truIdx : 2];
    const cpRow = rows[cpIdx >= 0 ? cpIdx : 6];
    const loopTru = joinRow(truRow, splitCells(truRow).map((c, i) => setCellText(c, [
      '{#loai_tru_lk}{stt}', '{loai_tru}', '{so_luong}', '{don_gia}', '{thanh_tien}', '0{/loai_tru_lk}'
    ][i])));
    const loopCp = joinRow(cpRow, splitCells(cpRow).map((c, i) => setCellText(c, [
      '{#chi_phi_lk}{stt}', '{loai_chi_phi}', '', '', '0', '{so_tien}{/chi_phi_lk}'
    ][i])));
    const secI = rows[1];
    const secII = rows.find((row) => /^II /.test(textOf(row))) || rows[5];
    const totalRow = rows[rows.length - 2];
    const ratioRow = rows[rows.length - 1];
    const totalCells = splitCells(totalRow).map((c, i) => setCellText(c, ['', 'Tổng cộng chi phí', '', '', '{loai_tru_lk_f_tmt_value}', '{chi_phi_lk_f_dt_value}'][i]));
    const ratioCells = splitCells(ratioRow).map((c, i) => setCellText(c, ['', 'Tỷ lệ % tham gia các bên', '', '', '{lk_ty_le_tmt}', '{lk_ty_le_doi_tac}'][i]));
    out = out.replace(tables[ti], () => rebuildTable(tables[ti], 1, [secI, loopTru, secII, loopCp].filter(Boolean), [joinRow(totalRow, totalCells), joinRow(ratioRow, ratioCells)]));
  }

  tables = splitTables(out);
  ti = tables.findIndex((x) => /CHỦ ĐẦU TƯ LIÊN KẾT/.test(textOf(x)));
  if (ti >= 0) {
    const rows = splitRows(tables[ti]);
    const cells = splitCells(rows[rows.length - 1]);
    let t = tables[ti];
    t = t.replace(cells[0], () => setCellText(cells[0], '{lk_chia_loi_nhuan_tmt} VNĐ'));
    t = t.replace(cells[1], () => setCellText(cells[1], '{lk_chia_loi_nhuan_lk} VNĐ'));
    out = out.replace(tables[ti], () => t);
  }

  tables = splitTables(out);
  ti = findTable(tables, 'Số lượng trụ theo kế hoạch');
  if (ti >= 0) out = out.replace(tables[ti], () => loopLuyKe(tables, ti));

  tables = splitTables(out);
  ti = findTable(tables, 'CHỦ TỊCH HĐQT');
  if (ti >= 0) out = out.replace(tables[ti], () => signCells(tables, ti, '{const_signer_tgd_nq_lk}'));

  tables = splitTables(out);
  {
    const at = addrTable(tables);
    if (at >= 0) {
      const rr = splitRows(tables[at]);
      const cells = splitCells(rr[1]);
      let a = tables[at];
      a = a.replace(cells[cells.length - 1], () => setCellText(cells[cells.length - 1], '{address} {link_de_xuat}'));
      out = out.replace(tables[at], () => a);
    }
  }
  return out;
}

const MAPPINGS = {
  tdt: {
    tokens: {
      nguoi_phu_trach: { source: 'field', key: 'nguoi_phu_trach' },
      address: { source: 'field', key: 'address' },
      link_de_xuat: { source: 'field', key: 'link_de_xuat' },
      dien_tich_mat_bang: { source: 'field', key: 'dien_tich_mat_bang' },
      nguon_dien: { source: 'field', key: 'nguon_dien' },
      thoi_gian_lap_dat: { source: 'field', key: 'thoi_gian_lap_dat' },
      thoi_gian_nghiem_thu: { source: 'field', key: 'thoi_gian_nghiem_thu' },
      note_phap_ly: { source: 'field', key: 'note_phap_ly' },
      thoi_han_thue_dat: { source: 'field', key: 'thoi_han_thue_dat' },
      tdt_tong_cong: { source: 'field', key: 'tdt_tong_cong' },
      const_so_van_ban: { source: 'const', key: 'so_van_ban' },
      const_plan_tdt: { source: 'const', key: 'plan_tdt' },
      const_plan_lk: { source: 'const', key: 'plan_lk' },
      const_plan_nq: { source: 'const', key: 'plan_nq' },
      const_plan_npp: { source: 'const', key: 'plan_npp' },
      const_signer_ketoan: { source: 'const', key: 'signer_ketoan' },
      const_signer_tgd_tdt: { source: 'const', key: 'signer_tgd_tdt' },
    },
    loops: {
      tdt_cost: { stt: true,
        parts: [
          { kind: 'table', table: 'tdt_tru', columns: { khoan_muc: 'loai_tru', so_luong: 'so_luong', don_gia: 'don_gia', thanh_tien: 'thanh_tien' } },
          { kind: 'table', table: 'tdt_chi_phi_khac', columns: { khoan_muc: 'loai_chi_phi', thanh_tien: 'so_tien' } },
        ] },
      luy_ke: { stt: true,
        parts: [{ kind: 'datalist', listId: 25, columns: { loai_hinh: 'loai_hinh', ke_hoach: 'ke_hoach', de_xuat: 'de_xuat', luy_ke: 'luy_ke', chenh_lech: 'chenh_lech' } }],
        footers: [{ id: 'kehoach', label: 'Tổng kế hoạch', formula: 'SUM(ke_hoach)' }, { id: 'luyke', label: 'Tổng lũy kế', formula: 'SUM(luy_ke)' }] },
    },
  },
  nq: {
    tokens: {
      nguoi_phu_trach: { source: 'field', key: 'nguoi_phu_trach' },
      address: { source: 'field', key: 'address' },
      link_de_xuat: { source: 'field', key: 'link_de_xuat' },
      dien_tich_mat_bang: { source: 'field', key: 'dien_tich_mat_bang' },
      nguon_dien: { source: 'field', key: 'nguon_dien' },
      thoi_gian_lap_dat: { source: 'field', key: 'thoi_gian_lap_dat' },
      thoi_gian_nghiem_thu: { source: 'field', key: 'thoi_gian_nghiem_thu' },
      nq_ten_khach_hang: { source: 'field', key: 'nq_ten_khach_hang' },
      nq_mst: { source: 'field', key: 'nq_mst' },
      nq_nguoi_dai_dien: { source: 'field', key: 'nq_nguoi_dai_dien' },
      nq_sdt: { source: 'field', key: 'nq_sdt' },
      nq_so_tai_khoan: { source: 'field', key: 'nq_so_tai_khoan' },
      nq_chia_loi_nhuan_tmt: { source: 'field', key: 'nq_chia_loi_nhuan_tmt' },
      nq_chia_loi_nhuan_nq: { source: 'field', key: 'nq_chia_loi_nhuan_nq' },
      const_so_van_ban: { source: 'const', key: 'so_van_ban' },
      const_plan_tdt: { source: 'const', key: 'plan_tdt' },
      const_plan_lk: { source: 'const', key: 'plan_lk' },
      const_plan_nq: { source: 'const', key: 'plan_nq' },
      const_plan_npp: { source: 'const', key: 'plan_npp' },
      const_signer_ketoan: { source: 'const', key: 'signer_ketoan' },
      const_signer_tgd_nq_lk: { source: 'const', key: 'signer_tgd_nq_lk' },
    },
    loops: {
      loai_tru_nq: { stt: true,
        parts: [{ kind: 'table', table: 'loai_tru_nq', columns: { loai_tru: 'loai_tru', gia_niem_yet: 'gia_niem_yet', gia_uu_dai: 'gia_uu_dai', so_luong: 'so_luong', thanh_tien: 'thanh_tien' } }],
        footers: [{ id: 'tong', label: 'Tổng cộng', formula: 'SUM(thanh_tien)' }] },
      luy_ke: { stt: true,
        parts: [{ kind: 'datalist', listId: 25, columns: { loai_hinh: 'loai_hinh', ke_hoach: 'ke_hoach', de_xuat: 'de_xuat', luy_ke: 'luy_ke', chenh_lech: 'chenh_lech' } }],
        footers: [{ id: 'kehoach', label: 'Tổng kế hoạch', formula: 'SUM(ke_hoach)' }, { id: 'luyke', label: 'Tổng lũy kế', formula: 'SUM(luy_ke)' }] },
    },
  },
  lk: {
    tokens: {
      nguoi_phu_trach: { source: 'field', key: 'nguoi_phu_trach' },
      address: { source: 'field', key: 'address' },
      link_de_xuat: { source: 'field', key: 'link_de_xuat' },
      dien_tich_mat_bang: { source: 'field', key: 'dien_tich_mat_bang' },
      nguon_dien: { source: 'field', key: 'nguon_dien' },
      thoi_gian_lap_dat: { source: 'field', key: 'thoi_gian_lap_dat' },
      thoi_gian_nghiem_thu: { source: 'field', key: 'thoi_gian_nghiem_thu' },
      lk_ten_phap_nhan: { source: 'field', key: 'lk_ten_phap_nhan' },
      lk_mst: { source: 'field', key: 'lk_mst' },
      lk_nguoi_dai_dien: { source: 'field', key: 'lk_nguoi_dai_dien' },
      lk_dia_chi_dkkd: { source: 'field', key: 'lk_dia_chi_dkkd' },
      lk_sdt: { source: 'field', key: 'lk_sdt' },
      lk_ty_le_tmt: { source: 'field', key: 'lk_ty_le_tmt' },
      lk_ty_le_doi_tac: { source: 'field', key: 'lk_ty_le_doi_tac' },
      lk_chia_loi_nhuan_tmt: { source: 'field', key: 'lk_chia_loi_nhuan_tmt' },
      lk_chia_loi_nhuan_lk: { source: 'field', key: 'lk_chia_loi_nhuan_lk' },
      const_so_van_ban: { source: 'const', key: 'so_van_ban' },
      const_plan_tdt: { source: 'const', key: 'plan_tdt' },
      const_plan_lk: { source: 'const', key: 'plan_lk' },
      const_plan_nq: { source: 'const', key: 'plan_nq' },
      const_plan_npp: { source: 'const', key: 'plan_npp' },
      const_signer_ketoan: { source: 'const', key: 'signer_ketoan' },
      const_signer_tgd_nq_lk: { source: 'const', key: 'signer_tgd_nq_lk' },
    },
    loops: {
      loai_tru_lk: { stt: true,
        parts: [{ kind: 'table', table: 'loai_tru_lk', columns: { loai_tru: 'loai_tru', so_luong: 'so_luong', don_gia: 'gia_niem_yet', thanh_tien: 'thanh_tien' } }],
        footers: [{ id: 'tmt', label: 'Tổng chi phí TMT', formula: 'SUM(thanh_tien)' }] },
      chi_phi_lk: { stt: true,
        parts: [{ kind: 'table', table: 'chi_phi_lk', columns: { loai_chi_phi: 'loai_chi_phi', so_tien: 'so_tien' } }],
        footers: [{ id: 'dt', label: 'Tổng chi phí đối tác', formula: 'SUM(so_tien)' }] },
      luy_ke: { stt: true,
        parts: [{ kind: 'datalist', listId: 25, columns: { loai_hinh: 'loai_hinh', ke_hoach: 'ke_hoach', de_xuat: 'de_xuat', luy_ke: 'luy_ke', chenh_lech: 'chenh_lech' } }],
        footers: [{ id: 'kehoach', label: 'Tổng kế hoạch', formula: 'SUM(ke_hoach)' }, { id: 'luyke', label: 'Tổng lũy kế', formula: 'SUM(luy_ke)' }] },
    },
  },
};

const main = () => {
  if (!IN_DIR || !OUT_DIR) {
    console.error('Usage: node build-bcxd-templates.js <input-dir> <output-dir>');
    process.exit(1);
  }
  const jobs = [
    { file: 'tdt.docx', out: 'tdt.docx', build: buildTDT },
    { file: 'nq.docx', out: 'nq.docx', build: buildNQ },
    { file: 'lk.docx', out: 'lk.docx', build: buildLK },
  ];
  for (const j of jobs) {
    const { zip, xml } = loadXml(path.join(IN_DIR, j.file));
    const out = j.build(xml);
    saveXml(zip, out, path.join(OUT_DIR, j.out));
    const key = j.out.replace('.docx', '');
    fs.writeFileSync(path.join(OUT_DIR, `${key}.mapping.json`), JSON.stringify(MAPPINGS[key], null, 2));
    console.log(`built ${j.out}`);
  }
};

module.exports = { MAPPINGS };

if (require.main === module) main();
