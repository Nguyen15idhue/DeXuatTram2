import { useState, useEffect, useMemo } from 'react';
import { leadService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import ProcessTimeline from './ProcessTimeline';
import { X, Route, ChevronDown, ChevronRight, ExternalLink, Building2, FileText } from 'lucide-react';

const STAGE_RAIL = [
  { key: 'LEAD', label: 'Lead', match: ['NEW', 'ASSIGNED'] },
  { key: 'CSKH', label: 'CSKH', match: ['CSKH'] },
  { key: 'TVBH', label: 'TVBH', match: ['QUALIFIED', 'TVBH'] },
  { key: 'PROPOSAL', label: 'Proposal', match: ['PROPOSAL'] },
  { key: 'STATION', label: 'Station', match: ['STATION'] },
  { key: 'ON', label: 'ON', match: ['ON'] }
];

const TERMINAL_STAGES = ['UNQUALIFIED', 'LOST'];

const stageIndex = (stage) => STAGE_RAIL.findIndex(s => s.match.includes(stage));

const STATUS_COLOR = {
  PENDING: '#facc15', REVIEWING: '#3b82f6', PRINCIPLE_APPROVED: '#6366f1',
  APPROVED: '#16a34a', REJECTED: '#dc2626', CANCELLED: '#6b7280',
  CONTRACT_SIGNED: '#0d9488', CONTRACT_FAILED: '#f59e0b', ARCHIVED: '#8b5cf6'
};

const ENTITY_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'lead', label: 'Lead' },
  { key: 'proposal', label: 'Đề xuất' },
  { key: 'station', label: 'Trạm' }
];

