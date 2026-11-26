const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('combined save commits and rolls back on MySQL', {
  skip: process.env.RUN_LEAD_PROPOSAL_MYSQL_TESTS !== '1', timeout: 60000
}, async (t) => {
  assert.equal(process.env.DB_NAME, 'copilot_lead_test');
  const pool = require('../src/utils/db');
  const leads = require('../src/services/lead/leadService.js');
  const access = require('../src/services/lead/leadAccessService.js');
  const proposals = require('../src/services/proposal/proposalService.js');
  const journey = require('../src/services/journeyActivityService');
  const sync = require('../src/services/journeySyncService');
  const requirement = require('../src/services/lead/leadProposalRequirement.js');
  const service = require('../src/services/lead/leadProposalService.js');
  try {
    await pool.query(`CREATE TABLE leads (
      id INT PRIMARY KEY, journey_id INT NOT NULL, sales_outcome VARCHAR(20),
      consultation_status VARCHAR(30), assigned_user_id INT
    )`);
    await pool.query('CREATE TABLE station_proposals (id INT AUTO_INCREMENT PRIMARY KEY, journey_id INT)');
    const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '252-lead-proposal-save-idempotency.sql'), 'utf8');
    await pool.query(migration);
    await pool.query("INSERT INTO leads VALUES (1, 10, NULL, 'CONSULTING', 8)");
    t.mock.method(leads, 'getLeadById', async (id, executor = pool) => {
      const [[row]] = await executor.query('SELECT * FROM leads WHERE id = ?', [id]);
      return row;
    });
    t.mock.method(access, 'permissions', async () => ({ can_consult: true }));
    t.mock.method(leads, 'applyLeadUpdate', async (conn, row) => {
      await conn.query("UPDATE leads SET sales_outcome = 'SUCCESS', consultation_status = 'SUCCESS' WHERE id = ?", [row.id]);
      return { ...row, sales_outcome: 'SUCCESS', consultation_status: 'SUCCESS' };
    });
    t.mock.method(proposals, 'createProposal', async (_owner, data, opts) => {
      const [result] = await opts.connection.query('INSERT INTO station_proposals (journey_id) VALUES (NULL)');
      if (data.description === 'fail') throw new Error('injected failure');
      return { id: result.insertId, initialStatus: 'PENDING', postResults: {} };
    });
    t.mock.method(proposals, 'finishProposalCreation', async () => {});
    t.mock.method(proposals, 'getProposalFullById', async (id) => {
      const [[row]] = await pool.query('SELECT * FROM station_proposals WHERE id = ?', [id]);
      return row;
    });
    t.mock.method(journey, 'log', async () => {});
    t.mock.method(sync, 'recomputeStage', async () => {});
    const before = await leads.getLeadById(1);
    const data = {
      lead: { sales_outcome: 'SUCCESS' },
      proposal: { latitude: 10, longitude: 106, owner_name: 'Khách', owner_phone: '0900000000' },
      edit_version: requirement.editVersion(before),
    };
    const actor = { id: 8, role: 'SUPER_ADMIN' };
    await assert.rejects(() => service.saveLeadAndCreateProposal(1, {
      ...data, proposal: { ...data.proposal, description: 'fail' }
    }, actor, { idempotencyKey: 'failed' }), /injected failure/);
    assert.equal((await leads.getLeadById(1)).sales_outcome, null);
    const [[afterFailure]] = await pool.query('SELECT COUNT(*) AS n FROM station_proposals');
    assert.equal(afterFailure.n, 0);
    const result = await service.saveLeadAndCreateProposal(1, data, actor, { idempotencyKey: 'success' });
    const retry = await service.saveLeadAndCreateProposal(1, data, actor, { idempotencyKey: 'success' });
    assert.equal(retry.deduped, true);
    assert.equal(retry.proposal.id, result.proposal.id);
    assert.equal((await leads.getLeadById(1)).sales_outcome, 'SUCCESS');
    const [[afterSuccess]] = await pool.query('SELECT COUNT(*) AS n FROM station_proposals WHERE journey_id = 10');
    assert.equal(afterSuccess.n, 1);
    await pool.query("INSERT INTO leads VALUES (2, 20, NULL, 'CONSULTING', 8)");
    const parallelData = { ...data, edit_version: requirement.editVersion(await leads.getLeadById(2)) };
    const results = await Promise.all([
      service.saveLeadAndCreateProposal(2, parallelData, actor, { idempotencyKey: 'parallel' }),
      service.saveLeadAndCreateProposal(2, parallelData, actor, { idempotencyKey: 'parallel' }),
    ]);
    assert.equal(results[0].proposal.id, results[1].proposal.id);
    assert.equal(results.filter((item) => item.deduped).length, 1);
    const [[afterParallel]] = await pool.query('SELECT COUNT(*) AS n FROM station_proposals WHERE journey_id = 20');
    assert.equal(afterParallel.n, 1);
  } finally {
    await pool.end();
  }
});
