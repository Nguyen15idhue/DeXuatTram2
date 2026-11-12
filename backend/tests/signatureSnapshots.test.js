const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const load = async (name, mocks) => {
  const filename = path.resolve(__dirname, '../src/services', name);
  const module = { exports: {} };
  const nativeRequire = createRequire(filename);
  const source = await fs.readFile(filename, 'utf8');
  const execute = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${source}\n})`, { filename });
  execute(id => Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id),
    module, module.exports, filename, path.dirname(filename));
  return module.exports;
};

test('snapshot round-trip is immutable, checks hash and does not fall back on corruption', async () => {
  const rows = new Map();
  const query = async (sql, args) => {
    if (sql.startsWith('INSERT')) {
      assert.equal(rows.has(args[0]), false);
      rows.set(args[0], { image_data: Buffer.from(args[1]), image_sha256: args[2] });
      return [{ affectedRows: 1 }];
    }
    return [rows.has(args[0]) ? [rows.get(args[0])] : []];
  };
  const snapshots = await load('signatureSnapshotService.js', { '../utils/db': { query } });
  const image = Buffer.from('original image');
  await snapshots.save(1, image, { query });
  assert.deepEqual(await snapshots.read(1), image);
  assert.equal(await snapshots.read(2), null);
  await assert.rejects(snapshots.save(2, Buffer.alloc(0), { query }), { statusCode: 400 });
  await assert.rejects(snapshots.save(2, Buffer.alloc(16 * 1024 * 1024), { query }), { statusCode: 400 });
  rows.get(1).image_data = Buffer.from('tampered');
  await assert.rejects(snapshots.read(1), { statusCode: 409 });
});

test('legacy preservation copies only referenced old signatures, including historical configs', async () => {
  const saved = [];
  let converted = 0;
  const executor = {
    query: async (sql, args) => {
      if (sql.startsWith('INSERT')) {
        saved.push(args);
        return [{ affectedRows: 1 }];
      }
      return [args[0] === 11 ? [{ id: 101 }, { id: 102 }] : []];
    }
  };
  const snapshots = await load('signatureSnapshotService.js', {
    '../utils/db': executor,
    './signedDocumentService': { validateSignature: async id => {
      assert.equal(id, 11);
      converted++;
      return { bytes: Buffer.from('old signature') };
    } }
  });
  await snapshots.preserveLegacy(11, executor);
  await snapshots.preserveLegacy(12, executor);
  assert.equal(converted, 1);
  assert.deepEqual(saved.map(args => args[0]), [101, 102]);
  assert.equal(saved[0][1].toString(), 'old signature');
});

const profileHarness = async ({ preserveFails = false, insertFails = false } = {}) => {
  const events = [];
  let deleted = false;
  const query = async (sql) => {
    events.push(sql);
    if (sql.includes('FROM users')) return [[{ id: 7 }]];
    if (sql.includes('FROM signatures')) return [[{ id: 11, user_id: 7, file_path: 'old.png' }]];
    if (sql.startsWith('DELETE')) { deleted = true; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT')) {
      if (insertFails) throw new Error('insert failed');
      return [{ insertId: 12 }];
    }
    throw new Error(sql);
  };
  const connection = {
    query, beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'),
    rollback: async () => { deleted = false; events.push('rollback'); },
    release: () => events.push('release')
  };
  const service = await load('signatureService.js', {
    '../utils/db': { query, getConnection: async () => connection },
    fs: { unlinkSync: filename => events.push(`unlink ${filename}`) },
    './signatureSnapshotService': { preserveLegacy: async () => {
      events.push('preserve');
      if (preserveFails) throw new Error('missing old image');
    } }
  });
  return { service, events, deleted: () => deleted };
};

test('profile replacement preserves old signatures before deletion and deletes images only after commit', async () => {
  const { service, events } = await profileHarness();
  const result = await service.upload(7, { path: 'new.png' });
  assert.equal(result.id, 12);
  const index = text => events.findIndex(event => event.includes(text));
  assert.ok(index('FOR UPDATE') < index('preserve'));
  assert.ok(index('preserve') < index('DELETE'));
  assert.ok(index('commit') < index('unlink old.png'));
  assert.equal(events.includes('unlink new.png'), false);
});

test('failed replacement retains old profile and removes only the newly uploaded file', async () => {
  for (const options of [{ preserveFails: true }, { insertFails: true }]) {
    const { service, events, deleted } = await profileHarness(options);
    await assert.rejects(service.upload(7, { path: 'new.png' }));
    assert.equal(deleted(), false);
    assert.equal(events.includes('commit'), false);
    assert.equal(events.includes('unlink old.png'), false);
    assert.equal(events.includes('unlink new.png'), true);
    assert.equal(events.includes('rollback'), true);
  }
});

test('profile removal preserves history and enforces ownership', async () => {
  const { service, events } = await profileHarness();
  await assert.rejects(service.remove(11, { id: 8, role: 'SALES' }), /FORBIDDEN/);
  assert.equal(events.includes('preserve'), false);
  await service.remove(11, { id: 7, role: 'SALES' });
  assert.ok(events.indexOf('preserve') < events.findIndex(event => event.startsWith('DELETE')));
  assert.ok(events.indexOf('commit') < events.indexOf('unlink old.png'));
});

test('real MySQL migration, legacy backfill, concurrent replacement and profile removal preserve signed PNGs', {
  skip: process.env.RUN_SIGNATURE_SNAPSHOT_TESTS !== '1', timeout: 60000
}, async () => {
  const mysql = require('mysql2/promise');
  const crypto = require('node:crypto');
  const os = require('node:os');
  const { promisify } = require('node:util');
  const { execFile } = require('node:child_process');
  const settings = {
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD
  };
  const database = `signature_snapshot_test_${crypto.randomBytes(8).toString('hex')}`;
  const admin = await mysql.createConnection(settings);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'signature-snapshot-test-'));
  let pool;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    pool = mysql.createPool({ ...settings, database, connectionLimit: 5 });
    await pool.query('CREATE TABLE users (id INT PRIMARY KEY) ENGINE=InnoDB');
    await pool.query('INSERT INTO users VALUES (7)');
    await pool.query(`CREATE TABLE signatures (
      id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL UNIQUE,
      file_path VARCHAR(500), file_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE proposal_signature_configs (
      id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, signature_id INT NULL,
      proposal_id INT NOT NULL DEFAULT 501, signature_url VARCHAR(500) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    ) ENGINE=InnoDB`);
    const migration = await fs.readFile(path.resolve(__dirname, '../../database/230-proposal-signature-snapshots.sql'), 'utf8');
    await pool.query(migration);
    await pool.query(migration);
    let signedDocuments;
    const snapshots = await load('signatureSnapshotService.js', {
      '../utils/db': pool,
      './signedDocumentService': { validateSignature: id => signedDocuments.validateSignature(id) }
    });
    signedDocuments = await load('signedDocumentService.js', {
      '../utils/db': pool, './signatureSnapshotService': snapshots
    });
    const profiles = await load('signatureService.js', {
      '../utils/db': pool, './signatureSnapshotService': snapshots
    });
    const createImage = async (name, color) => {
      const filename = path.join(root, name);
      await promisify(execFile)('convert', ['-size', '80x20', `xc:${color}`, filename]);
      return filename;
    };
    const v1 = await profiles.upload(7, { path: await createImage('v1.png', 'red') });
    const original = await signedDocuments.validateSignature(v1.id);
    await pool.query("INSERT INTO proposal_signature_configs (id,user_id,signature_id,status) VALUES (1,7,?,'SIGNED')", [v1.id]);
    const runBackfill = async (args = []) => promisify(execFile)(process.execPath, [
      path.resolve(__dirname, '../scripts/backfill-signature-snapshots.js'), ...args
    ], { env: { ...process.env, DB_NAME: database } });
    const dryRun = await runBackfill();
    assert.match(dryRun.stdout, /"mode":"dry-run","checked":1,"recovered":1,"missing":0/);
    assert.equal(await snapshots.read(1), null);
    await runBackfill(['--apply']);
    assert.deepEqual(await snapshots.read(1), original.bytes);
    const repeated = await runBackfill(['--apply']);
    assert.match(repeated.stdout, /"checked":0/);
    await pool.query("INSERT INTO proposal_signature_configs (id,user_id,signature_id,status) VALUES (3,7,?,'SIGNED')", [v1.id]);
    await pool.query("INSERT INTO proposal_signature_configs (id,user_id,signature_id,status) VALUES (4,7,99999,'SIGNED')");
    await assert.rejects(runBackfill(), error => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /"config_id":4/);
      assert.match(error.stdout, /"missing":1/);
      return true;
    });
    await pool.query('DELETE FROM proposal_signature_configs WHERE id=4');
    const v2 = await profiles.upload(7, { path: await createImage('v2.png', 'blue') });
    await assert.rejects(fs.access(path.join(root, 'v1.png')), { code: 'ENOENT' });
    assert.deepEqual((await signedDocuments.readSignature({ id: 1, signature_id: v1.id })).bytes, original.bytes);
    assert.deepEqual((await signedDocuments.readSignature({ id: 3, signature_id: v1.id })).bytes, original.bytes);
    const second = await signedDocuments.validateSignature(v2.id);
    assert.notDeepEqual(original.bytes, second.bytes);
    await pool.query('INSERT INTO proposal_signature_configs (id,user_id) VALUES (2,7)');
    const signing = await pool.getConnection();
    let replacement;
    try {
      await signing.beginTransaction();
      await signing.query('SELECT id FROM users WHERE id=7 FOR UPDATE');
      const replacementPath = await createImage('v3.png', 'green');
      let replaced = false;
      replacement = profiles.upload(7, { path: replacementPath }).then(result => { replaced = true; return result; });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(replaced, false);
      await signing.query("UPDATE proposal_signature_configs SET status='SIGNED',signature_id=? WHERE id=2", [v2.id]);
      await snapshots.save(2, second.bytes, signing);
      await signing.commit();
    } finally {
      await signing.rollback();
      signing.release();
      if (replacement) await replacement;
    }
    assert.deepEqual((await signedDocuments.readSignature({ id: 2, signature_id: v2.id })).bytes, second.bytes);
    const v3 = await replacement;
    await profiles.remove(v3.id, { id: 7, role: 'SALES' });
    assert.deepEqual((await signedDocuments.readSignature({ id: 1, signature_id: v1.id })).bytes, original.bytes);
    assert.deepEqual((await signedDocuments.readSignature({ id: 2, signature_id: v2.id })).bytes, second.bytes);
    const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM signatures');
    assert.equal(count.n, 0);
    const [[before]] = await pool.query('SELECT image_sha256 FROM proposal_signature_snapshots WHERE config_id=1');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await snapshots.preserveLegacy(v1.id, connection);
      await connection.commit();
    } finally {
      connection.release();
    }
    const [[after]] = await pool.query('SELECT image_sha256 FROM proposal_signature_snapshots WHERE config_id=1');
    assert.equal(before.image_sha256, after.image_sha256);
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
    await fs.rm(root, { recursive: true, force: true });
  }
});
