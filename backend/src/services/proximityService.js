const pool = require('../utils/db');

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

async function loadPoints() {
  const [stations] = await pool.query(
    'SELECT id, latitude, longitude, status FROM stations'
  );
  const [proposals] = await pool.query(
    "SELECT id, latitude, longitude, status, user_id FROM station_proposals WHERE status != 'REJECTED'"
  );
  return {
    stations: stations.map(s => ({
      kind: 'station', id: s.id,
      latitude: Number(s.latitude), longitude: Number(s.longitude),
      status: s.status
    })),
    proposals: proposals.map(p => ({
      kind: 'proposal', id: p.id,
      latitude: Number(p.latitude), longitude: Number(p.longitude),
      status: p.status, user_id: p.user_id
    }))
  };
}

function inRange(distanceM, minM, maxM) {
  return distanceM >= minM && distanceM <= maxM;
}

exports.checkNearby = async (latitude, longitude, radiusM = 200, excludeProposalId = null) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const radius = Number(radiusM) || 200;
  if (isNaN(lat) || lat < -90 || lat > 90) throw new Error('Vĩ độ không hợp lệ (phải từ -90 đến 90)');
  if (isNaN(lng) || lng < -180 || lng > 180) throw new Error('Kinh độ không hợp lệ (phải từ -180 đến 180)');
  if (radius <= 0 || radius > MAX_RADIUS_M) throw new Error(`Bán kính phải từ 1 đến ${MAX_RADIUS_M}m`);

  const { stations, proposals } = await loadPoints();
  const points = [...stations, ...proposals].filter(p =>
    !(p.kind === 'proposal' && excludeProposalId && p.id === Number(excludeProposalId))
  );

  let nearest = null;
  for (const p of points) {
    if (isNaN(p.latitude) || isNaN(p.longitude)) continue;
    const d = exports.haversineM(lat, lng, p.latitude, p.longitude);
    if (d < radius && (!nearest || d < nearest.distance_m)) {
      nearest = { kind: p.kind, id: p.id, status: p.status, distance_m: exports.roundM(d) };
    }
  }

  return { is_duplicate: !!nearest, nearest };
};

exports.findDuplicates = async ({ minM = 200, maxM = 2000, ownUserId = null }) => {
  const min = Number(minM);
  const max = Number(maxM);
  if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0) throw new Error('Khoảng cách phải lớn hơn 0');
  if (min >= max) throw new Error('min_m phải nhỏ hơn max_m');
  if (max > MAX_RADIUS_M) throw new Error(`max_m tối đa ${MAX_RADIUS_M}m`);

  const { stations, proposals } = await loadPoints();

  let sideA;
  let sideB;
  if (ownUserId) {
    sideA = proposals.filter(p => p.user_id === Number(ownUserId));
    sideB = [...proposals.filter(p => !sideA.some(a => a.id === p.id)), ...stations];
  } else {
    sideA = proposals;
    sideB = null;
  }

  const pairs = [];
  const proposalIds = new Set();
  const stationIds = new Set();

  const pushPair = (a, b, d) => {
    const distance_m = exports.roundM(d);
    pairs.push({
      a: { kind: a.kind, id: a.id, status: a.status, latitude: a.latitude, longitude: a.longitude },
      b: { kind: b.kind, id: b.id, status: b.status, latitude: b.latitude, longitude: b.longitude },
      distance_m
    });
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
    const all = [...proposals, ...stations];
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

exports.MAX_RADIUS_M = MAX_RADIUS_M;
