require('dotenv').config();
const pool = require('../src/utils/db');

const run = async () => {
  const poles = [
    { name: 'Trụ AC 22kW', charging_type: 'AC', power_kw: 22, supplier: 'Vendor A' },
    { name: 'Trụ DC 60kW', charging_type: 'DC', power_kw: 60, supplier: 'Vendor B' },
    { name: 'Trụ DC 120kW', charging_type: 'DC', power_kw: 120, supplier: 'Vendor B' },
    { name: 'Trụ AC 7kW', charging_type: 'AC', power_kw: 7, supplier: 'Vendor C' },
    { name: 'Trụ DC 30kW', charging_type: 'DC', power_kw: 30, supplier: 'Vendor A' }
  ];

  const poleIds = [];
  for (const pole of poles) {
    const [result] = await pool.query(
      'INSERT INTO charging_poles (name, charging_type, power_kw, quantity, supplier) VALUES (?, ?, ?, 0, ?)',
      [pole.name, pole.charging_type, pole.power_kw, pole.supplier]
    );
    poleIds.push(result.insertId);
  }

  const import1Date = '2026-10-20 09:00:00';
  const [import1] = await pool.query(
    'INSERT INTO warehouse_imports (importer_user_id, import_date, note) VALUES (?, ?, ?)',
    [1, import1Date, 'Nhập lô trụ AC/DC đầu kỳ']
  );
  await pool.query(
    'INSERT INTO warehouse_import_items (import_id, pole_id, quantity) VALUES ?',
    [poleIds.map((id, index) => [import1.insertId, id, index < 2 ? 10 : 5])]
  );
  for (let i = 0; i < poleIds.length; i++) {
    await pool.query('UPDATE charging_poles SET quantity = quantity + ? WHERE id = ?', [i < 2 ? 10 : 5, poleIds[i]]);
  }

  const import2Date = '2026-10-25 14:30:00';
  const [import2] = await pool.query(
    'INSERT INTO warehouse_imports (importer_user_id, import_date, note) VALUES (?, ?, ?)',
    [1, import2Date, 'Nhập bổ sung trụ DC 120kW']
  );
  await pool.query(
    'INSERT INTO warehouse_import_items (import_id, pole_id, quantity) VALUES (?, ?, ?)',
    [import2.insertId, poleIds[2], 3]
  );
  await pool.query('UPDATE charging_poles SET quantity = quantity + 3 WHERE id = ?', [poleIds[2]]);

  const [stationRows] = await pool.query('SELECT id FROM charging_stations ORDER BY id LIMIT 1');
  const stationId = stationRows.length > 0 ? stationRows[0].id : null;
  if (!stationId) {
    console.log('Không có charging_stations để xuất kho, bỏ qua phiếu xuất.');
    await pool.end();
    return;
  }

  const [exportHeader] = await pool.query(
    'INSERT INTO warehouse_exports (exporter_user_id, export_date, reason, charging_station_id) VALUES (?, ?, ?, ?)',
    [1, '2026-10-28 10:00:00', 'Xuất lắp đặt trạm', stationId]
  );
  await pool.query(
    'INSERT INTO warehouse_export_items (export_id, pole_id, quantity) VALUES (?, ?, ?), (?, ?, ?)',
    [exportHeader.insertId, poleIds[0], 2, exportHeader.insertId, poleIds[1], 1]
  );
  await pool.query('UPDATE charging_poles SET quantity = quantity - 2 WHERE id = ?', [poleIds[0]]);
  await pool.query('UPDATE charging_poles SET quantity = quantity - 1 WHERE id = ?', [poleIds[1]]);

  console.log('Đã tạo dữ liệu mẫu kho:');
  console.log(`  - ${poles.length} trụ sạc`);
  console.log('  - 2 phiếu nhập');
  console.log('  - 1 phiếu xuất');
  await pool.end();
};

run().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
