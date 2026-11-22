const { validateRecord, validateExistingRecord } = require('./historicalOnImportValidation');
const { buildPortions } = require('./historicalOnImportProgress');
const { progressFor } = require('./historicalOnImportReconciliation');
const managed = require('./historicalOnImportManagedShipments');
const dataLists = require('./dataListService');
const formula = require('./formulaService');
const stationCodes = require('./stationCodeService');

const conflict = message => Object.assign(new Error(message), { statusCode: 409 });
const text = value => String(value ?? '').trim();
const present = value => value !== null && value !== undefined && text(value) !== '';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const canonical = value => text(value).toLocaleLowerCase('vi-VN');
const dateOnly = value => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : text(value).slice(0, 10);
const STATUS = {
  proposal_status: { 'Đã duyệt BCĐX': 'APPROVED', 'Đang triển khai': 'DEPLOYING', 'Hoạt động': 'ACTIVE', 'Đã hủy': 'CANCELLED', 'Đã lưu trữ': 'ARCHIVED' },
  on_status: { 'Hợp đồng và hạ tầng': 'ONBOARDING', 'Giao trụ': 'DELIVERING', 'Lắp trụ': 'INSTALLING', 'Nghiệm thu': 'ACCEPTANCE', 'Cấu hình': 'CONFIGURING', 'Hoạt động': 'OPERATING', 'Đã hủy': 'CANCELLED' },
  contract_status: { 'Chưa thực hiện': 'NOT', 'Đang thực hiện': 'DOING', 'Hoàn thành': 'DONE', 'Đã hủy': 'CANCELLED' },
  power_status: { 'Chưa thực hiện': 'NOT', 'Đang thực hiện': 'DOING', 'Hoàn thành': 'DONE' },
  site_status: { 'Chưa thực hiện': 'NOT', 'Đang thực hiện': 'DOING', 'Hoàn thành': 'DONE' },
  deposit_status: { 'Chưa nhận': 'NOT_RECEIVED', 'Đã nhận': 'RECEIVED', 'Chờ hoàn': 'REFUND_PENDING', 'Đã hoàn': 'REFUNDED', 'Không áp dụng': 'NOT_REQUIRED' },
  payment_status: { 'Chưa thực hiện': 'NOT', 'Đang thực hiện': 'DOING', 'Hoàn thành': 'DONE', 'Không áp dụng': 'NOT_REQUIRED' },
  delivery_status: { 'Chưa giao': 'PENDING', 'Đang giao': 'SHIPPING', 'Đã giao': 'DELIVERED', 'Giao thất bại': 'FAILED' }
};
const keys = ['committed', 'shipped', 'received', 'installed', 'accepted', 'on', 'accepted_on'];
const hasProgress = pole => keys.some(key => pole[key] !== null && pole[key] !== undefined);
const customKey = model => ({ NQ: 'loai_tru_nq', LK: 'loai_tru_lk', TDT: 'tdt_tru' })[model];

const generateStationCode = async (connection, provinceCode, proposalId) => {
  const stationCode = await stationCodes.generatePendingCode(provinceCode, connection);
  await stationCodes.assertCodeFree(stationCode, proposalId, connection);
  const [stations] = await connection.query('SELECT id FROM charging_stations WHERE ma_tram = ? LIMIT 1', [stationCode]);
  if (stations.length) throw conflict(`Mã trạm ${stationCode} đã tồn tại; cần đối soát bộ đếm`);
  return stationCode;
};

const generateCodes = async (connection, model, province) => {
  const region = await dataLists.getDiaGioiByTenTinh(province, connection);
  if (!region?.ma_tinh) throw conflict(`Không tìm thấy mã tỉnh "${province}"; cần đối soát`);
  const prefix = `${model}_${region.ma_tinh}`;
  const number = await formula.getNextSequence(prefix, connection);
  const proposalCode = `${prefix}_${String(number).padStart(4, '0')}`;
  const [existing] = await connection.query('SELECT id FROM station_proposals WHERE ma_de_xuat_gen = ? LIMIT 1', [proposalCode]);
  if (existing.length) throw conflict(`Mã đề xuất ${proposalCode} đã tồn tại; cần đối soát bộ đếm`);
  const stationCode = await generateStationCode(connection, region.ma_tinh);
  return { region, proposalCode, stationCode };
};

