const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');
const fieldMappingService = require('./fieldMappingService');
const fieldMapper = require('./fieldMapper');
const oneOfficeService = require('./oneOfficeService');
const proposalService = require('./proposalService');
const queueService = require('./queueService');
const templateService = require('./templateService');
const fileSyncService = require('./fileSyncService');

exports.pushTo1Office = async (proposalIds, apiConfigId, userId) => {
  const config = await apiConfigService.getById(apiConfigId);
  if (!config) throw Object.assign(new Error('Không tìm thấy cấu hình API'), { statusCode: 404 });

  const mappings = await fieldMappingService.getAllByConfig(apiConfigId);
  const pushMappings = mappings.filter(m => m.sync_enabled && (m.direction === 'push' || m.direction === 'both'));

  const results = [];
  for (const proposalId of proposalIds) {
    const proposal = await proposalService.getProposalById(proposalId);
    if (!proposal) {
      results.push({ proposalId, success: false, error: 'Không tìm thấy đề xuất' });
      continue;
    }

    if (proposal.contact_1office_code) {
      results.push({ proposalId, success: false, error: 'Đề xuất đã liên kết với 1Office' });
      continue;
    }

    const contactData = {};
    for (const mapping of pushMappings) {
      const value = proposal[mapping.source_field] || (proposal.custom_data && proposal.custom_data[mapping.source_field]);
      const transformed = fieldMapper.transformPush(value, mapping);
      if (transformed !== null && transformed !== undefined) {
        contactData[mapping.target_field] = transformed;
      }
    }

    if (!contactData.code) {
      contactData.code = proposal.tracking_code || `DXS_${proposal.id}`;
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

    let filesResult = null;
    try {
      filesResult = await fileSyncService.uploadFiles(proposalId, apiConfigId);
      if (filesResult.success && filesResult.totalFiles > 0) {
        console.log(`[Sync] Uploaded ${filesResult.totalFiles} files for proposal ${proposalId}`);
      }
    } catch (err) {
      console.error('[Sync] Error uploading files:', err.message);
    }

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
      request_payload: { api_config_id: apiConfigId, contact_data: contactData, proposal_id: proposalId, files_result: filesResult },
      priority: 0,
      created_by: userId
    });

    try {
      const snapshotData = {
        contact_data: contactData,
        files_result: filesResult,
        synced_at: new Date().toISOString()
      };
      await pool.query(
        'UPDATE station_proposals SET last_synced_data = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(snapshotData), proposalId]
      );
    } catch (err) {
      console.error('[Sync] Error saving snapshot:', err.message);
    }

    results.push({ proposalId, success: true, jobId: job.id, contactData, filesResult });
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
  const mappings = await fieldMappingService.getAllByConfig(apiConfigId);
  const pullMappings = mappings.filter(m => m.sync_enabled && (m.direction === 'pull' || m.direction === 'both'));

  const result = await oneOfficeService.getContacts(apiConfigId, filter || {});
  if (!result.success) {
    throw new Error(result.error || 'Không thể lấy contacts từ 1Office');
  }

  const contacts = result.data.contacts || [];
  const created = [];
  const updated = [];
  const skipped = [];

  for (const contact of contacts) {
    const existingProposal = await findProposalByContactCode(contact.code);

    const proposalData = {};
    for (const mapping of pullMappings) {
      const value = contact[mapping.target_field];
      const transformed = fieldMapper.transformPull(value, mapping);
      if (transformed !== null && transformed !== undefined) {
        proposalData[mapping.source_field] = transformed;
      }
    }

    if (existingProposal) {
      await pool.query(
        `UPDATE station_proposals SET owner_name = ?, owner_phone = ?, address = ?, description = ?, updated_at = NOW() WHERE id = ?`,
        [proposalData.owner_name || existingProposal.owner_name, proposalData.owner_phone || existingProposal.owner_phone, proposalData.address || existingProposal.address, proposalData.description || existingProposal.description, existingProposal.id]
      );
      updated.push({ proposalId: existingProposal.id, contactCode: contact.code });
    } else {
      const [insertResult] = await pool.query(
        `INSERT INTO station_proposals (user_id, owner_name, owner_phone, address, description, contact_1office_code, sync_status, last_synced_at, created_at, updated_at)
         VALUES (NULL, ?, ?, ?, ?, ?, 'synced', NOW(), NOW(), NOW())`,
        [proposalData.owner_name || contact.name || '', proposalData.owner_phone || '', proposalData.address || '', proposalData.desc || '', contact.code]
      );
      created.push({ proposalId: insertResult.insertId, contactCode: contact.code });
    }
  }

  return { total: contacts.length, created: created.length, updated: updated.length, skipped: skipped.length, details: { created, updated, skipped } };
};

exports.linkProposal = async (proposalId, contactCode, apiConfigId) => {
  const proposal = await proposalService.getProposalById(proposalId);
  if (!proposal) throw Object.assign(new Error('Không tìm thấy đề xuất'), { statusCode: 404 });

  if (proposal.contact_1office_code) {
    throw Object.assign(new Error('Đề xuất đã được liên kết'), { statusCode: 400 });
  }

  await pool.query(
    `UPDATE station_proposals SET contact_1office_code = ?, sync_status = 'synced', last_synced_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [contactCode, proposalId]
  );

  return { proposalId, contactCode, linked: true };
};

exports.unlinkProposal = async (proposalId) => {
  const proposal = await proposalService.getProposalById(proposalId);
  if (!proposal) throw Object.assign(new Error('Không tìm thấy đề xuất'), { statusCode: 404 });

  await pool.query(
    `UPDATE station_proposals SET contact_1office_id = NULL, contact_1office_code = NULL, sync_status = 'none', updated_at = NOW() WHERE id = ?`,
    [proposalId]
  );

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
