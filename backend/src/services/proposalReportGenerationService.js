// backend/src/services/proposalReportGenerationService.js
// Tu dong tao BCĐX tu mau document_templates (entity=proposal_report).
const pool = require('../utils/db');
const path = require('path');
const fs = require('fs');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const documentService = require('./documentService');
const documentTemplateService = require('./documentTemplateService');
const documentSignatureBoxService = require('./documentSignatureBoxService');
const fileService = require('./fileService');
const libreOfficeService = require('./libreOfficeService');
const proposalSignatureService = require('./proposalSignatureService');

const err = (msg, code) => { const e = new Error(msg); e.statusCode = code || 400; return e; };

const loadProposal = async (id) => {
  const [rows] = await pool.query('SELECT * FROM station_proposals WHERE id = ? LIMIT 1', [id]);
  if (rows.length === 0) throw err('Không tìm thấy đề xuất', 404);
  return rows[0];
};

const resolveSigner = async (signerCfg) => {
  // Returns { userId, fullName, title, department } or null if invalid.
  const source = signerCfg.source;
  if (source === 'fixed_user') {
    const [rows] = await pool.query('SELECT id, full_name, status, custom_data FROM users WHERE id = ? LIMIT 1', [signerCfg.userId]);
    if (rows.length === 0 || rows[0].status !== 'ACTIVE') return null;
    const cd = (() => { try { return JSON.parse(rows[0].custom_data || '{}'); } catch { return {}; } })();
    return { userId: rows[0].id, fullName: rows[0].full_name, title: signerCfg.title || cd.chuc_vu || '', department: cd.department || '' };
  }
  // proposal.owner / proposal.region_gdttkd resolved by caller with proposal context
  return null;
};

