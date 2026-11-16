import { isBackOfficeDept, isFinanceDept } from './proposalAccess.js';

export const canOperateStation = (user, station, permission) => {
  if (user?.role === 'SUPER_ADMIN') return true;
  if (user?.role === 'ADMIN' && !['back_office', 'setup', 'infrastructure'].includes(permission)) return false;
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
  const installation = stage === 'INSTALLING'
    ? portion.sub_status === 'NOT_INSTALLED' ? ['start-installation'] : ['complete-installation']
    : [];
  const rollback = portion.acceptance_status !== 'NOT' ? ['acceptance-reset'] : [];
  if (portion.installation_status !== 'DONE') return [...installation, ...rollback];
  return [
    ...rollback,
    'acceptance-passed',
    ...(portion.acceptance_status !== 'FAILED' ? ['acceptance-failed'] : []),
    'complete-configuration'
  ];
};

export const ACCEPTANCE_LABELS = { NOT: 'Chưa nghiệm thu', FAILED: 'Nghiệm thu không đạt', PASSED: 'Nghiệm thu đạt' };
export const ACCEPTANCE_SUMMARY_LABELS = { NOT: 'Chưa nghiệm thu', DOING: 'Đã nghiệm thu một phần', DONE: 'Đã nghiệm thu' };
export const INTEGRATION_LABELS = { NOT: 'Chưa tích hợp', DOING: 'Đã tích hợp một phần', DONE: 'Đã tích hợp xong' };
export const SHIPMENT_STATUS_LABELS = {
  PENDING: 'Đang vận chuyển', SHIPPING: 'Đang vận chuyển', DELIVERED: 'Đã giao hàng thành công',
  RETURN_PENDING: 'Chờ hoàn hàng', RETURNED: 'Đã hoàn', FAILED: 'Giao thất bại'
};
export const shipmentNextStatuses = status => ({
  PENDING: ['DELIVERED', 'RETURN_PENDING'], SHIPPING: ['DELIVERED', 'RETURN_PENDING'],
  DELIVERED: ['RETURN_PENDING'], FAILED: ['RETURN_PENDING'], RETURN_PENDING: ['RETURNED'], RETURNED: []
}[status] || []);
export const portionUnavailable = portion => Boolean(portion.returned_at)
  || ['RETURN_PENDING', 'RETURNED'].includes(portion.shipment_status);

export const onDeploymentQuantity = portion => Number(portion.on_quantity
  ?? (portion.stage === 'OPERATING' ? portion.quantity : 0));

export const onQuantityStatus = (quantity, total) => quantity === 0 ? 'NOT' : quantity < total ? 'DOING' : 'DONE';

export const buildOnRows = (fulfillment, portions) => {
  const groups = new Map();
  const itemGroups = new Map();
  for (const shipment of fulfillment.shipments || []) {
    for (const item of shipment.items || []) {
      const key = `${shipment.id}:${item.pole_id}:${item.supplier_id || ''}`;
      const group = groups.get(key) || { id: key, export_id: shipment.id, pole_name: item.name,
        supplier_name: item.supplier_name, quantity: 0, portions: [], shipment_status: shipment.transport_status };
      group.quantity += Math.max(0, Number(item.quantity) - Number(item.returned_quantity || 0));
      groups.set(key, group);
      itemGroups.set(Number(item.id), key);
    }
  }
  for (const portion of portions.filter(row => !row.returned_at)) {
    const key = itemGroups.get(Number(portion.export_item_id))
      || `${portion.export_id || portion.export_item_id}:${portion.pole_id}:${portion.supplier_id || ''}`;
    const group = groups.get(key) || { id: key, export_id: portion.export_id, pole_name: portion.pole_name,
      supplier_name: portion.supplier_name, quantity: 0, portions: [], shipment_status: portion.shipment_status };
    if (!itemGroups.has(Number(portion.export_item_id))) group.quantity += Number(portion.quantity);
    group.portions.push(portion);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    Number(!a.portions.length && a.shipment_status !== 'DELIVERED')
      - Number(!b.portions.length && b.shipment_status !== 'DELIVERED')
    || Number(a.export_id) - Number(b.export_id)).map(group => {
    const initialQuantity = group.portions.reduce((sum, portion) => sum + onDeploymentQuantity(portion), 0);
    const available = group.portions.filter(portion => !portionUnavailable(portion));
    const maximum = initialQuantity + available.filter(portion => portion.installation_status === 'DONE')
      .reduce((sum, portion) => sum + Number(portion.quantity) - onDeploymentQuantity(portion), 0);
    const minimum = initialQuantity - available.reduce((sum, portion) => sum + onDeploymentQuantity(portion), 0);
    const firstOn = group.portions.filter(portion => portion.on_date).sort((a, b) =>
      String(a.on_first_at || a.created_at || '').localeCompare(String(b.on_first_at || b.created_at || ''))
      || Number(a.id) - Number(b.id))[0];
    return { ...group, initialQuantity, value: initialQuantity, minimum, maximum,
      firstDate: firstOn?.on_date || '', date: firstOn?.on_date || '' };
  });
};

