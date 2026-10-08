const pool = require('../utils/db');
const ttlCache = require('../utils/ttlCache');
const leadService = require('./leadService');
const proposalService = require('./proposalService');
const journeyActivityService = require('./journeyActivityService');
const journeySyncService = require('./journeySyncService');

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

exports.createProposalFromLead = async (leadId, body, actor, opts = {}) => {
  const lead = await leadService.getLeadById(leadId);
  if (!lead) throw err('Không tìm thấy Lead', 404);
  if (!(await leadService.canAccessLead(lead, actor))) {
    throw err('Không có quyền tạo đề xuất từ Lead này', 403);
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
  if (!/^\d{10}$/.test(String(data.owner_phone || '').replace(/[^\d]/g, ''))) {
    throw err('SĐT khách hàng phải có đúng 10 chữ số', 400);
  }

  const ownerId = Number(lead.assigned_user_id) || Number(actor.id);
  const created = await proposalService.createProposal(ownerId, data, {
    actorRole: actor.role || null,
    ip: opts.ip || null,
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

  if (idemKey) {
    ttlCache.set(`leadprop:${leadId}:${String(idemKey).slice(0, 128)}`, proposalId, 10 * 60 * 1000);
  }

  const proposal = await proposalService.getProposalFullById(proposalId);
  return { proposal, deduped: false };
};
