require('dotenv').config();
const pool = require('../src/utils/db');
const chargingStationService = require('../src/services/chargingStationService');

const apply = process.argv.includes('--apply');

const main = async () => {
  const [rows] = await pool.query(
    `SELECT p.id, p.ma_de_xuat_gen AS ma_de_xuat
     FROM station_proposals p
     LEFT JOIN charging_stations cs ON cs.proposal_id = p.id
     WHERE p.status = 'APPROVED' AND p.signed_file_id IS NOT NULL AND cs.id IS NULL
     ORDER BY p.id`
  );
  console.log(`Tìm thấy ${rows.length} đề xuất đã ký chưa có ON trạm.`);
  rows.forEach((row) => console.log(`  - #${row.id} ${row.ma_de_xuat || ''}`));

  if (!apply) {
    console.log('Dry-run: chưa ghi dữ liệu. Chạy lại với --apply để tạo bản ghi.');
    await pool.end();
    return;
  }

  let created = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await chargingStationService.createFromApprovedProposal(row.id, { source: 'script' });
      if (result.created) created += 1;
    } catch (error) {
      failed += 1;
      console.error(`Lỗi đề xuất #${row.id}: ${error.message}`);
    }
  }
  console.log(`Hoàn tất: tạo ${created}, lỗi ${failed}.`);
  await pool.end();
};

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
