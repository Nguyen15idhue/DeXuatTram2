const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const pool = require('./src/utils/db');

test('real MySQL partial delivery, returns and parallel activation remain atomic', {
  skip: process.env.ON_PARTIAL_INTEGRATION !== '1', timeout: 120000
}, async () => {
  const connection = await pool.getConnection();
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  let serial = 0;
  await connection.beginTransaction();
  pool.query = (...args) => connection.query(...args);
  pool.getConnection = async () => {
    const savepoint = `partial_test_${++serial}`;
    return {
      query: (...args) => connection.query(...args),
      beginTransaction: () => connection.query(`SAVEPOINT ${savepoint}`),
      commit: () => connection.query(`RELEASE SAVEPOINT ${savepoint}`),
      rollback: () => connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`),
      release: () => {}
    };
  };
  const ctx = (user) => ({ actorId: user.id, actorRole: user.role, ip: '127.0.0.1' });
  const stations = require('./src/services/chargingStationService');
  const shipping = require('./src/services/chargingStationShippingService');
  const deployments = require('./src/services/chargingStationDeploymentService');
  const finance = require('./src/services/chargingFinanceService');
  const request = () => randomUUID();
  const suffix = Date.now();
  try {
    const user = async (role, department) => {
      const [row] = await connection.query(
        'INSERT INTO users(full_name,email,password,role,status,custom_data) VALUES(?,?,?,?,?,?)',
        [`Partial test ${role}`, `partial-${role}-${department.length}-${suffix}@example.invalid`,
          'not-a-login-password', role, 'ACTIVE', JSON.stringify({ department })]);
      return { id: row.insertId, role };
    };
    const bo = await user('SALES', 'Back Office');
    const setup = await user('SALES', 'Phòng Setup và Vận hành');
    const admin = await user('ADMIN', 'Back Office');
    const superAdmin = await user('SUPER_ADMIN', '');
    const owner = await user('NPP', '');
    const [supplier] = await connection.query('INSERT INTO suppliers(name) VALUES(?)', [`Partial ${suffix}`]);
    const [pole] = await connection.query(
      'INSERT INTO charging_poles(name,charging_type,power_kw,quantity) VALUES(?,?,?,?)',
      [`Partial DC60 ${suffix}`, 'DC', 60, 10]);
    await connection.query('INSERT INTO supplier_charging_poles(supplier_id,charging_pole_id,quantity) VALUES(?,?,10)',
      [supplier.insertId, pole.insertId]);
    const [proposal] = await connection.query(
      `INSERT INTO station_proposals(user_id,latitude,longitude,owner_name,owner_phone,address,status,custom_data,chot_so_luong_tru)
       VALUES(?,10,106,'Partial integration','0900000000','Integration only','APPROVED',?,?)`,
      [owner.id, JSON.stringify({ mo_hinh_dau_tu: 'LK', ma_de_xuat: `PARTIAL_${suffix}` }),
        JSON.stringify([{ mo_hinh: 'LK', so_luong: 2, loai_tru: `Partial DC60 ${suffix}`,
          supplier_id: supplier.insertId, pole_id: pole.insertId }])]);
    const file = async (u) => {
      const [result] = await connection.query(
        `INSERT INTO files(original_name,storage_key,mime_type,size,uploaded_by,status)
         VALUES('partial.pdf',?,'application/pdf',10,?,'active')`, [`partial-${u.id}-${suffix}.pdf`, u.id]);
      return result.insertId;
    };
    const contractPdf = await file(bo);
    const acceptancePdf = await file(setup);
    await connection.query('UPDATE station_proposals SET signed_file_id=? WHERE id=?', [contractPdf, proposal.insertId]);
    const created = await stations.createFromApprovedProposal(proposal.insertId, ctx(owner));
    const id = created.record.id;
    await assert.rejects(() => stations.startContractSigning(id, admin, ctx(admin)), { statusCode: 403 });
    await stations.startContractSigning(id, bo, ctx(bo));
    await stations.completeContract(id, contractPdf, bo, ctx(bo));
    const [[afterContract]] = await connection.query('SELECT status FROM station_proposals WHERE id=?', [proposal.insertId]);
    assert.equal(afterContract.status, 'DEPLOYING');
    const [[payment]] = await connection.query('SELECT payment_status FROM charging_stations WHERE id=?', [id]);
    assert.equal(payment.payment_status, 'DOING');
    await stations.requestEarlyDelivery(id, {
      desired_delivery_date: '2027-01-01', reason: 'Deliver before prerequisites',
      accept_missing: true
    }, owner, ctx(owner));
    let summary = await shipping.getSummary(id);
    assert.equal(summary.items[0].committed_quantity, 2);
    const commitmentId = summary.items[0].commitment_id;
    const exportOne = async () => {
      await shipping.createExport(id, {
        request_id: request(), carrier: 'Test carrier', transport_code: request(), total_amount: 0,
        items: [{ commitment_id: commitmentId, quantity: 1 }]
      }, bo, ctx(bo));
      return (await shipping.getSummary(id)).shipments.reduce((latest, item) => item.id > latest.id ? item : latest);
    };
    const failed = await exportOne();
    await shipping.markFailed(id, failed.id, { request_id: request(), reason: 'Delivery failed' }, bo, ctx(bo));
    await shipping.requestReturn(id, failed.id, { request_id: request(), reason: 'Return unreceived',
      items: [{ item_id: failed.items[0].id, quantity: 1 }] }, bo, ctx(bo));
    let [[stock]] = await connection.query('SELECT quantity FROM supplier_charging_poles WHERE supplier_id=? AND charging_pole_id=?',
      [supplier.insertId, pole.insertId]);
    assert.equal(stock.quantity, 9);
    await shipping.confirmReturn(id, failed.id, { request_id: request(), reason: 'Warehouse received',
      items: [{ item_id: failed.items[0].id, quantity: 1 }] }, bo, ctx(bo));
    [[stock]] = await connection.query('SELECT quantity FROM supplier_charging_poles WHERE supplier_id=? AND charging_pole_id=?',
      [supplier.insertId, pole.insertId]);
    assert.equal(stock.quantity, 10);
    const activate = async (shipment, date) => {
      await shipping.receive(id, shipment.id, { request_id: request(),
        items: [{ item_id: shipment.items[0].id, quantity: 1 }] }, bo, ctx(bo));
      const portion = (await deployments.getDeployments(id)).at(-1);
      for (const action of ['start-installation', 'complete-installation', 'acceptance-failed', 'acceptance-passed']) {
        await deployments.updatePortion(id, portion.id, {
          action, request_id: request(), reason: 'Integration acceptance',
          ...(action === 'acceptance-passed' ? { acceptance_file_id: acceptancePdf } : {})
        }, setup, ctx(setup));
      }
      const payload = {
        action: 'complete-configuration', request_id: request(), cms_station_code: `CMS_PARTIAL_${suffix}`,
        on_date: date, accept_missing: true, reason: 'Explicitly allow residual infrastructure'
      };
      await deployments.updatePortion(id, portion.id, payload, setup, ctx(setup));
      await deployments.updatePortion(id, portion.id, payload, setup, ctx(setup));
    };
    await activate(await exportOne(), '2026-10-01');
    let [[progress]] = await connection.query(
      'SELECT cs.*,p.status AS proposal_status FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=?', [id]);
    assert.equal(progress.proposal_status, 'ACTIVE');
    assert.equal(progress.sub_status, 'ACTIVE');
    assert.equal(progress.deposit_status, 'NOT_RECEIVED');
    await assert.rejects(() => stations.updateChargingStation(id, { on_date: '2026-10-03' }, ctx(superAdmin)),
      { statusCode: 409 });
    await stations.updateChargingStation(id, { on_date: '2026-10-01', description: 'Preserve first ON date' }, ctx(superAdmin));
    const delivery = await stations.listChargingStations({ stage: 'giao-tru', tab: 'need', user: bo });
    assert.ok(delivery.items.some((row) => row.id === id));
    const counts = await stations.getChargingStationTaskCounts(bo);
    assert.ok(counts.counts.delivery > 0);
    await finance.createInvoice(id, { invoice_type: 'DEPOSIT', amount: 10, evidence_file_id: contractPdf }, bo, ctx(bo));
    await assert.rejects(() => finance.createInvoice(id, {
      invoice_type: 'REFUND', amount: 1, evidence_file_id: contractPdf
    }, bo, ctx(bo)), { statusCode: 409 });
    await activate(await exportOne(), '2026-10-02');
    [[progress]] = await connection.query('SELECT * FROM charging_stations WHERE id=?', [id]);
    assert.equal(progress.deposit_status, 'REFUND_PENDING');
    assert.equal(new Date(progress.on_date).getDate(), 1);
    summary = await shipping.getSummary(id);
    assert.equal(summary.totals.committed, 2);
    assert.equal(summary.totals.received, 2);
    assert.equal(summary.totals.operating, 2);
    assert.equal(summary.totals.remaining, 0);
    [[stock]] = await connection.query('SELECT quantity FROM supplier_charging_poles WHERE supplier_id=? AND charging_pole_id=?',
      [supplier.insertId, pole.insertId]);
    assert.equal(stock.quantity, 8);
    await finance.createInvoice(id, { invoice_type: 'REFUND', amount: 10, evidence_file_id: contractPdf }, bo, ctx(bo));
    for (const type of ['power', 'site']) {
      await stations.updateInfrastructureStatus(id, type, 'start', bo, ctx(bo));
      await stations.updateInfrastructureStatus(id, type, 'complete', bo, ctx(bo));
    }
    await finance.createInvoice(id, { invoice_type: 'PAYMENT', amount: 10, evidence_file_id: contractPdf }, bo, ctx(bo));
    await stations.updatePaymentStatus(id, { payment_status: 'DONE', reason: 'Finish residual finance' }, bo, ctx(bo));
    const finished = await stations.listChargingStations({ stage: 'thong-tin-chung', tab: 'completed', user: bo });
    assert.ok(finished.items.some((row) => row.id === id));
    await assert.rejects(() => shipping.createExport(id, {
      request_id: request(), carrier: 'Test', transport_code: 'Too many', total_amount: 0,
      items: [{ commitment_id: commitmentId, quantity: 1 }]
    }, bo, ctx(bo)), { statusCode: 409 });
    for (const last of ['contract', 'infrastructure', 'deposit']) {
      const model = last === 'deposit' ? 'LK' : 'TDT';
      const [source] = await connection.query(
        `INSERT INTO station_proposals(user_id,latitude,longitude,owner_name,owner_phone,address,status,signed_file_id,custom_data,chot_so_luong_tru)
         VALUES(?,10,106,'Readiness integration','0900000000','Integration only','APPROVED',?,?,?)`,
        [owner.id, contractPdf, JSON.stringify({ mo_hinh_dau_tu: model }),
          JSON.stringify([{ mo_hinh: model, so_luong: 1, loai_tru: `Partial DC60 ${suffix}`,
            supplier_id: supplier.insertId, pole_id: pole.insertId }])]);
      const next = (await stations.createFromApprovedProposal(source.insertId, ctx(owner))).record.id;
      const contract = async () => {
        await stations.startContractSigning(next, bo, ctx(bo));
        await stations.completeContract(next, contractPdf, bo, ctx(bo));
      };
      const infrastructure = async () => {
        await stations.updateInfrastructureStatus(next, 'power', 'start', bo, ctx(bo));
        await stations.updateInfrastructureStatus(next, 'power', 'complete', bo, ctx(bo));
      };
      if (last === 'contract') {
        await infrastructure();
        await contract();
      } else {
        await contract();
        await infrastructure();
      }
      if (last === 'deposit') {
        const [[waiting]] = await connection.query('SELECT status FROM charging_stations WHERE id=?', [next]);
        assert.equal(waiting.status, 'ONBOARDING');
        await finance.createInvoice(next, { invoice_type: 'DEPOSIT', amount: 10 }, bo, ctx(bo));
      }
      const [[ready]] = await connection.query('SELECT status,sub_status FROM charging_stations WHERE id=?', [next]);
      assert.deepEqual(ready, { status: 'DELIVERING', sub_status: 'NOT_DELIVERED' });
    }
  } finally {
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
    await connection.rollback();
    connection.release();
    await pool.end();
  }
});
