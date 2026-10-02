import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { webhookConfigService } from '../../services/api';
import Toast from '../Toast';
import { Pause, Play, Trash2, ChevronDown } from 'lucide-react';

const ACTION_FILTERS = [
  { value: '', label: 'Tất cả webhook' },
  { value: 'webhook', label: 'Trạng thái đề xuất (cũ)' },
  { value: 'work_process_move', label: 'Đẩy quy trình (mới, inbound)' },
  { value: 'work_process_update', label: 'Gọi sang 1Office (push)' }
];
const POLL_MS = 3000;

const fmtTime = (t) => {
  if (!t) return '—';
  return new Date(t).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

const pretty = (v) => {
  if (!v) return '—';
  try {
    const o = typeof v === 'string' ? JSON.parse(v) : v;
    return JSON.stringify(o, null, 2);
  } catch {
    return String(v);
  }
};

const WebhookListener = ({ initialAction = '' }) => {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [listening, setListening] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState(initialAction);
  const [expanded, setExpanded] = useState(null);
  const [freshIds, setFreshIds] = useState(new Set());
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const maxIdRef = useRef(0);
  const timersRef = useRef({});

  const fetchLogs = useCallback(async (sinceId) => {
    try {
      const res = await webhookConfigService.inboundLogs({ since_id: sinceId || 0, limit: 30, status: statusFilter || undefined, action: actionFilter || undefined }, token);
      if (!res.success) return;
      const data = res.data || [];
      if (sinceId > 0) {
        if (data.length > 0) {
          const fresh = new Set(data.map(r => r.id));
          setFreshIds(prev => {
            const next = new Set([...prev, ...fresh]);
            return next;
          });
          data.forEach(r => {
            clearTimeout(timersRef.current[r.id]);
            timersRef.current[r.id] = setTimeout(() => {
              setFreshIds(prev => {
                const next = new Set(prev);
                next.delete(r.id);
                return next;
              });
            }, 10000);
          });
          setRows(prev => {
            const known = new Set(prev.map(r => r.id));
            const merged = [...data.filter(r => !known.has(r.id)), ...prev];
            return merged.slice(0, 100);
          });
          const top = Math.max(...data.map(r => r.id), maxIdRef.current);
          maxIdRef.current = top;
        }
      } else {
        setRows(data);
        setFreshIds(new Set());
        if (data.length > 0) maxIdRef.current = Math.max(...data.map(r => r.id));
      }
    } catch { /* silent: giu log cu khi poll loi */ }
  }, [token, statusFilter, actionFilter]);

  useEffect(() => {
    maxIdRef.current = 0;
    fetchLogs(0);
  }, [statusFilter, actionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActionFilter(initialAction || '');
  }, [initialAction]);

  useEffect(() => {
    if (!listening) return undefined;
    const t = setInterval(() => fetchLogs(maxIdRef.current), POLL_MS);
    return () => clearInterval(t);
  }, [listening, fetchLogs]);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach(clearTimeout);
  }, []);

  const parseBody = (row) => {
    try {
      const b = typeof row.request_payload === 'string' ? JSON.parse(row.request_payload) : (row.request_payload || {});
      return b;
    } catch { return {}; }
  };

  const describeRow = (row, body) => {
    if (body.event) return { badge: body.event, code: body.proposal_code || body.contact_code || `#${row.entity_id || ''}` };
    const id = body.ID ?? body.id ?? body.postId ?? '';
    const pid = body.project_id ?? body.projectId ?? '';
    if (id !== '' || pid !== '') return { badge: row.action === 'work_process_update' ? 'work/update' : 'work/move', code: `ID ${id} → dự án ${pid}` };
    return { badge: row.action || '—', code: `#${row.entity_id || ''}` };
  };

  return (
    <div className="card bg-base-100 border border-base-300 mb-6">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <div className="card-body p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-bold flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              {listening && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${listening ? 'bg-success' : 'bg-base-300'}`} />
            </span>
            Log webhook 1Office
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <select className="select select-bordered select-sm" value={actionFilter} onChange={e => setActionFilter(e.target.value)} title="Lọc theo loại webhook">
              {ACTION_FILTERS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <select className="select select-bordered select-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="completed">Thành công</option>
              <option value="failed">Thất bại</option>
            </select>
            <button className="btn btn-outline btn-sm gap-1" onClick={() => setListening(v => !v)}>
              {listening ? <><Pause size={14} /> Tạm dừng</> : <><Play size={14} /> Tiếp tục</>}
            </button>
            <button className="btn btn-ghost btn-sm gap-1" onClick={() => { setRows([]); maxIdRef.current = 0; }} title="Xóa màn hình (không xóa DB)">
              <Trash2 size={14} /> Xóa màn hình
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-6 text-base-content/50 text-sm">
            {listening ? 'Đang lắng nghe... 1Office bắn sang sẽ hiện ngay tại đây.' : 'Đã tạm dừng. Bấm Tiếp tục để lắng nghe.'}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="table table-zebra table-sm">
              <thead className="sticky top-0">
                <tr className="bg-base-200">
                  <th className="w-14">ID</th>
                  <th>Thời gian</th>
                  <th>Sự kiện</th>
                  <th>Mã / Quy trình</th>
                  <th>Trạng thái</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const b = parseBody(r);
                  const desc = describeRow(r, b);
                  const isFresh = freshIds.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr className={`hover ${isFresh ? 'bg-success/10' : ''}`}>
                        <td className="font-mono text-xs">{r.id}</td>
                        <td className="text-xs">{fmtTime(r.created_at)}</td>
                        <td><span className="badge badge-sm badge-outline whitespace-nowrap">{desc.badge}</span></td>
                        <td className="text-xs font-medium">{desc.code}</td>
                        <td>
                          <span className={`badge badge-sm whitespace-nowrap ${r.status === 'completed' ? 'badge-success' : 'badge-error'}`}>
                            {r.status === 'completed' ? 'Thành công' : 'Thất bại'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-xs" onClick={() => setExpanded(prev => (prev === r.id ? null : r.id))} title="Xem payload">
                            <ChevronDown size={14} className={expanded === r.id ? 'rotate-180' : ''} />
                          </button>
                        </td>
                      </tr>
                      {expanded === r.id && (
                        <tr>
                          <td colSpan={6}>
                            <div className="grid md:grid-cols-2 gap-2">
                              <div>
                                <div className="font-medium text-xs mb-1">Request</div>
                                <pre className="bg-base-200 rounded-lg p-2 text-xs whitespace-pre-wrap max-h-52 overflow-auto">{pretty(r.request_payload)}</pre>
                              </div>
                              <div>
                                <div className="font-medium text-xs mb-1">Response</div>
                                <pre className="bg-base-200 rounded-lg p-2 text-xs whitespace-pre-wrap max-h-52 overflow-auto">{pretty(r.response_payload)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebhookListener;
