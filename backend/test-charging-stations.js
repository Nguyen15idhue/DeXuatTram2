const pool = require('./src/utils/db');
const service = require('./src/services/chargingStationService');

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

const expectError = async (fn, statusCode) => {
  try {
    await fn();
    return false;
  } catch (error) {
    return error.statusCode === statusCode;
  }
};

const tag = `TST${Date.now() % 100000}`;
const fileIds = [];
let proposalId = null;
let unsignedProposalId = null;
let hookProposalId = null;
let hookChargingId = null;
let chargingId = null;

const cleanup = async () => {
  if (process.env.KEEP_TEST_DATA === '1') return;
  for (const id of [chargingId, hookChargingId].filter(Boolean)) {
    await pool.query('DELETE FROM charging_stations WHERE id = ?', [id]);
  }
  for (const id of [proposalId, unsignedProposalId, hookProposalId].filter(Boolean)) {
    await pool.query('DELETE FROM proposal_activity_logs WHERE proposal_id = ?', [id]);
    await pool.query('DELETE FROM proposal_signature_configs WHERE proposal_id = ?', [id]);
    await pool.query("DELETE FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ?", [id]);
    await pool.query('DELETE FROM station_proposals WHERE id = ?', [id]);
  }
  for (const id of fileIds) {
    await pool.query('DELETE FROM files WHERE id = ?', [id]);
  }
};

