const pool = require('../utils/db');
const journeyActivityService = require('./journeyActivityService');

const STAGE_RANKS = {
  NEW: 0, ASSIGNED: 1, CSKH: 2, QUALIFIED: 2, TVBH: 2,
  PROPOSAL: 3, STATION: 4, ON: 5,
};

const LIVE_PROPOSAL_STATUSES = ['PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED', 'APPROVED', 'ARCHIVED'];

const proposalRank = (status, hasStation) => {
  if (status === 'CONTRACT_SIGNED' || hasStation) return 4;
  if (LIVE_PROPOSAL_STATUSES.includes(status)) return 3;
  return 0;
};

const rankToStage = (rank) => {
  if (rank >= 5) return 'ON';
  if (rank >= 4) return 'STATION';
  if (rank >= 3) return 'PROPOSAL';
  if (rank >= 2) return null;
  if (rank >= 1) return null;
  return null;
};

exports.recomputeStage = async (journeyId, conn = pool) => {
  const [jrows] = await conn.query(
    'SELECT id, current_stage FROM business_journeys WHERE id = ? LIMIT 1',
    [journeyId]
  );
  if (jrows.length === 0) return null;
  const current = jrows[0].current_stage;
  if (current === 'UNQUALIFIED' || current === 'LOST') return current;
  const currentRank = STAGE_RANKS[current] ?? 0;

  const [proposals] = await conn.query(
    'SELECT status, station_id FROM station_proposals WHERE journey_id = ?',
    [journeyId]
  );
  let computed = 0;
  for (const p of proposals) {
    const r = proposalRank(p.status, !!p.station_id);
    if (r > computed) computed = r;
  }
  if (computed <= currentRank) return current;
  const next = rankToStage(computed);
  if (!next) return current;
  await conn.query('UPDATE business_journeys SET current_stage = ? WHERE id = ?', [next, journeyId]);
  return next;
};

exports.onProposalTransition = async (proposalId, { from, to, actorId, actorRole, source, ip } = {}) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, journey_id FROM station_proposals WHERE id = ? LIMIT 1',
      [proposalId]
    );
    const journeyId = rows[0] && rows[0].journey_id;
    if (!journeyId) return null;
    await journeyActivityService.log({
      journey_id: journeyId,
      entity_type: 'proposal',
      entity_id: proposalId,
      action: 'proposal_status_changed',
      status_before: from || null,
      status_after: to || null,
      actor_id: actorId || null,
      actor_role: actorRole || (source === 'webhook' ? '1Office' : null),
      source: source || 'user',
      ip: ip || null,
    });
    return await exports.recomputeStage(journeyId);
  } catch { return null; }
};

exports.onProposalUpdated = async (proposalId, { changedFields, actorId, actorRole, source, ip } = {}) => {
  try {
    const [rows] = await pool.query('SELECT journey_id FROM station_proposals WHERE id = ? LIMIT 1', [proposalId]);
    const journeyId = rows[0] && rows[0].journey_id;
    if (!journeyId) return null;
    await journeyActivityService.log({
      journey_id: journeyId,
      entity_type: 'proposal',
      entity_id: proposalId,
      action: 'proposal_updated',
      changed_fields: changedFields || null,
      actor_id: actorId || null,
      actor_role: actorRole || null,
      source: source || 'user',
      ip: ip || null,
    });
    return journeyId;
  } catch { return null; }
};

const findJourneyByStation = async (stationId, conn = pool) => {
  const [rows] = await conn.query(
    'SELECT journey_id FROM station_proposals WHERE station_id = ? AND journey_id IS NOT NULL ORDER BY id ASC LIMIT 1',
    [stationId]
  );
  return (rows[0] && rows[0].journey_id) || null;
};

exports.onStationCreated = async (stationId, proposalId, { actorId, actorRole, source, ip } = {}) => {
  try {
    let journeyId = null;
    if (proposalId) {
      const [rows] = await pool.query('SELECT journey_id FROM station_proposals WHERE id = ? LIMIT 1', [proposalId]);
      journeyId = rows[0] && rows[0].journey_id;
    }
    if (!journeyId && stationId) journeyId = await findJourneyByStation(stationId);
    if (!journeyId) return null;
    await journeyActivityService.log({
      journey_id: journeyId,
      entity_type: 'station',
      entity_id: stationId,
      action: 'station_created',
      actor_id: actorId || null,
      actor_role: actorRole || null,
      source: source || 'user',
      ip: ip || null,
    });
    return await exports.recomputeStage(journeyId);
  } catch { return null; }
};

exports.onStationStatus = async (stationId, { from, to, actorId, actorRole, source, ip } = {}) => {
  try {
    const journeyId = await findJourneyByStation(stationId);
    if (!journeyId) return null;
    await journeyActivityService.log({
      journey_id: journeyId,
      entity_type: 'station',
      entity_id: stationId,
      action: 'station_status_changed',
      status_before: from || null,
      status_after: to || null,
      actor_id: actorId || null,
      actor_role: actorRole || (source === 'webhook' ? '1Office' : null),
      source: source || 'user',
      ip: ip || null,
    });
    if (to === 'ACTIVE') {
      const [jrows] = await pool.query('SELECT current_stage FROM business_journeys WHERE id = ? LIMIT 1', [journeyId]);
      const current = jrows[0] && jrows[0].current_stage;
      if (current && current !== 'UNQUALIFIED' && current !== 'LOST' && current !== 'ON') {
        await pool.query("UPDATE business_journeys SET current_stage = 'ON' WHERE id = ?", [journeyId]);
        return 'ON';
      }
    }
    return await exports.recomputeStage(journeyId);
  } catch { return null; }
};

exports.onStationUpdated = async (stationId, { changedFields, actorId, actorRole, source, ip } = {}) => {
  try {
    const journeyId = await findJourneyByStation(stationId);
    if (!journeyId) return null;
    await journeyActivityService.log({
      journey_id: journeyId,
      entity_type: 'station',
      entity_id: stationId,
      action: 'station_updated',
      changed_fields: changedFields || null,
      actor_id: actorId || null,
      actor_role: actorRole || null,
      source: source || 'user',
      ip: ip || null,
    });
    return journeyId;
  } catch { return null; }
};

exports.upsertExternalRef = async ({ journeyId, system, refType, externalId, externalCode } = {}) => {
  try {
    if (!journeyId || !system || !refType || !externalId) return null;
    await pool.query(
      `INSERT INTO journey_external_refs (journey_id, \`system\`, ref_type, external_id, external_code, last_synced_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE external_code = VALUES(external_code), last_synced_at = NOW()`,
      [journeyId, system, refType, String(externalId), externalCode ? String(externalCode) : null]
    );
    return true;
  } catch { return null; }
};

exports.linkAutomationRun = async ({ runId, proposalId, processId } = {}) => {
  try {
    if (!proposalId) return null;
    const [rows] = await pool.query('SELECT journey_id FROM station_proposals WHERE id = ? LIMIT 1', [proposalId]);
    const journeyId = rows[0] && rows[0].journey_id;
    if (!journeyId) return null;
    if (runId) {
      await exports.upsertExternalRef({ journeyId, system: 'automation', refType: 'run', externalId: String(runId) });
    }
    if (processId) {
      await exports.upsertExternalRef({ journeyId, system: 'automation', refType: 'process', externalId: String(processId) });
    }
    return journeyId;
  } catch { return null; }
};
