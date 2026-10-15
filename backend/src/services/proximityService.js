const pool = require('../utils/db');
const { toStrArray } = require('../utils/dynamicFilter');

const EARTH_RADIUS_M = 6371000;
const MAX_RADIUS_M = 5000;

exports.haversineM = (lat1, lng1, lat2, lng2) => {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
};

exports.roundM = (m) => Math.round(Number(m) * 10) / 10;

function parseCustomData(customData) {
  if (!customData) return {};
  if (typeof customData === 'object') return customData;
  try { return JSON.parse(customData); } catch { return {}; }
}

let pointsCache = { ts: 0, data: null };
const POINTS_CACHE_TTL_MS = 30000;

async function getCachedPoints() {
  const now = Date.now();
  if (pointsCache.data && now - pointsCache.ts < POINTS_CACHE_TTL_MS) return pointsCache.data;
  const data = await loadPoints();
  pointsCache = { ts: now, data };
  return data;
}

exports.invalidatePointsCache = () => { pointsCache = { ts: 0, data: null }; };

async function loadPoints() {
  const [stations] = await pool.query(
    'SELECT id, name, latitude, longitude, status, custom_data FROM stations'
  );
  const [proposals] = await pool.query(
    `SELECT p.id, p.owner_name, p.latitude, p.longitude, p.status, p.user_id, p.journey_id, p.custom_data,
            u.custom_data AS user_custom_data
       FROM station_proposals p
       LEFT JOIN users u ON p.user_id = u.id`
  );
  return {
    stations: stations.map(s => {
      const cd = parseCustomData(s.custom_data);
      return {
        kind: 'station', id: s.id,
        latitude: Number(s.latitude), longitude: Number(s.longitude),
        status: s.status,
        code: cd.ma_tram || null,
        name: s.name || '',
        province: cd.province != null ? String(cd.province) : null,
        vung_mien: cd.vung_mien != null ? String(cd.vung_mien) : null,
        mo_hinh: (cd.mo_hinh_tram != null ? String(cd.mo_hinh_tram) : null),
        loai_uu_tien: cd.loai_uu_tien != null ? String(cd.loai_uu_tien) : null
      };
    }),
    proposals: proposals.map(p => {
      const cd = parseCustomData(p.custom_data);
      const ucd = parseCustomData(p.user_custom_data);
      return {
        kind: 'proposal', id: p.id,
        latitude: Number(p.latitude), longitude: Number(p.longitude),
        status: p.status, user_id: p.user_id,
        journey_id: p.journey_id || null,
        code: cd.ma_de_xuat || null,
        name: p.owner_name || '',
        province: cd.province != null ? String(cd.province) : null,
        vung_mien: cd.vung_mien != null ? String(cd.vung_mien) : null,
        mo_hinh: (cd.mo_hinh_dau_tu != null ? String(cd.mo_hinh_dau_tu) : null),
        loai_uu_tien: cd.loai_uu_tien != null ? String(cd.loai_uu_tien) : null,
        department: ucd.department != null ? String(ucd.department) : null
      };
    })
  };
}

function inSet(set, val) {
  return !set || (val != null && val !== '' && set.has(String(val)));
}

function matchesFilters(p, f) {
  if (!f) return true;
  const checks = [
    [f.statuses, p.status],
    [f.uuTiens, p.loai_uu_tien],
    [f.provinces, p.province],
    [f.regions, p.vung_mien],
    [f.moHinhs, p.mo_hinh],
    [f.departments, p.department],
    [f.ownerIds, p.user_id != null ? String(p.user_id) : null]
  ];
  if (!checks.every(([set, val]) => inSet(set, val))) return false;
  if (f.leadLink === 'yes' && !p.journey_id) return false;
  if (f.leadLink === 'no' && p.journey_id) return false;
  return true;
}

function buildFilterSets(raw = {}) {
  return {
    statuses: toStrArray(raw.statuses).length ? new Set(toStrArray(raw.statuses)) : null,
    uuTiens: toStrArray(raw.uuTiens).length ? new Set(toStrArray(raw.uuTiens)) : null,
    provinces: toStrArray(raw.provinces).length ? new Set(toStrArray(raw.provinces)) : null,
    regions: toStrArray(raw.regions).length ? new Set(toStrArray(raw.regions)) : null,
    moHinhs: toStrArray(raw.moHinhs).length ? new Set(toStrArray(raw.moHinhs)) : null,
    departments: toStrArray(raw.departments).length ? new Set(toStrArray(raw.departments)) : null,
    ownerIds: toStrArray(raw.ownerIds).length ? new Set(toStrArray(raw.ownerIds)) : null,
    leadLink: raw.leadLink || null
  };
}

function inRange(distanceM, minM, maxM) {
  return distanceM >= minM && distanceM <= maxM;
}

exports.checkNearby = async (latitude, longitude, radiusM = 200, excludeProposalId = null, opts = {}) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const radius = Number(radiusM) || 200;
  if (isNaN(lat) || lat < -90 || lat > 90) throw new Error('Vĩ độ không hợp lệ (phải từ -90 đến 90)');
  if (isNaN(lng) || lng < -180 || lng > 180) throw new Error('Kinh độ không hợp lệ (phải từ -180 đến 180)');
  if (radius <= 0 || radius > MAX_RADIUS_M) throw new Error(`Bán kính phải từ 1 đến ${MAX_RADIUS_M}m`);

  const { stations, proposals } = await getCachedPoints();
  const kinds = Array.isArray(opts.kinds) && opts.kinds.length ? new Set(opts.kinds) : null;
  const points = [...stations, ...proposals]
    .filter(p => !(p.kind === 'proposal' && (p.status === 'REJECTED' || p.status === 'CANCELLED')))
    .filter(p => !kinds || kinds.has(p.kind))
    .filter(p => !(p.kind === 'proposal' && excludeProposalId && p.id === Number(excludeProposalId)));

  let nearest = null;
  for (const p of points) {
    if (isNaN(p.latitude) || isNaN(p.longitude)) continue;
    const d = exports.haversineM(lat, lng, p.latitude, p.longitude);
    if (d < radius && (!nearest || d < nearest.distance_m)) {
      nearest = { kind: p.kind, id: p.id, code: p.code || null, name: p.name || '', status: p.status, distance_m: exports.roundM(d) };
    }
  }

  return { is_duplicate: !!nearest, nearest };
};

