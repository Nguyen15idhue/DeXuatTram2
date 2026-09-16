import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  BookOpen, Search, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
  ExternalLink, Link2, LayoutGrid, Route as RouteIcon, Plug, Flag,
  BarChart3, Users, Zap, FileText, File, List, ShieldCheck, HelpCircle,
  User, Map as MapIcon, ClipboardList, Send, Database, Settings,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { GUIDE, resolveFlowStep } from '../help/guideData';

const SECTION_ICONS = { User, Map: MapIcon, ClipboardList, Send, Database, Settings, Book: BookOpen, Flag, Chart: BarChart3, Users, Zap, FileText, File, LayoutGrid, List, Shield: ShieldCheck, Help: HelpCircle };

const PANEL_SECTIONS = ['dash', 'users', 'stations', 'proposals'];
const SUPER_SECTIONS = ['fields', 'forms', 'views', 'data-lists', 'mapcfg', 'roles-api'];

const TOC_GROUPS = [
  { label: null, ids: ['bat-dau', 'tai-khoan', 'ban-do', 'de-xuat-cua-toi', 'khach'] },
  { label: 'Quản lý hệ thống', ids: PANEL_SECTIONS },
  { label: 'Quản lý cấu hình', ids: SUPER_SECTIONS },
  { label: 'Hỗ trợ', ids: ['faq'] },
];
const PANE_CLASS = 'lg:h-full lg:overflow-y-auto lg:pr-2 lg:pb-4 min-h-0';
const TOC_CLASS = 'hidden lg:block w-60 shrink-0 lg:h-full lg:overflow-y-auto lg:pb-2 min-h-0';

function matches(step, q) {
  if (!q) return true;
  const hay = `${step.id} ${step.title} ${step.text || ''} ${step.note || ''} ${step.purpose || ''} ${(step.substeps || []).join(' ')} ${(step.errors || []).join(' ')} ${(step.tags || []).join(' ')}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function StepCard({ step, index, onZoom, showLink, onGoStep, anchor, hideRelated }) {
  const [open, setOpen] = useState(false);
  return (
    <div id={anchor || step.id} className="card bg-base-100 border border-base-300 shadow-sm scroll-mt-2">
      <div className="card-body p-4 gap-3">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-content text-sm font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{step.title}</h3>
              <span className="badge badge-outline badge-xs">{step.id}</span>
            </div>
            {step.purpose && <p className="text-sm mt-1"><span className="font-medium">Để làm gì: </span>{step.purpose}</p>}
            {step.text && !step.purpose && <p className="text-sm text-base-content/70 mt-1">{step.text}</p>}
            {step.audience && <p className="text-sm text-base-content/70 mt-1"><span className="font-medium">Ai làm / khi nào: </span>{step.audience}</p>}
            {step.prereq && <p className="text-sm text-base-content/70 mt-1"><span className="font-medium">Trước khi bắt đầu: </span>{step.prereq}</p>}
            {step.note && <p className="text-sm text-info mt-1">{step.note}</p>}
            {step.substeps && step.substeps.length > 0 && (
              <ol className="mt-2 space-y-1">
                {step.substeps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-error text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            )}
            {step.expected && <p className="text-sm mt-2"><span className="font-medium text-success">Kết quả: </span>{step.expected}</p>}
            {step.errors && step.errors.length > 0 && (
              <div className="alert alert-warning py-2 px-3 mt-2">
                <div className="text-xs">
                  <p className="font-bold mb-1">Lỗi thường gặp</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {step.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {step.route && (
                <Link to={step.route} className="btn btn-xs btn-outline gap-1">
                  <ExternalLink size={12} /> Mở trang
                </Link>
              )}
              {showLink && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost gap-1"
                  onClick={() => {
                    try {
                      const t = `${window.location.origin}${window.location.pathname}${window.location.search}#${step.id}`;
                      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).catch(() => {});
                    } catch { /* clipboard unavailable */ }
                  }}
                  title="Copy link bước này"
                >
                  <Link2 size={12} /> #{step.id}
                </button>
              )}
              {step.related && !hideRelated && step.related.map((r) => (
                <button key={r} type="button" className="btn btn-xs btn-ghost gap-1" onClick={() => onGoStep && onGoStep(r)} title={`Xem bước ${r}`}>
                  <Link2 size={12} /> {r}
                </button>
              ))}
            </div>
          </div>
        </div>
        {step.image ? (
          <button type="button" className="block w-full" onClick={() => (onZoom ? onZoom() : setOpen((v) => !v))} title="Xem lớn">
            <img
              src={step.image}
              alt={step.title}
              loading="lazy"
              className={`w-full rounded-lg border border-base-300 ${open && !onZoom ? '' : 'max-h-80 object-contain bg-base-200'}`}
            />
          </button>
        ) : (
          <p className="text-xs text-base-content/40 italic">Ảnh minh họa đang bổ sung.</p>
        )}
      </div>
    </div>
  );
}

