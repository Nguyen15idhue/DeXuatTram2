require('dotenv').config();
const pool = require('../src/utils/db');
const service = require('../src/services/proposal/proposalSheetSyncService');

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(['--apply', '--confirm-backup', '--confirm-workers-stopped']);
  const unknown = [...args].filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`Tham số không hợp lệ: ${unknown.join(', ')}`);
  const apply = args.has('--apply');
  if (apply && (!args.has('--confirm-backup') || !args.has('--confirm-workers-stopped'))) {
    throw new Error('Cần sao lưu Sheet, dừng mọi worker đồng bộ và xác nhận bằng --confirm-backup --confirm-workers-stopped');
  }
  const config = service.getConfig();
  if (!config.configured) throw new Error(config.message);
  let connection;
  let locked = false;
  try {
    if (apply) {
      connection = await pool.getConnection();
      const [rows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [service.LOCK_NAME]);
      locked = Number(rows[0]?.acquired) === 1;
      if (!locked) throw new Error('Worker đồng bộ đang chạy; dừng worker rồi thử lại');
    }
    const fields = service.getExportFields(await service.getAllFieldDefinitions());
    const sheets = await service.createSheetsClient(config);
    const result = await service.migratePoleColumns(sheets, config, fields, { apply });
    if (result.status === 'ready') {
      console.log(`Kiểm tra thành công: sẽ chèn ${result.columnsPerGroup} cột vào mỗi nhóm. Chưa ghi Sheet.`);
    } else if (result.status === 'already_migrated') {
      console.log('Sheet đã có cấu trúc cột mới; không thay đổi.');
    } else {
      console.log(`Đã chèn ${result.columnsPerGroup} cột vào mỗi nhóm. Kiểm tra Sheet, sau đó chạy đối soát toàn bộ.`);
    }
  } finally {
    try {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [service.LOCK_NAME]);
    } finally {
      if (connection) connection.release();
    }
  }
};

main()
  .catch((error) => { console.error(`[ProposalSheetMigration] ${error.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
