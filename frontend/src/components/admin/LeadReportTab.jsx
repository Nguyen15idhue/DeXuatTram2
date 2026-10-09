import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { reportService } from '../../services/api';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import EmptyState from '../EmptyState';
import ProcessTimeline from './ProcessTimeline';

const fmtDateTime = (v) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('vi-VN', { hour12: false });
  } catch {
    return String(v);
  }
};

const Section = ({ title, right, children }) => (
  <div className="card bg-base-100 shadow p-4 mb-3">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-semibold">{title}</h3>
      {right}
    </div>
    {children}
  </div>
);

const MilestoneTable = ({ milestones }) => {
  if (!milestones || milestones.length === 0) return <p className="text-xs opacity-60">Chưa có dữ liệu node 1Office</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table table-xs w-full">
        <thead><tr><th>Mốc</th><th>Trạng thái</th><th>Kế hoạch</th><th>Thực tế</th></tr></thead>
        <tbody>
          {milestones.map((m, i) => (
            <tr key={i}>
              <td>{m.title}</td>
              <td><span className="badge badge-xs badge-ghost">{m.status || '—'}</span></td>
              <td>{m.plan ? fmtDateTime(m.plan) : '—'}</td>
              <td>{m.real ? fmtDateTime(m.real) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const LeadReportTab = ({ leadId, onClose }) => {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!leadId || !token) return;
    setLoading(true);
    setError('');
    reportService.getLead360(leadId, token)
      .then((res) => {
        if (cancelled) return;
        if (res.success) setData(res.data);
        else setError(res.message || 'Lỗi tải báo cáo');
      })
      .catch(() => { if (!cancelled) setError('Lỗi kết nối server'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leadId, token]);

  const h = data && data.header;
  const d = data && data.durations;

  return (
    <dialog className="modal modal-open" onClick={(e) => e.stopPropagation()}>
      <div className="modal-box max-w-5xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">Báo cáo 360 — {h ? `${h.lead_code} · ${h.full_name}` : `Lead #${leadId}`}</h3>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Đóng">✕</button>
        </div>

        {loading && <Loading message="Đang tải báo cáo..." />}
        {!loading && error && <ErrorMessage message={error} />}
        {!loading && !error && !data && <EmptyState title="Không có dữ liệu" />}

        {!loading && !error && data && (
          <div>
            <Section title="Thông tin chung" right={h.current_stage ? <span className="badge badge-primary">{h.current_stage}</span> : null}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><span className="opacity-60">Mã Lead:</span> <b>{h.lead_code}</b></div>
                <div><span className="opacity-60">Journey:</span> <span className="text-xs break-all">{h.journey_code}</span></div>
                <div><span className="opacity-60">SĐT:</span> {h.phone || '—'}</div>
                <div><span className="opacity-60">Tỉnh/Vùng:</span> {[h.province, h.region].filter(Boolean).join(' · ') || '—'}</div>
                <div><span className="opacity-60">Stage:</span> {h.stage || '—'}</div>
                <div><span className="opacity-60">Phân loại:</span> {h.customer_classification || '—'}</div>
                <div><span className="opacity-60">TVBH:</span> {h.sales_outcome || '—'}</div>
                <div><span className="opacity-60">Phụ trách:</span> {h.assigned_user_name || '—'}{h.assigned_department ? ` (${h.assigned_department})` : ''}</div>
              </div>
            </Section>

            <Section title="Thời gian chuyển giai đoạn (ngày)">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  ['Mới → Giao', d.new_to_assigned_days],
                  ['Giao → Đề xuất', d.assigned_to_proposal_days],
                  ['Đề xuất → Ký', d.proposal_to_contract_days],
                  ['Ký → Trạm', d.contract_to_station_days],
                  ['Trạm → ON', d.station_to_on_days],
                ].map(([label, v]) => (
                  <div key={label} className="stat bg-base-200 rounded-box p-2">
                    <div className="stat-title text-xs">{label}</div>
                    <div className="stat-value text-xl">{v === null || v === undefined ? '—' : v}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={`Chăm sóc (${data.cskh.count}) · TVBH (${data.tvbh.count})`}>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-medium mb-1">Lịch sử CSKH ({data.cskh.count})</p>
                  {data.cskh.history.length === 0 ? <p className="text-xs opacity-60">Chưa có</p> : (
                    <ul className="list-disc ml-5 text-xs space-y-1">
                      {data.cskh.history.map((r, i) => <li key={i}>{JSON.stringify(r)}</li>)}
                    </ul>
                  )}
                  {data.cskh.note ? <p className="text-xs mt-1"><b>Ghi chú:</b> {data.cskh.note}</p> : null}
                </div>
                <div>
                  <p className="font-medium mb-1">Lịch sử TVBH ({data.tvbh.count})</p>
                  {data.tvbh.history.length === 0 ? <p className="text-xs opacity-60">Chưa có</p> : (
                    <ul className="list-disc ml-5 text-xs space-y-1">
                      {data.tvbh.history.map((r, i) => <li key={i}>{JSON.stringify(r)}</li>)}
                    </ul>
                  )}
                  {data.tvbh.note ? <p className="text-xs mt-1"><b>Ghi chú:</b> {data.tvbh.note}</p> : null}
                </div>
              </div>
            </Section>

            <Section title={`Đề xuất (${data.counts.proposals}) · Trạm (${data.counts.stations})${data.counts.on ? ' · ĐÃ ON' : ''}`}>
              {data.proposals.length === 0 && <p className="text-sm opacity-60">Chưa có đề xuất</p>}
              {data.proposals.map((p) => (
                <div key={p.id} className="border border-base-300 rounded p-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <b>{p.code || `Đề xuất #${p.id}`}</b>
                    <span className="badge badge-xs badge-ghost">{p.status}</span>
                    {p.station ? <span className="text-xs opacity-70">→ {p.station.name} ({p.station.status})</span> : <span className="text-xs opacity-60">Chưa có trạm</span>}
                  </div>
                  {(p.mirror || []).length === 0 ? (
                    <p className="text-xs opacity-60 mt-1">Chưa join được quy trình 1Office (unlinked)</p>
                  ) : p.mirror.map((m, i) => (
                    <div key={i} className="mt-2">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="badge badge-xs badge-info">{m.kind === 'on_station' ? 'Quy trình ON trạm' : m.kind === 'proposal' ? 'Quy trình đề xuất' : 'Quy trình khác'}</span>
                        <span className="opacity-60">Process #{m.process_id} · Ver {m.version}</span>
                        {m.drift ? <span className="badge badge-xs badge-warning">lệch mapping</span> : null}
                      </div>
                      <MilestoneTable milestones={m.milestones} />
                    </div>
                  ))}
                </div>
              ))}
            </Section>

            <Section
              title="Đồng bộ 1Office"
              right={data.syncHealth.mirror_synced_at ? <span className="badge badge-xs badge-ghost">Gương lúc {fmtDateTime(data.syncHealth.mirror_synced_at)}</span> : null}
            >
              <div className="text-xs space-y-1">
                <p>Snapshot đã join lead này: <b>{data.syncHealth.matched_snapshots}</b></p>
                {(data.syncHealth.automations || []).map((a, i) => (
                  <p key={i} className="opacity-70">
                    {a.automation_key} · Ver {a.version}: {a.total} process ({a.linked} đã join, {a.unlinked} chưa) · sync {a.last_synced_at ? fmtDateTime(a.last_synced_at) : '—'}
                  </p>
                ))}
              </div>
            </Section>

            <Section title="Dòng thời gian">
              <ProcessTimeline events={data.timeline || []} />
            </Section>
          </div>
        )}

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" onClick={onClose} />
    </dialog>
  );
};

export default LeadReportTab;