function Lightbox({ steps, index, onClose, onNav }) {
  const [zoom, setZoom] = useState(0.75);
  const step = steps[index];
  useEffect(() => {
    setZoom(0.75);
  }, [index]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNav(1);
      if (e.key === 'ArrowLeft') onNav(-1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, onNav]);
  if (!step) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-medium">{step.id} — {step.title} ({index + 1}/{steps.length})</span>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-sm btn-circle" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><ZoomOut size={16} /></button>
          <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn btn-sm btn-circle" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}><ZoomIn size={16} /></button>
          <button type="button" className="btn btn-sm btn-circle" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {step.image ? (
          <img src={step.image} alt={step.title} className="rounded-lg max-w-none" style={{ transform: `scale(${zoom})`, maxWidth: zoom === 1 ? '100%' : 'none' }} />
        ) : (
          <p className="text-white/60 text-sm">Ảnh minh họa đang bổ sung.</p>
        )}
      </div>
      <div className="flex items-center justify-between p-3" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn-sm gap-1" disabled={index === 0} onClick={() => onNav(-1)}><ChevronLeft size={16} /> Trước</button>
        <button type="button" className="btn btn-sm gap-1" disabled={index === steps.length - 1} onClick={() => onNav(1)}>Sau <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

const HelpPage = () => {
  const { user, isSuperAdmin, canAccessPanel } = useAuth();
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const rootHeightClass = isAdminPath
    ? 'lg:h-[calc(100dvh-48px)] lg:-mb-6'
    : 'lg:h-[calc(100dvh-64px)]';
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const sectionParam = params.get('s');
  const [tab, setTab] = useState(tabParam === 'flows' || tabParam === 'integrations' ? tabParam : 'groups');
  const [q, setQ] = useState('');
  const [selectedSection, setSelectedSection] = useState(sectionParam || '');
  const [selectedFlow, setSelectedFlow] = useState('');
  const [lightbox, setLightbox] = useState({ steps: [], index: 0, open: false });
  const searchRef = useRef(null);
  const paneRef = useRef(null);

  useEffect(() => {
    if (tabParam === 'flows' || tabParam === 'integrations' || tabParam === 'groups') setTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const visibleSections = useMemo(() => {
    return GUIDE.groups.sections.filter((s) => {
      if (SUPER_SECTIONS.includes(s.id) && !isSuperAdmin) return false;
      if (PANEL_SECTIONS.includes(s.id) && !canAccessPanel) return false;
      return true;
    });
  }, [isSuperAdmin, canAccessPanel]);

  const activeSectionId = selectedSection && visibleSections.some((s) => s.id === selectedSection)
    ? selectedSection
    : visibleSections[0]?.id || '';
  const activeSection = visibleSections.find((s) => s.id === activeSectionId);

  const searchResults = useMemo(() => {
    if (!q) return [];
    return visibleSections.flatMap((s) => s.steps.filter((st) => matches(st, q)).map((st) => ({ ...st, sectionTitle: s.title })));
  }, [visibleSections, q]);

  const flowList = tab === 'integrations' ? GUIDE.integrations.flows : GUIDE.flows.flows;
  const activeFlowId = selectedFlow && flowList.some((f) => f.id === selectedFlow) ? selectedFlow : flowList[0]?.id || '';
  const activeFlow = flowList.find((f) => f.id === activeFlowId);
  const activeFlowSteps = useMemo(() => (activeFlow ? activeFlow.steps.map(resolveFlowStep) : []), [activeFlow]);

  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [activeSectionId, activeFlowId, tab]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [tab, activeSectionId, activeFlowId]);

  const visibleById = useMemo(() => {
    const m = {};
    for (const s of visibleSections) m[s.id] = s;
    return m;
  }, [visibleSections]);

  const tocGroups = useMemo(() => {
    const listed = new Set(TOC_GROUPS.flatMap((g) => g.ids));
    const extra = visibleSections.filter((s) => !listed.has(s.id));
    const groups = TOC_GROUPS
      .map((g) => ({ label: g.label, items: g.ids.map((id) => visibleById[id]).filter(Boolean) }))
      .filter((g) => g.items.length > 0);
    if (extra.length > 0) groups.push({ label: null, items: extra });
    return groups;
  }, [visibleById, visibleSections]);

  const tocItem = (s) => {
    const Icon = SECTION_ICONS[s.icon];
    const active = s.id === activeSectionId && !q;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => pickSection(s.id)}
        className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left ${active ? 'bg-primary text-primary-content font-medium' : 'hover:bg-base-200'}`}
      >
        {Icon && <Icon size={15} />}
        <span className="truncate">{s.title}</span>
        <span className="badge badge-xs ml-auto">{s.steps.length}</span>
      </button>
    );
  };

  const switchTab = (t) => {
    setTab(t);
    setQ('');
    setParams(t === 'groups' ? {} : { tab: t });
  };

  const pickSection = (id) => {
    setSelectedSection(id);
    setQ('');
    setParams({ s: id });
  };

  const openLightbox = (steps, index) => setLightbox({ steps, index, open: true });
  const stepToSection = useMemo(() => {
    const m = {};
    for (const s of GUIDE.groups.sections) {
      for (const st of s.steps) m[st.id] = s.id;
    }
    return m;
  }, []);
  const goStep = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const sec = stepToSection[id];
    if (sec && visibleSections.some((s) => s.id === sec)) {
      pickSection(sec);
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    }
  };
  const showIntegrations = canAccessPanel;

  return (
    <div className={`max-w-6xl mx-auto p-4 pb-4 lg:pb-4 lg:flex lg:flex-col lg:overflow-hidden ${rootHeightClass}`}>
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <BookOpen size={26} className="text-primary" />
        <h1 className="text-2xl font-bold">Hướng dẫn sử dụng</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-4 shrink-0">
        <div role="tablist" className="tabs tabs-boxed w-fit">
          <button type="button" role="tab" className={`tab gap-1 ${tab === 'groups' ? 'tab-active' : ''}`} onClick={() => switchTab('groups')}>
            <LayoutGrid size={14} /> I. Nhóm chức năng
          </button>
          <button type="button" role="tab" className={`tab gap-1 ${tab === 'flows' ? 'tab-active' : ''}`} onClick={() => switchTab('flows')}>
            <RouteIcon size={14} /> II. Luồng thực hiện
          </button>
          {showIntegrations && (
            <button type="button" role="tab" className={`tab gap-1 ${tab === 'integrations' ? 'tab-active' : ''}`} onClick={() => switchTab('integrations')}>
              <Plug size={14} /> III. Tích hợp
            </button>
          )}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            ref={searchRef}
            className="input input-bordered input-sm w-full pl-9"
            placeholder="Tìm bước... (phím /)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {tab === 'groups' && (
        <div className="flex gap-6 items-start lg:items-stretch flex-1 min-h-0 lg:overflow-hidden">
          <aside className={TOC_CLASS}>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-3">
                <p className="text-xs font-bold uppercase text-base-content/50 px-2 pb-2">Mục lục</p>
                {tocGroups.map((g, gi) => (
                  <div key={g.label || 'chung'}>
                    {gi > 0 && <div className="border-t border-base-300 my-2 mx-1" />}
                    {g.label && (
                      <p className="px-2 pt-1 pb-1 text-xs font-semibold text-base-content/50 uppercase tracking-wider">{g.label}</p>
                    )}
                    {g.items.map((s) => tocItem(s))}
                  </div>
                ))}
              </div>
            </div>
          </aside>
          <div ref={paneRef} className={`flex-1 min-w-0 space-y-3 ${PANE_CLASS}`}>
            <div className="lg:hidden">
              <select className="select select-bordered select-sm w-full" value={activeSectionId} onChange={(e) => pickSection(e.target.value)}>
                {tocGroups.map((g) => (
                  g.label
                    ? (
                      <optgroup key={g.label} label={g.label}>
                        {g.items.map((s) => (
                          <option key={s.id} value={s.id}>{s.title} ({s.steps.length})</option>
                        ))}
                      </optgroup>
                    )
                    : g.items.map((s) => (
                      <option key={s.id} value={s.id}>{s.title} ({s.steps.length})</option>
                    ))
                ))}
              </select>
            </div>
            {q ? (
              <>
                <p className="text-sm">Tìm thấy <b>{searchResults.length}</b> bước cho "{q}".</p>
                {searchResults.map((step, i) => (
                  <div key={`${step.id}-${i}`}>
                    <p className="text-xs text-base-content/50 mb-1">{step.sectionTitle}</p>
                    <StepCard
                      step={step}
                      index={i}
                      showLink
                      onGoStep={goStep}
                      onZoom={() => openLightbox(searchResults, i)}
                    />
                  </div>
                ))}
                {searchResults.length === 0 && <p className="text-sm text-base-content/60">Không tìm thấy bước nào.</p>}
              </>
            ) : activeSection ? (
              <>
                <h2 className="flex items-center gap-2 text-lg font-bold text-primary border-b border-base-300 pb-1 sticky top-0 bg-base-200/95 backdrop-blur py-1 z-10">
                  {(() => { const Icon = SECTION_ICONS[activeSection.icon]; return Icon ? <Icon size={18} /> : null; })()}
                  {activeSection.title}
                  <span className="badge badge-sm">{activeSection.steps.length} bước</span>
                  <span className="text-xs font-normal text-base-content/50 ml-auto hidden sm:inline">vai trò: {user?.role}</span>
                </h2>
                {activeSection.steps.map((step, idx) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={idx}
                    showLink
                    onGoStep={goStep}
                    onZoom={() => openLightbox(activeSection.steps, idx)}
                  />
                ))}
              </>
            ) : null}
          </div>
        </div>
      )}

      {(tab === 'flows' || tab === 'integrations') && (
        <div className="flex gap-6 items-start lg:items-stretch flex-1 min-h-0 lg:overflow-hidden">
          <aside className={TOC_CLASS}>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-3">
                <p className="text-xs font-bold uppercase text-base-content/50 px-2 pb-2">
                  {tab === 'flows' ? 'Các luồng' : 'Tích hợp'}
                </p>
                {flowList.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setSelectedFlow(f.id); setQ(''); }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left ${f.id === activeFlowId ? 'bg-primary text-primary-content font-medium' : 'hover:bg-base-200'}`}
                  >
                    <span className="badge badge-xs">{f.id}</span>
                    <span className="truncate">{f.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <div ref={tab === 'flows' ? paneRef : undefined} className={`flex-1 min-w-0 space-y-3 ${PANE_CLASS}`}>
            <div className="lg:hidden">
              <select className="select select-bordered select-sm w-full" value={activeFlowId} onChange={(e) => setSelectedFlow(e.target.value)}>
                {flowList.map((f) => (
                  <option key={f.id} value={f.id}>{f.id} — {f.title}</option>
                ))}
              </select>
            </div>
            {tab === 'integrations' && <p className="text-sm text-base-content/60">{GUIDE.integrations.title}</p>}
            {activeFlow && (
              <section key={activeFlow.id}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="badge badge-primary">{activeFlow.id}</span>
                  <h2 className="text-lg font-bold">{activeFlow.title}</h2>
                </div>
                <p className="text-sm text-base-content/60 mb-3">{activeFlow.desc} — {activeFlowSteps.length} bước</p>
                <div className="space-y-3">
                  {activeFlowSteps.filter((s) => matches(s, q)).map((st, i) => (
                    <div key={`${activeFlow.id}-${i}`}>
                      <StepCard
                        step={{ ...st, title: `B${i + 1}. ${st.title}` }}
                        index={i}
                        showLink={false}
                        hideRelated
                        anchor={`${activeFlow.id}-${i}`}
                        onZoom={() => openLightbox(activeFlowSteps, i)}
                      />
                      {i < activeFlowSteps.length - 1 && (
                        <div className="flex items-center justify-end mt-3">
                          <button
                            type="button"
                            className="btn btn-xs btn-outline gap-1"
                            onClick={() => document.getElementById(`${activeFlow.id}-${i + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                          >
                            Bước tiếp theo <ChevronRight size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {lightbox.open && (
        <Lightbox
          steps={lightbox.steps}
          index={lightbox.index}
          onClose={() => setLightbox((v) => ({ ...v, open: false }))}
          onNav={(d) => setLightbox((v) => ({ ...v, index: Math.min(v.steps.length - 1, Math.max(0, v.index + d)) }))}
        />
      )}
    </div>
  );
};

export default HelpPage;
