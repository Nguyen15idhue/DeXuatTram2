import { getColumnSource, resolveColumnDatalist, collectTableDatalistIds, findBaseField } from './src/utils/tableColumnSource.js';

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

const FIELDS = [
  { id: 10, key: 'loai_tru', label: 'Loại trụ', type: 'select', data_list_id: 18, data_list_column: 'ten' },
  { id: 11, key: 'ghi_chu', label: 'Ghi chú', type: 'text' },
];

function main() {
  const manual = { key: 'a', label: 'A', column_type: 'select', options: ['X', 'Y'] };
  check('manual khong field', getColumnSource(manual, null) === 'manual');
  check('manual dl null', resolveColumnDatalist(manual, null) === null);

  const explicit = { key: 'b', column_type: 'select', data_list_id: 18, data_list_column: 'ten' };
  check('explicit datalist', getColumnSource(explicit, null) === 'datalist');
  const r1 = resolveColumnDatalist(explicit, null);
  check('explicit ids', r1 && r1.data_list_id === 18 && r1.data_list_column === 'ten');

  const linked = { key: 'loai_tru', column_type: 'select', field_id: 10 };
  const base = findBaseField(linked, FIELDS);
  check('tim base theo field_id', base && base.id === 10);
  check('legacy ke thua base', getColumnSource(linked, base) === 'inherit');
  const r2 = resolveColumnDatalist(linked, base);
  check('ke thua ids cua base', r2 && r2.data_list_id === 18 && r2.data_list_column === 'ten');

  const override = { key: 'loai_tru', column_type: 'select', field_id: 10, data_list_id: 21, data_list_column: 'ten' };
  check('col cu the thang base (legacy ??)', getColumnSource(override, base) === 'datalist');
  check('col cu the ids', resolveColumnDatalist(override, base).data_list_id === 21);

  const forceManual = { key: 'loai_tru', column_type: 'select', field_id: 10, options_source: 'manual', data_list_id: 18, data_list_column: 'ten', options: ['Tay'] };
  check('explicit manual ngat ke thua', getColumnSource(forceManual, base) === 'manual');
  check('explicit manual dl null', resolveColumnDatalist(forceManual, base) === null);

  const forceInheritNoDl = { key: 'ghi_chu', column_type: 'text', field_id: 11, options_source: 'inherit' };
  const base2 = findBaseField(forceInheritNoDl, FIELDS);
  check('inherit base tay -> null', resolveColumnDatalist(forceInheritNoDl, base2) === null);

  const legacyManualBase = { key: 'ghi_chu', column_type: 'text', field_id: 11 };
  check('legacy base tay -> manual', getColumnSource(legacyManualBase, base2) === 'manual');

  const ids = collectTableDatalistIds([manual, explicit, linked, { key: 'x', column_type: 'select', field_id: 11 }], FIELDS);
  check('collect du id cot + ke thua', ids.includes(18) && ids.length === 1, JSON.stringify(ids));

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
