const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const dynamic = require('../src/services/dynamicUtils');
const enrichment = require('../src/services/addressEnrichment');
const admin = require('../src/services/adminProposalService');
const owner = require('../src/services/myProposalService');

const row = {
  user_id: 7, status: 'PENDING', custom_data: '{}', latitude: 21, longitude: 105,
  owner_name: 'Test', owner_phone: '0123456789', address: 'Test'
};

function mockFields(t) {
  t.mock.method(dynamic, 'getFieldDefinitionsByEntity', async () => []);
  t.mock.method(dynamic, 'splitData', () => ({ fixedData: {}, dynamicData: {} }));
  t.mock.method(dynamic, 'applyAutoUserFields', async () => {});
  t.mock.method(dynamic, 'resolveTablePrices', async () => {});
  t.mock.method(enrichment, 'enrichDynamicData', async () => {});
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    query: (...args) => pool.query(...args),
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  }));
}

for (const kind of ['admin', 'owner']) {
  test(`${kind} edit rejects a concurrent status transition instead of restoring the old status`, async (t) => {
    mockFields(t);
    t.mock.method(pool, 'query', async (sql, params) => {
      if (/^\s*SELECT/i.test(sql)) return [[row]];
      if (/^\s*UPDATE station_proposals/i.test(sql)) {
        assert.match(sql, /WHERE id = \? AND (?:user_id = \? AND )?status = \?/);
        assert.equal(params.at(-1), 'PENDING');
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const operation = kind === 'admin'
      ? admin.updateProposal(1, {}, { expectedStatus: 'PENDING' })
      : owner.updateProposal(1, 7, {}, { actorRole: 'CTV' });
    await assert.rejects(operation, { statusCode: 409 });
  });
}

test('admin edit rejects a status changed after the controller checked permissions', async (t) => {
  mockFields(t);
  t.mock.method(pool, 'query', async () => [[{ ...row, status: 'GRADING' }]]);
  await assert.rejects(admin.updateProposal(1, {}, { expectedStatus: 'PENDING' }), { statusCode: 409 });
});

test.after(async () => pool.end());
