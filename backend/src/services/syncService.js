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
const adminUserService = require('./adminUserService');
const { validateLatitude, validateLongitude } = require('../middlewares/validators');
const descRestoreService = require('./descRestoreService');
const restoreFilesService = require('./restoreFilesService');

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

const PUSH_REQUIRED_USER_FIELDS = ['nguoi_phu_trach', 'nguoi_giao_phu_trach'];

const parseCustomData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

exports.PUSH_REQUIRED_USER_FIELDS = PUSH_REQUIRED_USER_FIELDS;

exports.getMissingPushUserFieldLabels = async (proposal, fieldDefs) => {
  const defs = fieldDefs || await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const labelOf = (key) => {
    const f = (defs || []).find(d => d.key === key);
    return (f && f.label) || key;
  };
  const custom = parseCustomData(proposal && proposal.custom_data);
  const missing = [];
  for (const key of PUSH_REQUIRED_USER_FIELDS) {
    const direct = proposal ? proposal[key] : null;
    const value = (direct !== undefined && direct !== null && direct !== '') ? direct : custom[key];
    if (fieldMapper.resolveUserId(value) === null) missing.push(labelOf(key));
  }
  return missing;
};

exports.getPushCheck = async (proposal, fieldDefs) => {
  const defs = fieldDefs || await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const system = '1office';
  const labelOf = (key) => {
    const f = (defs || []).find(d => d.key === key);
    return (f && f.label) || key;
  };
  const custom = parseCustomData(proposal && proposal.custom_data);
  let userMapInfo = null;
  try {
    userMapInfo = await fieldMapper.getUserMapInfo(system);
  } catch { userMapInfo = null; }
  const missing = [];
  const unlinked = [];
  for (const key of PUSH_REQUIRED_USER_FIELDS) {
    const direct = proposal ? proposal[key] : null;
    const value = (direct !== undefined && direct !== null && direct !== '') ? direct : custom[key];
    const userId = fieldMapper.resolveUserId(value);
    if (userId === null) {
      missing.push({ key, label: labelOf(key) });
      continue;
    }
    let ext = null;
    try {
      ext = await adminUserService.findExternalByUser(userId, system);
    } catch { ext = null; }
    if (!ext) {
      let userName = `User #${userId}`;
      try {
        const [uRows] = await pool.query('SELECT full_name FROM users WHERE id = ?', [userId]);
        if (uRows.length > 0) userName = uRows[0].full_name;
      } catch { /* silent */ }
      unlinked.push({ key, label: labelOf(key), userId, userName, reason: 'no_map' });
      continue;
    }
    if (userMapInfo && userMapInfo.noAccount && userMapInfo.noAccount.has(String(ext))) {
      let userName = `User #${userId}`;
      try {
        const [uRows] = await pool.query('SELECT full_name FROM users WHERE id = ?', [userId]);
        if (uRows.length > 0) userName = uRows[0].full_name;
      } catch { /* silent */ }
      unlinked.push({ key, label: labelOf(key), userId, userName, reason: 'no_account', personnelId: String(ext) });
    }
  }
  return { missing, unlinked, canPush: missing.length === 0 };
};

exports.getUnlinkedPushUserWarnings = async (proposal, fieldDefs) => {
  const defs = fieldDefs || await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const system = '1office';
  const labelOf = (key) => {
    const f = (defs || []).find(d => d.key === key);
    return (f && f.label) || key;
  };
  const custom = parseCustomData(proposal && proposal.custom_data);
  const warnings = [];
  for (const key of PUSH_REQUIRED_USER_FIELDS) {
    const direct = proposal ? proposal[key] : null;
    const value = (direct !== undefined && direct !== null && direct !== '') ? direct : custom[key];
    const userId = fieldMapper.resolveUserId(value);
    if (userId === null) continue;
    try {
      const ext = await adminUserService.findExternalByUser(userId, system);
      if (!ext) {
        const [uRows] = await pool.query('SELECT full_name FROM users WHERE id = ?', [userId]);
        const name = uRows.length > 0 ? uRows[0].full_name : `User #${userId}`;
        warnings.push({ key, label: labelOf(key), userId, userName: name });
      }
    } catch { continue; }
  }
  return warnings;
};