const run = async () => {
  const [pdfInsert] = await pool.query(
    `INSERT INTO files (original_name, storage_key, mime_type, size, uploaded_by, status)
     VALUES (?, ?, 'application/pdf', 1024, NULL, 'active')`,
    [`${tag}_bien_ban.pdf`, `test/${tag}_bien_ban.pdf`]
  );
  const [imageInsert] = await pool.query(
    `INSERT INTO files (original_name, storage_key, mime_type, size, uploaded_by, status)
     VALUES (?, ?, 'image/png', 512, NULL, 'active')`,
    [`${tag}_anh.png`, `test/${tag}_anh.png`]
  );
  const pdfId = pdfInsert.insertId;
  const imageId = imageInsert.insertId;
  fileIds.push(pdfId, imageId);

  const [propInsert] = await pool.query(
    `INSERT INTO station_proposals (user_id, status, latitude, longitude, owner_name, owner_phone, pending_station_code, custom_data, signed_file_id)
     VALUES (NULL, 'APPROVED', 10.1, 106.1, ?, '0900000000', ?, CAST(? AS JSON), ?)`,
    [`TEST_${tag}`, `E.${tag}`, JSON.stringify({ mo_hinh_dau_tu: 'NQ' }), pdfId]
  );
  proposalId = propInsert.insertId;

  const first = await service.createFromApprovedProposal(proposalId, { source: 'script' });
  chargingId = first.record.id;
  check('Tạo ON trạm từ đề xuất đã ký', first.created === true && first.record.status === 'ONBOARDING', `id=${chargingId}`);
  check('Mã trạm lấy từ pending_station_code', first.record.ma_tram === `E.${tag}`, first.record.ma_tram);
  check('Mặc định hợp đồng/hạ tầng/thanh toán = NOT',
    first.record.contract_status === 'NOT' && first.record.infra_power_status === 'NOT'
    && first.record.infra_site_status === 'NOT' && first.record.payment_status === 'NOT');

  const second = await service.createFromApprovedProposal(proposalId, { source: 'script' });
  check('Idempotent: gọi lại không tạo bản ghi thứ hai', second.created === false && second.record.id === chargingId);

  const [unsignedInsert] = await pool.query(
    "INSERT INTO station_proposals (status, latitude, longitude, owner_name, owner_phone, custom_data) VALUES ('APPROVED', 1, 1, 'TEST_UNSIGNED', '0900000000', '{}')"
  );
  unsignedProposalId = unsignedInsert.insertId;
  const noSigned = await expectError(() => service.createFromApprovedProposal(unsignedProposalId, {}), 400);
  check('Không tạo nếu đề xuất chưa có file đã ký', noSigned);

  check('Chặn Đang giao hàng khi chưa ký hợp đồng',
    await expectError(() => service.changeStatus(chargingId, { to_status: 'DELIVERING' }, {}), 400));

  await service.updateChargingStation(chargingId, {
    contract_status: 'DONE',
    infra_power_status: 'DONE',
    infra_site_status: 'DONE',
    payment_status: 'DOING',
    on_date: '2026-11-01'
  }, {});
  const afterUpdate = await service.getChargingStationDetail(chargingId);
  check('Cập nhật hợp đồng/hạ tầng/thanh toán/ngày ON', afterUpdate.contract_status === 'DONE' && afterUpdate.payment_status === 'DOING' && afterUpdate.on_date === '2026-11-01');

  const delivering = await service.changeStatus(chargingId, { to_status: 'DELIVERING' }, {});
  check('Chuyển Đang giao hàng, sub = Chưa giao trụ', delivering.status === 'DELIVERING' && delivering.sub_status === 'NOT_DELIVERED');

  check('Chặn nhảy bước DELIVERING -> OPERATING',
    await expectError(() => service.changeStatus(chargingId, { to_status: 'OPERATING' }, {}), 400));

  await service.changeStatus(chargingId, { to_status: 'INSTALLING', sub_status: 'INSTALLING' }, {});
  await service.changeStatus(chargingId, { to_status: 'ACCEPTANCE' }, {});
  check('Đi qua Lắp trụ -> Nghiệm thu', (await service.getChargingStationDetail(chargingId)).status === 'ACCEPTANCE');

  check('Lùi bước cần lý do',
    await expectError(() => service.changeStatus(chargingId, { to_status: 'INSTALLING' }, {}), 400));
  const rolled = await service.changeStatus(chargingId, { to_status: 'INSTALLING', reason: 'Nghiệm thu không đạt, lắp lại' }, {});
  check('Lùi về Lắp trụ với sub = Đã lắp đặt', rolled.status === 'INSTALLING' && rolled.sub_status === 'INSTALLED');

  await service.changeStatus(chargingId, { to_status: 'ACCEPTANCE' }, {});
  check('Sub-status sai nhóm bị chặn',
    await expectError(() => service.updateChargingStation(chargingId, { sub_status: 'ACTIVE' }, {}), 400));

  check('Chặn On trạm khi chưa nghiệm thu đạt',
    await expectError(() => service.changeStatus(chargingId, { to_status: 'OPERATING' }, {}), 400));

  await service.updateChargingStation(chargingId, { sub_status: 'ACCEPT_PASSED' }, {});

  check('Chặn biên bản không phải PDF',
    await expectError(() => service.setAcceptanceFile(chargingId, imageId, {}), 400));
  await service.setAcceptanceFile(chargingId, pdfId, {});

  check('Chặn ảnh nghiệm thu không phải ảnh',
    await expectError(() => service.addAcceptanceImages(chargingId, [pdfId], {}), 400));
  const withImage = await service.addAcceptanceImages(chargingId, [imageId], {});
  check('Thêm ảnh nghiệm thu', withImage.images.length === 1);
  const withoutImage = await service.removeAcceptanceImage(chargingId, imageId, {});
  check('Gỡ ảnh nghiệm thu', withoutImage.images.length === 0);

  await service.updateAcceptance(chargingId, { acceptance_user_id: 1, acceptance_date: '2026-11-05' }, {});
  const accepted = await service.getChargingStationDetail(chargingId);
  check('Lưu người và ngày nghiệm thu', accepted.acceptance_user_id === 1 && accepted.acceptance_date === '2026-11-05');

  const operating = await service.changeStatus(chargingId, { to_status: 'OPERATING' }, {});
  check('Chuyển On trạm, sub = Đang cấu hình', operating.status === 'OPERATING' && operating.sub_status === 'CONFIGURING');

  const onList = await service.listChargingStations({ stage: 'on-tram', search: tag });
  check('Giai đoạn On trạm liệt kê bản ghi', onList.items.some((item) => item.id === chargingId));

  const detail = await service.getChargingStationDetail(chargingId);
  check('Nhật ký hoạt động được ghi', detail.timeline.length >= 8, `${detail.timeline.length} dòng`);

  const [hookInsert] = await pool.query(
    `INSERT INTO station_proposals (user_id, status, latitude, longitude, owner_name, owner_phone, custom_data)
     VALUES (NULL, 'SIGNATURE_PENDING', 10.1, 106.1, ?, '0900000000', '{}')`,
    [`TEST_HOOK_${tag}`]
  );
  hookProposalId = hookInsert.insertId;
  await pool.query(
    "INSERT INTO proposal_signature_configs (proposal_id, user_id, status, signed_at) VALUES (?, 1, 'SIGNED', NOW())",
    [hookProposalId]
  );
  const proposalSignatureService = require('./src/services/proposalSignatureService');
  await proposalSignatureService.uploadSignedFile({
    user: { id: 1, role: 'ADMIN' },
    id: hookProposalId,
    files: [{ id: fileIds[0] }],
    ip: '127.0.0.1'
  });
  const [hookStatus] = await pool.query('SELECT status, signed_file_id FROM station_proposals WHERE id = ?', [hookProposalId]);
  check('Hook: tải file đã ký chuyển đề xuất sang APPROVED', hookStatus[0].status === 'APPROVED' && hookStatus[0].signed_file_id === fileIds[0]);
  const hookCharging = await service.findByProposal(hookProposalId);
  check('Hook: tự tạo ON trạm ONBOARDING sau khi upload file đã ký',
    !!hookCharging && hookCharging.status === 'ONBOARDING' && hookCharging.contract_status === 'NOT',
    hookCharging ? `id=${hookCharging.id}` : 'không có bản ghi');
  if (hookCharging) hookChargingId = hookCharging.id;

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nKết quả: ${passed}/${results.length} PASS`);
};

run()
  .catch((error) => {
    console.error('FAIL | lỗi không mong muốn:', error);
    results.push({ name: 'unexpected', ok: false });
  })
  .finally(async () => {
    await cleanup();
    await pool.end();
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  });
