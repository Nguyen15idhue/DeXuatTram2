import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../../components/ui/PageHeader';

const AdminCrmPage = () => {
  const { token } = useAuth();
  const [tab, setTab] = useState('config');
  const [config, setConfig] = useState(null);
  const [outbox, setOutbox] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logPagination, setLogPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [logFilter, setLogFilter] = useState({ direction: '', status: '', lead_id: '', crm_lead_id: '', date_from: '', date_to: '' });
  const [logDetail, setLogDetail] = useState(null);
  const [outboxDetail, setOutboxDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const viewOutboxDetail = async (id) => {
    const res = await fetch(`/api/admin/crm/outbox/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setOutboxDetail(res.data);
  };

  const cancelOutbox = async (id) => {
    await fetch(`/api/admin/crm/outbox/${id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    await loadOutbox();
  };

  const loadConfig = async () => {
    try {
      const cfgRes = await fetch('/api/admin/crm/config', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setConfig(cfgRes.data);
    } catch (e) { console.error(e); }
  };

  const loadOutbox = async () => {
    try {
      const obRes = await fetch('/api/admin/crm/outbox?limit=50', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setOutbox(obRes.data || []);
    } catch (e) { console.error(e); }
  };

  const loadLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(logPagination.limit) });
      if (logFilter.direction) params.set('direction', logFilter.direction);
      if (logFilter.status) params.set('status', logFilter.status);
      if (logFilter.lead_id) params.set('lead_id', logFilter.lead_id);
      if (logFilter.crm_lead_id) params.set('crm_lead_id', logFilter.crm_lead_id);
      if (logFilter.date_from) params.set('date_from', logFilter.date_from);
      if (logFilter.date_to) params.set('date_to', logFilter.date_to);
      const res = await fetch(`/api/admin/crm/logs?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setLogs(res.data || []);
      setLogPagination(res.pagination || { page, limit: logPagination.limit, total: 0, totalPages: 0 });
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      await loadConfig();
      await loadOutbox();
      await loadLogs(1);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) load(); }, [token]);

  const syncNow = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/crm/sync-now', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      alert(JSON.stringify(res.data));
      await load();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const testWebhook = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/crm/test-webhook', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setTestResult(res);
    } catch (e) { setTestResult({ success: false, message: e.message }); } finally { setLoading(false); }
  };

  const retry = async (id) => {
    await fetch(`/api/admin/crm/outbox/${id}/retry`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    await loadOutbox();
  };

  const retryAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/crm/outbox/retry-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      alert(res.message || 'Done');
      await loadOutbox();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const viewLogDetail = async (id) => {
    const res = await fetch(`/api/admin/crm/logs/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setLogDetail(res.data);
  };

  const exportLogs = () => {
    const params = new URLSearchParams();
    if (logFilter.direction) params.set('direction', logFilter.direction);
    if (logFilter.status) params.set('status', logFilter.status);
    if (logFilter.lead_id) params.set('lead_id', logFilter.lead_id);
    if (logFilter.crm_lead_id) params.set('crm_lead_id', logFilter.crm_lead_id);
    if (logFilter.date_from) params.set('date_from', logFilter.date_from);
    if (logFilter.date_to) params.set('date_to', logFilter.date_to);
    window.open(`/api/admin/crm/logs/export?${params.toString()}`, '_blank');
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Tích hợp TMT CRM" />
      <div className="tabs tabs-bordered mb-4">
        <button className={`tab ${tab === 'config' ? 'tab-active' : ''}`} onClick={() => setTab('config')}>Cấu hình</button>
        <button className={`tab ${tab === 'outbox' ? 'tab-active' : ''}`} onClick={() => setTab('outbox')}>Outbox</button>
        <button className={`tab ${tab === 'logs' ? 'tab-active' : ''}`} onClick={() => { setTab('logs'); loadLogs(1); }}>Nhật ký webhook</button>
      </div>

      {tab === 'config' && (
        <div className="card bg-base-100 shadow p-4">
          <h3 className="font-semibold mb-2">Cấu hình</h3>
          {config ? (
            <div className="text-sm space-y-1">
              <div>Inbound: {config.inbound.configured ? '✅' : '❌'} {config.inbound.message}</div>
              <div>Outbound: {config.outbound.configured ? '✅' : '❌'} {config.outbound.message}</div>
              <div className="mt-2">API Key: {config.env.TMT_CRM_API_KEY ? '✅' : '❌'} | Webhook URL: {config.env.TMT_CRM_WEBHOOK_URL ? '✅' : '❌'} | Secret: {config.env.TMT_CRM_WEBHOOK_SECRET ? '✅' : '❌'}</div>
              <div>IPs: {config.env.CRM_WEBHOOK_IPS || '(không whitelist)'}</div>
            </div>
          ) : 'Đang tải...'}
          <div className="flex gap-2 mt-3">
            <button className="btn btn-sm btn-primary" onClick={syncNow} disabled={loading}>Sync ngay</button>
            <button className="btn btn-sm btn-outline" onClick={testWebhook} disabled={loading}>Test webhook</button>
          </div>
          {testResult && (
            <div className={`alert text-sm mt-3 ${testResult.success ? 'alert-success' : 'alert-error'}`}>
              <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(testResult, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {tab === 'outbox' && (
        <div className="card bg-base-100 shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Outbox (gửi về CRM)</h3>
            <button className="btn btn-xs btn-outline" onClick={retryAll} disabled={loading}>Retry tất cả</button>
          </div>
          <table className="table table-sm">
            <thead><tr><th>ID</th><th>Event</th><th>Lead</th><th>Status</th><th>Attempts</th><th>Thao tác</th></tr></thead>
            <tbody>
              {outbox.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.event_type}</td>
                  <td>{o.crm_lead_id || o.lead_id}</td>
                  <td>{o.status}</td>
                  <td>{o.attempts}</td>
                  <td className="flex gap-1">
                    <button className="btn btn-xs btn-ghost" onClick={() => viewOutboxDetail(o.id)} title="Xem payload">Xem</button>
                    {o.status === 'failed' && <button className="btn btn-xs" onClick={() => retry(o.id)}>Retry</button>}
                    {o.status === 'pending' && <button className="btn btn-xs btn-error btn-outline" onClick={() => cancelOutbox(o.id)}>Hủy</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'logs' && (
        <div className="card bg-base-100 shadow p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select className="select select-bordered select-sm" value={logFilter.direction} onChange={(e) => setLogFilter(f => ({ ...f, direction: e.target.value }))}>
              <option value="">Tất cả hướng</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <select className="select select-bordered select-sm" value={logFilter.status} onChange={(e) => setLogFilter(f => ({ ...f, status: e.target.value }))}>
              <option value="">Tất cả trạng thái</option>
              <option value="received">received</option>
              <option value="processed">processed</option>
              <option value="failed">failed</option>
              <option value="skipped">skipped</option>
              <option value="sent">sent</option>
              <option value="retried">retried</option>
            </select>
            <input className="input input-bordered input-sm w-32" placeholder="Lead ID" value={logFilter.lead_id} onChange={(e) => setLogFilter(f => ({ ...f, lead_id: e.target.value }))} />
            <input className="input input-bordered input-sm w-32" placeholder="CRM Lead ID" value={logFilter.crm_lead_id} onChange={(e) => setLogFilter(f => ({ ...f, crm_lead_id: e.target.value }))} />
            <input type="date" className="input input-bordered input-sm" value={logFilter.date_from} onChange={(e) => setLogFilter(f => ({ ...f, date_from: e.target.value }))} />
            <input type="date" className="input input-bordered input-sm" value={logFilter.date_to} onChange={(e) => setLogFilter(f => ({ ...f, date_to: e.target.value }))} />
            <button className="btn btn-sm btn-primary" onClick={() => loadLogs(1)} disabled={loading}>Lọc</button>
            <button className="btn btn-sm btn-outline" onClick={exportLogs}>Xuất Excel</button>
          </div>
          <table className="table table-sm">
            <thead><tr><th>Thời gian</th><th>Hướng</th><th>Bên gửi</th><th>Bên nhận</th><th>Event type</th><th>Lead</th><th>Trạng thái</th><th>HTTP</th><th>Hành động</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="text-xs">{new Date(l.created_at).toLocaleString('vi-VN')}</td>
                  <td><span className={`badge badge-sm ${l.direction === 'inbound' ? 'badge-info' : 'badge-success'}`}>{l.direction}</span></td>
                  <td>{l.sender}</td>
                  <td>{l.receiver}</td>
                  <td className="text-xs">{l.event_type || '—'}</td>
                  <td className="text-xs">{l.crm_lead_id || l.lead_id || '—'}</td>
                  <td><span className={`badge badge-sm ${l.status === 'failed' ? 'badge-error' : 'badge-ghost'}`}>{l.status}</span></td>
                  <td>{l.http_status || '—'}</td>
                  <td><button className="btn btn-xs" onClick={() => viewLogDetail(l.id)}>Xem chi tiết</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-base-content/60">Tổng: {logPagination.total}</span>
            <div className="join">
              <button className="join-item btn btn-xs" disabled={logPagination.page <= 1} onClick={() => loadLogs(logPagination.page - 1)}>«</button>
              <button className="join-item btn btn-xs">{logPagination.page}/{logPagination.totalPages || 1}</button>
              <button className="join-item btn btn-xs" disabled={logPagination.page >= logPagination.totalPages} onClick={() => loadLogs(logPagination.page + 1)}>»</button>
            </div>
          </div>
        </div>
      )}

      {outboxDetail && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <h3 className="font-bold text-lg mb-3">Chi tiết outbox #{outboxDetail.id}</h3>
            <div className="text-sm space-y-2">
              <div><b>Event ID:</b> {outboxDetail.event_id}</div>
              <div><b>Event type:</b> {outboxDetail.event_type}</div>
              <div><b>Lead ID:</b> {outboxDetail.lead_id} | <b>CRM Lead ID:</b> {outboxDetail.crm_lead_id}</div>
              <div><b>Status:</b> {outboxDetail.status} | <b>Attempts:</b> {outboxDetail.attempts}</div>
              <div><b>Created:</b> {outboxDetail.created_at} | <b>Sent:</b> {outboxDetail.sent_at || '—'}</div>
              <div><b>Next retry:</b> {outboxDetail.next_retry_at || '—'}</div>
              {outboxDetail.last_error && <div className="alert alert-error text-xs">{outboxDetail.last_error}</div>}
              <div>
                <b>Payload:</b>
                <pre className="bg-base-200 p-2 rounded text-xs overflow-auto max-h-60">{JSON.stringify(outboxDetail.payload, null, 2)}</pre>
              </div>
              {outboxDetail.response && (
                <div>
                  <b>Response:</b>
                  <pre className="bg-base-200 p-2 rounded text-xs overflow-auto max-h-60">{outboxDetail.response}</pre>
                </div>
              )}
            </div>
            <div className="modal-action">
              <button className="btn btn-sm" onClick={() => setOutboxDetail(null)}>Đóng</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setOutboxDetail(null)}></div>
        </div>
      )}

      {logDetail && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <h3 className="font-bold text-lg mb-3">Chi tiết webhook log #{logDetail.id}</h3>
            <div className="text-sm space-y-2">
              <div><b>Hướng:</b> {logDetail.direction} ({logDetail.sender} → {logDetail.receiver})</div>
              <div><b>Thời gian:</b> {new Date(logDetail.created_at).toLocaleString('vi-VN')}</div>
              <div><b>Trạng thái:</b> {logDetail.status} (HTTP {logDetail.http_status || '—'}, {logDetail.duration_ms || 0}ms)</div>
              {logDetail.error && <div className="alert alert-error text-xs">{logDetail.error}</div>}
              <div>
                <b>Payload:</b>
                <pre className="bg-base-200 p-2 rounded text-xs overflow-auto max-h-60">{JSON.stringify(logDetail.payload, null, 2)}</pre>
              </div>
              {logDetail.response && (
                <div>
                  <b>Response:</b>
                  <pre className="bg-base-200 p-2 rounded text-xs overflow-auto max-h-60">{JSON.stringify(logDetail.response, null, 2)}</pre>
                </div>
              )}
            </div>
            <div className="modal-action">
              <button className="btn btn-sm" onClick={() => setLogDetail(null)}>Đóng</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setLogDetail(null)}></div>
        </div>
      )}
    </div>
  );
};

export default AdminCrmPage;
