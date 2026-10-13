export const VIEW_ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SALES', label: 'Sales' },
  { value: 'CTV', label: 'CTV' },
  { value: 'NPP', label: 'NPP' },
  { value: 'MKT', label: 'MKT' },
];

export function parseVisibleRoles(v) {
  if (v === null || v === undefined || v === '') return null;
  try {
    const arr = Array.isArray(v) ? v : JSON.parse(v);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map((r) => String(r).trim().toUpperCase());
  } catch {
    return null;
  }
}

export function isViewVisibleToRole(view, role) {
  if (!view) return false;
  const arr = parseVisibleRoles(view.visible_roles);
  if (!arr) return true;
  return arr.includes(role);
}
