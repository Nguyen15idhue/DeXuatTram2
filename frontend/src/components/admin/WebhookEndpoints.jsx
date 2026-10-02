import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { webhookConfigService } from '../../services/api';
import Toast from '../Toast';
import { Copy, Check, Send, ScrollText, ChevronDown } from 'lucide-react';

const getWebhookUrl = (path) => {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const base = raw.replace(/\/api\/?$/, '');
  if (base) return `${base}${path}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${path}`;
};

const pretty = (v) => {
  try {
    return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2);
  } catch {
    return String(v ?? '');
  }
};

const EVENTS = ['PRINCIPLE_APPROVED', 'APPROVED', 'ARCHIVED', 'CONTRACT_SIGNED', 'CONTRACT_FAILED', 'CANCELLED'];

const ProposalStatusTest = ({ onDone }) => {
  const { token } = useAuth();
  const [form, setForm] = useState({ event: 'APPROVED', proposal_code: '', contact_code: '', note: '' });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const handleTest = async () => {
    if (!form.proposal_code.trim() && !form.contact_code.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await webhookConfigService.testSend({
        event: form.event,
        proposal_code: form.proposal_code.trim() || undefined,
        contact_code: form.contact_code.trim() || undefined,
        note: form.note.trim() || undefined
      }, token);
      if (res.success) {
        setResult(res.data);
        if (onDone) onDone();
      } else {
        setResult({ error: res.message || 'Bắn thử thất bại' });
      }
    } catch {
      setResult({ error: 'Lỗi kết nối server' });
    }
    setTesting(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-2 p-3 bg-base-200 rounded-lg">
      <div className="form-control">
        <label className="label py-0"><span className="label-text text-xs">Event</span></label>
        <select className="select select-bordered select-sm" value={form.event} onChange={e => setForm(prev => ({ ...prev, event: e.target.value }))}>
          {EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>
      <div className="form-control">
        <label className="label py-0"><span className="label-text text-xs">Mã đề xuất</span></label>
        <input type="text" className="input input-bordered input-sm" value={form.proposal_code} onChange={e => setForm(prev => ({ ...prev, proposal_code: e.target.value }))} />
      </div>
      <div className="form-control">
        <label className="label py-0"><span className="label-text text-xs">Mã contact</span></label>
        <input type="text" className="input input-bordered input-sm" value={form.contact_code} onChange={e => setForm(prev => ({ ...prev, contact_code: e.target.value }))} />
      </div>
      <div className="form-control flex-1 min-w-[140px]">
        <label className="label py-0"><span className="label-text text-xs">Ghi chú</span></label>
        <input type="text" className="input input-bordered input-sm" value={form.note} onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))} />
      </div>
      <button className="btn btn-success btn-sm gap-1" disabled={testing || (!form.proposal_code.trim() && !form.contact_code.trim())} onClick={handleTest}>
        <Send size={14} /> {testing ? 'Đang bắn...' : 'Bắn thử'}
      </button>
      {result && (
        <div className="basis-full mt-1">
          <pre className="bg-base-100 rounded-lg p-2 text-xs whitespace-pre-wrap max-h-40 overflow-auto">{pretty(result)}</pre>
        </div>
      )}
    </div>
  );
};

