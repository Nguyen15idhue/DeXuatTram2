const canonical = value => String(value ?? '').trim().toLocaleLowerCase('vi-VN');
const { buildPortions } = require('./historicalOnImportProgress');
const PROGRESS_KEYS = ['committed', 'shipped', 'received', 'installed', 'accepted', 'on', 'accepted_on'];
const hasProgress = pole => PROGRESS_KEYS.some(key => pole[key] !== null && pole[key] !== undefined);

const quantity = (value, label) => {
  const result = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(result) || result < 0) {
    throw Object.assign(new Error(`${label} không hợp lệ; cần đối soát`), { statusCode: 409 });
  }
  return result;
};

const progressFor = (items, deployments) => {
  const ids = new Set(items.map(item => Number(item.id)));
  const portions = deployments.filter(item => ids.has(Number(item.export_item_id)) && !item.returned_at);
  for (const item of items) {
    const sent = quantity(item.quantity, 'Số lượng xuất');
    const returned = quantity(item.returned_quantity, 'Số lượng đã hoàn');
    const received = quantity(item.received_quantity, 'Số lượng đã nhận');
    const allocated = portions.filter(part => Number(part.export_item_id) === Number(item.id))
      .reduce((sum, part) => sum + quantity(part.quantity, 'Số lượng phần trụ'), 0);
    if (returned + received > sent || allocated !== received) {
      throw Object.assign(new Error('Phiếu xuất và phần trụ đã nhận chưa khớp; cần đối soát'), { statusCode: 409 });
    }
  }
  for (const part of portions) {
    const count = quantity(part.quantity, 'Số lượng phần trụ');
    const on = quantity(part.on_quantity, 'Số lượng ON');
    if (on > count || ((on > 0 || part.acceptance_status === 'PASSED') && part.installation_status !== 'DONE')) {
      throw Object.assign(new Error('Tiến độ phần trụ trên chứng từ không hợp lệ; cần đối soát'), { statusCode: 409 });
    }
  }
  const shipped = items.reduce((sum, item) =>
    sum + quantity(item.quantity, 'Số lượng xuất') - quantity(item.returned_quantity, 'Số lượng đã hoàn'), 0);
  const received = items.reduce((sum, item) => sum + quantity(item.received_quantity, 'Số lượng đã nhận'), 0);
  const installed = portions.filter(item => item.installation_status === 'DONE')
    .reduce((sum, item) => sum + quantity(item.quantity, 'Số lượng lắp'), 0);
  const accepted = portions.filter(item => item.acceptance_status === 'PASSED')
    .reduce((sum, item) => sum + quantity(item.quantity, 'Số lượng nghiệm thu'), 0);
  const on = portions.reduce((sum, item) => sum + quantity(item.on_quantity, 'Số lượng ON'), 0);
  const acceptedOn = portions.filter(item => item.acceptance_status === 'PASSED')
    .reduce((sum, item) => sum + quantity(item.on_quantity, 'Số lượng ON'), 0);
  const progress = { shipped, received, installed, accepted, on, accepted_on: acceptedOn };
  if (Object.values(progress).some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw Object.assign(new Error('Số lượng trên chứng từ không hợp lệ; cần đối soát'), { statusCode: 409 });
  }
  return progress;
};

const checkRealProgress = (record, snapshot, catalog) => {
  if (!snapshot.station || !record.poles.some(hasProgress)) return [];
  const exportsById = new Map((snapshot.exports || []).map(item => [Number(item.id), item]));
  const commitmentsById = new Map((snapshot.commitments || []).map(item => [Number(item.id), item]));
  const items = (snapshot.export_items || []).filter(item => {
    const header = exportsById.get(Number(item.export_id));
    if (!header || ![0, 1, '0', '1'].includes(header.historical_import)) {
      throw Object.assign(new Error('Không xác định được nguồn phiếu xuất; cần đối soát'), { statusCode: 409 });
    }
    return header.destination_type === 'STATION' && Number(header.historical_import) === 0;
  });
  if (items.some(item => !commitmentsById.has(Number(item.commitment_id)))) {
    return ['Có phiếu thực chưa đối soát với trụ chốt; cần đối soát trước khi cập nhật tiến độ'];
  }
  const deployments = snapshot.deployments || [];
  const labels = {
    committed: 'chốt', shipped: 'đã giao', received: 'đã nhận',
    installed: 'đã lắp', accepted: 'đã nghiệm thu', on: 'đã ON',
    accepted_on: 'vừa nghiệm thu vừa ON'
  };
  const errors = [];
  for (const pole of record.poles) {
    const matchingPoles = catalog.poles.filter(item => canonical(item.name) === canonical(pole.name));
    if (matchingPoles.length !== 1) continue;
    const poleId = Number(matchingPoles[0].id);
    const matching = items.filter(item => {
      const commitment = commitmentsById.get(Number(item.commitment_id));
      return canonical(commitment.model) === canonical(pole.model) && Number(commitment.pole_id) === poleId;
    });
    const itemIds = new Set(matching.map(item => Number(item.id)));
    const portions = deployments.filter(item => itemIds.has(Number(item.export_item_id)) && !item.returned_at);
    const shipped = matching.reduce((sum, item) => sum + Number(item.quantity) - Number(item.returned_quantity), 0);
    const floor = {
      committed: shipped,
      shipped,
      received: matching.reduce((sum, item) => sum + Number(item.received_quantity), 0),
      installed: portions.filter(item => item.installation_status === 'DONE').reduce((sum, item) => sum + Number(item.quantity), 0),
      accepted: portions.filter(item => item.acceptance_status === 'PASSED').reduce((sum, item) => sum + Number(item.quantity), 0),
      on: portions.reduce((sum, item) => sum + Number(item.on_quantity), 0),
      accepted_on: portions.filter(item => item.acceptance_status === 'PASSED').reduce((sum, item) => sum + Number(item.on_quantity), 0)
    };
    for (const [key, minimum] of Object.entries(floor)) {
      if (!Number.isSafeInteger(minimum) || minimum < 0) {
        throw Object.assign(new Error('Số lượng trên chứng từ thực không hợp lệ; cần đối soát'), { statusCode: 409 });
      }
      if (pole[key] !== null && pole[key] !== undefined && pole[key] < minimum) {
        errors.push(`${pole.model} ${pole.name}: số ${labels[key]} trong file (${pole[key]}) thấp hơn chứng từ thực (${minimum})`);
      }
    }
  }
  return errors;
};