export const onRowPayload = row => {
  const value = Number(row.value);
  if (row.value === '' || !Number.isSafeInteger(value) || value < row.minimum || value > row.maximum) {
    throw new Error(`Số lượng ON không hợp lệ: ${row.pole_name} · Đơn giao #${row.export_id || '—'}`);
  }
  let delta = value - row.initialQuantity;
  if (delta === 0) return [];
  if (!row.date) throw new Error('Nhập ngày ON hoặc ngày điều chỉnh cho từng dòng thay đổi');
  const portions = row.portions.filter(portion => !portionUnavailable(portion))
    .sort((a, b) => delta > 0 ? Number(a.id) - Number(b.id) : Number(b.id) - Number(a.id));
  const items = [];
  for (const portion of portions) {
    const current = onDeploymentQuantity(portion);
    const change = delta > 0
      ? portion.installation_status === 'DONE' ? Math.min(delta, Number(portion.quantity) - current) : 0
      : -Math.min(-delta, current);
    if (change !== 0) {
      items.push({ id: Number(portion.id), expected_version: portion.workflow_version,
        on_quantity: current + change, on_date: row.date, note: portion.on_note || null });
      delta -= change;
    }
    if (delta === 0) break;
  }
  if (delta !== 0) throw new Error('Số lượng phần trụ đã thay đổi; hãy mở lại modal');
  return items;
};

export const formatDeploymentScale = rows => {
  const grouped = new Map();
  for (const row of rows) {
    const name = row.pole_name || row.name || 'Chưa rõ loại trụ';
    const supplier = row.supplier_name || '';
    const key = `${row.pole_id || name}:${row.supplier_id || supplier}`;
    const group = grouped.get(key) || { name, supplier, quantity: 0 };
    group.quantity += Number(row.quantity);
    grouped.set(key, group);
  }
  return [...grouped.values()].map(row => `${row.name}${row.supplier ? ` · ${row.supplier}` : ''} · ${row.quantity} trụ`).join(' + ');
};

export const groupDeployments = (rows, stage) => {
  const groups = new Map();
  for (const row of rows.filter(row => !row.returned_at)) {
    const status = stage === 'nghiem-thu' ? row.acceptance_status || 'NOT'
      : onQuantityStatus(onDeploymentQuantity(row), Number(row.quantity));
    const group = groups.get(status) || { id: status, status, rows: [], quantity: 0 };
    group.rows.push(row);
    group.quantity += Number(row.quantity);
    groups.set(status, group);
  }
  return [...groups.values()].map(group => ({ ...group, scale: formatDeploymentScale(group.rows) }));
};

export const acceptanceSummary = station => {
  if (station.workflow_override?.completed && station.status === 'OPERATING') return 'DONE';
  const fulfillment = station.fulfillment || {};
  const items = fulfillment.items || [];
  const portions = station.deployments || [];
  if (!fulfillment.needs_review && items.length && items.every(item => portions.filter(portion =>
    !portion.returned_at && Number(portion.commitment_id) === Number(item.commitment_id) && portion.acceptance_status === 'PASSED')
    .reduce((sum, portion) => sum + Number(portion.quantity), 0) >= Number(item.committed_quantity))) return 'DONE';
  if (!items.length && !portions.length && !fulfillment.needs_review && ['CONFIGURING', 'OPERATING'].includes(station.status)) return 'DONE';
  return portions.some(portion => !portion.returned_at && portion.acceptance_status === 'PASSED') ? 'DOING' : 'NOT';
};

export const onStationStatus = station => {
  if (station.workflow_override?.completed && station.status === 'OPERATING') return 'DONE';
  const fulfillment = station.fulfillment || {};
  const items = fulfillment.items || [];
  const portions = station.deployments || [];
  if (!fulfillment.needs_review && items.length && items.every(item => portions.filter(portion =>
    !portion.returned_at && Number(portion.commitment_id) === Number(item.commitment_id))
    .reduce((sum, portion) => sum + onDeploymentQuantity(portion), 0) >= Number(item.committed_quantity))) return 'DONE';
  if (!items.length && !portions.length && !fulfillment.needs_review && station.status === 'OPERATING') return 'DONE';
  return portions.some(portion => !portion.returned_at && onDeploymentQuantity(portion) > 0) ? 'DOING' : 'NOT';
};

export const DEPLOYMENT_ACTION_LABELS = {
  'start-installation': 'Bắt đầu lắp đặt',
  'complete-installation': 'Hoàn tất lắp đặt',
  'acceptance-passed': 'Nghiệm thu đạt',
  'acceptance-failed': 'Nghiệm thu không đạt',
  'acceptance-reset': 'Chuyển về Chưa nghiệm thu',
  'complete-configuration': 'Hoàn tất ON phần trụ'
};