exports.pushTo1Office = async (proposalIds, apiConfigId, userId, opts = {}) => {
  const config = await apiConfigService.getById(apiConfigId);
  if (!config) throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });
  const allowAllStatuses = !!(opts && opts.allowAllStatuses);
  const allowedStatuses = ['PENDING', 'REVIEWING', ...((opts && opts.allowStatuses) || [])];
  const setStatus = opts && opts.setStatus ? String(opts.setStatus) : null;

  const mappings = await fieldMappingService.getAllByConfig(apiConfigId);
  const pushMappings = mappings.filter(m => m.sync_enabled && (m.direction === 'push' || m.direction === 'both') && !fieldMapper.isSpecialTarget(m.target_field));
  const system = (config && config.system_key) || '1office';
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');

  const results = [];
  for (const proposalId of proposalIds) {
    const proposal = await proposalService.getProposalFullById(proposalId);
    if (!proposal) {
      results.push({ proposalId, success: false, error: 'Không tìm thấy đề xuất' });
      continue;
    }

    if (!allowAllStatuses && !allowedStatuses.includes(proposal.status)) {
      results.push({ proposalId, success: false, error: `Chỉ đẩy được đề xuất ở trạng thái Đang đề xuất hoặc Đang xem xét (hiện tại: ${proposal.status})` });
      continue;
    }

    const [pendingJobs] = await pool.query(
      `SELECT id FROM api_queue_logs
       WHERE action = 'push' AND entity_type = 'station_proposals' AND entity_id = ?
         AND api_config_id <=> ? AND status IN ('pending', 'processing')
       ORDER BY id DESC LIMIT 1`,
      [proposalId, apiConfigId]
    );
    if (pendingJobs.length > 0) {
      results.push({ proposalId, success: true, jobId: pendingJobs[0].id, deduped: true, isUpdate: !!proposal.contact_1office_code, warnings: [], droppedFields: [] });
      continue;
    }

    const missingUserFields = await exports.getMissingPushUserFieldLabels(proposal, fieldDefs);
    if (missingUserFields.length > 0) {
      results.push({ proposalId, success: false, error: `Thiếu ${missingUserFields.map(l => `"${l}"`).join(', ')}` });
      continue;
    }

    const unlinkedWarnings = await exports.getUnlinkedPushUserWarnings(proposal, fieldDefs);
    const isLinked = !!proposal.contact_1office_code;

    const contactData = {};
    const warnings = unlinkedWarnings.map(w => `${w.label} (${w.userName}) chưa liên kết 1Office`);
    const droppedFields = [];
    const labelOf = (key) => {
      const d = (fieldDefs || []).find(f => f.key === key);
      return (d && d.label) || key;
    };
    const userMapInfo = await fieldMapper.getUserMapInfo(system);
    for (const mapping of pushMappings) {
      const value = proposal[mapping.source_field] || (proposal.custom_data && proposal.custom_data[mapping.source_field]);
      if (mapping.target_field_type === 'user' && value !== null && value !== undefined && value !== '') {
        const internalId = fieldMapper.resolveUserId(value);
        if (internalId) {
          try {
            const ext = await adminUserService.findExternalByUser(internalId, system);
            if (ext && userMapInfo.noAccount && userMapInfo.noAccount.has(String(ext))) {
              warnings.push(`${mapping.target_field}: nhân sự (personnel_id ${ext}) chưa có tài khoản 1Office nên 1Office sẽ bỏ qua`);
            }
          } catch { /* silent */ }
        }
      }
      const transformed = await fieldMapper.transformPush(value, mapping, system, apiConfigId);
      if (transformed !== null && transformed !== undefined) {
        contactData[mapping.target_field] = transformed;
      } else if (value !== null && value !== undefined && value !== '') {
        const label = labelOf(mapping.source_field);
        droppedFields.push({ label, target: mapping.target_field });
        warnings.push(`"${label}" có dữ liệu nhưng không đẩy được sang 1Office (sai định dạng/không liên kết)`);
      }
    }
    try {
      const fileSyncService = require('./fileSyncService');
      const files = await fileSyncService.loadFiles(proposalId);
      const broken = files.filter(f => {
        try {
          const st = require('fs').statSync(require('path').join(__dirname, '../../storage/uploads', f.storage_key));
          return st.size > 10 * 1024 * 1024;
        } catch { return true; }
      });
      broken.forEach(f => warnings.push(`File "${f.original_name}" lỗi/thiếu trên server, sẽ bị bỏ qua khi đẩy`));
    } catch { /* silent: worker se bao chi tiet */ }

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
      request_payload: { api_config_id: apiConfigId, contact_data: contactData, proposal_id: proposalId, was_linked: isLinked, previous_contact_id: proposal.contact_1office_id || null, set_status: setStatus },
      priority: 0,
      created_by: userId
    });

    results.push({ proposalId, success: true, jobId: job.id, isUpdate: isLinked, contactData, warnings, droppedFields });
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
  const pullMappings = mappings.filter(m => m.sync_enabled && (m.direction === 'pull' || m.direction === 'both') && !fieldMapper.isSpecialTarget(m.target_field));
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
  const proposalData = await buildProposalDataFromContact(contact, restoreMappings, pullSystem, apiConfigId);

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
    try {
      const proposalLifecycle = require('./proposalLifecycle');
      await proposalLifecycle.logActivity({
        proposalId: existingProposal.id, action: 'sync_pull', source: 'system_auto',
        changedFields: { contact_code: contact.code, fields_updated: Object.keys(fixedData).concat(Object.keys(dynamicData)).slice(0, 20) }
      });
    } catch { /* silent: khong chan pull vi log */ }
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

