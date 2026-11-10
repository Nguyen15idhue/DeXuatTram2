const documents = require('../services/proposalReportDocumentService');
const pool = require('../utils/db');

const respond = (handler) => async (req, res) => {
  try {
    if (req.baseUrl === '/api/my-proposals') {
      const [rows] = await pool.query('SELECT user_id FROM station_proposals WHERE id=?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
      if (Number(rows[0].user_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Bạn không phải chủ đề xuất' });
      }
    }
    const data = await handler(req);
    res.json({ success: true, data: { documents: data } });
  } catch (error) {
    console.error('[ReportDocument] Request failed:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Không xử lý được tài liệu BCĐX' });
  }
};

exports.list = respond(async req => {
  await documents.assertAccess(req.params.id, req.user);
  return documents.listDocuments(req.params.id);
});

exports.prepare = respond(req => documents.prepareDocuments({
  proposalId: req.params.id, files: req.body?.files, user: req.user, ip: req.ip
}));

exports.convert = respond(async req => {
  await documents.convertDocument({
    proposalId: req.params.id, documentId: req.params.documentId, user: req.user, ip: req.ip
  });
  const [rows] = await pool.query('SELECT id,is_current FROM proposal_report_documents WHERE id=? AND proposal_id=?',
    [req.params.documentId, req.params.id]);
  return documents.listDocuments(req.params.id, {
    initializeLegacy: false, ...(rows[0]?.is_current ? {} : { ids: [Number(req.params.documentId)] })
  });
});
