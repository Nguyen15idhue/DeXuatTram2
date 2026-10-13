const pool = require('../utils/db');
const formulaService = require('./formulaService');

const formatStationCode = (maTinh, seq) => `E.${maTinh}${String(seq).padStart(4, '0')}`;

exports.formatStationCode = formatStationCode;

exports.generatePendingCode = async (maTinh, connection) => {
  const tinh = String(maTinh || '').trim();
  if (!tinh) throw Object.assign(new Error('Thiếu mã tỉnh để sinh mã trạm chờ'), { statusCode: 400 });
  const prefix = `E.${tinh}`.slice(0, 20);
  const n = await formulaService.getNextSequence(prefix, connection);
  return formatStationCode(tinh, n);
};

exports.isCodeTaken = async (code, excludeProposalId) => {
  const c = String(code || '').trim();
  if (!c) return false;
  const params = [c];
  let excludeClause = '';
  if (excludeProposalId !== undefined && excludeProposalId !== null && excludeProposalId !== '') {
    excludeClause = ' AND id != ?';
    params.push(excludeProposalId);
  }
  const [srows] = await pool.query(
    "SELECT id FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) = ? LIMIT 1",
    [c]
  );
  if (srows.length > 0) return true;
  const [prows] = await pool.query(
    `SELECT id FROM station_proposals WHERE pending_station_code = ?${excludeClause} LIMIT 1`,
    params
  );
  return prows.length > 0;
};

exports.assertCodeFree = async (code, excludeProposalId) => {
  if (await exports.isCodeTaken(code, excludeProposalId)) {
    throw Object.assign(new Error(`Mã trạm "${code}" đã tồn tại`), { statusCode: 400 });
  }
};

exports.ensureFreshCode = async (maTinh) => {
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    const code = await exports.generatePendingCode(maTinh);
    try {
      await exports.assertCodeFree(code);
      return code;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || Object.assign(new Error('Không sinh được mã trạm mới'), { statusCode: 400 });
};