const checkFeasibleProgress = (record, snapshot, catalog) => {
  if (!record.poles.length || (snapshot && !record.poles.some(hasProgress))) return [];
  const commitments = snapshot?.commitments || [];
  const headers = new Map((snapshot?.exports || []).map(item => [Number(item.id), item]));
  const commitmentIds = new Set(commitments.map(item => Number(item.id)));
  const items = (snapshot?.export_items || []).filter(item => {
    const header = headers.get(Number(item.export_id));
    if (!header || ![0, 1, '0', '1'].includes(header.historical_import)) {
      throw Object.assign(new Error('Không xác định được nguồn phiếu xuất; cần đối soát'), { statusCode: 409 });
    }
    return header.destination_type === 'STATION';
  });
  if (items.some(item => !commitmentIds.has(Number(item.commitment_id)))) {
    return ['Có phiếu xuất chưa đối soát với trụ chốt; cần đối soát trước khi cập nhật tiến độ'];
  }
  const deployments = snapshot?.deployments || [];
  const itemIds = new Set(items.map(item => Number(item.id)));
  if (deployments.some(item => !item.returned_at && !itemIds.has(Number(item.export_item_id)))) {
    return ['Có phần trụ chưa đối soát với phiếu xuất của trạm; cần đối soát trước khi cập nhật tiến độ'];
  }
  const errors = [];
  for (const pole of record.poles) {
    if (snapshot && !hasProgress(pole)) continue;
    const matchingPoles = catalog.poles.filter(item => canonical(item.name) === canonical(pole.name));
    if (matchingPoles.length !== 1) continue;
    const lines = commitments.filter(item =>
      canonical(item.model) === canonical(pole.model) && Number(item.pole_id) === Number(matchingPoles[0].id));
    const lineIds = new Set(lines.map(item => Number(item.id)));
    const matching = items.filter(item => lineIds.has(Number(item.commitment_id)));
    const actual = progressFor(matching, deployments);
    const real = progressFor(matching.filter(item =>
      Number(headers.get(Number(item.export_id)).historical_import) === 0), deployments);
    const currentCommitted = lines.reduce((sum, item) => sum + quantity(item.quantity, 'Số lượng trụ chốt'), 0);
    const target = Object.fromEntries(
      PROGRESS_KEYS.map(key => [
        key, pole[key] === null || pole[key] === undefined
          ? key === 'committed' ? currentCommitted : actual[key]
          : quantity(pole[key], 'Số lượng trong file')
      ])
    );
    const remainder = Object.fromEntries(Object.keys(real).map(key => [key, target[key] - real[key]]));
    const invalidRemainder = Object.values(remainder).some(value => value < 0)
      || target.committed < real.shipped
      || remainder.shipped > target.committed - real.shipped
      || remainder.received > remainder.shipped;
    let invalidPortions = false;
    if (!invalidRemainder) {
      try {
        buildPortions(remainder);
      } catch (error) {
        if (error.statusCode !== 400) throw error;
        invalidPortions = true;
      }
    }
    if (invalidRemainder || invalidPortions) {
      errors.push(`${pole.model} ${pole.name}: không thể phân bổ số lượng trong file mà vẫn giữ nguyên chứng từ thực; cần đối soát`);
    }
  }
  return errors;
};

module.exports = { checkRealProgress, checkFeasibleProgress, progressFor };
