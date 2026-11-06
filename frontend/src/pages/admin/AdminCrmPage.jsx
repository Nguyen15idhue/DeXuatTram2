import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';

const AdminCrmPage = () => {
  const { token } = useAuth();
  const [config, setConfig] = useState(null);
  const [outbox, setOutbox] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testWebhook = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/crm/test-webhook', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setTestResult(res);
    } catch (e) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const cfgRes = await fetch('/api/admin/crm/config', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setConfig(cfgRes.data);
      const obRes = await fetch('/api/admin/crm/outbox?limit=50', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setOutbox(obRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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

  const retry = async (id) => {
    await fetch(`/api/admin/crm/outbox/${id}/retry`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    await load();
  };

  const retryAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/crm/outbox/retry-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      alert(res.message || 'Done');
      await load();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Tích hợp TMT CRM" />
      <div className="card bg-base-100 shadow p-4">
        <h3 className="font-semibold mb-2">Cấu hình</h3>
        {config ? (
          <div className="text-sm space-y-1">
            <div>Inbound: {config.inbound.configured ? '✅' : '❌'} {config.inbound.message}</div>
            <div>Outbound: {config.outbound.configured ? '✅' : '❌'} {config.outbound.message}</div>
            <div className="mt-2">API Key: {config.env.TMT_CRM_API_KEY ? '✅' : '❌'} | Webhook URL: {config.env.TMT_CRM_WEBHOOK_URL ? '✅' : '❌'} | Secret: {config.env.TMT_CRM_WEBHOOK_SECRET ? '✅' : '❌'}</div>
          </div>
        ) : 'Đang tải...'}
        <button className="btn btn-sm btn-primary mt-3" onClick={syncNow} disabled={loading}>Sync ngay</button>
        <button className="btn btn-sm btn-outline ml-2 mt-3" onClick={testWebhook} disabled={loading}>Test webhook</button>
        {testResult && (
          <div className={`alert text-sm mt-3 ${testResult.success ? 'alert-success' : 'alert-error'}`}>
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(testResult, null, 2)}</pre>
          </div>
        )}
      </div>
      <div className="card bg-base-100 shadow p-4">
        <h3 className="font-semibold mb-2">Outbox (gửi về CRM)</h3>
        <button className="btn btn-xs btn-outline mb-2" onClick={retryAll} disabled={loading}>Retry tất cả</button>
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
                <td>{o.status === 'failed' && <button className="btn btn-xs" onClick={() => retry(o.id)}>Retry</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminCrmPage;
