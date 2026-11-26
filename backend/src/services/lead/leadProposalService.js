const pool = require('../../utils/db');
const ttlCache = require('../../utils/ttlCache');
const leadService = require('./leadService');
const proposalService = require('../proposal/proposalService');
const journeyActivityService = require('../journeyActivityService');
const journeySyncService = require('../journeySyncService');
const crypto = require('crypto');
const requirement = require('./leadProposalRequirement');
const { isLeadPortalUser } = require('../../utils/leadPortal');

const CUSTOMER_TYPE_MAP = {
  'Hộ KD': 'Hộ Kinh doanh',
};

const err = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const prefill = (lead, body) => {
  const data = { ...(body || {}) };
  const put = (k, v) => {
    if (data[k] === undefined || data[k] === null || data[k] === '') {
      if (v !== undefined && v !== null && v !== '') data[k] = v;
    }
  };
  put('owner_name', lead.full_name);
  put('owner_phone', lead.phone);
  put('address', lead.address);
  put('province', lead.province);
  put('xa_phuong', lead.ward);
  put('ma_tinh', lead.province_code);
  put('vung_mien', lead.region);
  if (lead.customer_type) {
    put('loai_khach_hang', CUSTOMER_TYPE_MAP[lead.customer_type] || lead.customer_type);
  }
  return data;
};

