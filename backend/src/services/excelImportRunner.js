const bcrypt = require('bcryptjs');
const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dataListService = require('./dataListService');
const addressEnrichment = require('./addressEnrichment');
const proximityService = require('./proximityService');
const { validateLatitude, validateLongitude, validatePhone, validateRequired, validateEmail } = require('../middlewares/validators');

const ENTITY_TABLE_MAP = {
  stations: 'stations',
  users: 'users',
  station_proposals: 'station_proposals'
};

const PROGRESS_EVERY = 5;

exports.runImportRows = async ({ jobId, entity, rows, params, user, ip, onProgress, shouldStop }) => {
  const startedAt = Date.now();
  const table = ENTITY_TABLE_MAP[entity];
  const skipGeocode = params.geocode === false || String(params.geocode).toLowerCase() === 'false' || String(params.geocode) === '0';
  const checkDuplicate = params.checkDuplicate !== false && params.checkDuplicate !== 'false';
  const checkIntraFile = params.checkIntraFile !== false && params.checkIntraFile !== 'false';

  let importSupplementMinutes = 4320;
  if (entity === 'station_proposals') {
    try {
      const proposalLifecycle = require('./proposalLifecycle');
      const configured = await proposalLifecycle.getDeadlineMinutes('PENDING');
      importSupplementMinutes = Math.max(1, Number(configured) || 4320);
    } catch { /* silent */ }
  }

  const dynamicEngineService = require('./dynamicEngineService');
  const [allDefs] = await pool.query(
    'SELECT `key`, formula_config FROM field_definitions WHERE entity = ? AND status = \'active\'',
    [entity]
  );
  let confirmTableDefs = [];
  try {
    const [tDefs] = await pool.query(
      "SELECT `key`, label, source_config FROM field_definitions WHERE entity = ? AND type = 'table' AND source_type = 'json' AND status = 'active'",
      [entity]
    );
    confirmTableDefs = (tDefs || []).map(r => ({ key: r.key, label: r.label, type: 'table', source_type: 'json', source_config: r.source_config }));
  } catch { /* silent */ }
  const postFormulaKeys = new Set(
    allDefs.filter(f => {
      if (!f.formula_config) return false;
      try {
        const fc = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config;
        return fc.compute_mode === 'post';
      } catch { return false; }
    }).map(f => f.key)
  );
  const keepProvidedPost = entity === 'stations' ? new Set(['ma_tram', 'loai_uu_tien']) : new Set();

  let imported = 0;
  let failed = 0;
  const failDetails = [];
  const confirmWarnDetails = [];
  const createdIds = [];
  const createdProposalIds = [];
  let defaultUserPasswordHash = null;
  const insertedCoords = [];
  const usedCodes = new Set();
  if (entity === 'stations') {
    const [existing] = await pool.query(
      `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) AS code FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) IS NOT NULL`
    );
    existing.forEach(r => { if (r.code) usedCodes.add(r.code); });
  }

  let proposalFieldDefs = null;
  if (entity === 'station_proposals' && user && user.id) {
    proposalFieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  }

  let stopped = false;
  let processed = 0;
  for (let idx = 0; idx < rows.length; idx++) {
    if (shouldStop && await shouldStop()) {
      stopped = true;
      break;
    }
    const row = rows[idx];
    const originData = { ...(row.fixedData || {}), ...(row.dynamicData || {}) };
    try {
      const fixedData = row.fixedData || {};
      const dynamicData = row.dynamicData || {};
      try {
        const priceFlags = await dynamicUtils.resolveTablePrices({ ...fixedData, ...dynamicData }, dynamicData, confirmTableDefs);
        if (priceFlags.length > 0) confirmWarnDetails.push({ row: row.rowNumber || '?', warnings: priceFlags });
      } catch { /* silent */ }
      const keptPost = {};
      postFormulaKeys.forEach(k => {
        if (keepProvidedPost.has(k) && dynamicData[k] !== undefined && dynamicData[k] !== null && dynamicData[k] !== '') {
          keptPost[k] = dynamicData[k];
        }
        delete dynamicData[k];
      });
      if (entity === 'stations' && keptPost.loai_uu_tien !== undefined) {
        const n = Number(keptPost.loai_uu_tien);
        if (n !== 1 && n !== 2) throw new Error(`Loại ưu tiên không hợp lệ "${keptPost.loai_uu_tien}" (chấp nhận 1 hoặc 2)`);
        keptPost.loai_uu_tien = n;
      }

      if (entity === 'stations' || entity === 'station_proposals') {
        const coordErr = validateLatitude(fixedData.latitude) || validateLongitude(fixedData.longitude);
        if (coordErr) throw new Error(coordErr);
      }
      if (entity === 'station_proposals' || entity === 'stations') {
        const lat = parseFloat(fixedData.latitude);
        const lng = parseFloat(fixedData.longitude);
        const rowWarns = [];
        if (checkDuplicate) {
          const opts = entity === 'stations' ? { kinds: ['station'] } : {};
          const nearby = await proximityService.checkNearby(lat, lng, 200, null, opts);
          if (nearby.is_duplicate) {
            const n = nearby.nearest;
            const who = n.kind === 'station' ? 'trạm' : 'đề xuất';
            const label = n.name ? ` "${n.name}"` : (n.code ? ` "${n.code}"` : '');
            rowWarns.push(`Vị trí gần với ${who} #${n.id}${label} (cách ${n.distance_m}m < 200m)`);
          }
        }
        if (checkIntraFile) {
          for (const c of insertedCoords) {
            if (proximityService.haversineM(lat, lng, c.lat, c.lng) < 200) {
              rowWarns.push(`Vị trí gần với dòng ${c.row} trong cùng file import (< 200m)`);
              break;
            }
          }
        }
        if (rowWarns.length > 0) confirmWarnDetails.push({ row: row.rowNumber || '?', warnings: rowWarns });
        insertedCoords.push({ lat, lng, row: row.rowNumber });
      }
      if (entity === 'stations') {
        const code = dynamicData.ma_tram;
        if (code) {
          const [dup] = await pool.query(
            `SELECT id FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) = ? LIMIT 1`,
            [code]
          );
          let pendingDup = [];
          if (dup.length === 0) {
            [pendingDup] = await pool.query(
              'SELECT id FROM station_proposals WHERE pending_station_code = ? LIMIT 1',
              [code]
            );
          }
          if (dup.length > 0 || pendingDup.length > 0 || usedCodes.has(code)) throw new Error(`Mã trạm "${code}" đã tồn tại, không cho import`);
          usedCodes.add(code);
        }
      }
      if (entity === 'users') {
        const uErr = validateRequired(fixedData.full_name, 'Họ tên') || validateEmail(fixedData.email);
        if (uErr) throw new Error(uErr);
      }

      if (entity === 'station_proposals' || entity === 'stations') {
        if (!skipGeocode && process.env.GEOCODE_ON_IMPORT !== 'false') {
          await addressEnrichment.enrichDynamicData({ dynamicData, fixedData }).catch(() => {});
        }
        const provinceEmpty = !dynamicData.province || String(dynamicData.province).trim() === '';
        if (provinceEmpty && !dynamicData.ma_tinh) {
          await addressEnrichment.extractProvinceFromAddress({ dynamicData, fixedData }).catch(() => {});
        }
        if (dynamicData.province && String(dynamicData.province).trim() !== '') {
          await dataListService.applyDiaGioi(dynamicData);
        } else if (!dynamicData.ma_tinh) {
          console.warn(`[Import] Dòng ${row.rowNumber}: Không xác định được tỉnh/thành từ toạ độ và địa chỉ. Import bỏ qua.`);
        }
      }

      if (entity === 'station_proposals' && user && user.id) {
        fixedData.user_id = user.id;
        await dynamicUtils.applyAutoUserFields(dynamicData, proposalFieldDefs, user.id, null);
      }

      if (entity === 'users') {
        if (fixedData.password && String(fixedData.password).trim() !== '') {
          const salt = await bcrypt.genSalt(10);
          fixedData.password = await bcrypt.hash(String(fixedData.password), salt);
        } else {
          if (!defaultUserPasswordHash) {
            const salt = await bcrypt.genSalt(10);
            defaultUserPasswordHash = await bcrypt.hash('123456', salt);
          }
          fixedData.password = defaultUserPasswordHash;
        }
        if (!fixedData.role) fixedData.role = 'CTV';
        if (!fixedData.status) fixedData.status = 'ACTIVE';
        if (fixedData.role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
          throw new Error('Không được import tài khoản Super Admin');
        }
        if (fixedData.external_id !== undefined && String(fixedData.external_id).trim() === '') {
          delete fixedData.external_id;
        }
      }

      if (entity === 'station_proposals') {
        if (fixedData.owner_name == null) fixedData.owner_name = '';
        if (fixedData.owner_phone == null) fixedData.owner_phone = '';
      }
      if (entity === 'stations') {
        if (fixedData.name == null) fixedData.name = '';
      }

      const fixedCols = Object.keys(fixedData);
      const fixedValues = Object.values(fixedData);

      if (fixedCols.length === 0) {
        failed++;
        failDetails.push({ row: row.rowNumber || '?', data: originData, error: 'Không có dữ liệu cột cố định' });
        processed++;
      } else {
        const placeholders = fixedCols.map(() => '?').join(', ');
        const [result] = await pool.query(
          `INSERT INTO ${table} (${fixedCols.join(', ')}) VALUES (${placeholders})`,
          fixedValues
        );
        if (entity === 'station_proposals') {
          await pool.query(
            'UPDATE station_proposals SET supplement_deadline_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
            [importSupplementMinutes, result.insertId]
          );
        }

        const postResults = await dynamicEngineService.computePostFormulas(entity, result.insertId, dynamicData, user ? user.id : null, null, { excludeKeys: Object.keys(keptPost) });
        const mergedDynamic = { ...dynamicData, ...postResults, ...keptPost };
        if (Object.keys(mergedDynamic).length > 0) {
          await pool.query(
            `UPDATE ${table} SET custom_data = ? WHERE id = ?`,
            [JSON.stringify(mergedDynamic), result.insertId]
          );
        }

        if (entity === 'station_proposals') {
          createdProposalIds.push(result.insertId);
        }
        createdIds.push(result.insertId);

        imported++;
        processed++;
      }
    } catch (err) {
      failed++;
      processed++;
      failDetails.push({ row: row.rowNumber || '?', data: originData, error: err.message });
    }
    if (onProgress && (processed % PROGRESS_EVERY === 0 || processed === rows.length)) {
      try { await onProgress({ done: processed, imported, failed }); } catch { /* silent */ }
    }
  }

  let pendingRows = [];
  if (stopped) {
    pendingRows = rows.slice(processed).map((r) => ({
      row: r.rowNumber || '?',
      data: { ...(r.fixedData || {}), ...(r.dynamicData || {}) }
    }));
  }
  const pending = rows.length - processed;

  if (entity === 'stations' && imported > 0) {
    const [codeRows] = await pool.query(
      `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) AS code FROM stations WHERE JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_tram')) IS NOT NULL`
    );
    const maxByPrefix = {};
    const formulaService = require('./formulaService');
    for (const r of codeRows) {
      const parsed = formulaService.parseCodeToSeq(r.code);
      if (!parsed) continue;
      maxByPrefix[parsed.prefix] = Math.max(maxByPrefix[parsed.prefix] || 0, parsed.num);
    }
    for (const [prefix, max] of Object.entries(maxByPrefix)) {
      await pool.query(
        'INSERT INTO proposal_sequences (prefix, last_number) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_number = GREATEST(last_number, VALUES(last_number))',
        [prefix, max]
      );
    }
  }

  if (entity === 'station_proposals' && createdProposalIds.length > 0) {
    const proposalLifecycle = require('./proposalLifecycle');
    for (const pid of createdProposalIds) {
      try {
        await proposalLifecycle.logActivity({
          proposalId: pid, action: 'created', fromStatus: null, toStatus: 'PENDING',
          actorId: user ? user.id : null,
          actorRole: user ? user.role : null,
          source: 'import', ip: ip || null
        });
      } catch { /* silent */ }
    }
  }

  let status = 'done';
  if (stopped) status = 'cancelled';
  else if (failed >= rows.length) status = 'failed';
  else if (failed > 0) status = 'partial';

  console.log(`[Import] runner ${entity} job=${jobId}: ${status} imported=${imported} failed=${failed} pending=${pending} in ${Date.now() - startedAt}ms`);

  return {
    status,
    imported,
    failed,
    pending,
    failedRows: failDetails,
    failedTruncated: failDetails.length > 2000,
    pendingRows,
    pendingTruncated: pendingRows.length > 2000,
    successIds: createdIds,
    warnDetails: confirmWarnDetails,
    error: null
  };
};

exports.ENTITY_TABLE_MAP = ENTITY_TABLE_MAP;