const buildProposalDataFromContact = async (contact, pullMappings, pullSystem, apiConfigId) => {
  const proposalData = {};
  for (const mapping of pullMappings) {
    const value = contact[mapping.target_field];
    const transformed = await fieldMapper.transformPull(value, mapping, pullSystem, apiConfigId);
    if (transformed !== null && transformed !== undefined && transformed !== '' && !(Array.isArray(transformed) && transformed.length === 0)) {
      proposalData[mapping.source_field] = transformed;
    }
  }
  return proposalData;
};

const RESTORE_FIXED_WHITELIST = ['latitude', 'longitude', 'owner_name', 'owner_phone', 'address', 'area', 'land_type', 'description'];
const RESTORE_OVERRIDE_KEYS = ['latitude', 'longitude', 'owner_name', 'owner_phone', 'address', 'area', 'land_type', 'description', 'province'];

const restoreErr = (message, statusCode, extra) => Object.assign(new Error(message), { statusCode, ...(extra || {}) });

async function getRestoreContext(code, apiConfigId) {
  const clean = String(code || '').trim();
  if (!clean) throw restoreErr('Vui lòng nhập mã đề xuất (mã contact bên 1Office)', 400);
  if (!apiConfigId) throw restoreErr('Thiếu cấu hình 1Office', 400);

  const dup = await findProposalByContactCode(clean);
  if (dup) throw restoreErr(`Mã này đã tồn tại ở đề xuất #${dup.id}, không cần khôi phục`, 409, { proposalId: dup.id });
  const [codeRows] = await pool.query(
    `SELECT id FROM station_proposals WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_de_xuat')) = ? LIMIT 1`,
    [clean]
  );
  if (codeRows.length > 0) throw restoreErr(`Mã đề xuất đã được dùng ở đề xuất #${codeRows[0].id}`, 409, { proposalId: codeRows[0].id });

  const detail = await oneOfficeService.getContactDetail(apiConfigId, clean);
  const d = detail && detail.data ? detail.data : null;
  const inner = d && d.data ? d.data : d;
  if (!detail || !detail.success || (d && d.error) || !inner || typeof inner !== 'object') {
    throw restoreErr('Mã này không còn trên 1Office, không thể khôi phục', 404);
  }
  const contact = { ...inner, code: inner.code || clean, ID: inner.ID ?? inner.id ?? null };

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const mappings = await fieldMappingService.getAllByConfig(apiConfigId);
  const usableMappings = mappings.filter(m => m.sync_enabled && !fieldMapper.isSpecialTarget(m.target_field));
  const pullMappings = usableMappings.filter(m => m.direction === 'pull' || m.direction === 'both');
  if (pullMappings.length === 0 && usableMappings.length === 0) throw restoreErr('Chưa cấu hình mapping pull cho 1Office', 400);
  const restoreMappings = usableMappings.length > 0 ? usableMappings : pullMappings;
  const pullConfig = await apiConfigService.getById(apiConfigId);
  const pullSystem = (pullConfig && pullConfig.system_key) || '1office';

  const proposalData = await buildProposalDataFromContact(contact, pullMappings, pullSystem, apiConfigId);
  const { fixedData, dynamicData } = dynamicUtils.splitData('station_proposals', proposalData, fieldDefs);
  const descStats = { parsed: 0, unmatched: [], filledKeys: [], source: 'none' };
  const fillFromParsed = (parsed) => {
    descStats.parsed += Object.keys(parsed.values).length;
    descStats.unmatched.push(...(parsed.unmatched || []).slice(0, 20).map((u) => ({ label: u.label, text: String(u.text == null ? '' : u.text).slice(0, 80) })));
    for (const [k, v] of Object.entries(parsed.values)) {
      if (k === 'latitude' || k === 'longitude' || RESTORE_FIXED_WHITELIST.includes(k)) {
        if (fixedData[k] === undefined) { fixedData[k] = v; descStats.filledKeys.push(k); }
      } else if (dynamicData[k] === undefined) {
        dynamicData[k] = v;
        descStats.filledKeys.push(k);
      }
    }
  };
  try {
    const [pushRows] = await pool.query(
      `SELECT request_payload FROM api_queue_logs WHERE action = 'push' AND status = 'completed'
       AND JSON_UNQUOTE(JSON_EXTRACT(request_payload, '$.contact_data.code')) = ? ORDER BY id DESC LIMIT 1`,
      [contact.code]
    );
    const rawPayload = pushRows.length > 0 ? pushRows[0].request_payload : null;
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    const pushDesc = payload && payload.contact_data ? payload.contact_data.desc : null;
    if (pushDesc && String(pushDesc).includes('<table')) {
      const parsed = await descRestoreService.parseDescToFields(pushDesc, fieldDefs);
      fillFromParsed(parsed);
      if (descStats.parsed > 0) descStats.source = 'queue-log';
    }
  } catch { /* silent: rớt xuống nguồn contact */ }
  try {
    if (descStats.source === 'none' && contact.desc && String(contact.desc).length > 50) {
      const parsed = await descRestoreService.parseDescText(contact.desc, fieldDefs);
      fillFromParsed(parsed);
      if (descStats.parsed > 0) descStats.source = 'contact';
    }
  } catch { /* silent: desc chỉ bổ sung, lỗi thì bỏ qua */ }
  Object.keys(fixedData).forEach(k => {
    if (!RESTORE_FIXED_WHITELIST.includes(k)) { dynamicData[k] = fixedData[k]; delete fixedData[k]; }
  });
  const postKeys = new Set(fieldDefs.filter(f => {
    if (f.type !== 'formula' || !f.formula_config) return false;
    try {
      const fc = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config;
      return fc.compute_mode === 'post';
    } catch { return false; }
  }).map(f => f.key));
  Object.keys(dynamicData).forEach(k => { if (postKeys.has(k)) delete dynamicData[k]; });
  if (dynamicData.province !== undefined && dynamicData.province !== null && String(dynamicData.province).trim() !== '') {
    try { await dataListService.applyDiaGioi(dynamicData); } catch { delete dynamicData.province; }
  }
  return { contact, fieldDefs, fixedData, dynamicData, pullMappings, restoreMappings, descStats };
}