const generate = async ({ proposalId, templateId, user, ip } = {}) => {
  const proposal = await loadProposal(proposalId);
  const reports = require('./proposalReportService');
  const scope = await reports.resolveScope(user);
  if (!await reports.canUploadReport(scope, proposal)) {
    throw err('Bạn không có quyền tạo tờ trình BCĐX cho đề xuất này', 403);
  }
  // Parse chot_so_luong_tru if string
  if (typeof proposal.chot_so_luong_tru === 'string') {
    try { proposal.chot_so_luong_tru = JSON.parse(proposal.chot_so_luong_tru); } catch { proposal.chot_so_luong_tru = []; }
  }
  if (!Array.isArray(proposal.chot_so_luong_tru)) proposal.chot_so_luong_tru = [];

  // Enrich chot rows with stt, don_vi, gia_niem_yet, gia_uu_dai, ghi_chu
  const [priceRows] = await pool.query('SELECT data FROM data_list_rows WHERE list_id = 18');
  const priceMap = new Map();
  priceRows.forEach((r) => {
    const d = typeof r.data === 'string' ? (function(){ try { return JSON.parse(r.data); } catch { return {}; } })() : (r.data || {});
    if (d.ten) {
      const gia = Number(d.gia);
      const giaUuDai = d.gia_uu_dai !== undefined && d.gia_uu_dai !== null && d.gia_uu_dai !== '' ? Number(d.gia_uu_dai) : gia;
      priceMap.set(String(d.ten), { gia: Number.isFinite(gia) ? gia : 0, gia_uu_dai: Number.isFinite(giaUuDai) ? giaUuDai : gia });
    }
  });

  proposal.chot_so_luong_tru = proposal.chot_so_luong_tru.map((row, idx) => {
    const loaiTru = String(row.loai_tru || '').trim();
    const priceInfo = priceMap.get(loaiTru) || { gia: Number(row.gia_chot) || 0, gia_uu_dai: Number(row.gia_chot) || 0 };
    return {
      ...row,
      stt: idx + 1,
      don_vi: 'Trụ',
      gia_niem_yet: row.gia_niem_yet || priceInfo.gia,
      gia_uu_dai: row.gia_uu_dai || priceInfo.gia_uu_dai,
      ghi_chu: row.ghi_chu || '',
    };
  });
  let template;
  try {
    template = await documentService.resolveTemplate(model, templateId, 'proposal_report');
  } catch (e) {
    try {
      template = await documentService.resolveTemplate(model, templateId, 'station_proposals');
    } catch (e2) {
      throw err('Chưa cấu hình template BCĐX cho mô hình ' + (model || '(trống)'), 400);
    }
  }

  const mapping = template.mapping || {};
  const { data, loopInfos } = await documentService.buildData(proposal, mapping);

  // read docx
  const { zip } = await documentTemplateService.readDocxXml(template.file_id);

  // strip empty loops
  for (const [loopKey, cfg] of Object.entries(mapping.loops || {})) {
    if (cfg && cfg.render && cfg.render.empty === 'hide' && (loopInfos[loopKey] || { count: 0 }).count === 0) {
      // reuse stripEmptyLoopRow from documentService? not exported; skip for v1
    }
  }

  const doc = new (require('docxtemplater'))(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  try {
    doc.render(data);
  } catch (e) {
    const details = e && e.properties && Array.isArray(e.properties.errors)
      ? e.properties.errors.map((x) => x.message || String(x)).join('; ')
      : (e && e.message) || 'Lỗi render template';
    throw Object.assign(new Error(details), { statusCode: 400 });
  }

  let xml = doc.getZip().file('word/document.xml').asText();

  // Replace anchors with boxes
  let anchors = Array.isArray(mapping.signatureAnchors) ? mapping.signatureAnchors : [];
  if (anchors.length === 0) {
    const tokenRe = /{sig_[a-zA-Z0-9_]+}/g;
    const found = new Set();
    let m;
    while ((m = tokenRe.exec(xml)) !== null) found.add(m[0]);
    anchors = [...found].map((tok, idx) => ({ token: tok, slot: idx + 1 }));
  }
  let signers = Array.isArray(mapping.signers) ? mapping.signers : [];
  if (signers.length === 0 && anchors.length > 0) {
    signers = anchors.map((a) => ({
      slot: a.slot,
      role: a.slot === 1 ? 'proposer' : (a.slot === 2 ? 'gdttkd' : 'tgd'),
      source: a.slot === 1 ? 'proposal.owner' : (a.slot === 2 ? 'proposal.region_gdttkd' : 'fixed_user'),
      title: a.slot === 1 ? 'Người đề xuất' : (a.slot === 2 ? 'GĐTTKD' : 'Tổng giám đốc'),
      userId: a.slot === 3 ? 1 : undefined,
    }));
  }
  const boxCfg = mapping.signatureBox || { width: 0.30, height: 0.08 };
  const boxW = Math.round((boxCfg.width || 0.30) * 567 * 2.5); // rough twips (A4 ~ 567 twips/cm, 2.5cm? use 0.3 of page width)
  const boxH = Math.round((boxCfg.height || 0.08) * 1000);

  const signerBySlot = {};
  for (const s of signers) signerBySlot[s.slot] = s;

  for (const anchor of anchors) {
    const slot = anchor.slot;
    const signerCfg = signerBySlot[slot] || {};
    // resolve signer user
    let signer = null;
    if (signerCfg.source === 'fixed_user') {
      signer = await resolveSigner(signerCfg);
    } else if (signerCfg.source === 'proposal.owner') {
      // resolve from proposal owner
      const [urows] = await pool.query('SELECT id, full_name, status, custom_data FROM users WHERE id = ? LIMIT 1', [proposal.user_id]);
      if (urows.length && urows[0].status === 'ACTIVE') {
        const cd = (() => { try { return JSON.parse(urows[0].custom_data || '{}'); } catch { return {}; } })();
        signer = { userId: urows[0].id, fullName: urows[0].full_name, title: signerCfg.title || cd.chuc_vu || '', department: cd.department || '' };
      }
    } else if (signerCfg.source === 'proposal.region_gdttkd') {
      // resolve GĐTTKD by region — reuse findGdttkdByDepartment via crmInboundService
      try {
        const crmInbound = require('./crmInboundService');
        const geo = { region: proposal.region || proposal.vung_mien };
        // find department by region via leadService
        const leadService = require('./leadService');
        const department = await leadService.getRoutingDepartment(proposal.region || proposal.vung_mien, pool);
        if (department) {
          const gdttkd = await crmInbound.findGdttkdByDepartment(department, pool);
          if (gdttkd && gdttkd.status === 'ACTIVE') {
            const cd = (() => { try { return JSON.parse(gdttkd.custom_data || '{}'); } catch { return {}; } })();
            signer = { userId: gdttkd.id, fullName: gdttkd.full_name, title: signerCfg.title || cd.chuc_vu || '', department: cd.department || '' };
          }
        }
      } catch (e) { console.error('[gen] gdttkd resolve failed:', e.message); }
    }

    const boxText = signer ? `Ký: ${signer.fullName}` : `Ký: (chưa có người ký)`;
    xml = documentSignatureBoxService.replaceAnchorWithBox(xml, anchor.token, boxText, boxW, boxH);

    // Create signature config row
    try {
      await pool.query(
        `INSERT INTO proposal_signature_configs (proposal_id, file_id, user_id, signer_title, signer_department, anchor_token, page, pos_x, pos_y, box_width, box_height, status)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 'PENDING')`,
        [proposal.id, null, signer ? signer.userId : null, signer ? signer.title : (signerCfg.title || ''), signer ? signer.department : '', anchor.token, boxCfg.width || 0.30, boxCfg.height || 0.08]
      );
    } catch (e) { console.error('[gen] signature config insert failed:', e.message); }
  }

  // regenerate docx with box
  const newZip = new PizZip(doc.getZip().generate({ type: 'nodebuffer' }));
  // replace document.xml
  newZip.file('word/document.xml', xml);
  const docxBuffer = newZip.generate({ type: 'nodebuffer' });

  // convert to pdf
  let pdfBuffer = null;
  try {
    const conv = await libreOfficeService.convertToPdf(docxBuffer, '.docx');
    pdfBuffer = conv.pdfBuffer;
  } catch (e) { console.error('[gen] pdf convert failed:', e.message); }

  // save files
  const uploadDir = path.join(__dirname, '../../storage/uploads');
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dir = path.join(uploadDir, `${dd}-${mm}-${yyyy}`);
  fs.mkdirSync(dir, { recursive: true });

  const saveFile = async (buf, name, mime) => {
    const storageKey = `${dd}-${mm}-${yyyy}/gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(name)}`;
    const fullPath = path.join(uploadDir, storageKey);
    fs.writeFileSync(fullPath, buf);
    const [result] = await pool.query(
      `INSERT INTO files (original_name, storage_key, mime_type, size, checksum, uploaded_by, submitter_ip, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, storageKey.replace(/\\/g, '/'), mime, buf.length, null, user ? user.id : null, null, 'active']
    );
    const [rows] = await pool.query('SELECT * FROM files WHERE id = ?', [result.insertId]);
    return rows[0];
  };

  const docxFile = await saveFile(docxBuffer, `BCDX_${proposal.ma_de_xuat || proposal.id}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  let pdfFile = null;
  if (pdfBuffer) pdfFile = await saveFile(pdfBuffer, `BCDX_${proposal.ma_de_xuat || proposal.id}.pdf`, 'application/pdf');

  // update proposal custom_data (file_bc_dx) + bc_dx_template_id/generated_at
  const custom = (() => { try { return JSON.parse(proposal.custom_data || '{}'); } catch { return {}; } })();
  custom.file_bc_dx = [{ id: docxFile.id, original_name: docxFile.original_name, mime_type: docxFile.mime_type }];
  if (pdfFile) custom.file_bc_dx_pdf = [{ id: pdfFile.id, original_name: pdfFile.original_name, mime_type: pdfFile.mime_type }];

  await pool.query(
    `UPDATE station_proposals SET custom_data = ?, bc_dx_template_id = ?, bc_dx_generated_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [JSON.stringify(custom), template.id, proposal.id]
  );

  // update signature config file_id
  if (docxFile) {
    await pool.query('UPDATE proposal_signature_configs SET file_id = ? WHERE proposal_id = ? AND file_id IS NULL', [docxFile.id, proposal.id]);
  }

  // log activity
  try {
    const proposalActivity = require('./proposalActivityService');
    await proposalActivity.logActivity({ proposalId: proposal.id, action: 'report_generated', fromStatus: proposal.status, toStatus: proposal.status, actorId: user ? user.id : null, actorRole: user ? user.role : 'SYSTEM', ip });
  } catch (e) { console.error('[gen] activity log failed:', e.message); }

  return { docxFile, pdfFile, templateId: template.id };
};

exports.generate = generate;
