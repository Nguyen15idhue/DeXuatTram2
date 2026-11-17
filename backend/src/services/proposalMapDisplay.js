function parseRows(value, allowObject = false) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return allowObject ? [value] : [];
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return allowObject && parsed && typeof parsed === 'object' ? [parsed] : [];
  } catch (error) {
    console.warn('[proposalMapDisplay] Dữ liệu trụ không phải JSON hợp lệ:', error.message);
    return [];
  }
}

function summarize(rows) {
  const groups = {};
  rows.forEach((row) => {
    if (!row) return;
    const name = row.loai_tru || 'Trụ';
    groups[name] = (groups[name] || 0) + (Number(row.so_luong) || 0);
  });
  const parts = Object.entries(groups).map(([name, qty]) => (qty > 0 ? `${qty}× ${name}` : name));
  const total = Object.values(groups).reduce((a, b) => a + b, 0);
  return total > 0 ? `${parts.join(' + ')} (tổng ${total} trụ)` : parts.join(' + ');
}

function mainSummary(item) {
  const rows = value => parseRows(value, true).filter(row => row && (row.loai_tru || row.so_luong));
  const tdt = () => summarize(rows(item.tdt_tru));
  const nq = () => summarize(rows(item.loai_tru_nq));
  const lk = () => summarize(rows(item.loai_tru_lk));
  if (item.mo_hinh_dau_tu === 'TDT') return tdt() || item.loai_tru || '';
  if (item.mo_hinh_dau_tu === 'NQ') return nq() || item.loai_tru || '';
  if (item.mo_hinh_dau_tu === 'LK') return lk();
  if (item.mo_hinh_dau_tu === 'NQ_LK') return summarize([...rows(item.loai_tru_nq), ...rows(item.loai_tru_lk)]) || item.loai_tru || '';
  return tdt() || nq() || lk() || item.loai_tru || '';
}

function nearbySummary(item) {
  const rows = [...parseRows(item.tdt_tru), ...parseRows(item.loai_tru_nq), ...parseRows(item.loai_tru_lk)];
  return rows.length > 0 ? summarize(rows) : item.loai_tru || '';
}

function forMap(item, user) {
  const result = { ...item };
  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    result.map_pole_summary = mainSummary(item);
    result.nearby_pole_summary = nearbySummary(item);
    delete result.address;
    delete result.mo_hinh_dau_tu;
    delete result.tdt_tru;
    delete result.loai_tru_nq;
    delete result.loai_tru_lk;
  }
  if (!user) {
    for (const key of ['owner_name', 'owner_phone', 'gdkv_name', 'gdkv_phone', 'gdkv_chuc_vu', 'phu_trach_name', 'phu_trach_phone', 'ptr_chuc_vu']) {
      delete result[key];
    }
  }
  return result;
}

module.exports = { forMap };
