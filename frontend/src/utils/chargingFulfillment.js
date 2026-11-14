import { isBackOfficeDept, isFinanceDept } from './proposalAccess.js';

export const canOperateStation = (user, station, permission) => {
  if (user?.role === 'ADMIN') return false;
  if (user?.role === 'SUPER_ADMIN') return true;
  if (station?.permissions) return station.permissions[permission] === true;
  if (permission === 'back_office') return isBackOfficeDept(user);
  if (permission === 'finance') return isBackOfficeDept(user) || isFinanceDept(user);
  if (permission === 'setup') {
    const department = String(user?.department || user?.custom_data?.department || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
    return department.includes('setup') && department.includes('van hanh');
  }
  return false;
};

export const missingOnPrerequisites = (station) => [
  station.contract_status !== 'DONE' && 'Hợp đồng',
  station.infra_power_status !== 'DONE' && 'Hạ tầng điện',
  station.infra_site_status !== 'DONE' && 'Hạ tầng mặt bằng',
  !['NOT_REQUIRED', 'RECEIVED', 'REFUND_PENDING', 'REFUNDED'].includes(station.deposit_status) && 'Tiền cọc',
  !['DOING', 'DONE', 'NOT_REQUIRED'].includes(station.payment_status) && 'Thanh toán'
].filter(Boolean);

export const shipmentAvailable = (item, action) => {
  if (action === 'confirm-return') return Number(item.return_pending_quantity || 0);
  if (action === 'request-return') {
    const available = Math.max(0, Number(item.received_quantity || 0)
      - Number(item.returned_quantity || 0) - Number(item.return_pending_quantity || 0));
    return item.returnable_quantity === undefined ? available : Math.min(available, item.returnable_quantity);
  }
  return Math.max(0, Number(item.quantity || 0) - Number(item.received_quantity || 0)
    - Number(item.returned_quantity || 0));
};

export const validateShipmentQuantities = (rows, quantities, exporting = false, action = 'receive') => {
  if (Object.values(quantities).some((value) => !Number.isInteger(Number(value)) || Number(value) < 0)) {
    throw new Error('Số lượng phải là số nguyên không âm');
  }
  const items = rows.filter((row) => Number(quantities[row.id]) > 0).map((row) => {
    const quantity = Number(quantities[row.id]);
    const maximum = exporting ? Number(row.remaining_quantity || 0) : shipmentAvailable(row, action);
    if (!Number.isInteger(quantity) || quantity > maximum) throw new Error('Số lượng vượt phần còn lại hoặc không phải số nguyên');
    if (exporting && quantity > Number(row.stock_quantity || 0)) throw new Error(`Tồn kho không đủ: ${row.name || row.id}`);
    return { [exporting ? 'commitment_id' : 'item_id']: exporting ? (row.commitment_id || row.id) : row.id, quantity };
  });
  if (!items.length) throw new Error('Vui lòng chọn ít nhất một trụ với số lượng lớn hơn 0');
  return items;
};

export const requestKeyForIntent = (previous, payload) => {
  const fingerprint = JSON.stringify(payload);
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, request_id: crypto.randomUUID() };
};

export const deploymentActions = (portion) => {
  const stage = portion.stage;
  if (stage === 'INSTALLING' && portion.sub_status === 'NOT_INSTALLED') return ['start-installation'];
  if (stage === 'INSTALLING' && portion.sub_status === 'INSTALLING') return ['complete-installation'];
  if (portion.installation_status !== 'DONE') return [];
  return [
    ...(portion.acceptance_status !== 'PASSED' ? ['acceptance-passed', 'acceptance-failed'] : []),
    ...(stage !== 'OPERATING' ? ['complete-configuration'] : [])
  ];
};

export const ACCEPTANCE_LABELS = { NOT: 'Chưa nghiệm thu', FAILED: 'Nghiệm thu không đạt', PASSED: 'Nghiệm thu đạt' };

export const onStationStatus = station => {
  if (station.workflow_override?.completed && station.status === 'OPERATING') return 'DONE';
  const fulfillment = station.fulfillment || {};
  const items = fulfillment.items || [];
  const portions = station.deployments || [];
  if (!fulfillment.needs_review && items.length && items.every(item => portions.filter(portion =>
    Number(portion.commitment_id) === Number(item.commitment_id) && portion.stage === 'OPERATING')
    .reduce((sum, portion) => sum + Number(portion.quantity), 0) >= Number(item.committed_quantity))) return 'DONE';
  if (!items.length && !portions.length && !fulfillment.needs_review && station.status === 'OPERATING') return 'DONE';
  return portions.some(portion => portion.stage === 'OPERATING') ? 'DOING' : 'NOT';
};

export const DEPLOYMENT_ACTION_LABELS = {
  'start-installation': 'Bắt đầu lắp đặt',
  'complete-installation': 'Hoàn tất lắp đặt',
  'acceptance-passed': 'Nghiệm thu đạt',
  'acceptance-failed': 'Nghiệm thu không đạt',
  'complete-configuration': 'Hoàn tất ON phần trụ'
};
