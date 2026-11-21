const { values, addInFilter } = require('./multiValueFilter');

const addProposalAdvancedFilters = async (where, params, filters, regionPattern) => {
  addInFilter(where, params, 'p.status', filters.proposalStatus);
  addInFilter(where, params, "JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu'))", filters.model);
  addInFilter(where, params, "JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province'))", filters.province);
  const patterns = [...new Set(values(filters.region).map(regionPattern).filter(Boolean))];
  if (patterns.length) {
    where.push(`(${patterns.map(() => "LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?").join(' OR ')})`);
    params.push(...patterns);
  }
  addInFilter(where, params, 'p.user_id', filters.ownerUserId);
  const managers = values(filters.managerUserId);
  if (managers.length) {
    const { getBranchIds } = require('../services/adminUserService');
    const branches = await Promise.all(managers.map(id => getBranchIds(Number(id))));
    const ids = [...new Set(branches.flat().map(Number))];
    if (!ids.length) where.push('1 = 0');
    else {
      where.push(`p.user_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  if (filters.dateFrom) {
    where.push('p.created_at >= ?');
    params.push(`${String(filters.dateFrom).slice(0, 10)} 00:00:00`);
  }
  if (filters.dateTo) {
    where.push('p.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(String(filters.dateTo).slice(0, 10));
  }
};

const patternForNormalizedRegion = (normalized) => normalized.includes('bac') ? '%bac%'
  : normalized.includes('trung') ? '%trung%' : normalized.includes('nam') ? '%nam%' : null;

module.exports = { addProposalAdvancedFilters, patternForNormalizedRegion };
