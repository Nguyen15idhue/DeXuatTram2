require('dotenv').config();
const pool = require('../src/utils/db');

const COUNT = 20;
const SIGNERS = [1, 6];

const run = async () => {
  for (let i = 1; i <= COUNT; i++) {
    const code = `ONTEST_${String(i).padStart(3, '0')}`;
    const customData = {
      ma_de_xuat: code,
      mo_hinh_dau_tu: 'NQ',
      owner_name: `Chủ trạm test ${i}`,
      owner_phone: '0900000000',
      address: `Địa chỉ test ${i}, Hà Nội`,
      province: 'Hà Nội',
      ma_tinh: 'HN',
      vung_mien: 'Bắc'
    };

    const [result] = await pool.query(
      `INSERT INTO station_proposals
        (user_id, status, latitude, longitude, owner_name, owner_phone, custom_data, pending_station_code)
       VALUES (?, 'SIGNATURE_PENDING', ?, ?, ?, ?, CAST(? AS JSON), ?)`,
      [1, 10 + i * 0.01, 105 + i * 0.01, customData.owner_name, customData.owner_phone, JSON.stringify(customData), `E.HN${String(i).padStart(4, '0')}`]
    );
    const proposalId = result.insertId;

    await pool.query(
      `INSERT INTO proposal_signature_configs (proposal_id, user_id, signer_title, status, signed_at)
       VALUES (?, ?, ?, 'SIGNED', NOW())`,
      [proposalId, SIGNERS[0], 'Người ký 1']
    );
    await pool.query(
      `INSERT INTO proposal_signature_configs (proposal_id, user_id, signer_title, status)
       VALUES (?, ?, ?, 'PENDING')`,
      [proposalId, SIGNERS[1], 'Người ký 2']
    );

    console.log(`Tạo đề xuất #${proposalId} (${code}) - SIGNATURE_PENDING, ký: Đang thực hiện`);
  }

  console.log(`Hoàn tất: ${COUNT} đề xuất.`);
  await pool.end();
};

run().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
