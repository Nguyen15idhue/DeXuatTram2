require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/utils/db');

function parseArgs() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith('--'));
  return {
    file: fileArg || null,
    apply: args.includes('--apply'),
    report: args.includes('--report'),
    stationsOnly: args.includes('--stations-only')
  };
}

function loadMapping(file) {
  const abs = path.resolve(process.cwd(), file);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const map = {};
  for (const [code, val] of Object.entries(raw)) {
    let lat;
    let lng;
    if (Array.isArray(val)) { [lat, lng] = val; }
    else if (val && typeof val === 'object') { lat = val.lat ?? val.latitude; lng = val.lng ?? val.longitude; }
    if (typeof lat === 'number' && typeof lng === 'number' && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      map[code] = { lat, lng };
    } else {
      console.warn(`[fix-coords] bo qua "${code}": toa do khong hop le (${JSON.stringify(val)})`);
    }
  }
  return map;
}

async function reportDuplicates() {
  const [rows] = await pool.query(
    `SELECT latitude, longitude, COUNT(*) n,
            GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(custom_data,'$.ma_tram')) ORDER BY id SEPARATOR ', ') codes
       FROM stations
      GROUP BY latitude, longitude
     HAVING n > 1
      ORDER BY n DESC`
  );
  if (rows.length === 0) {
    console.log('[fix-coords] Khong co nhom tram trung toa do.');
    return;
  }
  console.log(`[fix-coords] ${rows.length} nhom tram trung toa do:\n`);
  rows.forEach((r) => {
    console.log(`  ${r.latitude}, ${r.longitude}  (${r.n} tram)\n    ${r.codes}\n`);
  });
}

async function applyMapping(map, { apply, stationsOnly }) {
  const codes = Object.keys(map);
  if (codes.length === 0) {
    console.log('[fix-coords] Mapping rong.');
    return;
  }
  let changed = 0;
  for (const code of codes) {
    const { lat, lng } = map[code];
    const [stations] = await pool.query(
      "SELECT id, latitude, longitude, custom_data FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data,'$.ma_tram')) = ?",
      [code]
    );
    if (stations.length === 0) {
      console.warn(`  [${code}] khong tim thay tram -> bo qua`);
      continue;
    }
    for (const st of stations) {
      console.log(`  [${code}] tram #${st.id}: (${st.latitude}, ${st.longitude}) -> (${lat}, ${lng})`);
      const [linked] = stationsOnly
        ? [[]]
        : await pool.query('SELECT id, latitude, longitude FROM station_proposals WHERE station_id = ?', [st.id]);
      linked.forEach((p) => console.log(`      de xuat #${p.id} (lien ket): (${p.latitude}, ${p.longitude}) -> (${lat}, ${lng})`));
      if (apply) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await conn.query('UPDATE stations SET latitude = ?, longitude = ?, updated_at = NOW() WHERE id = ?', [lat, lng, st.id]);
          if (!stationsOnly) {
            await conn.query('UPDATE station_proposals SET latitude = ?, longitude = ?, updated_at = NOW() WHERE station_id = ?', [lat, lng, st.id]);
          }
          await conn.commit();
          changed += 1;
        } catch (e) {
          await conn.rollback();
          console.error(`  [${code}] loi cap nhat tram #${st.id}: ${e.message}`);
        } finally {
          conn.release();
        }
      }
    }
  }
  console.log(`\n[fix-coords] ${codes.length} ma | mode=${apply ? 'APPLY' : 'DRY-RUN'}${apply ? ` | updated=${changed} tram` : ''}`);
}

async function main() {
  const opts = parseArgs();
  if (opts.report || !opts.file) {
    await reportDuplicates();
    if (!opts.file) {
      console.log('\nCach dung:');
      console.log('  node scripts/fix-coords-by-mapping.js --report');
      console.log('  node scripts/fix-coords-by-mapping.js <mapping.json> [--apply] [--stations-only]');
      console.log('\nFile mapping (JSON):');
      console.log('  { "E.HTT0011": [18.3521, 105.9012], "E.HTT0012": { "lat": 18.3531, "lng": 105.9021 } }');
      process.exit(0);
    }
  }
  const map = loadMapping(opts.file);
  console.log(`[fix-coords] nap ${Object.keys(map).length} ma tu ${opts.file}`);
  await applyMapping(map, opts);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
