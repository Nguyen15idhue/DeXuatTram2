const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2');
const { applyLeadListFilters } = require('../src/services/leadService');

test('lead filters combine CRM and legacy values, empty values, and independent column filters', () => {
  const where = [];
  const params = [];
  applyLeadListFilters(where, params, {
    filter_customer_classification: ['Tiềm năng', '__empty__'],
    filter_source: ['CRM', 'Phòng A, B'],
    customer_classification: 'ut1',
    date_field: 'updated_at', date_from: '2026-01-01', date_to: '2026-01-31'
  });
  assert.equal(where.length, 5);
  assert.match(where[1], /customer_classification IN/);
  assert.match(where[2], /customer_classification IS NULL/);
  assert.deepEqual(params, [
    'CRM', 'Phòng A, B',
    'Tiềm năng', 'TIEM_NANG', 'ut1', 'Tiềm năng', 'TIEM_NANG', 'ut1',
    '2026-01-01 00:00:00', '2026-01-31 23:59:59'
  ]);
});

test('legacy scalar queries retain last-value behavior while CRM aliases match', () => {
  const where = [];
  const params = [];
  applyLeadListFilters(where, params, {
    customer_classification: ['Tiềm năng', 'ut2'], assigned_user_id: '__empty__'
  });
  assert.deepEqual(params, ['Quan tâm', 'QUAN_TAM', 'ut2']);
  assert.match(where[0], /assigned_user_id IS NULL/);
  assert.match(where[1], /customer_classification IN/);
});

test('real SQL applies OR within filters and AND with scope, column filters and dates before pagination', {
  skip: process.env.RUN_LEAD_FILTER_SQL_TEST !== '1', timeout: 90000
}, async () => {
  const database = `lead_filter_test_${process.pid}_${Date.now()}`;
  const run = (sql) => {
    const result = spawnSync('docker', [
      'exec', '-i', process.env.MYSQL_CONTAINER || 'station-mysql', 'sh', '-c',
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root --default-character-set=utf8mb4 --batch --skip-column-names'
    ], { input: sql, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split(/\r?\n/).filter(Boolean).map(Number);
  };
  let created = false;
  try {
    run(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    created = true;
    run(`USE \`${database}\`;
      CREATE TABLE leads (id INT PRIMARY KEY, customer_classification VARCHAR(100), source VARCHAR(100),
        assigned_user_id INT, province VARCHAR(100), created_at DATETIME, updated_at DATETIME);
      INSERT INTO leads VALUES
        (1,'Tiềm năng','CRM',10,'Hà Nội','2026-01-01','2026-01-01'),
        (2,'ut1','CRM',10,'Hà Nội','2026-01-02','2026-01-02'),
        (3,'Quan tâm','Phòng A, B',11,'Đà Nẵng','2026-01-03','2026-01-03'),
        (4,'ut2','CRM',12,'Hà Nội','2026-01-04','2026-01-04'),
        (5,NULL,'CRM',10,'Hà Nội','2026-01-05','2026-01-05'),
        (6,'THEO_DOI','CRM',10,'Hà Nội','2026-01-06','2026-01-06');`);
    const select = (query, count = false) => {
      const where = ['l.assigned_user_id IN (10,11)'];
      const params = [];
      applyLeadListFilters(where, params, query);
      const sql = `SELECT ${count ? 'COUNT(*)' : 'l.id'} FROM leads l WHERE ${where.join(' AND ')}${count ? '' : ' ORDER BY l.id LIMIT 2'}`;
      return run(`USE \`${database}\`; ${mysql.format(sql, params)};`);
    };
    const filters = {
      filter_customer_classification: ['Tiềm năng', 'Quan tâm'],
      filter_source: ['CRM', 'Phòng A, B'], filter_province: ['Hà Nội', 'Đà Nẵng']
    };
    assert.deepEqual(select(filters, true), [3]);
    assert.deepEqual(select(filters), [1, 2]);
    assert.deepEqual(select({ ...filters, customer_classification: 'ut2' }), [3]);
    assert.deepEqual(select({ filter_customer_classification: ['Tiềm năng', '__empty__'] }, true), [3]);
    assert.deepEqual(select({ customer_classification: 'Quan tâm' }), [3]);
    assert.deepEqual(select({ filter_customer_classification: ['Tiềm năng'], date_from: '2026-01-02' }), [2]);
  } finally {
    if (created) run(`DROP DATABASE \`${database}\`;`);
  }
});
