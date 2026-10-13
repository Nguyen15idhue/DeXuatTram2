import { queueLogService } from '../services/api';

export const parseJobPayload = (job) => {
  if (!job) return {};
  const p = job.response_payload;
  if (!p) return {};
  if (typeof p === 'object') return p;
  try { return JSON.parse(p); } catch { return {}; }
};

export const collectSkippedFiles = (jobs) => {
  const out = [];
  (jobs || []).forEach(j => {
    const p = parseJobPayload(j);
    const skipped = (p.files && p.files.skipped) || [];
    skipped.forEach(f => out.push(`#${j.entity_id || '?'}: ${(f && f.name) || f}${f && f.reason ? ` (${f.reason})` : ''}`));
  });
  return out;
};

export const collectStaleFiles = (jobs) => {
  const out = [];
  (jobs || []).forEach(j => {
    const p = parseJobPayload(j);
    const stale = (p.files && p.files.stale) || [];
    stale.forEach(name => out.push(`#${j.entity_id || '?'}: ${name || '?'}`));
  });
  return out;
};

export const buildPushDoneMessage = (jobs) => {
  const ok = jobs.filter(j => j.status === 'completed').length;
  const bad = jobs.filter(j => j.status !== 'completed').length;
  const skipped = collectSkippedFiles(jobs);
  const stale = collectStaleFiles(jobs);
  let msg = ok > 0 ? 'Đẩy sang 1Office thành công' : `Đẩy sang 1Office thất bại (${bad}) — xem Audit Log để Retry`;
  if (skipped.length > 0) msg += ` — ${skipped.length} file bị bỏ qua: ${skipped.slice(0, 3).join('; ')}${skipped.length > 3 ? '…' : ''}`;
  if (stale.length > 0) msg += ` — ${stale.length} file cũ vẫn còn trên 1Office (API 1Office không hỗ trợ xóa file)`;
  const type = ok > 0 ? ((skipped.length > 0 || stale.length > 0) ? 'warning' : 'success') : 'error';
  return { msg, type };
};

export function pollSyncJobs({ jobIds, token, onDone, onTimeout, intervalMs = 3000, maxAttempts = 30 }) {
  if (!jobIds || jobIds.length === 0) return null;
  let attempts = 0;
  let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  timer = setInterval(async () => {
    attempts++;
    try {
      const jobs = [];
      for (const jid of jobIds) {
        const r = await queueLogService.getById(jid, token);
        if (r.success && r.data) jobs.push(r.data);
      }
      const done = jobs.length === jobIds.length && jobs.every(j => ['completed', 'failed', 'cancelled'].includes(j.status));
      if (done) {
        stop();
        onDone(jobs);
      } else if (attempts >= maxAttempts) {
        stop();
        if (onTimeout) onTimeout();
      }
    } catch {
      stop();
    }
  }, intervalMs);
  return timer;
}
