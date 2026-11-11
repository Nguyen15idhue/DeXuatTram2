require('dotenv').config();
const path = require('path');
const pool = require('../src/utils/db');
const snapshots = require('../src/services/signatureSnapshotService');
const signedDocuments = require('../src/services/signedDocumentService');
const { SIGNATURE_DIR } = require('../src/services/signatureService');

const legacyPath = (url) => {
  const prefix = '/files/signatures/';
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  const resolved = path.resolve(SIGNATURE_DIR, url.slice(prefix.length));
  const relative = path.relative(SIGNATURE_DIR, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  let cursor = 0;
  let checked = 0;
  let recovered = 0;
  let missing = 0;
  for (;;) {
    const [configs] = await pool.query(
      `SELECT c.id, c.user_id, c.proposal_id, c.signature_id, c.signature_url
       FROM proposal_signature_configs c
       LEFT JOIN proposal_signature_snapshots s ON s.config_id = c.id
       WHERE c.id > ? AND c.signature_id IS NOT NULL AND s.config_id IS NULL
       ORDER BY c.id LIMIT 100`,
      [cursor]
    );
    if (!configs.length) break;
    for (const config of configs) {
      cursor = Number(config.id);
      checked++;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [config.user_id]);
        const [current] = await connection.query(
          'SELECT signature_id, signature_url FROM proposal_signature_configs WHERE id = ? FOR UPDATE', [config.id]
        );
        if (!current.length || current[0].signature_id !== config.signature_id) {
          throw Object.assign(new Error('Config changed; rerun backfill'), { statusCode: 409 });
        }
        if (await snapshots.read(config.id)) {
          await connection.rollback();
          continue;
        }
        const [source] = await connection.query('SELECT file_path FROM signatures WHERE id = ?', [config.signature_id]);
        const image = await signedDocuments.readSignatureFile(source[0]?.file_path || legacyPath(current[0].signature_url));
        if (apply) {
          await snapshots.save(config.id, image.bytes, connection);
          await connection.commit();
        } else {
          await connection.rollback();
        }
        recovered++;
        console.log(JSON.stringify({ config_id: config.id, proposal_id: config.proposal_id, result: apply ? 'saved' : 'recoverable' }));
      } catch (error) {
        await connection.rollback();
        if (![400, 404, 409].includes(error.statusCode)) throw error;
        missing++;
        console.error(JSON.stringify({ config_id: config.id, proposal_id: config.proposal_id, signature_id: config.signature_id, error: error.message }));
      } finally {
        connection.release();
      }
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', checked, recovered, missing }));
  if (missing) process.exitCode = 2;
};

main().catch(error => {
  console.error('[SignatureSnapshotBackfill]', error);
  process.exitCode = 1;
}).finally(() => pool.end());
