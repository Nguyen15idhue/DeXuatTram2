// backend/src/services/crmInboundService.js
const pool = require('../utils/db');
const crypto = require('crypto');
const leadService = require('./leadService');
const leadAssignmentService = require('./leadAssignmentService');
const { isGdtt, gdttTitlesFor } = require('../constants/salesRanks');
const crmStatusMapping = require('../integrations/crm/crmStatusMapping');

const parseCustomData = (val) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

const normalizeProvinceName = (name) => String(name || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const lookupProvinceFlexible = async (province, conn = pool) => {
  if (!province) return null;
  const [lists] = await conn.query("SELECT id FROM data_lists WHERE name IN ('Tỉnh', 'dm_tinh') ORDER BY (name = 'Tỉnh') DESC LIMIT 1");
  if (lists.length === 0) return null;
  const [rows] = await conn.query('SELECT `data` FROM data_list_rows WHERE list_id = ?', [lists[0].id]);
  const target = normalizeProvinceName(province);
  for (const r of rows) {
    let d = r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { continue; } }
    const name = d.ten_tinh || d.tinh || '';
    if (normalizeProvinceName(name) === target) {
      return { province_code: d.ma_tinh || null, region: d.vung_mien || null, province_name: name };
    }
  }
  // fuzzy: contains
  for (const r of rows) {
    let d = r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { continue; } }
    const name = d.ten_tinh || d.tinh || '';
    if (normalizeProvinceName(name).includes(target) || target.includes(normalizeProvinceName(name))) {
      return { province_code: d.ma_tinh || null, region: d.vung_mien || null, province_name: name };
    }
  }
  return { notFound: true };
};

const findGdttkdByDepartment = async (department, conn = pool) => {
  if (!department) return null;
  const [rows] = await conn.query(
    "SELECT id, full_name, role, status, custom_data FROM users WHERE role = 'SALES' AND status = 'ACTIVE'"
  );
  for (const u of rows) {
    const cd = parseCustomData(u.custom_data);
    if (String(cd.department || '').trim() !== String(department).trim()) continue;
    if (isGdtt(cd.chuc_vu, cd.department)) return u;
  }
  return null;
};

const getSystemUserId = async (conn = pool) => {
  const envId = Number(process.env.CRM_IMPORT_USER_ID);
  if (Number.isInteger(envId) && envId > 0) {
    const [rows] = await conn.query('SELECT id FROM users WHERE id = ? AND status = "ACTIVE" LIMIT 1', [envId]);
    if (rows.length) return envId;
  }
  const [rows] = await conn.query("SELECT id FROM users WHERE role IN ('SUPER_ADMIN','ADMIN') AND status = 'ACTIVE' ORDER BY id ASC LIMIT 1");
  return rows.length ? rows[0].id : null;
};

