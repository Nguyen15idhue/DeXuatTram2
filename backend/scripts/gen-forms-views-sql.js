const fs = require('fs');
const path = require('path');

const FULL_KEYS = new Set([
  'description', 'ghi_chu',
  'tdt_tru', 'tdt_chi_phi_khac', 'tdt_tong_cong',
]);

const norm = (f) => (typeof f === 'string' ? { key: f } : f);

function pairRows(fields) {
  const rows = [];
  let i = 0;
  while (i < fields.length) {
    const a = norm(fields[i]);
    const aFull = a.full || FULL_KEYS.has(a.key);
    if (aFull) {
      rows.push({ cols: 1, items: [a] });
      i += 1;
      continue;
    }
    const b = i + 1 < fields.length ? norm(fields[i + 1]) : null;
    const bFull = b ? (b.full || FULL_KEYS.has(b.key)) : true;
    if (b && !bFull) {
      rows.push({ cols: 2, items: [a, b] });
      i += 2;
    } else {
      rows.push({ cols: 1, items: [a] });
      i += 1;
    }
  }
  return rows;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const j = (o) => q(JSON.stringify(o));
const formSub = (entity, purpose) =>
  `(SELECT id FROM forms WHERE entity='${entity}' AND purpose='${purpose}' LIMIT 1)`;
const fieldSub = (entity, key) =>
  `(SELECT id FROM field_definitions WHERE entity='${entity}' AND \`key\`='${key}' LIMIT 1)`;
const viewSub = (entity) =>
  `(SELECT id FROM views WHERE entity='${entity}' ORDER BY id LIMIT 1)`;

function genForm(entity, purpose, name, desc, sectionsSpec) {
  const out = [];
  out.push(`-- ============ FORM: ${entity} / ${purpose} ============`);
  out.push(`INSERT INTO forms (entity, name, description, status, purpose)`);
  out.push(`SELECT ${q(entity)}, ${q(name)}, ${q(desc)}, 'active', ${q(purpose)}`);
  out.push(`WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity=${q(entity)} AND purpose=${q(purpose)});`);
  out.push('');

  let order = 0;
  const layoutSections = [];
  const inserts = [];

  sectionsSpec.forEach((sec, si) => {
    const secId = `${entity}_${purpose}_s${si + 1}`;
    const rowDefs = pairRows(sec.fields);
    const layoutRows = [];

    rowDefs.forEach((rd, ri) => {
      const rowId = `${secId}_r${ri + 1}`;
      layoutRows.push({ id: rowId, columns: rd.cols === 2 ? '1:2' : '1:1' });
      rd.items.forEach((item, ci) => {
        const cfg = { rowId, colSpan: 1, colIndex: ci, rowIndex: ri };
        if (item.conditions) {
          cfg.conditions = item.conditions;
          cfg.conditionLogic = item.conditionLogic || 'AND';
        }
        inserts.push(`(${formSub(entity, purpose)}, ${fieldSub(entity, item.key)}, ${order}, 1, ${j(cfg)})`);
        order += 1;
      });
    });

    layoutSections.push({
      id: secId,
      title: sec.title,
      collapsible: false,
      ...(sec.visibleWhen ? { visibleWhen: sec.visibleWhen } : {}),
      rows: layoutRows,
    });
  });

  const layout = { rows: [], sections: layoutSections };
  out.push(`DELETE FROM form_fields WHERE form_id = ${formSub(entity, purpose)};`);
  out.push(`UPDATE forms SET layout_config = ${j(layout)}, updated_at = NOW() WHERE entity=${q(entity)} AND purpose=${q(purpose)};`);
  out.push('');
  out.push(`INSERT INTO form_fields (form_id, field_id, order_index, visible, config) VALUES`);
  out.push(inserts.join(',\n') + ';');
  out.push('');
  return out.join('\n');
}

function genView(entity, name, cols) {
  const out = [];
  out.push(`-- ============ VIEW: ${entity} ============`);
  out.push(`INSERT INTO views (entity, name, description, status)`);
  out.push(`SELECT ${q(entity)}, ${q(name)}, ${q('View chuẩn hóa cho ' + entity)}, 'active'`);
  out.push(`WHERE NOT EXISTS (SELECT 1 FROM views WHERE entity=${q(entity)});`);
  out.push(`DELETE FROM view_fields WHERE view_id = ${viewSub(entity)};`);
  const values = cols.map((c, i) =>
    `(${viewSub(entity)}, ${fieldSub(entity, c.key)}, ${i}, ${c.visible === 0 ? 0 : 1}, ${c.width || 'NULL'}, ${c.sortable === 0 ? 0 : 1}, ${c.filterable === 0 ? 0 : 1}, NULL)`
  );
  out.push(`INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config) VALUES`);
  out.push(values.join(',\n') + ';');
  out.push('');
  return out.join('\n');
}

const proposalSections = [
  { title: 'Thông tin chủ sở hữu', fields: ['owner_name', 'owner_phone'] },
  { title: 'Vị trí', fields: ['latitude', 'longitude', 'address', 'province', 'xa_phuong', 'area', 'dien_tich_mat_bang', 'vung_mien', 'land_type'] },
  { title: 'Thông tin đề xuất', fields: ['description', 'ghi_chu', 'investment_cost', 'loai_tru', 'mo_hinh_dau_tu', 'ma_tinh', 'nguon_dien', 'thoi_gian_lap_dat', 'thoi_gian_nghiem_thu'] },
  { title: 'Chi phí đầu tư TDT', visibleWhen: { field: 'mo_hinh_dau_tu', value: 'TDT' }, fields: [{ key: 'tdt_tru', full: true }, { key: 'tdt_chi_phi_khac', full: true }, { key: 'tdt_tong_cong', full: true }] },
  { title: 'Thông tin CĐT Liên kết', visibleWhen: { field: 'mo_hinh_dau_tu', value: 'LK' }, fields: ['lk_ten_phap_nhan', 'lk_mst', 'lk_nguoi_dai_dien', 'lk_sdt', 'lk_dia_chi_dkkd', 'lk_ty_le_tmt', 'lk_ty_le_doi_tac', 'lk_chia_loi_nhuan_tmt', 'lk_chia_loi_nhuan_lk'] },
  { title: 'Thông tin Nhượng quyền', visibleWhen: { field: 'mo_hinh_dau_tu', value: 'NQ' }, fields: ['nq_gia_niem_yet', 'nq_gia_uu_dai', 'nq_ten_khach_hang', 'nq_mst', 'nq_nguoi_dai_dien', 'nq_sdt', 'nq_so_tai_khoan', 'nq_chia_loi_nhuan_tmt', 'nq_chia_loi_nhuan_nq', 'nq_thanh_toan_lan_1', 'nq_thanh_toan_lan_2', 'nq_thanh_toan_lan_3'] },
  {
    title: 'Hồ sơ & Hình ảnh',
    fields: [
      { key: 'legal_document', conditions: [{ field: 'mo_hinh_dau_tu', operator: '=', value: 'TDT' }, { field: 'mo_hinh_dau_tu', operator: '=', value: 'LK' }], conditionLogic: 'OR' },
      'site_images', 'phap_ly_dat', 'dkkd_cccd_hkd',
    ],
  },
  { title: 'Thông tin hệ thống', fields: ['status', 'ma_de_xuat', 'nguoi_de_xuat', 'sales_quan_ly'] },
];

const stationSections = [
  { title: 'Thông tin trạm', fields: ['ma_tram', 'name', 'status', 'nha_dieu_hanh', 'doi_tuong_quan_ly', 'nha_dau_tu', 'loai_phuong_tien', 'loai_tru_sac', 'description'] },
  { title: 'Vị trí', fields: ['latitude', 'longitude', 'province', 'address'] },
  { title: 'Thông số kỹ thuật', fields: ['tower_type', 'power_capacity', 'so_luong_tru'] },
  { title: 'Thống kê', fields: ['tong_so_phien_sac', 'so_dien_ban_duoc'] },
];

const userSections = [
  { title: 'Thông tin tài khoản', fields: ['employee_code', 'full_name', 'email', 'phone', 'password', 'external_id', 'role', 'status', 'department', 'chuc_vu', 'avatar'] },
];

const proposalView = [
  { key: 'ma_de_xuat', width: 100 },
  { key: 'owner_name', width: 150 },
  { key: 'owner_phone', width: 120 },
  { key: 'mo_hinh_dau_tu', width: 100 },
  { key: 'address', width: 250 },
  { key: 'province', width: 120 },
  { key: 'status', width: 100 },
  { key: 'latitude', width: 100 },
  { key: 'longitude', width: 100 },
  { key: 'investment_cost', width: 110 },
  { key: 'nguon_dien', width: 110 },
  { key: 'dien_tich_mat_bang', width: 110 },
  { key: 'nguoi_de_xuat', width: 150 },
  { key: 'id_1office', width: 120, visible: 0, sortable: 0 },
  { key: 'he_thong_nguon', width: 110, visible: 0, sortable: 0 },
  { key: 'nhom_nguoi_tao', width: 110, visible: 0, sortable: 0 },
  { key: 'sales_quan_ly', width: 130, visible: 0, sortable: 0 },
  { key: 'nguoi_phu_trach', width: 130, visible: 0, sortable: 0 },
  { key: 'nguoi_giao_phu_trach', width: 140, visible: 0, sortable: 0 },
];

const stationView = [
  { key: 'ma_tram', width: 100 },
  { key: 'name', width: 200 },
  { key: 'status', width: 100 },
  { key: 'nha_dieu_hanh', width: 120 },
  { key: 'doi_tuong_quan_ly', width: 120 },
  { key: 'nha_dau_tu', width: 140 },
  { key: 'loai_phuong_tien', width: 110 },
  { key: 'loai_tru_sac', width: 110 },
  { key: 'so_luong_tru', width: 90 },
  { key: 'address', width: 250 },
  { key: 'province', width: 120 },
  { key: 'latitude', width: 100 },
  { key: 'longitude', width: 100 },
  { key: 'tower_type', width: 100 },
  { key: 'power_capacity', width: 90 },
  { key: 'tong_so_phien_sac', width: 110 },
  { key: 'so_dien_ban_duoc', width: 120 },
];

const userView = [
  { key: 'full_name', width: 180 },
  { key: 'email', width: 200 },
  { key: 'phone', width: 120 },
  { key: 'role', width: 110 },
  { key: 'status', width: 100 },
  { key: 'department', width: 120 },
  { key: 'chuc_vu', width: 120 },
  { key: 'employee_code', width: 100 },
  { key: 'external_id', width: 100 },
];

const header = [
  '-- -*- coding: utf-8 -*-',
  '-- 62: Rebuild Forms + Views chuẩn hóa cho 3 entity (SINH TỰ ĐỘNG bởi backend/scripts/gen-forms-views-sql.js)',
  '-- Bước 6 + 7 của docs/5/38.ChuanHoaFields3Entity_kehoach.md',
  '-- Tham chiếu field theo (entity, key) — không hardcode field_id (portable local/VPS).',
  '',
];

const body = [
  genForm('station_proposals', 'create', 'Form station_proposals - Nhập liệu', 'Form nhập liệu đề xuất trạm', proposalSections),
  genForm('station_proposals', 'view', 'Form station_proposals - Xem/sửa', 'Form xem/sửa đề xuất trạm', proposalSections),
  genForm('stations', 'create', 'Form stations - Nhập liệu', 'Form nhập liệu trạm sạc', stationSections),
  genForm('stations', 'view', 'Form stations - Xem / sửa', 'Form xem/sửa trạm sạc', stationSections),
  genForm('users', 'create', 'Form Users - Nhập liệu', 'Form nhập liệu người dùng', userSections),
  genForm('users', 'view', 'Form Users - Xem/sửa', 'Form xem/sửa người dùng', userSections),
  genView('station_proposals', 'View Proposals', proposalView),
  genView('stations', 'View Stations', stationView),
  genView('users', 'View Users', userView),
];

const outPath = path.join(__dirname, '..', '..', 'database', '62-rebuild-forms-views.sql');
fs.writeFileSync(outPath, header.concat(body).join('\n'), 'utf8');
console.log('Generated', outPath);
