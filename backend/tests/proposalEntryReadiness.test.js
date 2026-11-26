const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const dynamicUtils = require('../src/services/dynamicUtils');
const readiness = require('../src/services/proposalEntryReadiness');

const originalDefinitions = dynamicUtils.getFieldDefinitionsByEntity;
const fields = [
  { key: 'owner_phone', label: 'Số điện thoại', type: 'phone', required: 1 },
  { key: 'latitude', label: 'Vĩ độ', type: 'number', required: 1, decimal_places: 2 },
  { key: 'longitude', label: 'Kinh độ', type: 'number', required: 1, decimal_places: 2 },
  { key: 'conditional', label: 'Trường theo mô hình', type: 'text', required: 1 },
  { key: 'poles', label: 'Bảng trụ', type: 'table', required: 1 }
];

const connection = (formExists = true) => ({
  async query(sql) {
    if (sql.includes('SELECT id FROM forms')) return [formExists ? [{ id: 13 }] : []];
    if (sql.includes('SELECT id, layout_config FROM forms')) return [[{ id: 13, layout_config: {} }]];
    if (sql.includes('FROM form_fields')) return [fields.map(({ key }) => ({
      field_key: key,
      config: key === 'conditional' ? { conditions: [{ field: 'model', operator: '=', value: 'LK' }] } : {}
    }))];
    throw new Error(`Unexpected SQL: ${sql}`);
  }
});

test.before(() => { dynamicUtils.getFieldDefinitionsByEntity = async () => fields; });
test.after(async () => { dynamicUtils.getFieldDefinitionsByEntity = originalDefinitions; await pool.end(); });

test('full form checks formats, coordinates and visible conditional fields', async () => {
  const valid = { owner_phone: '0123456789', latitude: 10.12345, longitude: 106.12345, model: 'NQ', poles: [{}] };
  assert.deepEqual(await readiness.check(valid, connection()), { complete: true, missing: [] });
  const invalid = await readiness.check({ ...valid, model: 'LK', owner_phone: '123', latitude: 91, poles: [] }, connection());
  assert.equal(invalid.complete, false);
  assert.ok(invalid.missing.some((message) => message.includes('Số điện thoại')));
  assert.ok(invalid.missing.some((message) => message.includes('Vĩ độ')));
  assert.ok(invalid.missing.some((message) => message.includes('Trường theo mô hình')));
  assert.ok(invalid.missing.some((message) => message.includes('Bảng trụ')));
});

test('missing full form is an explicit error rather than a successful readiness check', async () => {
  await assert.rejects(readiness.check({}, connection(false)), /Không tìm thấy form tạo đầy đủ/);
});