exports.findDuplicates = async ({ minM = 200, maxM = 2000, ownUserId = null, branchUserIds = null, filters = null }) => {
  const min = Number(minM);
  const max = Number(maxM);
  if (isNaN(min) || isNaN(max) || min < 0 || max <= 0) throw new Error('Khoảng cách phải từ 0 trở lên');
  if (min >= max) throw new Error('min_m phải nhỏ hơn max_m');
  if (max > MAX_RADIUS_M) throw new Error(`max_m tối đa ${MAX_RADIUS_M}m`);

  const { stations, proposals } = await getCachedPoints();
  const f = buildFilterSets(filters || {});
  const defaultExclude = !f.statuses;
  const proposalPool = proposals.filter(p => {
    if (defaultExclude && (p.status === 'REJECTED' || p.status === 'CANCELLED')) return false;
    return matchesFilters(p, f);
  });

  let sideA;
  let sideB;
  if (branchUserIds) {
    const branchSet = new Set(branchUserIds.map(Number));
    sideA = proposalPool.filter(p => branchSet.has(Number(p.user_id)));
    sideB = [...proposalPool.filter(p => !sideA.some(a => a.id === p.id)), ...stations];
  } else if (ownUserId) {
    sideA = proposalPool.filter(p => p.user_id === Number(ownUserId));
    sideB = [...proposalPool.filter(p => !sideA.some(a => a.id === p.id)), ...stations];
  } else {
    sideA = proposalPool;
    sideB = null;
  }

  const pairs = [];
  const proposalIds = new Set();
  const stationIds = new Set();

  const pushPair = (a, b, d) => {
    const distance_m = exports.roundM(d);
    const toItem = (p) => ({ kind: p.kind, id: p.id, code: p.code || null, name: p.name || '', status: p.status, latitude: p.latitude, longitude: p.longitude });
    pairs.push({ a: toItem(a), b: toItem(b), distance_m });
    [a, b].forEach(p => {
      if (p.kind === 'proposal') proposalIds.add(p.id);
      else stationIds.add(p.id);
    });
  };

  if (sideB) {
    for (const a of sideA) {
      for (const b of sideB) {
        const d = exports.haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
        if (inRange(d, min, max)) pushPair(a, b, d);
      }
    }
    for (let i = 0; i < sideA.length; i++) {
      for (let j = i + 1; j < sideA.length; j++) {
        const d = exports.haversineM(sideA[i].latitude, sideA[i].longitude, sideA[j].latitude, sideA[j].longitude);
        if (inRange(d, min, max)) pushPair(sideA[i], sideA[j], d);
      }
    }
  } else {
    const all = [...proposalPool, ...stations];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (all[i].kind === 'station' && all[j].kind === 'station') continue;
        const d = exports.haversineM(all[i].latitude, all[i].longitude, all[j].latitude, all[j].longitude);
        if (inRange(d, min, max)) pushPair(all[i], all[j], d);
      }
    }
  }

  pairs.sort((x, y) => x.distance_m - y.distance_m);
  return {
    pairs,
    duplicate_proposal_ids: [...proposalIds],
    duplicate_station_ids: [...stationIds]
  };
};

exports.findStationDuplicates = async ({ minM = 0, maxM = 2000, filters = null }) => {
  const min = Number(minM);
  const max = Number(maxM);
  if (isNaN(min) || isNaN(max) || min < 0 || max <= 0) throw new Error('Khoảng cách phải từ 0 trở lên');
  if (min >= max) throw new Error('min_m phải nhỏ hơn max_m');
  if (max > MAX_RADIUS_M) throw new Error(`max_m tối đa ${MAX_RADIUS_M}m`);

  const { stations } = await getCachedPoints();
  const f = buildFilterSets(filters || {});
  const defaultExclude = !f.statuses;
  const list = stations.filter(s => {
    if (defaultExclude && s.status === 'REJECTED') return false;
    if (isNaN(s.latitude) || isNaN(s.longitude)) return false;
    return matchesFilters(s, f);
  });

  const pairs = [];
  const stationIds = new Set();
  const seenKeys = new Set();
  const toItem = (p) => ({ kind: p.kind, id: p.id, code: p.code || null, name: p.name || '', status: p.status, latitude: p.latitude, longitude: p.longitude });

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const key = a.id < b.id ? `station:${a.id}-station:${b.id}` : `station:${b.id}-station:${a.id}`;
      if (seenKeys.has(key)) continue;
      const d = exports.haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
      if (inRange(d, min, max)) {
        seenKeys.add(key);
        pairs.push({ a: toItem(a), b: toItem(b), distance_m: exports.roundM(d) });
        stationIds.add(a.id);
        stationIds.add(b.id);
      }
    }
  }

  pairs.sort((x, y) => x.distance_m - y.distance_m);
  return {
    pairs,
    duplicate_proposal_ids: [],
    duplicate_station_ids: [...stationIds]
  };
};

exports.MAX_RADIUS_M = MAX_RADIUS_M;
