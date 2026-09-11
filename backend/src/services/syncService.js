const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');
const fieldMappingService = require('./fieldMappingService');
const fieldMapper = require('./fieldMapper');
const oneOfficeService = require('./oneOfficeService');
const proposalService = require('./proposalService');
const queueService = require('./queueService');
const templateService = require('./templateService');
const fileSyncService = require('./fileSyncService');
const dynamicEngineService = require('./dynamicEngineService');
const dynamicUtils = require('./dynamicUtils');
const dataListService = require('./dataListService');

const refreshId1Office = async (proposalId) => {
  const [rows] = await pool.query('SELECT custom_data FROM station_proposals WHERE id = ?', [proposalId]);
  if (rows.length === 0) return;
  let cd = rows[0].custom_data;
  if (typeof cd === 'string') {
    try { cd = JSON.parse(cd); } catch { cd = {}; }
  }
  cd = cd || {};
  const postResults = await dynamicEngineService.computePostFormulas('station_proposals', proposalId, cd, null, null, { excludeKeys: ['ma_de_xuat'] });
  if (postResults.id_1office !== undefined) {
    cd.id_1office = postResults.id_1office;
    await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(cd), proposalId]);
  }
};

exports.pushTo1Office = async (proposalIds, apiConfigId, userId) => {
  const config = await apiConfigService.getById(apiConfigId);
  if (!config) throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });

  const mappings = await fieldMappingService.getAllByConfig(apiConfigId);
  const pushMappings = mappings.filter(m => m.sync_enabled && (m.direction === 'push' || m.direction === 'both'));
  const system = (config && config.system_key) || '1office';

  const results = [];
  for (const proposalId of proposalIds) {
    const proposal = await proposalService.getProposalFullById(proposalId);
    if (!proposal) {
      results.push({ proposalId, success: false, error: 'Không tìm thấy đề xuất' });
      continue;
    }

    const isLinked = !!proposal.contact_1office_code;

    const contactData = {};
    for (const mapping of pushMappings) {
      const value = proposal[mapping.source_field] || (proposal.custom_data && proposal.custom_data[mapping.source_field]);
      const transformed = await fieldMapper.transformPush(value, mapping, system, apiConfigId);
      if (transformed !== null && transformed !== undefined) {
        contactData[mapping.target_field] = transformed;
      }
    }

    if (!contactData.code) {
      contactData.code = proposal.tracking_code || `DXS_${proposal.id}`;
    }
    if (isLinked) {
      contactData.code = proposal.contact_1office_code;
    }
    if (!contactData.name) {
      contactData.name = proposal.owner_name || `Đề xuất #${proposal.id}`;
    }
    if (!contactData.type) {
      contactData.type = '0';
    }

    let descHtml = '';
    try {
      descHtml = await templateService.render(proposal, apiConfigId);
    } catch (err) {
      console.error('[Sync] Error rendering desc template:', err.message);
      descHtml = proposal.description || '';
    }
    contactData.desc = descHtml;

    const missingRequired = [];
    if (!contactData.code) missingRequired.push('Mã (code)');
    if (!contactData.name) missingRequired.push('Tên (name)');
    if (!contactData.type) missingRequired.push('Loại (type)');
    if (missingRequired.length > 0) {
      results.push({ proposalId, success: false, error: `Thiếu trường bắt buộc: ${missingRequired.join(', ')}` });
      continue;
    }

    const job = await queueService.addJob({
      api_config_id: apiConfigId,
      action: 'push',
      entity_type: 'station_proposals',
      entity_id: proposalId,
      direction: 'push',
      request_payload: { api_config_id: apiConfigId, contact_data: contactData, proposal_id: proposalId, was_linked: isLinked, previous_contact_id: proposal.contact_1office_id || null },
      priority: 0,
      created_by: userId
    });

    results.push({ proposalId, success: true, jobId: job.id, isUpdate: isLinked, contactData });
  }

  return results;
};

exports.pullFrom1Office = async (apiConfigId, filter, userId) => {
  const config = await apiConfigService.getById(apiConfigId);
  if (!config) throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });

  const job = await queueService.addJob({
    api_config_id: apiConfigId,
    action: 'pull',
    entity_type: 'station_proposals',
    direction: 'pull',
    request_payload: { api_config_id: apiConfigId, filter: filter || {} },
    priority: 0,
    created_by: userId
  });

  return { jobId: job.id, status: 'pending' };
};