exports.previewRestoreFrom1Office = async (code, apiConfigId) => {
  const { contact, fixedData, dynamicData, restoreMappings, descStats } = await getRestoreContext(code, apiConfigId);
  const missing = [];
  if (validateLatitude(fixedData.latitude)) missing.push({ key: 'latitude', label: 'Vĩ độ' });
  if (validateLongitude(fixedData.longitude)) missing.push({ key: 'longitude', label: 'Kinh độ' });
  if (!fixedData.owner_name || !String(fixedData.owner_name).trim()) missing.push({ key: 'owner_name', label: 'Tên khách hàng' });
  if (!dynamicData.province || !String(dynamicData.province).trim()) missing.push({ key: 'province', label: 'Tỉnh/Thành phố' });
  const mappedTargets = new Set((restoreMappings || []).map(m => m.target_field));
  const unmapped = Object.keys(contact).filter(k => !['ID', 'id', 'code', 'desc', 'files'].includes(k) && !mappedTargets.has(k));
  const fileFieldDefs = (await dynamicUtils.getFieldDefinitionsByEntity('station_proposals')).filter((f) => f && f.type === 'file');
  const contactFiles = Array.isArray(contact.files) ? contact.files : [];
  const fileNames = contactFiles.map((f) => f && (f.filename || f.title)).filter(Boolean);
  const filesPlan = restoreFilesService.planFileAssignment(fileNames, fileFieldDefs, contact.code);
  const fileUrls = {};
  contactFiles.forEach((f) => {
    const nm = f && (f.filename || f.title);
    if (nm && f.path && !fileUrls[nm]) fileUrls[nm] = f.path;
  });
  const labelOf = {};
  fileFieldDefs.forEach((f) => { labelOf[f.key] = f.label || f.key; });
  return {
    contact: { code: contact.code, id: contact.ID, name: contact.name || '' },
    fixedData,
    dynamicData,
    missing,
    mappedCount: Object.keys({ ...fixedData, ...dynamicData }).length,
    unmappedFields: unmapped.slice(0, 20),
    unmappedCount: unmapped.length,
    descStats,
    files: {
      total: fileNames.length,
      assigned: Object.entries(filesPlan.assigned).map(([fieldKey, names]) => ({ fieldKey, fieldLabel: labelOf[fieldKey] || fieldKey, names: names.map((n) => ({ name: n, url: fileUrls[n] || null })) })),
      unassigned: filesPlan.unassigned.map((n) => ({ name: n, url: fileUrls[n] || null })),
      fileFields: fileFieldDefs.map((f) => ({ key: f.key, label: f.label || f.key }))
    }
  };
};

