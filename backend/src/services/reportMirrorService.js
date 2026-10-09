const pool = require('../utils/db');

const PROPOSAL_PATHS = ['contact.ma_de_xuat', 'process.ma_de_xuat'];
const CONTACT_PATHS = ['contact'];
const STATION_PATHS = ['contact.ma_tram', 'process.ma_tram'];

function colLetterToIndex(col) {
  const s = String(col || '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(s)) return -1;
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function toCellsObject(cells) {
  if (Array.isArray(cells)) {
    const o = {};
    cells.forEach((v, i) => { o[String(i)] = v; });
    return o;
  }
  return cells && typeof cells === 'object' ? cells : {};
}

function findColIndex(mappings, paths) {
  for (const p of paths) {
    const m = (mappings || []).find((x) => x && x.source_path === p);
    if (m) {
      const idx = colLetterToIndex(m.sheet_col);
      if (idx >= 0) return idx;
    }
  }
  return -1;
}

function cellAt(cells, idx) {
  if (idx === undefined || idx === null || idx < 0) return null;
  const v = cells[String(idx)];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function decodeRowCodes(mappings, cells) {
  const c = toCellsObject(cells);
  const proposalIdx = findColIndex(mappings, PROPOSAL_PATHS);
  const contactIdx = findColIndex(mappings, CONTACT_PATHS);
  const stationIdx = findColIndex(mappings, STATION_PATHS);
  return {
    proposal_code: cellAt(c, proposalIdx),
    contact_code: cellAt(c, contactIdx),
    station_code: cellAt(c, stationIdx),
    has_identifier_mapping: proposalIdx >= 0 || contactIdx >= 0,
  };
}

async function getMappings(automationId, version) {
  const [rows] = await pool.query(
    'SELECT source_path, sheet_col, label FROM automation_sheet_mappings WHERE automation_id = ? AND version = ? ORDER BY sheet_col ASC',
    [automationId, String(version)]
  );
  return rows;
}

async function findProposalByCode(code) {
  const clean = String(code || '').trim();
  if (!clean) return null;
  const [rows] = await pool.query(
    `SELECT p.id, p.station_id FROM station_proposals p
     WHERE p.contact_1office_code = ? OR p.tracking_code = ? OR p.ma_de_xuat_gen = ?
        OR JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.ma_de_xuat')) = ?
     LIMIT 1`,
    [clean, clean, clean, clean]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function resolveStationCode(proposalCode) {
  const p = await findProposalByCode(proposalCode);
  if (!p || !p.station_id) return null;
  const [rows] = await pool.query('SELECT ma_tram_gen FROM stations WHERE id = ? LIMIT 1', [p.station_id]);
  if (rows.length === 0) return null;
  const v = rows[0].ma_tram_gen;
  if (v === undefined || v === null || String(v).trim() === '') return null;
  return String(v).trim();
}

async function decodeSnapshot(automationId, version, snapshotRow) {
  const mappings = await getMappings(automationId, version);
  let cells = snapshotRow.cells_json;
  try {
    if (typeof cells === 'string') cells = JSON.parse(cells);
  } catch { cells = {}; }
  const codes = decodeRowCodes(mappings, cells);
  let stationCode = codes.station_code;
  if (!stationCode && codes.proposal_code) {
    try { stationCode = await resolveStationCode(codes.proposal_code); } catch { stationCode = null; }
  }
  return {
    automation_id: automationId,
    version: String(version),
    process_id: snapshotRow.process_id,
    cells,
    proposal_code: codes.proposal_code,
    contact_code: codes.contact_code,
    station_code: stationCode,
    drift: !codes.has_identifier_mapping,
    synced_at: snapshotRow.updated_at || null,
  };
}

async function backfillIdentifiers(options) {
  const { automationId = null, limit = 2000 } = options || {};
  const where = ['(proposal_code IS NULL AND contact_code IS NULL)'];
  const params = [];
  if (automationId !== null && automationId !== undefined) {
    where.push('automation_id = ?');
    params.push(automationId);
  }
  const [rows] = await pool.query(
    `SELECT id, automation_id, version, process_id, cells_json FROM automation_sync_snapshots
     WHERE ${where.join(' AND ')} ORDER BY id LIMIT ${Math.min(Math.max(Number(limit) || 2000, 1), 10000)}`,
    params
  );
  let updated = 0;
  let unlinked = 0;
  for (const r of rows) {
    const d = await decodeSnapshot(r.automation_id, r.version, r);
    if (!d.proposal_code && !d.contact_code) {
      unlinked++;
      continue;
    }
    await pool.query(
      'UPDATE automation_sync_snapshots SET proposal_code = ?, contact_code = ?, station_code = ? WHERE id = ?',
      [d.proposal_code, d.contact_code, d.station_code, r.id]
    );
    updated++;
  }
  return { scanned: rows.length, updated, unlinked };
}

async function getSnapshotsByProposalCodes(codes, options) {
  const list = [...new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (list.length === 0) return [];
  const { automationIds = null } = options || {};
  const where = [`(proposal_code IN (${list.map(() => '?').join(',')}))`];
  const params = [...list];
  if (automationIds && automationIds.length > 0) {
    where.push(`automation_id IN (${automationIds.map(() => '?').join(',')})`);
    params.push(...automationIds);
  }
  const [rows] = await pool.query(
    `SELECT automation_id, version, process_id, cells_json, proposal_code, contact_code, station_code, updated_at
     FROM automation_sync_snapshots WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT 500`,
    params
  );
  const out = [];
  for (const r of rows) out.push(await decodeSnapshot(r.automation_id, r.version, r));
  return out;
}

async function getSnapshotsByStationCodes(codes, options) {
  const list = [...new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (list.length === 0) return [];
  const { automationIds = null } = options || {};
  const where = [`(station_code IN (${list.map(() => '?').join(',')}))`];
  const params = [...list];
  if (automationIds && automationIds.length > 0) {
    where.push(`automation_id IN (${automationIds.map(() => '?').join(',')})`);
    params.push(...automationIds);
  }
  const [rows] = await pool.query(
    `SELECT automation_id, version, process_id, cells_json, proposal_code, contact_code, station_code, updated_at
     FROM automation_sync_snapshots WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT 500`,
    params
  );
  const out = [];
  for (const r of rows) out.push(await decodeSnapshot(r.automation_id, r.version, r));
  return out;
}

async function getMirrorStats() {
  const [rows] = await pool.query(
    `SELECT s.automation_id, a.automation_key, s.version,
       COUNT(*) AS total,
       SUM(s.proposal_code IS NOT NULL OR s.contact_code IS NOT NULL) AS linked,
       MAX(s.updated_at) AS last_synced_at
     FROM automation_sync_snapshots s
     LEFT JOIN work_automations a ON a.id = s.automation_id
     GROUP BY s.automation_id, a.automation_key, s.version
     ORDER BY s.automation_id, s.version`
  );
  return rows.map((r) => ({
    automation_id: r.automation_id,
    automation_key: r.automation_key,
    version: r.version,
    total: Number(r.total),
    linked: Number(r.linked),
    unlinked: Number(r.total) - Number(r.linked),
    last_synced_at: r.last_synced_at,
  }));
}

module.exports = {
  PROPOSAL_PATHS,
  CONTACT_PATHS,
  STATION_PATHS,
  colLetterToIndex,
  decodeRowCodes,
  decodeSnapshot,
  backfillIdentifiers,
  getSnapshotsByProposalCodes,
  getSnapshotsByStationCodes,
  getMirrorStats,
  findProposalByCode,
  resolveStationCode,
};
