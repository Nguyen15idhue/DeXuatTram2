const GDKV_TITLES = ['Giám đốc Khu vực'];

function hasGdkvTitle(chuc_vu) {
  return typeof chuc_vu === 'string' && GDKV_TITLES.includes(chuc_vu);
}

export function getProposalDisplayName(item) {
  if (!item) return '';
  if (hasGdkvTitle(item.gdkv_chuc_vu)) return item.gdkv_name || '';
  if (hasGdkvTitle(item.ptr_chuc_vu)) return item.phu_trach_name || '';
  return item.owner_name || item.phu_trach_name || item.gdkv_name || '';
}

export function getProposalDisplayPhone(item) {
  if (!item) return '';
  if (hasGdkvTitle(item.gdkv_chuc_vu)) return item.gdkv_phone || '';
  if (hasGdkvTitle(item.ptr_chuc_vu)) return item.phu_trach_phone || '';
  return item.owner_phone || item.phu_trach_phone || item.gdkv_phone || '';
}

export function isProposalAssignee(item, userId) {
  if (!item || !userId) return false;
  return Number(item.nguoi_phu_trach_id) === Number(userId)
    || Number(item.sales_quan_ly_id) === Number(userId);
}
