const crypto = require('node:crypto');
const pool = require('../utils/db');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const parse = (value, fallback = null) => {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};
const cell = value => value && typeof value === 'object' && !Array.isArray(value) ? (value.value ?? value.label ?? '') : value;
const array = value => {
  const parsed = parse(value, []);
  const rows = Array.isArray(parsed) ? parsed : (parsed?.rows || parsed?.data);
  return Array.isArray(rows) ? rows : [];
};
const positiveInt = value => (typeof value === 'string' || typeof value === 'number') && String(value).trim() !== ''
  && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
const tokenOf = snapshot => crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const centsOf = value => {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const money = cents => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
const assertFullControl = user => require('./chargingStationAccessService').assertFullControl(user);

const proposedRows = data => {
  const model = String(cell(data.mo_hinh_dau_tu) || '').toUpperCase();
  const allGroups = [['NQ', 'loai_tru_nq'], ['LK', 'loai_tru_lk'], ['TDT', 'tdt_tru']];
  const groups = model === 'NQ_LK' ? allGroups.slice(0, 2) : allGroups.filter(([name]) => !model || name === model);
  const rows = groups.flatMap(([mo_hinh, key]) => {
    let values = array(data[key]);
    if (key === 'loai_tru_nq' && !values.length) values = array(data.loai_tru_nq_cs);
    return values.map(row => ({
      mo_hinh, loai_tru: String(cell(row.loai_tru || row.ten_loai_tru) || '').trim(), so_luong: cell(row.so_luong) ?? 1
    }));
  });
  if (!rows.length && cell(data.loai_tru)) {
    for (const part of String(cell(data.loai_tru)).split(/[;+\n]/)) {
      const text = part.trim();
      if (!text) continue;
      const match = /^(\d+)\s*(?:[x×]\s*)?((?:AC|DC|GBT)\s*\d+.*)$/i.exec(text);
      rows.push({ mo_hinh: model, loai_tru: match ? match[2] : text,
        so_luong: match ? Number(match[1]) : (cell(data.so_luong_tru) || 1) });
    }
  }
  return rows;
};

const load = async (db, id, lock = false) => {
  const [stations] = await db.query(
    `SELECT cs.id, cs.proposal_id, cs.fulfillment_review_required, p.chot_so_luong_tru, p.tong_gia_tri_chot, p.custom_data
       FROM charging_stations cs JOIN station_proposals p ON p.id=cs.proposal_id WHERE cs.id=?${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!stations.length) throw fail('Không tìm thấy ON trạm', 404);
  const station = stations[0];
  const [commitments] = await db.query(
    `SELECT id, model, pole_id, quantity, source_key FROM charging_station_commitments
      WHERE charging_station_id=? ORDER BY id${lock ? ' FOR UPDATE' : ''}`, [id]);
  const [evidence] = await db.query(
    `SELECT i.id, i.commitment_id, i.pole_id, i.quantity, i.returned_quantity
       FROM warehouse_export_items i JOIN warehouse_exports e ON e.id=i.export_id
      WHERE e.charging_station_id=? AND e.destination_type='STATION' ORDER BY i.id${lock ? ' FOR UPDATE' : ''}`, [id]);
  const [poles] = await db.query('SELECT id, name FROM charging_poles ORDER BY name, id');
  const [priceRows] = await db.query('SELECT data FROM data_list_rows WHERE list_id=18 ORDER BY id');
  const prices = new Map();
  for (const row of priceRows) {
    const data = parse(row.data, {});
    if (data.ten && centsOf(data.gia) !== null) {
      prices.set(String(data.ten), { price: data.gia, preferential: centsOf(data.gia_uu_dai) !== null ? data.gia_uu_dai : data.gia });
    }
  }
  const raw = parse(station.chot_so_luong_tru, []);
  if (!Array.isArray(raw)) throw fail('Bảng trụ chốt không hợp lệ; cần đối soát', 409);
  const snapshot = raw.map((row, i) => ({ ...row, source_key: String(row.source_key || row.id || `line:${i + 1}`) }));
  const proposalModel = String(cell(parse(station.custom_data, {}).mo_hinh_dau_tu) || '').toUpperCase();
  const byKey = new Map(snapshot.map(row => [row.source_key, row]));
  if (byKey.size !== snapshot.length || (commitments.length && (commitments.length !== snapshot.length ||
    commitments.some(c => {
      const row = byKey.get(c.source_key);
      const pole = poles.find(p => Number(p.id) === Number(c.pole_id));
      return !row || String(row.mo_hinh || row.model || row.mo_hinh_dau_tu || proposalModel).toUpperCase() !== c.model
        || Number(row.so_luong ?? row.quantity) !== Number(c.quantity)
        || (row.pole_id ? Number(row.pole_id) !== Number(c.pole_id) : !pole || String(row.loai_tru || row.pole_name || '').trim().toLowerCase() !== pole.name.trim().toLowerCase());
    })))) throw fail('Trụ chốt và dữ liệu giao trụ không khớp; cần đối soát thủ công', 409);
  if (evidence.some(e => !e.commitment_id || !commitments.some(c => Number(c.id) === Number(e.commitment_id)))) {
    throw fail('Có chứng từ chưa gắn dòng trụ chốt; cần đối soát thủ công', 409);
  }
  if (evidence.some(e => Number(e.pole_id) !== Number(commitments.find(c => Number(c.id) === Number(e.commitment_id))?.pole_id))) {
    throw fail('Loại trụ trong chứng từ không khớp; cần đối soát thủ công', 409);
  }
  if (evidence.some(e => !Number.isSafeInteger(Number(e.quantity)) || !Number.isSafeInteger(Number(e.returned_quantity || 0))
    || Number(e.quantity) < 0 || Number(e.returned_quantity || 0) < 0 || Number(e.returned_quantity || 0) > Number(e.quantity))) {
    throw fail('Số lượng chứng từ không hợp lệ; cần đối soát thủ công', 409);
  }
  const lines = snapshot.length ? snapshot : proposedRows(parse(station.custom_data, {}));
  const rows = lines.map((row, index) => {
    const c = commitments.find(item => item.source_key === row.source_key);
    const matched = poles.filter(p => row.pole_id ? Number(p.id) === Number(row.pole_id) : p.name.trim().toLowerCase() === String(row.loai_tru || row.pole_name || '').trim().toLowerCase());
    const associated = evidence.filter(e => Number(e.commitment_id) === Number(c?.id));
    return {
      source_key: snapshot.length ? row.source_key : null,
      commitment_id: c?.id || null, mo_hinh: row.mo_hinh || row.model || row.mo_hinh_dau_tu || proposalModel,
      pole_id: c?.pole_id || (matched.length === 1 ? matched[0].id : null),
      loai_tru: row.loai_tru || row.pole_name || '', so_luong: row.so_luong ?? row.quantity ?? '',
      gia_chot: row.gia_chot ?? null,
      min_quantity: associated.reduce((sum, e) => sum + Number(e.quantity) - Number(e.returned_quantity || 0), 0),
      has_evidence: associated.length > 0, index
    };
  });
  return { station, snapshot, commitments, evidence, poles, prices, rows,
    token: tokenOf({ snapshot, commitments, fallback: snapshot.length ? null : lines }) };
};

exports.get = async (id, user) => {
  await assertFullControl(user);
  const state = await load(pool, id);
  return { rows: state.rows, token: state.token, from_proposal: !state.snapshot.length,
    needs_review: Boolean(Number(state.station.fulfillment_review_required)),
    poles: state.poles.filter(p => state.prices.has(p.name)).map(p => ({ ...p, price: state.prices.get(p.name).price })) };
};

exports.update = async (id, body, user, ctx = {}) => {
  await assertFullControl(user);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 5000) throw fail('Lý do cập nhật phải từ 3 đến 5000 ký tự');
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 50) throw fail('Cần từ 1 đến 50 dòng trụ chốt');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const state = await load(db, id, true);
    if (!body.expected_token || body.expected_token !== state.token) throw fail('Trụ chốt đã thay đổi; vui lòng tải lại', 409);
    const prior = new Map(state.rows.filter(r => r.source_key).map(r => [r.source_key, r]));
    const originals = new Map(state.snapshot.map(r => [r.source_key, r]));
    const seen = new Set();
    let totalCents = 0n;
    const next = body.rows.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw fail(`Dòng ${index + 1} không hợp lệ`);
      const key = row.source_key || null;
      if (key !== null && typeof key !== 'string') throw fail(`Dòng ${index + 1} không hợp lệ`);
      if (key && (!prior.has(key) || seen.has(key))) throw fail(`Dòng ${index + 1} không hợp lệ`, 409);
      if (key) seen.add(key);
      const previous = prior.get(key);
      const model = typeof row.mo_hinh === 'string' ? row.mo_hinh.trim().toUpperCase() : '';
      const pole = positiveInt(row.pole_id) && state.poles.find(p => Number(p.id) === Number(row.pole_id));
      if (!['NQ', 'LK', 'TDT'].includes(model) || !pole || !positiveInt(row.so_luong)) throw fail(`Dòng ${index + 1}: mô hình, loại trụ hoặc số lượng không hợp lệ`);
      const quantity = Number(row.so_luong);
      if (previous?.has_evidence && (model !== previous.mo_hinh || Number(pole.id) !== Number(previous.pole_id))) {
        throw fail(`Dòng ${index + 1} đã có chứng từ; không thể đổi mô hình hoặc loại trụ`, 409);
      }
      if (previous && quantity < previous.min_quantity) throw fail(`Dòng ${index + 1}: số lượng không thể nhỏ hơn đã xuất ròng ${previous.min_quantity}; vui lòng tải lại`, 409);
      const same = previous && model === previous.mo_hinh && Number(pole.id) === Number(previous.pole_id);
      const priceInfo = state.prices.get(pole.name);
      const old = same ? originals.get(key) : null;
      const price = old?.gia_chot != null && old.gia_chot !== '' ? old.gia_chot : priceInfo?.price;
      const priceCents = centsOf(price);
      if (priceCents === null) throw fail(`Dòng ${index + 1}: giá chốt không hợp lệ cho ${pole.name}`);
      const amountCents = BigInt(quantity) * priceCents;
      totalCents += amountCents;
      if (totalCents > 999999999999999999n) throw fail('Tổng giá trị trụ chốt không hợp lệ');
      const newKey = key || `manual:${crypto.randomUUID()}`;
      return { ...(old || {}), source_key: newKey, pole_id: Number(pole.id), mo_hinh: model,
        so_luong: quantity, loai_tru: pole.name, gia_chot: price,
        gia_niem_yet: old?.gia_niem_yet ?? price, gia_uu_dai: old?.gia_uu_dai ?? priceInfo?.preferential ?? price,
        thanh_tien: money(amountCents) };
    });
    for (const previous of prior.values()) if (!seen.has(previous.source_key) && previous.has_evidence) {
      throw fail('Không thể xóa dòng đã có chứng từ', 409);
    }
    for (const c of state.commitments) if (!next.some(r => r.source_key === c.source_key)) {
      await db.query('DELETE FROM charging_station_commitments WHERE id=?', [c.id]);
    }
    for (const row of next) {
      const c = state.commitments.find(item => item.source_key === row.source_key);
      if (c) await db.query('UPDATE charging_station_commitments SET model=?, pole_id=?, quantity=? WHERE id=?', [row.mo_hinh, row.pole_id, row.so_luong, c.id]);
      else await db.query('INSERT INTO charging_station_commitments (charging_station_id,model,supplier_id,pole_id,quantity,source_key) VALUES (?,?,NULL,?,?,?)', [id, row.mo_hinh, row.pole_id, row.so_luong, row.source_key]);
    }
    const total = money(totalCents);
    await db.query('UPDATE station_proposals SET chot_so_luong_tru=?, tong_gia_tri_chot=?, updated_at=NOW() WHERE id=?', [JSON.stringify(next), total, state.station.proposal_id]);
    const reviewCleared = Boolean(Number(state.station.fulfillment_review_required));
    if (reviewCleared) {
      await db.query('UPDATE charging_stations SET fulfillment_review_required=0 WHERE id=?', [id]);
    }
    await db.query(`INSERT INTO charging_station_activity_logs
      (charging_station_id,action,changed_fields,reject_reason,actor_id,actor_role,source,ip)
      VALUES (?, 'commitments_updated', ?, ?, ?, ?, 'admin_override', ?)`,
    [id, JSON.stringify({
      chot_so_luong_tru: { old: state.snapshot, new: next },
      tong_gia_tri_chot: { old: state.station.tong_gia_tri_chot, new: total },
      ...(reviewCleared ? { fulfillment_review_required: { old: 1, new: 0 } } : {})
    }), reason, user.id, user.role, ctx.ip || null]);
    await db.commit();
    return { rows: next, total, needs_review: false };
  } catch (error) {
    await db.rollback();
    if (error.code === 'ER_LOCK_DEADLOCK' || error.code === 'ER_LOCK_WAIT_TIMEOUT') throw fail('Dữ liệu đang thay đổi; vui lòng tải lại', 409);
    throw error;
  } finally { db.release(); }
};

exports._proposedRows = proposedRows;