exports.processPull = async (apiConfigId, filter) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const mappings = await fieldMappingService.getAllByConfig(apiConfigId);
  const pullMappings = mappings.filter(m => m.sync_enabled && (m.direction === 'pull' || m.direction === 'both'));
  const pullConfig = await apiConfigService.getById(apiConfigId);
  const pullSystem = (pullConfig && pullConfig.system_key) || '1office';
  const pullRawFields = [...new Set(pullMappings.filter(m => m.target_field_type === 'user').map(m => m.target_field))];

  const PAGE_LIMIT = 50;
  const contacts = [];
  let page = 1;
  let total = Infinity;
  while (contacts.length < total) {
    const pageResult = await oneOfficeService.getContacts(apiConfigId, { ...(filter || {}), page, limit: PAGE_LIMIT, fieldRaws: pullRawFields });
    if (!pageResult.success) {
      throw new Error(pageResult.error || 'Không thể lấy contacts từ 1Office');
    }
    const batch = pageResult.data.contacts || [];
    total = pageResult.data.total || batch.length;
    contacts.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    page++;
  }

  const FIXED_WHITELIST = ['owner_name', 'owner_phone', 'address', 'area', 'land_type', 'description'];
  const postKeys = new Set(fieldDefs.filter(f => {
    if (f.type !== 'formula' || !f.formula_config) return false;
    try {
      const fc = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config;
      return fc.compute_mode === 'post';
    } catch { return false; }
  }).map(f => f.key));

  const created = [];
  const updated = [];
  const skipped = [];

  for (const contact of contacts) {
    const proposalData = {};
    for (const mapping of pullMappings) {
      const value = contact[mapping.target_field];
      const transformed = await fieldMapper.transformPull(value, mapping, pullSystem, apiConfigId);
      if (transformed !== null && transformed !== undefined && transformed !== '' && !(Array.isArray(transformed) && transformed.length === 0)) {
        proposalData[mapping.source_field] = transformed;
      }
    }

    const existingProposal = (contact.code && await findProposalByContactCode(contact.code))
      || ((contact.ID ?? contact.id) && await findProposalByContactId(contact.ID ?? contact.id));

    if (!existingProposal) {
      skipped.push({ contactCode: contact.code, contactId: contact.ID ?? contact.id ?? null, reason: 'chưa liên kết' });
      continue;
    }

    const { fixedData, dynamicData } = dynamicUtils.splitData('station_proposals', proposalData, fieldDefs);
    Object.keys(fixedData).forEach(k => {
      if (!FIXED_WHITELIST.includes(k)) { dynamicData[k] = fixedData[k]; delete fixedData[k]; }
    });
    Object.keys(dynamicData).forEach(k => { if (postKeys.has(k)) delete dynamicData[k]; });
    if (dynamicData.province !== undefined && dynamicData.province !== null && String(dynamicData.province).trim() !== '') {
      try { await dataListService.applyDiaGioi(dynamicData); } catch { delete dynamicData.province; }
    }

    const current = existingProposal.custom_data
      ? (typeof existingProposal.custom_data === 'string' ? JSON.parse(existingProposal.custom_data) : existingProposal.custom_data)
      : {};
    const mergedDynamic = { ...current, ...dynamicData };

    const setParts = ['custom_data = ?', 'sync_status = ?', 'last_synced_at = NOW()', 'last_synced_data = ?', 'updated_at = NOW()'];
    const setParams = [JSON.stringify(mergedDynamic), 'synced', JSON.stringify({ contact: { code: contact.code, id: contact.ID ?? contact.id ?? null }, synced_at: new Date().toISOString() })];
    Object.keys(fixedData).forEach(k => { setParts.push(`${k} = ?`); setParams.push(fixedData[k]); });
    setParams.push(existingProposal.id);
    await pool.query(`UPDATE station_proposals SET ${setParts.join(', ')} WHERE id = ?`, setParams);

    const postResults = await dynamicEngineService.computePostFormulas('station_proposals', existingProposal.id, mergedDynamic, null, null, { excludeKeys: ['ma_de_xuat'] });
    const persistable = Object.fromEntries(Object.entries(postResults).filter(([k]) => k !== 'ma_de_xuat'));
    if (Object.keys(persistable).length > 0) {
      const updatedDynamic = { ...mergedDynamic, ...persistable };
      await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(updatedDynamic), existingProposal.id]);
    }

    updated.push({ proposalId: existingProposal.id, contactCode: contact.code, contactId: contact.ID ?? contact.id ?? null });
  }

  const dangling = [];
  const isFullPull = !filter || Object.keys(filter).length === 0;
  if (isFullPull) {
    const seenCodes = new Set(contacts.map(c => c.code).filter(Boolean));
    const seenIds = new Set(contacts.map(c => String(c.ID ?? c.id ?? '')).filter(Boolean));
    const [linked] = await pool.query(
      'SELECT id, contact_1office_id, contact_1office_code FROM station_proposals WHERE contact_1office_code IS NOT NULL OR contact_1office_id IS NOT NULL'
    );
    for (const row of linked) {
      const codeSeen = row.contact_1office_code && seenCodes.has(row.contact_1office_code);
      const idSeen = row.contact_1office_id && seenIds.has(String(row.contact_1office_id));
      if (!codeSeen && !idSeen) {
        await pool.query(
          `UPDATE station_proposals SET sync_status = 'error', last_synced_data = ?, updated_at = NOW() WHERE id = ?`,
          [JSON.stringify({ contact: { code: row.contact_1office_code, id: row.contact_1office_id }, error: 'Contact không còn trên 1Office (có thể đã bị xóa)', synced_at: new Date().toISOString() }), row.id]
        );
        dangling.push({ proposalId: row.id, contactCode: row.contact_1office_code, contactId: row.contact_1office_id });
      }
    }
  }

  return { total: contacts.length, created: created.length, updated: updated.length, skipped: skipped.length, dangling: dangling.length, details: { created, updated, skipped, dangling } };
};

