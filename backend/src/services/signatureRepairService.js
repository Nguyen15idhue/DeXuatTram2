const fs = require('fs/promises');
const pool = require('../utils/db');
const snapshots = require('./signatureSnapshotService');
const signedDocuments = require('./signedDocumentService');

const error = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const validate = ({ user, id, configId }) => {
  if (user?.role !== 'SUPER_ADMIN') throw error('Chỉ SUPER_ADMIN được phục hồi ảnh chữ ký', 403);
  if (![id, configId].every(value => Number.isSafeInteger(Number(value)) && Number(value) > 0)) {
    throw error('Đề xuất hoặc ô ký không hợp lệ', 400);
  }
};

const load = async (id, configId, executor, lock = false) => {
  const [rows] = await executor.query(
    `SELECT c.*, p.status AS proposal_status, p.signed_file_id AS proposal_signed_file_id,
       d.signed_file_id AS document_signed_file_id, d.id AS current_document_id, d.is_current
     FROM proposal_signature_configs c
     JOIN station_proposals p ON p.id = c.proposal_id
     LEFT JOIN proposal_report_documents d ON d.proposal_id = c.proposal_id
       AND (d.id = c.document_id OR (c.document_id IS NULL AND d.signing_file_id = c.file_id))
     WHERE c.id = ? AND c.proposal_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [configId, id]
  );
  if (!rows.length) throw error('Không tìm thấy ô ký của đề xuất', 404);
  return rows[0];
};

const eligible = async (config, executor) => {
  if (config.proposal_status !== 'SIGNATURE_PENDING' || config.proposal_signed_file_id
    || config.document_signed_file_id || !config.current_document_id || !config.is_current
    || config.status !== 'SIGNED' || !config.signature_id || !config.signed_at) return false;
  if (await snapshots.read(config.id)) return false;
  const [rows] = await executor.query('SELECT file_path FROM signatures WHERE id = ?', [config.signature_id]);
  if (!rows[0]?.file_path) return true;
  try {
    await fs.access(rows[0].file_path);
    return false;
  } catch (cause) {
    if (cause.code === 'ENOENT') return true;
    throw cause;
  }
};

exports.getStatus = async (args) => {
  validate(args);
  const config = await load(args.id, args.configId, pool);
  const canRepair = await eligible(config, pool);
  const [logs] = await pool.query(
    `SELECT created_at FROM proposal_activity_logs
     WHERE proposal_id = ? AND action = 'signature_image_repaired'
       AND JSON_UNQUOTE(JSON_EXTRACT(changed_fields, '$.config_id.new')) = ?
     ORDER BY id DESC LIMIT 1`, [args.id, String(args.configId)]
  );
  return { can_repair: canRepair, repaired_at: logs[0]?.created_at || null };
};

exports.repair = async (args) => {
  validate(args);
  const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
  if (!reason || reason.length > 2000) throw error('Vui lòng nhập lý do phục hồi (tối đa 2000 ký tự)', 400);
  return require('./proposalSignatureService')._internals.withSignatureMutationLock(args.id, async connection => {
    await connection.beginTransaction();
    try {
      const initial = await load(args.id, args.configId, connection);
      await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [initial.user_id]);
      const config = await load(args.id, args.configId, connection, true);
      if (!await eligible(config, connection)) {
        throw error('Chỉ phục hồi ô đã ký mất ảnh, chưa có bản chụp và chưa có file BCĐX hoàn chỉnh', 409);
      }
      const [current] = await connection.query(
        'SELECT id FROM signatures WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1', [config.user_id]
      );
      if (!current.length) throw error('Người ký chưa có chữ ký hồ sơ hiện tại', 400);
      const image = await signedDocuments.validateSignature(current[0].id);
      await snapshots.save(config.id, image.bytes, connection);
      await require('./proposalLifecycle').logActivity({
        proposalId: Number(args.id), action: 'signature_image_repaired',
        fromStatus: config.proposal_status, toStatus: config.proposal_status,
        reason, actorId: args.user.id, actorRole: args.user.role, source: 'user',
        manualOverride: true, ip: args.ip, connection,
        changedFields: {
          config_id: { label: 'Ô ký phục hồi', old: null, new: config.id },
          signature_source: { label: 'Ảnh mới thay cho ảnh lịch sử bị mất', old: config.signature_id, new: current[0].id },
          signer_id: { label: 'Người ký', old: config.user_id, new: config.user_id },
          signed_at: { label: 'Thời điểm ký gốc (giữ nguyên)', old: config.signed_at, new: config.signed_at }
        }
      });
      await connection.commit();
      return { config_id: config.id, source_signature_id: current[0].id };
    } catch (cause) {
      await connection.rollback();
      throw cause;
    }
  });
};
