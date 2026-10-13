require('dotenv').config();
const pool = require('../src/utils/db');
const dynamicEngineService = require('../src/services/dynamicEngineService');

async function main() {
  const [rows] = await pool.query('SELECT id, custom_data FROM station_proposals ORDER BY id');
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const cd = row.custom_data
        ? (typeof row.custom_data === 'string' ? JSON.parse(row.custom_data) : row.custom_data)
        : {};
      const postResults = await dynamicEngineService.computePostFormulas(
        'station_proposals',
        row.id,
        cd,
        null,
        null,
        { excludeKeys: ['ma_de_xuat'] }
      );
      const merged = { ...cd, ...postResults };
      if (JSON.stringify(merged) !== JSON.stringify(cd)) {
        await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(merged), row.id]);
        updated++;
      } else {
        unchanged++;
      }
    } catch (e) {
      failed++;
      console.error(`[recompute] id=${row.id} loi: ${e.message}`);
    }
  }

  console.log(`[recompute] tong=${rows.length} updated=${updated} unchanged=${unchanged} failed=${failed}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