exports.linkProposal = async (proposalId, contactCode, apiConfigId) => {
  const proposal = await proposalService.getProposalFullById(proposalId);
  if (!proposal) throw Object.assign(new Error('Không tìm thấy đề xuất'), { statusCode: 404 });

  if (proposal.contact_1office_code) {
    throw Object.assign(new Error('Đề xuất đã được liên kết'), { statusCode: 400 });
  }

  await pool.query(
    `UPDATE station_proposals SET contact_1office_code = ?, sync_status = 'synced', last_synced_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [contactCode, proposalId]
  );

  if (apiConfigId) {
    try {
      const detail = await oneOfficeService.getContactDetail(apiConfigId, contactCode);
      const d = detail && detail.data ? detail.data : null;
      const inner = d && d.data ? d.data : d;
      const numericId = inner ? (inner.ID ?? inner.id ?? null) : null;
      if (numericId !== null && numericId !== undefined && String(numericId).match(/^\d+$/)) {
        await pool.query('UPDATE station_proposals SET contact_1office_id = ? WHERE id = ?', [String(numericId), proposalId]);
      }
    } catch { /* silent */ }
  }

  await refreshId1Office(proposalId);

  return { proposalId, contactCode, linked: true };
};

exports.unlinkProposal = async (proposalId) => {
  const proposal = await proposalService.getProposalFullById(proposalId);
  if (!proposal) throw Object.assign(new Error('Không tìm thấy đề xuất'), { statusCode: 404 });

  await pool.query(
    `UPDATE station_proposals SET contact_1office_id = NULL, contact_1office_code = NULL, sync_status = 'none', updated_at = NOW() WHERE id = ?`,
    [proposalId]
  );

  await refreshId1Office(proposalId);

  return { proposalId, unlinked: true };
};

exports.searchContacts = async (apiConfigId, query) => {
  const result = await oneOfficeService.getContacts(apiConfigId, { search: query, limit: 20 });
  if (!result.success) {
    throw new Error(result.error || 'Không thể tìm contacts');
  }
  return result.data;
};

const findProposalByContactCode = async (contactCode) => {
  if (!contactCode) return null;
  const [rows] = await pool.query(
    'SELECT * FROM station_proposals WHERE contact_1office_code = ? LIMIT 1',
    [contactCode]
  );
  return rows.length > 0 ? rows[0] : null;
};

const findProposalByContactId = async (contactId) => {
  if (contactId === null || contactId === undefined || String(contactId) === '') return null;
  const [rows] = await pool.query(
    'SELECT * FROM station_proposals WHERE contact_1office_id = ? LIMIT 1',
    [String(contactId)]
  );
  return rows.length > 0 ? rows[0] : null;
};
