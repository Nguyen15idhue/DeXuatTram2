const pool = require('../utils/db');
const consultation = require('../services/leadConsultationService');
const calendarService = require('../services/businessCalendarService');
const { isGdtt } = require('../constants/salesRanks');

let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    let batch;
    do { batch = await consultation.backfill(); } while (batch === 200);
    const [candidates] = await pool.query(
      `SELECT id FROM leads WHERE consultation_status = 'WAITING_FIRST_CONTACT'
       AND first_contact_deadline_at > NOW() AND first_contact_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM lead_consultation_notifications n
         WHERE n.lead_id = leads.id AND n.consultation_round = leads.consultation_round)`);
    for (const candidate of candidates) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [[lead]] = await conn.query('SELECT * FROM leads WHERE id = ? FOR UPDATE', [candidate.id]);
        if (!lead || lead.consultation_status !== 'WAITING_FIRST_CONTACT' || lead.first_contact_at) {
          await conn.rollback();
          continue;
        }
        const now = new Date();
        const deadline = new Date(lead.first_contact_deadline_at);
        const calendar = await calendarService.getCalendarById(lead.consultation_calendar_id, conn);
        const remaining = calendarService.workingMinutesBetween(now, deadline, calendar);
        if (deadline <= now || remaining > 60) {
          await conn.rollback();
          continue;
        }
        const [claim] = await conn.query(
          'INSERT IGNORE INTO lead_consultation_notifications (lead_id, consultation_round) VALUES (?, ?)',
          [lead.id, lead.consultation_round]);
        if (!claim.affectedRows) {
          await conn.rollback();
          continue;
        }
        const [users] = await conn.query("SELECT id, custom_data FROM users WHERE status = 'ACTIVE' ORDER BY id");
        const recipients = new Set([Number(lead.assigned_user_id)]);
        for (const user of users) {
          const cd = typeof user.custom_data === 'string' ? JSON.parse(user.custom_data) : user.custom_data || {};
          if (cd.department === lead.assigned_department && isGdtt(cd.chuc_vu, cd.department)) recipients.add(Number(user.id));
        }
        for (const recipient of recipients) {
          if (!recipient) continue;
          await conn.query(
            `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, is_read)
             VALUES (?, 'LEAD_FIRST_CONTACT_WARNING', 'Khách hàng sắp hết hạn tư vấn lần đầu', ?, 'leads', ?, 0)`,
            [recipient, `Khách hàng ${lead.lead_code || `#${lead.id}`} còn không quá 1 giờ làm việc để tư vấn lần đầu.`, lead.id]);
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        console.error(`[LeadConsultationWorker] lead #${candidate.id}:`, error);
      } finally {
        conn.release();
      }
    }
  } finally {
    running = false;
  }
};

const start = async () => {
  if (timer) return;
  await tick();
  timer = setInterval(() => tick().catch((error) => console.error('[LeadConsultationWorker]', error)), 60000);
  timer.unref();
};

const stop = () => { if (timer) clearInterval(timer); timer = null; };
module.exports = { tick, start, stop };
