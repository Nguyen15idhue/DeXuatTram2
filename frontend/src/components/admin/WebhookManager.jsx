import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Toast from '../Toast';
import { Plus, X, Copy, Check, RefreshCw, Trash2, Power } from 'lucide-react';

const webhookApi = {
  async call(path, token, method = 'GET', body) {
    const res = await fetch(`/api/admin/webhook-configs${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined
    });
    return res.json();
  }
};

const WEBHOOK_PATH = '/api/webhooks/oneoffice/proposal-status';

const getWebhookUrl = () => {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const base = raw.replace(/\/api\/?$/, '');
  if (base) return `${base}${WEBHOOK_PATH}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${WEBHOOK_PATH}`;
};

const WebhookManager = ({ onChanged }) => {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', note: '' });
  const [fresh, setFresh] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await webhookApi.call('', token);
      if (res.success) setRows(res.data || []);
    } catch {
      setToast({ message: 'Lỗi tải danh sách webhook', type: 'error' });
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyUrl = async () => {
    const url = getWebhookUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setToast({ message: 'Nhập tên webhook', type: 'error' });
      return;
    }
    setWorking(true);
    try {
      const res = await webhookApi.call('', token, 'POST', { name: form.name.trim(), note: form.note.trim() || undefined });
      if (res.success) {
        setFresh({ id: res.data.id, secret: res.data.secret });
        setForm({ name: '', note: '' });
        setShowCreate(false);
        load();
        if (onChanged) onChanged();
      } else {
        setToast({ message: res.message || 'Tạo thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
    setWorking(false);
  };

  const handleRotate = async (id) => {
    if (!window.confirm('Tạo secret mới? Secret cũ vẫn dùng được trong grace period.')) return;
    try {
      const res = await webhookApi.call(`/${id}/rotate`, token, 'POST', {});
      if (res.success) {
        setFresh({ id, secret: res.data.webhook_secret });
        load();
        if (onChanged) onChanged();
      } else {
        setToast({ message: res.message || 'Xoay thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  const handleToggle = async (row) => {
    try {
      const res = await webhookApi.call(`/${row.id}/active`, token, 'PUT', { is_active: !row.is_active });
      if (res.success) load();
      else setToast({ message: res.message || 'Cập nhật thất bại', type: 'error' });
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Xóa webhook "${row.name}"? Các BPA đang dùng secret này sẽ 401.`)) return;
    try {
      const res = await webhookApi.call(`/${row.id}`, token, 'DELETE');
      if (res.success) {
        setToast({ message: 'Đã xóa', type: 'success' });
        load();
      } else {
        setToast({ message: res.message || 'Xóa thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  return (
    <div className="card bg-base-100 border border-base-300 mb-6">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Webhooks 1Office (đầu nhận)</h3>
          <button className="btn btn-primary btn-sm gap-1" onClick={() => { setFresh(null); setShowCreate(true); }}>
            <Plus size={14} /> Thêm webhook mới
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3 p-2 bg-base-200 rounded text-xs">
          <span className="font-medium shrink-0">Callback URL:</span>
          <code className="flex-1 break-all text-primary">{getWebhookUrl()}</code>
          <button className="btn btn-ghost btn-xs gap-1 shrink-0" onClick={copyUrl}>
            {copiedUrl ? <><Check size={12} /> Đã copy</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>

        {fresh && (
          <div className="alert alert-warning py-2 px-3 text-xs mb-3">
            <div className="w-full">
              <p className="font-bold mb-1">Secret mới cho webhook #{fresh.id} (chỉ hiện 1 lần duy nhất):</p>
              <div className="flex gap-2 mb-2">
                <code className="flex-1 break-all bg-base-100 rounded px-2 py-1">{fresh.secret}</code>
                <button className="btn btn-sm gap-1" onClick={() => copyText(fresh.secret)}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} Copy
                </button>
              </div>
              <p className="font-medium mb-1">Callback URL:</p>
              <div className="flex gap-2">
                <code className="flex-1 break-all bg-base-100 rounded px-2 py-1">{getWebhookUrl()}</code>
                <button className="btn btn-sm gap-1" onClick={copyUrl}>
                  {copiedUrl ? <Check size={14} /> : <Copy size={14} />} Copy
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-4 text-base-content/50 text-sm">Đang tải...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-4 text-base-content/50 text-sm">Chưa có webhook nào — bấm "Thêm webhook mới".</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra table-sm">
              <thead>
                <tr className="bg-base-200">
                  <th className="w-12">ID</th>
                  <th>Tên</th>
                  <th>Callback URL</th>
                  <th>Secret</th>
                  <th>Trạng thái</th>
                  <th className="w-40">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="hover">
                    <td className="font-mono text-xs">{r.id}</td>
                    <td>
                      <div className="font-medium text-sm">{r.name}</div>
                      {r.note && <div className="text-xs text-base-content/50">{r.note}</div>}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <code className="text-xs break-all max-w-[280px]">{getWebhookUrl()}</code>
                        <button className="btn btn-ghost btn-xs p-0 shrink-0" onClick={copyUrl} title="Copy URL">
                          {copiedUrl ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>
                    </td>
                    <td>
                      {r.secret_set
                        ? <span className="badge badge-success badge-sm">Đã cấu hình</span>
                        : <span className="badge badge-ghost badge-sm">Chưa có</span>}
                      {r.secret_prev_set && <span className="badge badge-warning badge-sm ml-1">Còn cũ</span>}
                    </td>
                    <td>
                      <span className={`badge badge-sm ${r.is_active ? 'badge-success' : 'badge-ghost'}`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn btn-ghost btn-xs gap-1" onClick={() => handleRotate(r.id)} title="Tạo secret mới">
                          <RefreshCw size={13} /> Xoay
                        </button>
                        <button className="btn btn-ghost btn-xs gap-1" onClick={() => handleToggle(r)} title={r.is_active ? 'Tắt' : 'Bật'}>
                          <Power size={13} />
                        </button>
                        <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDelete(r)} title="Xóa">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showCreate && (
          <dialog className="modal modal-open">
            <div className="modal-box max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Thêm webhook mới</h3>
                <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowCreate(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-control mb-3">
                <label className="label"><span className="label-text">Tên webhook *</span></label>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  placeholder="VD: Webhook duyệt BCĐX"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Ghi chú</span></label>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  placeholder="Dùng cho node BPA nào..."
                  value={form.note}
                  onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                />
              </div>
              <div className="modal-action">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Hủy</button>
                <button className="btn btn-primary btn-sm" disabled={working} onClick={handleCreate}>
                  {working ? 'Đang tạo...' : 'Tạo + sinh secret'}
                </button>
              </div>
            </div>
            <div className="modal-backdrop bg-black/50" onClick={() => setShowCreate(false)} />
          </dialog>
        )}
      </div>
    </div>
  );
};

export default WebhookManager;
