require('dotenv').config();
const pool = require('../src/utils/db');
const chargingStationService = require('../src/services/chargingStationService');

const run = async () => {
  const tag = `E2E${Date.now() % 100000}`;

  const [fileRes] = await pool.query(
    "INSERT INTO files (original_name, storage_key, mime_type, size, status) VALUES (?, ?, 'application/pdf', 1024, 'active')",
    [`${tag}_signed.pdf`, `test/${tag}_signed.pdf`]
  );
  const fileId = fileRes.insertId;

  const chot = [{ mo_hinh: 'NQ', so_luong: 2, loai_tru: 'Trụ DC 30kW', supplier_id: 4, supplier_name: 'Meter', gia_chot: 1000, thanh_tien: 2000 }];
  const [proposalRes] = await pool.query(
    `INSERT INTO station_proposals (user_id, status, latitude, longitude, owner_name, owner_phone, custom_data, signed_file_id, chot_so_luong_tru, tong_gia_tri_chot)
     VALUES (1, 'APPROVED', 10.1, 106.1, ?, '0900000000', CAST(? AS JSON), ?, CAST(? AS JSON), 2000)`,
    [`E2E ${tag}`, JSON.stringify({ ma_de_xuat: `E2E_${tag}`, mo_hinh_dau_tu: 'NQ', ma_tinh: 'DN' }), fileId, JSON.stringify(chot)]
  );
  const proposalId = proposalRes.insertId;

  const created = await chargingStationService.createFromApprovedProposal(proposalId, { actorId: 1, source: 'script' });
  const stationId = created.record.id;
  console.log(`Tạo ON trạm #${stationId} (proposal #${proposalId}), committed: DC30 x2 (Meter)`);

  // Nhập kho 5 trụ DC30 từ Meter
  const [importRes] = await pool.query(
    "INSERT INTO warehouse_imports (importer_user_id, import_date, note) VALUES (1, NOW(), 'Seed E2E')"
  );
  await pool.query(
    "INSERT INTO warehouse_import_items (import_id, supplier_id, pole_id, quantity) VALUES (?, 4, 7, 5)",
    [importRes.insertId]
  );
  await pool.query(
    "INSERT INTO supplier_charging_poles (supplier_id, charging_pole_id, quantity) VALUES (4, 7, 5) ON DUPLICATE KEY UPDATE quantity = quantity + 5"
  );
  await pool.query("UPDATE charging_poles SET quantity = (SELECT COALESCE(SUM(quantity),0) FROM supplier_charging_poles WHERE charging_pole_id = charging_poles.id) WHERE id = 7");
  console.log('Đã nhập kho 5 trụ DC30 (Meter).');

  console.log(`\nTest xuất kho:`);
  console.log(`- Station ID: ${stationId}`);
  console.log(`- Pole ID: 7 (DC 30kW)`);
  console.log(`- Supplier ID: 4 (Meter)`);
  console.log(`- Tồn kho: 5, committed: 2 => xuất tối đa 2.`);
  console.log(`\nBạn có thể vào Quản lý kho → Xuất kho, chọn trạm ${stationId ? 'E.HN...' : ''}, chọn Meter/DC30, nhập 1/2/3 để test.`);
  await pool.end();
};

run().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
