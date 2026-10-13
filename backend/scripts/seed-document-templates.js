const fs = require('fs');
const path = require('path');
const pool = require('../src/utils/db');
const { MAPPINGS } = require('./build-bcxd-templates');

const MODELS = { tdt: 'TDT', nq: 'NQ', lk: 'LK' };
const FORCE = process.argv.includes('--force');
const TPL_DIR = path.join(__dirname, '../templates/bcxd');
const UPLOAD_DIR = path.join(__dirname, '../storage/uploads');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const saveFile = async (fileName, buf) => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const relativePath = `general/${dd}-${mm}-${yyyy}/${Date.now()}-${rand}.docx`;
  const dest = path.join(UPLOAD_DIR, relativePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  const [result] = await pool.query(
    `INSERT INTO files (original_name, storage_key, mime_type, size, checksum, uploaded_by, submitter_ip, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [fileName, relativePath, DOCX_MIME, buf.length, null, null, null, 'active']
  );
  return result.insertId;
};

(async () => {
  for (const [key, model] of Object.entries(MODELS)) {
    const src = path.join(TPL_DIR, `${key}.docx`);
    if (!fs.existsSync(src)) {
      console.log(`[seed] ${model}: khong thay ${src}, bo qua`);
      continue;
    }
    const mapping = MAPPINGS[key];
    const [rows] = await pool.query(
      "SELECT id FROM document_templates WHERE entity = 'station_proposals' AND model = ? ORDER BY is_default DESC, id ASC LIMIT 1",
      [model]
    );
    if (rows.length > 0) {
      if (FORCE) {
        await pool.query('UPDATE document_templates SET mapping = ? WHERE id = ?', [JSON.stringify(mapping), rows[0].id]);
        console.log(`[seed] ${model}: cap nhat mapping (--force)`);
      } else {
        console.log(`[seed] ${model}: da co template, bo qua`);
      }
      continue;
    }
    const buf = fs.readFileSync(src);
    const fileId = await saveFile(`${key}.docx`, buf);
    await pool.query(
      `INSERT INTO document_templates (name, entity, model, file_id, mapping, status, is_default)
       VALUES (?, 'station_proposals', ?, ?, ?, 'active', 0)`,
      [`Báo cáo đề xuất ${model}`, model, fileId, JSON.stringify(mapping)]
    );
    console.log(`[seed] ${model}: da tao template + file #${fileId}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('[seed] loi:', e.message);
  process.exit(1);
});
