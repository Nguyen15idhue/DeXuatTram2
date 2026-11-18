export const comparePolesByPower = (a, b) =>
  Number(a.power_kw) - Number(b.power_kw)
  || String(a.charging_type || '').localeCompare(String(b.charging_type || ''))
  || String(a.name || '').localeCompare(String(b.name || ''), 'vi')
  || String(a.supplier_name || '').localeCompare(String(b.supplier_name || ''), 'vi')
  || String(a.id || '').localeCompare(String(b.id || ''));