exports.confirmRestoreFrom1Office = async (code, apiConfigId, userId, overrides = {}, ip = null, fileAssignments = {}) => {
  const { contact, fieldDefs, fixedData, dynamicData } = await getRestoreContext(code, apiConfigId);
  const ov = overrides && typeof overrides === 'object' ? overrides : {};
  for (const k of RESTORE_OVERRIDE_KEYS) {
    if (ov[k] !== undefined && ov[k] !== null && String(ov[k]).trim() !== '') {
      if (k === 'latitude' || k === 'longitude' || RESTORE_FIXED_WHITELIST.includes(k)) fixedData[k] = ov[k];
      else dynamicData[k] = ov[k];
    }
  }
  const coordErr = validateLatitude(fixedData.latitude) || validateLongitude(fixedData.longitude);
  if (coordErr) throw restoreErr(coordErr, 400);
  if (!fixedData.owner_name || !String(fixedData.owner_name).trim()) throw restoreErr('Tên khách hàng là bắt buộc', 400);
  if (!dynamicData.province || !String(dynamicData.province).trim()) throw restoreErr('Vui lòng bổ sung Tỉnh/Thành phố', 400);
  try {
    await dataListService.applyDiaGioi(dynamicData);
  } catch (e) {
    throw restoreErr(e.message || 'Tỉnh/Thành phố không hợp lệ', 400);
  }
  await dynamicUtils.applyAutoUserFields(dynamicData, fieldDefs, userId);
  dynamicData.ma_de_xuat = contact.code;

  let importSupplementMinutes = 4320;
  try {
    const proposalLifecycle = require('./proposalLifecycle');
    const configured = await proposalLifecycle.getDeadlineMinutes('PENDING');
    importSupplementMinutes = Math.max(1, Number(configured) || 4320);
  } catch { /* silent */ }

  const customDataObj = { ...dynamicData };
  const [result] = await pool.query(
    `INSERT INTO station_proposals (user_id, tracking_code, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, custom_data, supplement_deadline_at, contact_1office_code, contact_1office_id, sync_status, last_synced_at, last_synced_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?, 'synced', NOW(), ?)`,
    [
      userId, contact.code,
      fixedData.latitude, fixedData.longitude,
      fixedData.owner_name || '', fixedData.owner_phone || '', fixedData.address || '',
      fixedData.area || '', fixedData.land_type || '', fixedData.description || '',
      JSON.stringify(customDataObj), importSupplementMinutes,
      contact.code, contact.ID ? String(contact.ID) : null,
      JSON.stringify({ contact: { code: contact.code, id: contact.ID }, restored_at: new Date().toISOString(), source: 'restore' })
    ]
  );
  const recordId = result.insertId;
  const postResults = await dynamicEngineService.computePostFormulas('station_proposals', recordId, dynamicData, userId, null, { excludeKeys: ['ma_de_xuat'] });
  const mergedDynamic = { ...dynamicData, ...postResults, ma_de_xuat: contact.code };
  await pool.query('UPDATE station_proposals SET custom_data = ?, tracking_code = ? WHERE id = ?', [JSON.stringify(mergedDynamic), contact.code, recordId]);
  const fileWarnings = [];
  let attachedCount = 0;
  try {
    const fileFieldDefs = fieldDefs.filter((f) => f && f.type === 'file');
    const validFileKeys = new Set(fileFieldDefs.map((f) => f.key));
    const contactFiles = Array.isArray(contact.files) ? contact.files : [];
    const fileNames = contactFiles.map((f) => f && (f.filename || f.title)).filter(Boolean);
    const filesPlan = restoreFilesService.planFileAssignment(fileNames, fileFieldDefs, contact.code);
    const mergedPlan = {};
    Object.entries(filesPlan.assigned).forEach(([k, names]) => { mergedPlan[k] = [...names]; });
    if (fileAssignments && typeof fileAssignments === 'object') {
      const assignedSet = new Set(Object.values(mergedPlan).flat());
      Object.entries(fileAssignments).forEach(([name, fieldKey]) => {
        if (!name || !validFileKeys.has(fieldKey) || assignedSet.has(name)) return;
        if (!fileNames.includes(name)) return;
        if (!mergedPlan[fieldKey]) mergedPlan[fieldKey] = [];
        mergedPlan[fieldKey].push(name);
        assignedSet.add(name);
      });
    }
    if (Object.keys(mergedPlan).length > 0) {
      const { attached, failed } = await restoreFilesService.downloadAndStoreFiles(contactFiles, userId, mergedPlan);
      const withFiles = { ...mergedDynamic };
      Object.entries(attached).forEach(([fieldKey, entries]) => {
        const cur = Array.isArray(withFiles[fieldKey]) ? withFiles[fieldKey] : [];
        withFiles[fieldKey] = [...cur, ...entries];
        attachedCount += entries.length;
      });
      await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(withFiles), recordId]);
      try {
        const fileService = require('./fileService');
        await fileService.renameProposalFiles({ dynamicData: withFiles, fieldDefs, maDeXuat: contact.code });
        await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [JSON.stringify(withFiles), recordId]);
      } catch { /* silent */ }
      failed.forEach((f) => fileWarnings.push(`${f.name}: ${f.error}`));
      const planned = Object.values(mergedPlan).reduce((a, n) => a + n.length, 0);
      if (attachedCount < planned) fileWarnings.push(`${planned - attachedCount} file không tải được, bổ sung tay sau khôi phục`);
    }
    const stillUnassigned = (filesPlan.unassigned || []).filter((n) => !Object.values(mergedPlan).flat().includes(n));
    if (stillUnassigned.length > 0) fileWarnings.push(`${stillUnassigned.length} file không xác định được ô (${stillUnassigned.slice(0, 5).join(', ')}${stillUnassigned.length > 5 ? '…' : ''}) — tải tay từ 1Office`);
  } catch (e) {
    fileWarnings.push(`Không kéo được file đính kèm: ${e.message}`);
  }
  try {
    const formulaService = require('./formulaService');
    await formulaService.reconcileSequences();
  } catch { /* silent */ }
  try {
    const proposalLifecycle = require('./proposalLifecycle');
    await proposalLifecycle.logActivity({
      proposalId: recordId, action: 'created', fromStatus: null, toStatus: 'PENDING',
      actorId: userId || null, source: 'restore', ip: ip || null
    });
  } catch { /* silent */ }
  return { proposalId: recordId, maDeXuat: contact.code, contactId: contact.ID, attachedFiles: attachedCount, fileWarnings };
};