const LeadJourneyPopup = ({ leadId, onClose }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [showUnified, setShowUnified] = useState(false);
  const [entityFilter, setEntityFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');

  useEffect(() => {
    if (!leadId || !token) return;
    let cancelled = false;
    setLoading(true);
    leadService.journey(leadId, token)
      .then(res => {
        if (cancelled) return;
        if (res.success) setData(res.data);
        else setError(res.message || 'Lỗi tải hành trình');
      })
      .catch(() => { if (!cancelled) setError('Lỗi kết nối server'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leadId, token]);

  const lead = data?.lead;
  const journey = data?.journey;
  const timeline = data?.timeline || [];
  const proposals = data?.proposals || [];
  const currentStage = journey?.current_stage || lead?.stage || 'NEW';
  const curIdx = stageIndex(currentStage);
  const stationCount = proposals.filter(p => p.station_id_resolved || p.station_id).length;

  // Map entity id -> mã hiển thị (mã đề xuất / mã trạm)
  const codeMap = useMemo(() => {
    const map = {};
    proposals.forEach(p => {
      map[`proposal:${p.id}`] = p.ma_de_xuat || null;
      const sid = p.station_id_resolved || p.station_id;
      if (sid) map[`station:${sid}`] = p.station_code || p.station_name || null;
    });
    return map;
  }, [proposals]);

  const labelFor = (it) => {
    const code = codeMap[`${it.entity_type}:${it.entity_id}`];
    if (it.entity_type === 'proposal') return code ? `Đề xuất ${code}` : 'Đề xuất';
    if (it.entity_type === 'station') return code ? `Trạm ${code}` : 'Trạm';
    return 'Lead';
  };

  const filteredTimeline = useMemo(() => {
    let base = timeline;
    if (branchFilter !== 'all') {
      const p = proposals.find(x => String(x.id) === String(branchFilter));
      if (p) {
        const sid = p.station_id_resolved || p.station_id;
        base = timeline.filter(t =>
          (t.entity_type === 'proposal' && String(t.entity_id) === String(p.id)) ||
          (sid && t.entity_type === 'station' && String(t.entity_id) === String(sid))
        );
      }
    }
    if (entityFilter === 'all') return base;
    return base.filter(t => t.entity_type === entityFilter);
  }, [timeline, entityFilter, branchFilter, proposals]);

  const proposalLabel = (p) => p.ma_de_xuat || 'Đề xuất (chưa có mã)';
  const stationLabel = (p) => {
    if (p.station_name && !/#\d+/.test(p.station_name)) return p.station_name;
    if (p.station_code) return `Trạm ${p.station_code}`;
    return 'Trạm (chưa có mã)';
  };

  return (
    <dialog className="modal modal-open" onClick={(e) => e.stopPropagation()}>
      <div className="modal-box max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Route size={18} className="text-primary" />
            Hành trình Lead {lead ? lead.lead_code || `#${lead.id}` : `#${leadId}`}
          </h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><span className="loading loading-spinner loading-lg"></span></div>
        ) : error ? (
          <div className="alert alert-error text-sm">{error}</div>
        ) : !data ? (
          <div className="text-center py-8 text-base-content/50 text-sm">Không có dữ liệu hành trình</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <div><span className="text-base-content/60">Lead:</span> <b>{lead?.lead_code || `#${lead?.id}`}</b></div>
              <div className="truncate" title={journey?.journey_code}><span className="text-base-content/60">Journey:</span> <b>{journey?.journey_code ? journey.journey_code.slice(0, 8) : '—'}</b></div>
              <div><span className="text-base-content/60">Giai đoạn:</span> <b>{currentStage}</b></div>
              <div><span className="text-base-content/60">Đề xuất:</span> <b>{proposals.length}</b></div>
              <div><span className="text-base-content/60">Trạm:</span> <b>{stationCount}</b></div>
              <div className="truncate"><span className="text-base-content/60">Phòng ban:</span> <b>{lead?.assigned_department || '—'}</b></div>
            </div>

            {TERMINAL_STAGES.includes(currentStage) ? (
              <div className="alert alert-warning py-2 text-sm">Lead đã kết thúc ở giai đoạn <b>{currentStage}</b>.</div>
            ) : (
              <div className="flex items-center gap-1 overflow-x-auto py-1">
                {STAGE_RAIL.map((s, i) => {
                  const active = i === curIdx;
                  const done = curIdx >= 0 && i < curIdx;
                  return (
                    <div key={s.key} className="flex items-center gap-1 shrink-0">
                      <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: active ? '#4f46e5' : done ? '#c7d2fe' : '#e5e7eb', color: active ? '#fff' : '#374151' }}>{s.label}</span>
                      {i < STAGE_RAIL.length - 1 && <ChevronRight size={14} className="text-base-content/40" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Đề xuất & Trạm */}
            <div>
              <h4 className="font-semibold text-sm mb-2">Đề xuất &amp; Trạm ({proposals.length})</h4>
              {proposals.length === 0 ? (
                <div className="text-sm text-base-content/50 border border-dashed border-base-300 rounded-lg p-3">
                  Chưa có đề xuất nào. Dùng nút "Tạo đề xuất" ở popup Lead khi Lead đã TVBH thành công.
                </div>
              ) : (
                <div className="space-y-2">
                  {proposals.map(p => {
                    const isOpen = expanded[p.id];
                    const statusColor = STATUS_COLOR[p.status] || '#9ca3af';
                    const pEvents = timeline.filter(t => t.entity_type === 'proposal' && Number(t.entity_id) === Number(p.id));
                    const sid = p.station_id_resolved || p.station_id;
                    const sEvents = sid ? timeline.filter(t => t.entity_type === 'station' && Number(t.entity_id) === Number(sid)) : [];
                    return (
                      <div key={p.id} className="border border-base-300 rounded-lg">
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <button
                            type="button"
                            className="flex items-center gap-2 min-w-0 text-left flex-1"
                            onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                          >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <FileText size={14} className="text-base-content/50" />
                            <span className="font-medium text-sm truncate">{proposalLabel(p)}</span>
                            <span className="badge badge-sm" style={{ background: statusColor, color: '#fff', border: 'none' }}>{p.status}</span>
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            <a className="link link-primary text-xs flex items-center gap-0.5" href={`/admin/proposals/view=${p.id}`}>
                              Mở đề xuất <ExternalLink size={11} />
                            </a>
                          </div>
                        </div>
                        <div className="px-3 pb-2 -mt-1">
                          {sid ? (
                            <span className="text-xs text-base-content/60 flex items-center gap-1 flex-wrap">
                              <Building2 size={12} /> {stationLabel(p)}
                              {p.station_code && !stationLabel(p).includes(p.station_code) ? <span className="badge badge-ghost badge-xs">{p.station_code}</span> : null}
                              {p.station_status ? <span className="badge badge-ghost badge-xs">{p.station_status}</span> : null}
                              <a className="link link-primary" href={`/admin/stations/view=${sid}`}>Mở trạm <ExternalLink size={10} className="inline" /></a>
                            </span>
                          ) : (
                            <span className="text-xs text-base-content/50">Chưa có trạm</span>
                          )}
                        </div>
                        {isOpen && (
                          <div className="px-3 pb-3 border-t border-base-200 pt-2">
                            <div className="text-xs font-semibold text-base-content/70 mb-1">Timeline đề xuất {proposalLabel(p)}</div>
                            <ProcessTimeline events={pEvents} emptyText="Chưa có hoạt động đề xuất" labelFor={labelFor} />
                            {sid && (
                              <>
                                <div className="text-xs font-semibold text-base-content/70 mt-3 mb-1">Timeline {stationLabel(p)}</div>
                                <ProcessTimeline events={sEvents} emptyText="Chưa có hoạt động trạm" labelFor={labelFor} />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dòng thời gian hợp nhất (thu gọn mặc định) */}
            <div className="border border-base-300 rounded-lg">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2"
                onClick={() => setShowUnified(v => !v)}
              >
                <span className="font-semibold text-sm flex items-center gap-1">
                  {showUnified ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Dòng thời gian hợp nhất ({timeline.length})
                </span>
                <span className="text-xs text-base-content/50">{showUnified ? 'Thu gọn' : 'Mở rộng'}</span>
              </button>
              {showUnified && (
                <div className="px-3 pb-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <select
                      className="select select-bordered select-xs max-w-[240px]"
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                    >
                      <option value="all">Tất cả đề xuất/trạm</option>
                      {proposals.map(p => (
                        <option key={p.id} value={p.id}>{proposalLabel(p)}</option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-1">
                      {ENTITY_FILTERS.map(f => (
                        <button
                          key={f.key}
                          type="button"
                          className={`btn btn-xs ${entityFilter === f.key ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setEntityFilter(f.key)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ProcessTimeline events={filteredTimeline} emptyText="Chưa có hoạt động" labelFor={labelFor} />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" onClick={onClose} />
    </dialog>
  );
};

export default LeadJourneyPopup;
