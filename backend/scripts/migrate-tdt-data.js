require('dotenv').config();
const pool = require('../src/utils/db');

const TRU_MAP = [
  { sl: 'tdt_tru_ccs2_60kw_sl', dg: 'tdt_tru_ccs2_60kw_dg', label: 'CCS2 60kW' },
  { sl: 'tdt_tru_ccs2_120kw_sl', dg: 'tdt_tru_ccs2_120kw_dg', label: 'CCS2 120kW' },
];

const CHI_PHI_MAP = [
  { key: 'tdt_chi_phi_van_chuyen', label: 'Vận chuyển' },
  { key: 'tdt_chi_phi_tba', label: 'Trạm biến áp' },
  { key: 'tdt_chi_phi_ha_tang', label: 'Hạ tầng' },
  { key: 'tdt_chi_phi_thue_vi_tri', label: 'Thuê vị trí' },
];

const FLAT_KEYS = [
  ...TRU_MAP.flatMap((m) => [m.sl, m.dg]),
  ...CHI_PHI_MAP.map((m) => m.key),
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function main() {
  const [rows] = await pool.query('SELECT id, custom_data FROM station_proposals ORDER BY id');
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const cd = row.custom_data
        ? (typeof row.custom_data === 'string' ? JSON.parse(row.custom_data) : row.custom_data)
        : {};

      const hasFlatKey = FLAT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(cd, k));
      const hasTables = Array.isArray(cd.tdt_tru) || Array.isArray(cd.tdt_chi_phi_khac);

      if (!hasFlatKey || hasTables) {
        skipped++;
        continue;
      }

      const tru = [];
      const khac = [];
      let tong = 0;

      for (const m of TRU_MAP) {
        const sl = num(cd[m.sl]);
        const dg = num(cd[m.dg]);
        if (sl || dg) {
          const thanhTien = sl * dg;
          tru.push({ loai_tru: m.label, so_luong: sl, don_gia: dg, thanh_tien: thanhTien });
          tong += thanhTien;
        }
      }

      for (const m of CHI_PHI_MAP) {
        const v = num(cd[m.key]);
        if (v) {
          khac.push({ loai_chi_phi: m.label, so_tien: v });
          tong += v;
        }
      }

      const next = { ...cd };
      FLAT_KEYS.forEach((k) => delete next[k]);
      next.tdt_tru = tru;
      next.tdt_chi_phi_khac = khac;
      next.tdt_tong_cong = tong;

      await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(next), row.id]);
      updated++;
      console.log(`[tdt] id=${row.id} tru=${tru.length} khac=${khac.length} tong=${tong}`);
    } catch (e) {
      failed++;
      console.error(`[tdt] id=${row.id} loi: ${e.message}`);
    }
  }

  console.log(`[tdt] tong=${rows.length} updated=${updated} skipped=${skipped} failed=${failed}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
