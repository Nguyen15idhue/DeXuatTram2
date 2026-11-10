const pool = require('../utils/db');
const documents = require('../services/proposalReportDocumentService');

let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.proposal_id, d.created_by
       FROM proposal_report_documents d
       JOIN station_proposals p ON p.id=d.proposal_id
       WHERE d.is_current=1 AND p.status='PROPOSAL_REPORT_REVIEWING'
         AND d.signed_file_id IS NULL AND d.pdf_file_id IS NULL
         AND (d.conversion_status='PENDING'
           OR (d.conversion_status='PROCESSING' AND d.updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)))
         AND NOT EXISTS (SELECT 1 FROM proposal_signature_configs s
           WHERE s.proposal_id=d.proposal_id AND s.status<>'CANCELLED'
             AND (s.document_id=d.id OR s.file_id=d.signing_file_id))
       ORDER BY d.id LIMIT 10`
    );
    for (const row of rows) {
      try {
        await documents.convertInBackground({
          proposalId: row.proposal_id, documentId: row.id,
          user: { id: row.created_by || null },
        });
      } catch (error) {
        console.error(`[ReportConversionWorker] document #${row.id}:`, error);
      }
    }
  } finally {
    running = false;
  }
};

const start = async () => {
  if (timer) return;
  timer = setInterval(() => tick().catch((error) => console.error('[ReportConversionWorker]', error)), 3000);
  timer.unref();
  await tick();
};

const stop = () => { if (timer) clearInterval(timer); timer = null; };
module.exports = { tick, start, stop };