const WorkMoveTest = ({ onDone }) => {
  const { token } = useAuth();
  const [form, setForm] = useState({ ID: '', project_id: '' });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const handleTest = async () => {
    if (!form.ID.trim() || !form.project_id.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await webhookConfigService.testSendWork({ ID: form.ID.trim(), project_id: form.project_id.trim() }, token);
      if (res.success) {
        setResult(res.data);
        if (onDone) onDone();
      } else {
        setResult({ error: res.message || 'Gọi 1Office thất bại', data: res.data });
      }
    } catch {
      setResult({ error: 'Lỗi kết nối server' });
    }
    setTesting(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-2 p-3 bg-base-200 rounded-lg">
      <div className="form-control">
        <label className="label py-0"><span className="label-text text-xs">ID quy trình (gọi thật sang 1Office)</span></label>
        <input type="text" className="input input-bordered input-sm" placeholder="VD: 1185" value={form.ID} onChange={e => setForm(prev => ({ ...prev, ID: e.target.value }))} />
      </div>
      <div className="form-control">
        <label className="label py-0"><span className="label-text text-xs">project_id (dự án mã 2 = ID 3)</span></label>
        <input type="text" className="input input-bordered input-sm" placeholder="VD: 3" value={form.project_id} onChange={e => setForm(prev => ({ ...prev, project_id: e.target.value }))} />
      </div>
      <button className="btn btn-primary btn-sm gap-1" disabled={testing || !form.ID.trim() || !form.project_id.trim()} onClick={handleTest}>
        <Send size={14} /> {testing ? 'Đang gọi...' : 'Test đẩy quy trình'}
      </button>
      {result && (
        <div className="basis-full mt-1">
          <pre className="bg-base-100 rounded-lg p-2 text-xs whitespace-pre-wrap max-h-40 overflow-auto">{pretty(result)}</pre>
        </div>
      )}
    </div>
  );
};

const EndpointCard = ({ title, badge, badgeClass, path, header, params, logAction, TestForm, onViewLogs }) => {
  const [copied, setCopied] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const url = getWebhookUrl(path);

  const copyUrl = async () => {
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card bg-base-100 border border-base-300 mb-4">
      <div className="card-body p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="font-bold">{title}</h3>
          <span className={`badge badge-sm ${badgeClass}`}>{badge}</span>
          <div className="ml-auto flex gap-1">
            <button className="btn btn-outline btn-sm gap-1" onClick={() => setShowTest(v => !v)}>
              <Send size={14} /> {showTest ? 'Ẩn test' : 'Test'}
              <ChevronDown size={14} className={showTest ? 'rotate-180' : ''} />
            </button>
            <button className="btn btn-outline btn-sm gap-1" onClick={() => onViewLogs(logAction)}>
              <ScrollText size={14} /> Xem log
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 bg-base-200 rounded text-xs mb-2">
          <span className="badge badge-neutral badge-sm shrink-0">POST</span>
          <code className="flex-1 break-all text-primary">{url}</code>
          <button className="btn btn-ghost btn-xs gap-1 shrink-0" onClick={copyUrl}>
            {copied ? <><Check size={12} /> Đã copy</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
        <div className="text-xs text-base-content/60 space-y-0.5 mb-1">
          <div>Header: <code>{header}</code></div>
          <div>Body: <code>{params}</code></div>
        </div>
        {showTest && (
          <div className="mt-2">
            <TestForm onDone={() => onViewLogs(logAction, true)} />
          </div>
        )}
      </div>
    </div>
  );
};

const WebhookEndpoints = ({ onViewLogs }) => {
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const goLogs = (action, stay) => {
    if (!stay) {
      onViewLogs(action);
      return;
    }
    setToast({ message: 'Đã ghi log, bấm Xem log để kiểm tra', type: 'success' });
  };

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <EndpointCard
        title="Nhận trạng thái đề xuất"
        badge="cũ"
        badgeClass="badge-ghost"
        path="/api/webhooks/oneoffice/proposal-status"
        header="X-1Office-Signature hoặc x-webhook-secret"
        params="event_id, event, proposal_code | contact_code, note"
        logAction="webhook"
        TestForm={ProposalStatusTest}
        onViewLogs={goLogs}
      />
      <EndpointCard
        title="Đẩy quy trình vào dự án"
        badge="mới"
        badgeClass="badge-primary"
        path="/api/webhooks/oneoffice/work-process/move-to-project"
        header="X-1Office-Signature"
        params="ID, project_id, access_token (gửi kèm hoặc dùng token lưu sẵn)"
        logAction="work_process_move"
        TestForm={WorkMoveTest}
        onViewLogs={goLogs}
      />
    </div>
  );
};

export default WebhookEndpoints;