exports.saveLeadAndCreateProposal = async (leadId, data, actor, opts = {}) => {
    const key = String(opts.idempotencyKey || '').trim();
    if (!key || key.length > 128) throw err('Thiếu khóa chống trùng hợp lệ', 400);
    if (isLeadPortalUser(actor)) throw err('Tài khoản này không có quyền tạo đề xuất', 403);
    if (!data || !data.lead || !data.proposal || !data.edit_version) throw err('Thiếu dữ liệu Lead hoặc đề xuất', 400);
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const conn = await pool.getConnection();
    let created;
    let updated;
    let before;
    let deduped = false;
    try {
      await conn.beginTransaction();
      const [locked] = await conn.query('SELECT id FROM leads WHERE id = ? FOR UPDATE', [leadId]);
      if (!locked.length) throw err('Không tìm thấy Lead', 404);
      before = await leadService.getLeadById(leadId, conn);
      if (!(await require('./leadAccessService').permissions(before, actor, conn)).can_consult) {
        throw err('Không có quyền tạo đề xuất từ khách hàng này', 403);
      }
      const [requests] = await conn.query(
        'SELECT request_hash, proposal_id FROM lead_proposal_save_requests WHERE lead_id = ? AND actor_id = ? AND request_key = ?',
        [leadId, actor.id, key]
      );
      if (requests.length) {
        if (requests[0].request_hash !== hash) throw err('Khóa chống trùng đã được dùng cho dữ liệu khác', 409);
        created = { id: requests[0].proposal_id };
        deduped = true;
      } else {
        if (requirement.editVersion(before) !== data.edit_version) {
          throw err('Lead đã thay đổi. Vui lòng tải lại và kiểm tra dữ liệu trước khi lưu.', 409);
        }
        if (await requirement.hasProposal(before, conn)) {
          throw err('Lead đã có đề xuất. Vui lòng tải lại trước khi lưu.', 409);
        }
        updated = await leadService.applyLeadUpdate(conn, before, data.lead, actor, {
          source: 'admin', ip: opts.ip, creatingProposal: true
        });
        if (updated.sales_outcome !== 'SUCCESS' || updated.consultation_status !== 'SUCCESS') {
          throw err('Kết quả tư vấn phải là Gửi vị trí đề xuất', 400);
        }
        const routingChanged = String(before.customer_classification || '') !== String(updated.customer_classification || '') ||
          String(before.province || '') !== String(updated.province || '');
        if (routingChanged && !updated.assigned_user_id) {
          await require('./leadAssignmentService').tryAutoRoute(updated, actor, {
            conn, source: 'admin', ip: opts.ip, creatingProposal: true
          });
          updated = await leadService.getLeadById(leadId, conn);
        }
        const proposalData = prefill(updated, data.proposal);
        const lat = Number(proposalData.latitude);
        const lng = Number(proposalData.longitude);
        if (proposalData.latitude === '' || proposalData.latitude == null || proposalData.longitude === '' ||
            proposalData.longitude == null || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
            !Number.isFinite(lng) || lng < -180 || lng > 180) {
          throw err('Vui lòng chọn tọa độ hợp lệ trên bản đồ', 400);
        }
        if (!String(proposalData.owner_name || '').trim()) throw err('Thiếu tên khách hàng', 400);
        const ownerId = Number(updated.assigned_user_id) || Number(actor.id);
        created = await proposalService.createProposal(ownerId, proposalData, {
          connection: conn, actorId: actor.id, actorRole: actor.role, ip: opts.ip, initialStatus: 'PENDING'
        });
        await conn.query('UPDATE station_proposals SET journey_id = ? WHERE id = ?', [updated.journey_id, created.id]);
        await journeyActivityService.log({
          journey_id: updated.journey_id, entity_type: 'proposal', entity_id: created.id,
          action: 'proposal_created', actor_id: actor.id, actor_role: actor.role,
          source: 'admin', ip: opts.ip || null
        }, conn);
        await journeySyncService.recomputeStage(updated.journey_id, conn);
        if (updated.external_crm_id) {
          const mapping = require('../../integrations/crm/crmStatusMapping');
          await require('../crm/crmOutboundService').enqueue({
            eventId: `eg_${leadId}_proposal_${created.id}`, eventType: 'lead.care',
            leadId, crmLeadId: updated.external_crm_id, conn,
            payload: {
              leadId: updated.external_crm_id,
              channel: mapping.mapCareValue('channel', ''),
              contact: mapping.mapCareValue('contact', ''),
              classify: mapping.mapCareValue('classify', updated.customer_classification || ''),
              saleResult: mapping.mapCareValue('saleResult', ''), reason: '',
              note: mapping.MILESTONE_NOTES.proposalCreated(created.postResults.ma_de_xuat || `DX${created.id}`),
              staff: actor.full_name || '', ref: `EG-${leadId}`
            }
          });
        }
        await conn.query(
          'INSERT INTO lead_proposal_save_requests (lead_id, actor_id, request_key, request_hash, proposal_id) VALUES (?, ?, ?, ?, ?)',
          [leadId, actor.id, key, hash, created.id]
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    if (!deduped) {
      await leadService.notifyLeadUpdate(before, updated, actor);
      try {
        await proposalService.finishProposalCreation(created.id, Number(updated.assigned_user_id) || Number(actor.id),
          created.initialStatus, created.postResults, { actorId: actor.id, actorRole: actor.role, ip: opts.ip });
      } catch (error) {
        console.error(`[LeadProposal] Post-commit processing failed for proposal ${created.id}:`, error);
      }
    }
    const proposal = await proposalService.getProposalFullById(created.id);
    if (!proposal) throw err('Đề xuất đã tạo không còn tồn tại', 409);
    return { proposal, deduped };
};

exports.createProposalFromLead = async (leadId, body, actor, opts = {}) => {
  const lead = await leadService.getLeadById(leadId);
  if (!lead) throw err('Không tìm thấy Lead', 404);
  if (!(await leadService.canAccessLead(lead, actor))) {
    throw err('Không có quyền tạo đề xuất từ Lead này', 403);
  }
  if (!(await require('./leadAccessService').permissions(lead, actor)).can_consult) {
    throw err('Không có quyền tạo đề xuất từ khách hàng này', 403);
  }
  if (lead.sales_outcome !== 'SUCCESS') {
    throw err('Lead chưa TVBH thành công (sales_outcome phải là Thành công)', 422);
  }

  const idemKey = opts.idempotencyKey || (body && body.idempotency_key);
  if (idemKey) {
    const cacheKey = `leadprop:${leadId}:${String(idemKey).slice(0, 128)}`;
    const hit = ttlCache.get(cacheKey);
    if (hit) {
      const [rows] = await pool.query('SELECT id FROM station_proposals WHERE id = ? LIMIT 1', [hit]);
      if (rows.length > 0) {
        const existing = await proposalService.getProposalFullById(hit);
        return { proposal: existing, deduped: true };
      }
    }
  }

  const data = prefill(lead, body);
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw err('Vui lòng chọn tọa độ trên bản đồ (latitude/longitude bắt buộc)', 400);
  }
  if (!String(data.owner_name || '').trim()) throw err('Thiếu tên khách hàng (lấy từ Lead)', 400);
  if (!/^\d{10,11}$/.test(String(data.owner_phone || '').replace(/[^\d]/g, ''))) {
    throw err('SĐT khách hàng phải có 10 hoặc 11 chữ số', 400);
  }

  const ownerId = Number(lead.assigned_user_id) || Number(actor.id);
  const created = await proposalService.createProposal(ownerId, data, {
    actorId: actor.id,
    actorRole: actor.role || null,
    ip: opts.ip || null,
    initialStatus: 'PENDING',
  });
  const proposalId = created.id;
  if (!proposalId) throw err('Tạo đề xuất thất bại', 500);

  await pool.query('UPDATE station_proposals SET journey_id = ? WHERE id = ?', [lead.journey_id, proposalId]);

  await journeyActivityService.log({
    journey_id: lead.journey_id,
    entity_type: 'proposal',
    entity_id: proposalId,
    action: 'proposal_created',
    actor_id: actor.id,
    actor_role: actor.role,
    source: 'admin',
    ip: opts.ip || null,
  });
  await journeySyncService.recomputeStage(lead.journey_id);

  // CRM outbound: notify proposal created
  try {
    const crmLeadId = lead.external_crm_id || null;
    if (crmLeadId) {
      const crmStatusMapping = require('../../integrations/crm/crmStatusMapping');
      const maDeXuat = (created && (created.ma_de_xuat || created.custom_data?.ma_de_xuat)) || `DX${proposalId}`;
      const crmOutboundService = require('../crm/crmOutboundService');
      await crmOutboundService.enqueue({
        eventId: `eg_${leadId}_proposal_${proposalId}`,
        eventType: 'lead.care',
        leadId,
        crmLeadId,
        payload: {
          leadId: crmLeadId,
          channel: crmStatusMapping.mapCareValue('channel', ''),
          contact: crmStatusMapping.mapCareValue('contact', ''),
          classify: crmStatusMapping.mapCareValue('classify', lead.customer_classification || ''),
          saleResult: crmStatusMapping.mapCareValue('saleResult', ''),
          reason: '',
          note: crmStatusMapping.MILESTONE_NOTES.proposalCreated(maDeXuat),
          staff: actor.full_name || '',
          ref: `EG-${leadId}`
        }
      });
    }
  } catch (notifyErr) {
    console.error(`[CRM] notify proposal created failed: leadId=${leadId} proposalId=${proposalId} error=${notifyErr && notifyErr.message}`);
  }


  if (idemKey) {
    ttlCache.set(`leadprop:${leadId}:${String(idemKey).slice(0, 128)}`, proposalId, 10 * 60 * 1000);
  }

  const proposal = await proposalService.getProposalFullById(proposalId);
  return { proposal, deduped: false };
};
