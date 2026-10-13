const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const { getApplicableFieldKeys } = require('../middlewares/validators');

const hasValue = (v) => !(v === undefined || v === null || v === '');

// Kiem tra "day du thong tin" theo dung luat validate cua form sua (purpose='view'):
// - chi xet field co trong form + dang hien thi (dieu kien mo_hinh_dau_tu, visibleWhen...)
// - required + dinh dang giong het khi an Luu o form sua
exports.checkCompleteness = async (id) => {
  const [rows] = await pool.query('SELECT * FROM station_proposals WHERE id = ?', [id]);
  if (rows.length === 0) {
    const e = new Error('Không tìm thấy đề xuất');
    e.statusCode = 404;
    throw e;
  }
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const flat = dynamicUtils.mergeData(rows[0], fieldDefs);
  let defs = fieldDefs;
  try {
    const applicable = await getApplicableFieldKeys('station_proposals', flat, 'view', null);
    if (applicable && applicable.size > 0) {
      defs = defs.filter((f) => applicable.has(f.key));
    }
  } catch { /* silent: fallback validate toan bo field */ }
  defs = defs.map((f) => ((f.key === 'latitude' || f.key === 'longitude') ? { ...f, decimal_places: null } : f));
  const errors = await dynamicUtils.validateData('station_proposals', flat, defs);
  if (!hasValue(flat.latitude)) errors.push('Vĩ độ là bắt buộc');
  if (!hasValue(flat.longitude)) errors.push('Kinh độ là bắt buộc');
  const missing = [...new Set(errors)];
  return { id: Number(id), complete: missing.length === 0, missing };
};
