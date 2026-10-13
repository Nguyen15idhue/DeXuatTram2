const pool = require('../src/utils/db');
const dynamicUtils = require('../src/services/dynamicUtils');
const syncService = require('../src/services/syncService');

const DRY = process.argv.includes('--dry-run');

(async () => {
  const defs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const [rows] = await pool.query(
    "SELECT id, user_id, status, custom_data FROM station_proposals WHERE status IN ('PENDING','REVIEWING')"
  );
  let filled = 0;
  const stillMissing = [];
  for (const r of rows) {
    let cd = {};
    try { cd = typeof r.custom_data === 'string' ? JSON.parse(r.custom_data || '{}') : (r.custom_data || {}); } catch { cd = {}; }
    const before = JSON.stringify({ a: cd.nguoi_phu_trach || null, b: cd.nguoi_giao_phu_trach || null });
    const patch = {};
    await dynamicUtils.applyAutoUserFields(patch, defs, r.user_id, null, cd);
    Object.keys(patch).forEach(k => {
      if (!syncService.PUSH_REQUIRED_USER_FIELDS.includes(k)) delete patch[k];
      else if (patch[k] === '') delete patch[k];
    });
    const merged = { ...cd, ...patch };
    const changed = Object.keys(patch).length > 0;
    if (changed && !DRY) {
      await pool.query('UPDATE station_proposals SET custom_data = ?, updated_at = NOW() WHERE id = ?', [JSON.stringify(merged), r.id]);
    }
    const missing = await syncService.getMissingPushUserFieldLabels({ ...r, custom_data: merged }, defs);
    if (missing.length > 0) {
      stillMissing.push({ id: r.id, user_id: r.user_id, status: r.status, missing });
    } else if (changed) {
      filled++;
    }
    if (changed) console.log((DRY ? '[dry] fill' : 'fill'), 'id=' + r.id, before, '->', JSON.stringify(patch));
  }
  console.log('TOTAL=' + rows.length, 'FILLED=' + (DRY ? 0 : filled), 'STILL_MISSING=' + stillMissing.length);
  stillMissing.forEach(m => console.log('manual-needed id=' + m.id, 'user_id=' + m.user_id, 'missing=' + m.missing.join(',')));
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
