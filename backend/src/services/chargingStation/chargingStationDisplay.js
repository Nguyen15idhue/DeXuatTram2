const CONTRACT_LABELS = {
  NOT: 'Chưa ký hợp đồng',
  DOING: 'Đang ký hợp đồng',
  DONE: 'Đã ký hợp đồng',
  CANCELLED: 'Đã hủy'
};

const INFRA_LABELS = { NOT: 'Chưa làm', DOING: 'Đang làm', DONE: 'Đã làm' };

const financeLabel = (row) => {
  if (row.requires_deposit === false || (row.deposit_status === 'NOT_REQUIRED' && row.payment_status === 'NOT_REQUIRED')) {
    return 'Không yêu cầu';
  }
  const deposit = Number(row.deposit_total || 0);
  const payment = Number(row.payment_total || 0);
  const refund = Number(row.refund_total || 0);
  const amount = Number(row.contract_amount || 0);
  const paid = amount > 0 ? deposit + payment - refund >= amount : row.payment_status === 'DONE';
  if (!paid) {
    if (payment > 0 || refund > 0) return 'Đang thanh toán';
    return deposit > 0 ? 'Đã nhận cọc' : 'Chưa nhận cọc';
  }
  if (refund > 0 && deposit > 0 && refund >= deposit) return 'Đã thanh toán - Đã hoàn cọc';
  return Number(row.deposit_refund_required) === 1 ? 'Đã thanh toán - Chờ hoàn cọc' : 'Đã thanh toán toàn bộ';
};

const paidPercent = (row) => {
  const model = String(row.mo_hinh_dau_tu || '').toUpperCase();
  if (!['LK', 'NQ', 'NQ_LK'].includes(model)) return null;
  const contract = Number(row.contract_amount) || 0;
  const paid = (Number(row.deposit_total) || 0) + (Number(row.payment_total) || 0) - (Number(row.refund_total) || 0);
  if (contract <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((paid / contract) * 100)));
};

module.exports = { CONTRACT_LABELS, INFRA_LABELS, financeLabel, paidPercent };
