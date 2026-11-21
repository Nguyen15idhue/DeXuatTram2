const crypto = require('crypto');

const editVersion = (lead) => crypto.createHash('sha256').update(JSON.stringify(lead)).digest('hex');

const hasProposal = async (lead, conn) => {
  const [rows] = await conn.query(
    'SELECT id FROM station_proposals WHERE journey_id = ? LIMIT 1',
    [lead.journey_id]
  );
  return rows.length > 0;
};

const assertSatisfied = async (lead, outcome, conn) => {
  if (outcome === 'SUCCESS' && !(await hasProposal(lead, conn))) {
    throw Object.assign(new Error('Khách hàng chưa có đề xuất. Vui lòng lưu và tạo đề xuất.'), { statusCode: 409 });
  }
};

module.exports = { editVersion, hasProposal, assertSatisfied };
