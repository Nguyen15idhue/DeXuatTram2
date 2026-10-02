export function getProposalDisplayName(item) {
  if (!item) return '';
  return item.gdkv_name || item.phu_trach_name || item.owner_name || '';
}

export function getProposalDisplayPhone(item) {
  if (!item) return '';
  return item.gdkv_phone || item.phu_trach_phone || item.owner_phone || '';
}

export function isProposalAssignee(item, userId) {
  if (!item || !userId) return false;
  return Number(item.nguoi_phu_trach_id) === Number(userId)
    || Number(item.sales_quan_ly_id) === Number(userId);
}