const upsertLeadFromCrm = async (data, conn) => {
  const crmId = String(data.id || '').trim();
  if (!crmId) throw new Error('Thiếu id khách hàng CRM');

  // find existing by external_crm_id
  const [existing] = await conn.query('SELECT id FROM leads WHERE external_crm_id = ? LIMIT 1', [crmId]);
  const systemUserId = await getSystemUserId(conn);

  const province = data.province ? String(data.province).trim() : '';
  const geo = await lookupProvinceFlexible(province, conn);

  const customData = {
    crm_lead_id: crmId,
    cskh_history: data.cskhNote ? [{ note: data.cskhNote, at: data.cskhContactAt || null }] : [],
    tvbh_history: [],
    extra: data.extra || {},
    campaign: data.campaign || null,
    adCampaign: data.adCampaign || null,
    segment: data.segment || null,
    suggestedDealer: data.suggestedDealer || null,
    reRegistrations: data.reRegistrations || 0,
    lastReRegistrationAt: data.lastReRegistrationAt || null,
    crm_status: data.status || null,
    crm_partner_status: data.partnerStatus || null,
    crm_partner_ref: data.partnerRef || null,
    handedAt: data.handedAt || null,
    changedAt: data.changedAt || null,
    needs_review: !crmStatusMapping.isKnownCrmClassify(data.classify) || !crmStatusMapping.isKnownCrmStatus(data.status),
  };

  if (existing.length) {
    const leadId = existing[0].id;
    await conn.query(
      `UPDATE leads SET full_name = ?, phone = ?, email = ?, address = ?, province = ?, ward = ?,
         province_code = ?, region = ?, customer_type = ?, source = ?, note = ?,
         customer_classification = ?, custom_data = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        String(data.name || '').trim() || null,
        String(data.phone || '').trim() || null,
        data.email ? String(data.email).trim() : null,
        data.address ? String(data.address).trim() : null,
        province || null,
        data.ward ? String(data.ward).trim() : null,
        geo && !geo.notFound ? geo.province_code : null,
        geo && !geo.notFound ? geo.region : null,
        data.customer_type ? String(data.customer_type).trim() : null,
        data.source ? String(data.source).trim() : null,
        data.cskhNote ? String(data.cskhNote).trim() : null,
        crmStatusMapping.mapCrmClassifyToTmt(data.classify),
        JSON.stringify(customData),
        leadId
      ]
    );
    return { id: leadId, created: false };
  }

  // create new lead
  const fullName = String(data.name || '').trim();
  const phone = String(data.phone || '').trim();
  if (!fullName) throw new Error('Thiếu họ tên khách hàng');
  if (!/^\d{10}$/.test(phone)) throw new Error('Số điện thoại phải có đúng 10 chữ số');
  if (!province) throw new Error('Thiếu tỉnh/thành phố');

  const journeyCode = crypto.randomUUID();
  const [jres] = await conn.query(
    "INSERT INTO business_journeys (journey_code, current_stage, status, started_at) VALUES (?, 'NEW', 'ACTIVE', NOW())",
    [journeyCode]
  );
  const journeyId = jres.insertId;

  const [lres] = await conn.query(
    `INSERT INTO leads (journey_id, full_name, phone, email, address, province, ward,
      province_code, region, customer_type, source, note, stage,
      customer_classification, sales_outcome, custom_data, created_by, external_crm_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, NULL, ?, ?, ?)`,
    [
      journeyId, fullName, phone,
      data.email ? String(data.email).trim() : null,
      data.address ? String(data.address).trim() : null,
      province,
      data.ward ? String(data.ward).trim() : null,
      geo && !geo.notFound ? geo.province_code : null,
      geo && !geo.notFound ? geo.region : null,
      data.customer_type ? String(data.customer_type).trim() : null,
      data.source ? String(data.source).trim() : null,
      data.cskhNote ? String(data.cskhNote).trim() : null,
      crmStatusMapping.mapCrmClassifyToTmt(data.classify),
      JSON.stringify(customData),
      systemUserId,
      crmId
    ]
  );
  const leadId = lres.insertId;
  const leadCode = `LD-${String(leadId).padStart(6, '0')}`;
  await conn.query('UPDATE leads SET lead_code = ? WHERE id = ?', [leadCode, leadId]);

  const journeyActivityService = require('./journeyActivityService');
  await journeyActivityService.log({
    journey_id: journeyId,
    entity_type: 'lead',
    entity_id: leadId,
    action: 'lead_created',
    stage_after: 'NEW',
    actor_id: systemUserId,
    actor_role: 'SYSTEM',
    source: 'crm_inbound',
    ip: null,
  }, conn);

  // auto-assign to GĐTTKD by region (Q3)
  try {
    await autoAssignCrmLead(leadId, geo && !geo.notFound ? geo.region : null, geo && !geo.notFound ? geo.province_code : null, conn);
  } catch (e) {
    // don't fail inbound on assignment error; flag needs_assignment
    await conn.query('UPDATE leads SET custom_data = JSON_SET(COALESCE(custom_data, JSON_OBJECT()), "$.needs_assignment", true) WHERE id = ?', [leadId]);
  }

  // CRM outbound: notify received (best-effort, after commit)
  try {
    const crmOutboundService = require('./crmOutboundService');
    await crmOutboundService.enqueue({
      eventId: `eg_${leadId}_received_${Date.now()}`,
      eventType: 'lead.care',
      leadId,
      crmLeadId: crmId,
      payload: { leadId: crmId, channel: 'Hệ thống', note: 'Đã nhận khách từ CRM', staff: 'Hệ thống', ref: `EG-${leadId}` },
      conn
    });
  } catch (e) {
    console.error('[CrmInbound] received-event enqueue failed:', e.message);
  }

  return { id: leadId, created: true };
};

const autoAssignCrmLead = async (leadId, region, provinceCode, conn) => {
  if (!region) return;
  const department = await leadService.getRoutingDepartment(region, conn);
  if (!department) return;
  // find active GĐTTKD in department
  const [users] = await conn.query(
    "SELECT id, full_name, role, status, custom_data FROM users WHERE role = 'SALES' AND status = 'ACTIVE'"
  );
  let gdttkd = null;
  for (const u of users) {
    const cd = parseCustomData(u.custom_data);
    if (String(cd.department || '').trim() !== String(department).trim()) continue;
    if (isGdtt(cd.chuc_vu, cd.department)) { gdttkd = u; break; }
  }
  if (!gdttkd) return;
  // only assign if classification is TIEM_NANG (auto-routing rule)
  const [leadRows] = await conn.query('SELECT customer_classification, journey_id, external_crm_id FROM leads WHERE id = ?', [leadId]);
  const leadRow = leadRows[0] || {};
  const cls = leadRow.customer_classification;
  const crmLeadId = leadRow.external_crm_id || null;
  const journeyId = leadRow.journey_id;
  if (crmStatusMapping.mapCrmClassifyToTmt(cls) !== 'TIEM_NANG' && cls !== 'Tiềm năng') {
    await conn.query('UPDATE leads SET assigned_department = ? WHERE id = ?', [department, leadId]);
    return;
  }
  await conn.query(
    `UPDATE leads SET assigned_user_id = ?, assigned_department = ?, assigned_at = NOW(), stage = 'ASSIGNED' WHERE id = ?`,
    [gdttkd.id, department, leadId]
  );
  const journeyActivityService = require('./journeyActivityService');
  await journeyActivityService.log({
    journey_id: journeyId,
    entity_type: 'lead',
    entity_id: leadId,
    action: 'assigned',
    stage_before: 'NEW',
    stage_after: 'ASSIGNED',
    changed_fields: { assigned_user_id: { from: null, to: gdttkd.id } },
    actor_id: null,
    actor_role: 'SYSTEM',
    source: 'crm_inbound',
    reason: 'Tự động giao cho GĐTTKD theo vùng',
    ip: null,
  }, conn);
  // CRM outbound: notify assignment to GĐTTKD
  if (crmLeadId) {
    try {
      const crmOutboundService = require('./crmOutboundService');
      await crmOutboundService.enqueue({
        eventId: `eg_${leadId}_assign_${Date.now()}`,
        eventType: 'lead.care',
        leadId,
        crmLeadId,
        payload: { leadId: crmLeadId, channel: 'Hệ thống', note: `Giao cho GĐTTKD ${gdttkd.full_name || ''}`.trim(), staff: gdttkd.full_name || '', ref: `EG-${leadId}` },
        conn
      });
    } catch { /* silent */ }
  }
};

exports.processWebhookEvents = async (events) => {
  const results = { received: 0, applied: 0, duplicate: 0, unchanged: 0, errors: [] };
  if (!Array.isArray(events)) events = [];
  const conn = await pool.getConnection();
  try {
    for (const ev of events) {
      if (!ev || !ev.id) {
        results.errors.push({ id: ev?.id || null, error: 'Thiếu event id' });
        continue;
      }
      results.received++;
      // dedup
      const [dup] = await conn.query('SELECT 1 FROM crm_inbound_events WHERE event_id = ?', [ev.id]);
      if (dup.length) { results.duplicate++; continue; }
      await conn.query(
        'INSERT INTO crm_inbound_events (event_id, event_type, crm_lead_id, status) VALUES (?,?,?,?)',
        [ev.id, ev.type || null, ev.data?.id || null, 'received']
      );
      try {
        if (ev.type === 'ping') {
          await conn.query('UPDATE crm_inbound_events SET status = ? WHERE event_id = ?', ['processed', ev.id]);
          results.applied++;
          continue;
        }
        if (ev.type === 'lead.handed' || ev.type === 'lead.updated') {
          await upsertLeadFromCrm(ev.data || {}, conn);
          await conn.query('UPDATE crm_inbound_events SET status = ? WHERE event_id = ?', ['processed', ev.id]);
          results.applied++;
        } else {
          await conn.query('UPDATE crm_inbound_events SET status = ?, error = ? WHERE event_id = ?', ['skipped', 'Unknown event type', ev.id]);
        }
      } catch (e) {
        await conn.query('UPDATE crm_inbound_events SET status = ?, error = ? WHERE event_id = ?', ['failed', String(e.message || e), ev.id]);
        results.errors.push({ id: ev.id, error: e.message || String(e) });
      }
    }
  } finally {
    conn.release();
  }
  return results;
};

exports.upsertLeadFromCrm = upsertLeadFromCrm;
exports.autoAssignCrmLead = autoAssignCrmLead;
exports.lookupProvinceFlexible = lookupProvinceFlexible;