const patchProposed = (custom, pole) => {
  if (pole.proposed === null || pole.proposed === undefined) return;
  const key = customKey(pole.model);
  const existing = custom[key] == null ? [] : parse(custom[key]);
  if (!Array.isArray(existing)) throw conflict(`Quy mô đề xuất ${pole.model} không hợp lệ; cần đối soát`);
  const matches = existing.filter(row => canonical(row.loai_tru || row.ten_loai_tru) === canonical(pole.name));
  if (matches.length > 1) throw conflict(`${pole.model} ${pole.name}: quy mô đề xuất bị trùng`);
  if (matches.length) {
    if (pole.proposed === 0) existing.splice(existing.indexOf(matches[0]), 1);
    else matches[0].so_luong = pole.proposed;
  } else if (pole.proposed > 0) {
    existing.push({ loai_tru: pole.name, so_luong: pole.proposed });
  }
  custom[key] = existing;
};

const saveProgress = async (connection, stationId, snapshot, pole, resolved, commitments, chot, actor, context, deliveryDate, onDate, deliveryStatus) => {
  if (!hasProgress(pole)) return null;
  const lines = commitments.filter(line => canonical(line.model) === canonical(pole.model) && Number(line.pole_id) === resolved.pole_id);
  if (lines.length > 1) throw conflict(`${pole.model} ${pole.name}: có nhiều dòng trụ chốt; cần đối soát`);
  let line = lines[0];
  const headerById = new Map((snapshot?.exports || []).map(header => [Number(header.id), header]));
  const lineItems = line ? (snapshot?.export_items || []).filter(item => Number(item.commitment_id) === Number(line.id)
    && headerById.get(Number(item.export_id))?.destination_type === 'STATION') : [];
  const all = progressFor(lineItems, snapshot?.deployments || []);
  const realItems = lineItems.filter(item => Number(headerById.get(Number(item.export_id)).historical_import) === 0);
  const real = progressFor(realItems, snapshot?.deployments || []);
  const current = { ...all, committed: line ? Number(line.quantity) : 0 };
  const target = Object.fromEntries(keys.map(key => [key, pole[key] == null ? current[key] : pole[key]]));
  if (keys.every(key => target[key] === current[key])) return null;
  const remainder = Object.fromEntries(Object.keys(real).map(key => [key, target[key] - real[key]]));
  if (Object.values(remainder).some(value => value < 0) || target.committed < target.shipped
    || remainder.received > remainder.shipped) throw conflict(`${pole.model} ${pole.name}: số lượng không thể đối soát`);
  const portions = buildPortions(remainder);
  const historicalIds = [...new Set(lineItems.filter(item => Number(headerById.get(Number(item.export_id)).historical_import) === 1)
    .map(item => Number(item.export_id)))];
  for (const id of historicalIds) {
    const headerItems = snapshot.export_items.filter(item => Number(item.export_id) === id);
    if (headerItems.some(item => Number(item.commitment_id) !== Number(line.id))) {
      throw conflict('Phiếu lịch sử chứa nhiều dòng trụ; cần đối soát trước khi thay thế');
    }
    const old = await managed.assertUntouched(connection, id);
    if (old.deployments.length) await connection.query('DELETE FROM charging_station_deployments WHERE id IN (?)', [old.deployments.map(row => row.id)]);
    await connection.query('DELETE FROM warehouse_exports WHERE id = ?', [id]);
  }
  const matchingRows = line ? chot.filter(row => text(row.source_key || row.id) === text(line.source_key)) : [];
  if (line && matchingRows.length !== 1) throw conflict(`${pole.model} ${pole.name}: bảng trụ chốt không khớp; cần đối soát`);
  if (line && target.committed !== current.committed && (matchingRows[0].gia_chot != null || matchingRows[0].thanh_tien != null)) {
    throw conflict(`${pole.model} ${pole.name}: trụ chốt có giá; cần đối soát giá trước khi thay đổi số lượng`);
  }
  if (!target.committed) {
    if (line) {
      const [references] = await connection.query('SELECT id FROM warehouse_export_items WHERE commitment_id = ? LIMIT 1', [line.id]);
      if (references.length) throw conflict('Trụ chốt vẫn được tham chiếu bởi phiếu xuất; cần đối soát');
      await connection.query('DELETE FROM charging_station_commitments WHERE id = ?', [line.id]);
      commitments.splice(commitments.indexOf(line), 1);
      chot.splice(chot.indexOf(matchingRows[0]), 1);
    }
    return null;
  }
  if (!line) {
    const sourceKey = `historical:${pole.model}:${resolved.pole_id}`;
    const [inserted] = await connection.query(
      'INSERT INTO charging_station_commitments (charging_station_id,model,supplier_id,pole_id,quantity,source_key) VALUES (?,?,?,?,?,?)',
      [stationId, pole.model, resolved.supplier_id, resolved.pole_id, target.committed, sourceKey]
    );
    line = { id: inserted.insertId, model: pole.model, supplier_id: resolved.supplier_id, pole_id: resolved.pole_id, quantity: target.committed, source_key: sourceKey };
    commitments.push(line);
    chot.push({ source_key: sourceKey, mo_hinh: pole.model, pole_id: resolved.pole_id, loai_tru: pole.name, so_luong: target.committed });
  } else {
    await connection.query('UPDATE charging_station_commitments SET quantity = ? WHERE id = ?', [target.committed, line.id]);
    line.quantity = target.committed;
    matchingRows[0].so_luong = target.committed;
  }
  if (!remainder.shipped) return null;
  const transport = deliveryStatus || (remainder.received === remainder.shipped ? 'DELIVERED' : 'SHIPPING');
  if (transport === 'DELIVERED' && remainder.received !== remainder.shipped) throw conflict('Trạng thái đã giao không khớp số lượng đã nhận');
  const [shipment] = await connection.query(
    `INSERT INTO warehouse_exports
       (exporter_user_id,export_date,reason,charging_station_id,destination_type,transport_status,historical_import,historical_import_batch_key)
     VALUES (?,?,?,?,'STATION',?,1,?)`,
    [actor.id, deliveryDate, 'Dữ liệu lịch sử được nhập', stationId, transport, context.batchKey]
  );
  const [exportItem] = await connection.query(
    `INSERT INTO warehouse_export_items (export_id,pole_id,supplier_id,commitment_id,quantity,received_quantity)
     VALUES (?,?,?,?,?,?)`,
    [shipment.insertId, resolved.pole_id, resolved.supplier_id, line.id, remainder.shipped, remainder.received]
  );
  for (const portion of portions) {
    await connection.query(
      `INSERT INTO charging_station_deployments
       (charging_station_id,export_item_id,quantity,stage,sub_status,installation_status,acceptance_status,acceptance_legacy,on_quantity,on_date)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [stationId, exportItem.insertId, portion.quantity, portion.stage, portion.sub_status, portion.installation_status,
        portion.acceptance_status, portion.acceptance_status === 'PASSED' ? 1 : 0, portion.on_quantity, portion.on_quantity ? onDate : null]
    );
  }
  return shipment.insertId;
};

const writeRow = async (connection, raw, item, snapshot, actor, context) => {
  const record = validateRecord(raw, { creating: item.action === 'create' });
  validateExistingRecord(record, snapshot);
  const creating = item.action === 'create';
  const oldProposal = snapshot?.proposal || null;
  const oldStation = snapshot?.station || null;
  const managedBaselines = [];
  const historicIds = (snapshot?.exports || []).filter(header => Number(header.historical_import) === 1).map(header => Number(header.id));
  if (historicIds.length) {
    const [tracked] = await connection.query(
      'SELECT export_id FROM historical_on_import_managed_shipments WHERE export_id IN (?) ORDER BY export_id FOR UPDATE',
      [historicIds]
    );
    for (const row of tracked) managedBaselines.push(await managed.assertUntouched(connection, row.export_id));
  }
  const custom = oldProposal?.custom_data ? parse(oldProposal.custom_data) : {};
  if (!custom || Array.isArray(custom) || typeof custom !== 'object') throw conflict('Dữ liệu đề xuất không hợp lệ; cần đối soát');
  custom.historical_bcdx_code = text(record.legacy_code);
  for (const [source, target] of [['province', 'province'], ['ward', 'xa_phuong'], ['map_url', 'link_google_map'], ['model', 'mo_hinh_dau_tu']]) {
    if (present(record[source])) custom[target] = text(record[source]);
  }
  for (const pole of record.poles) patchProposed(custom, pole);
  const hasOn = record.poles.some(pole => Number(pole.on) > 0);
  const inferredStatus = hasOn ? 'ACTIVE' : record.poles.some(pole => Number(pole.shipped) > 0) ? 'DEPLOYING' : 'APPROVED';
  const proposalStatus = STATUS.proposal_status[record.proposal_status] || (record.cancel_kind === 'Hủy BCĐX' ? 'CANCELLED'
    : record.cancel_kind === 'Hủy ON trạm' ? 'ARCHIVED' : oldProposal?.status || inferredStatus);
  const chot = oldProposal?.chot_so_luong_tru ? parse(oldProposal.chot_so_luong_tru) : [];
  if (!Array.isArray(chot)) throw conflict('Bảng trụ chốt không hợp lệ; cần đối soát');
  let proposalId = item.proposal_id;
  let stationCode = oldStation?.ma_tram || null;
  if (creating) {
    const codes = await generateCodes(connection, record.model, record.province);
    custom.ma_tinh = codes.region.ma_tinh;
    custom.vung_mien = codes.region.vung_mien;
    custom.ma_de_xuat = codes.proposalCode;
    stationCode = codes.stationCode;
    const [inserted] = await connection.query(
      `INSERT INTO station_proposals (user_id,latitude,longitude,owner_name,owner_phone,address,status,custom_data,chot_so_luong_tru,tong_gia_tri_chot)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [item.owner.id, record.latitude, record.longitude, text(record.owner_name), text(record.owner_phone),
        text(record.address), proposalStatus, JSON.stringify(custom), JSON.stringify(chot), record.contract_amount]
    );
    proposalId = inserted.insertId;
  } else {
    if (!oldStation && oldProposal.pending_station_code) {
      stationCode = oldProposal.pending_station_code;
      await stationCodes.assertCodeFree(stationCode, proposalId, connection);
      const [existingStations] = await connection.query('SELECT id FROM charging_stations WHERE ma_tram = ? LIMIT 1', [stationCode]);
      if (existingStations.length) throw conflict(`Mã trạm ${stationCode} đã tồn tại; cần đối soát`);
    } else if (!oldStation) {
      const region = custom.ma_tinh ? { ma_tinh: custom.ma_tinh }
        : await dataLists.getDiaGioiByTenTinh(custom.province, connection);
      if (!region?.ma_tinh) throw conflict('Không xác định được mã tỉnh để sinh mã trạm; cần đối soát');
      stationCode = await generateStationCode(connection, region.ma_tinh, proposalId);
    }
    await connection.query(
      `UPDATE station_proposals SET user_id=?,latitude=?,longitude=?,owner_name=?,owner_phone=?,address=?,status=?,custom_data=?,tong_gia_tri_chot=? WHERE id=?`,
      [item.owner?.id || oldProposal.user_id, present(record.latitude) ? record.latitude : oldProposal.latitude,
        present(record.longitude) ? record.longitude : oldProposal.longitude, present(record.owner_name) ? text(record.owner_name) : oldProposal.owner_name,
        present(record.owner_phone) ? text(record.owner_phone) : oldProposal.owner_phone, present(record.address) ? text(record.address) : oldProposal.address,
        proposalStatus, JSON.stringify(custom), record.contract_amount ?? oldProposal.tong_gia_tri_chot, proposalId]
    );
  }
  const stationStatus = STATUS.on_status[record.on_status] || (record.cancel_kind ? 'CANCELLED' : oldStation?.status
    || (hasOn ? 'OPERATING' : record.poles.some(pole => Number(pole.received) > Number(pole.installed)) ? 'INSTALLING'
      : record.poles.some(pole => Number(pole.installed) > 0) ? 'CONFIGURING'
      : record.poles.some(pole => Number(pole.received) > 0) ? 'INSTALLING'
        : record.poles.some(pole => Number(pole.shipped) > 0) ? 'DELIVERING' : 'ONBOARDING'));
  if ((stationStatus === 'CANCELLED') !== ['CANCELLED', 'ARCHIVED'].includes(proposalStatus)) {
    throw conflict('Trạng thái hủy của đề xuất và ON trạm không khớp; cần đối soát');
  }
  if (stationStatus !== 'CANCELLED' && (stationStatus === 'OPERATING') !== (proposalStatus === 'ACTIVE')) {
    throw conflict('Trạng thái hoạt động của đề xuất và ON trạm không khớp; cần đối soát');
  }
  const stationFields = {
    status: stationStatus,
    sub_status: oldStation?.status === stationStatus ? oldStation.sub_status : ({
      ONBOARDING: null, DELIVERING: 'NOT_DELIVERED', INSTALLING: 'NOT_INSTALLED',
      ACCEPTANCE: 'NOT_ACCEPTED', CONFIGURING: 'NOT_CONFIGURED', OPERATING: 'ACTIVE', CANCELLED: null
    })[stationStatus],
    cms_station_code: present(record.cms_code) ? text(record.cms_code) : oldStation?.cms_station_code || null,
    contract_status: STATUS.contract_status[record.contract_status] || oldStation?.contract_status || 'NOT',
    infra_power_status: STATUS.power_status[record.power_status] || oldStation?.infra_power_status || 'NOT',
    infra_site_status: STATUS.site_status[record.site_status] || oldStation?.infra_site_status || 'NOT',
    deposit_status: STATUS.deposit_status[record.deposit_status] || oldStation?.deposit_status || (record.model === 'TDT' ? 'NOT_REQUIRED' : 'NOT_RECEIVED'),
    payment_status: STATUS.payment_status[record.payment_status] || oldStation?.payment_status || (record.model === 'TDT' ? 'NOT_REQUIRED' : 'NOT'),
    contract_number: present(record.contract_number) ? text(record.contract_number) : oldStation?.contract_number || null,
    contract_signed_date: record.contract_date || oldStation?.contract_signed_date || null,
    note: present(record.note) ? text(record.note) : oldStation?.note || null,
    on_date: record.on_date && oldStation?.on_date ? (record.on_date < dateOnly(oldStation.on_date) ? record.on_date : oldStation.on_date)
      : record.on_date || oldStation?.on_date || null
  };
  let stationId = oldStation?.id;
  if (!stationId) {
    const [inserted] = await connection.query(
      `INSERT INTO charging_stations (proposal_id,ma_tram,status,sub_status,cms_station_code,contract_status,infra_power_status,infra_site_status,deposit_status,payment_status,contract_number,contract_signed_date,note,on_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [proposalId, stationCode, ...Object.values(stationFields)]
    );
    stationId = inserted.insertId;
  } else {
    await connection.query(
      `UPDATE charging_stations SET status=?,sub_status=?,cms_station_code=?,contract_status=?,infra_power_status=?,infra_site_status=?,deposit_status=?,payment_status=?,contract_number=?,contract_signed_date=?,note=?,on_date=? WHERE id=?`,
      [...Object.values(stationFields), stationId]
    );
    if (oldStation.infra_delivery_confirmation === 'CONFIRMED') {
      const [[current]] = await connection.query('SELECT * FROM charging_stations WHERE id=?', [stationId]);
      await require('./chargingStationService').revokeInvalidInfrastructureConfirmation(
        connection, current, { actorId: actor.id, actorRole: actor.role }
      );
    }
  }
  const commitments = [...(snapshot?.commitments || [])];
  const createdExports = [];
  for (let index = 0; index < record.poles.length; index++) {
    const id = await saveProgress(connection, stationId, snapshot, record.poles[index], item.poles[index], commitments, chot,
      actor, context, record.delivery_date, record.on_date, STATUS.delivery_status[record.delivery_status]);
    if (id) createdExports.push(id);
  }
  const [[progress]] = await connection.query(
    'SELECT COALESCE(SUM(on_quantity),0) AS on_quantity FROM charging_station_deployments WHERE charging_station_id=? AND returned_at IS NULL',
    [stationId]
  );
  if (Number(progress.on_quantity) > 0 && stationStatus !== 'CANCELLED'
    && (stationStatus !== 'OPERATING' || proposalStatus !== 'ACTIVE')) {
    throw conflict('Có trụ đã ON nhưng trạng thái đề xuất hoặc ON trạm chưa hoạt động; cần đối soát');
  }
  if (record.delivery_date || present(record.delivery_status)) {
    const affectedIds = commitments.filter(line => record.poles.some((pole, index) =>
      canonical(pole.model) === canonical(line.model) && Number(item.poles[index].pole_id) === Number(line.pole_id)))
      .map(line => line.id);
    const [shipments] = affectedIds.length ? await connection.query(
      `SELECT DISTINCT e.id,e.export_date,e.transport_status FROM warehouse_exports e
       JOIN warehouse_export_items i ON i.export_id=e.id
       WHERE e.historical_import=1 AND i.commitment_id IN (?)`, [affectedIds]
    ) : [[]];
    if (!shipments.length || shipments.some(shipment =>
      (record.delivery_date && dateOnly(shipment.export_date) !== record.delivery_date)
      || (present(record.delivery_status) && shipment.transport_status !== STATUS.delivery_status[record.delivery_status]))) {
      throw conflict('Ngày hoặc trạng thái giao trụ không khớp phiếu lịch sử; cần đối soát');
    }
  }
  await connection.query('UPDATE station_proposals SET chot_so_luong_tru = ? WHERE id = ?', [JSON.stringify(chot), proposalId]);
  await connection.query(
    `INSERT INTO charging_station_activity_logs (charging_station_id,action,from_status,to_status,changed_fields,actor_id,actor_role,source)
     VALUES (?,'historical_import',?,?,?,?,?,'script')`,
    [stationId, oldStation?.status || null, stationStatus, JSON.stringify({ batch_key: context.batchKey, row: record.row }), actor.id, actor.role]
  );
  await require('./proposalLifecycle').logActivity({ connection, proposalId, action: 'historical_import',
    fromStatus: oldProposal?.status, toStatus: proposalStatus, actorId: actor.id, actorRole: actor.role, source: 'script',
    changedFields: { batch_key: context.batchKey, row: record.row } });
  if (managedBaselines.length) {
    const [remaining] = await connection.query('SELECT id FROM warehouse_exports WHERE id IN (?)',
      [managedBaselines.map(baseline => baseline.header.id)]);
    const remainingIds = new Set(remaining.map(row => Number(row.id)));
    for (const baseline of managedBaselines) {
      if (remainingIds.has(Number(baseline.header.id))) await managed.advanceBaseline(connection, baseline);
    }
  }
  for (const exportId of createdExports) await managed.saveBaseline(connection, { exportId, batchKey: context.batchKey });
  return { row: record.row, action: item.action, proposal_id: proposalId, charging_station_id: stationId };
};

module.exports = { writeRow };
