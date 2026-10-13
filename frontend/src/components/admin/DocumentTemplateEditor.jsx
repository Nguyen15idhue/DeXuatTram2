import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { documentService, fieldDefinitionService } from '../../services/api';
import { X, Save, Eye, GripVertical, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Toast from '../Toast';
import Loading from '../Loading';
import DocxPreviewPane from './DocxPreviewPane';
import { normalizeForSearch } from '../../utils/searchText';

const PALETTE_TABS = [
  { id: 'fields', label: 'Trường đề xuất', short: 'Trường' },
  { id: 'tables', label: 'Bảng', short: 'Bảng' },
  { id: 'datalists', label: 'Danh mục', short: 'Danh mục' },
  { id: 'consts', label: 'Hằng số', short: 'Hằng số' },
];

const normalizeLoopForEdit = (cfg) => {
  const out = { ...(cfg || {}) };
  if (!Array.isArray(out.parts)) {
    if (out.source === 'field' && out.table) out.parts = [{ kind: 'table', table: out.table, columns: { ...(out.columns || {}) } }];
    else if (out.source === 'datalist' && out.listId) out.parts = [{ kind: 'datalist', listId: out.listId, columns: { ...(out.columns || {}) } }];
    else out.parts = [];
  }
  out.scalars = out.scalars && typeof out.scalars === 'object' ? out.scalars : {};
  out.footers = Array.isArray(out.footers) ? out.footers : [];
  if (out.stt === undefined) out.stt = true;
  return out;
};

const normalizeMapping = (m) => {
  const src = (m && typeof m === 'object') ? m : {};
  const loops = {};
  Object.entries(src.loops || {}).forEach(([k, cfg]) => { loops[k] = normalizeLoopForEdit(cfg); });
  return { tokens: { ...(src.tokens || {}) }, loops };
};

const partIdOf = (p) => (p.kind === 'datalist' ? `dl:${p.listId}` : `t:${p.table}`);

const parseSourceConfig = (sc) => {
  if (!sc) return {};
  if (typeof sc === 'object') return sc;
  try { return JSON.parse(sc); } catch { return {}; }
};

const stripToken = (tok) => tok.replace(/[{}#/]/g, '');

const matchSearch = (term, ...texts) => {
  const t = normalizeForSearch(term || '').trim();
  if (!t) return true;
  return texts.some((x) => normalizeForSearch(x || '').includes(t));
};
const isFooterToken = (name) => /^(.*)_f_([^_]+)_(value|label)$/.test(name);
const parseFooterToken = (name) => {
  const m = name.match(/^(.*)_f_([^_]+)_(value|label)$/);
  return m ? { loop: m[1], id: m[2], part: m[3] } : null;
};

const DocumentTemplateEditor = ({ templateId, onClose, onSaved }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [tpl, setTpl] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [fields, setFields] = useState([]);
  const [datalists, setDatalists] = useState([]);
  const [constants, setConstants] = useState([]);
  const [mapping, setMapping] = useState({ tokens: {}, loops: {} });
  const [tab, setTab] = useState('fields');
  const [dragItem, setDragItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [errors, setErrors] = useState([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewTab, setPreviewTab] = useState('word');
  const [tplBytes, setTplBytes] = useState(null);
  const [tplBytesLoading, setTplBytesLoading] = useState(false);
  const [realProposalId, setRealProposalId] = useState('');
  const [realBytes, setRealBytes] = useState(null);
  const [realLoading, setRealLoading] = useState(false);
  const [expandedTable, setExpandedTable] = useState(null);
  const [expandedDl, setExpandedDl] = useState(null);
  const [centerView, setCenterView] = useState('fields');
  const [paletteSearch, setPaletteSearch] = useState('');
  const [chipMode, setChipMode] = useState('label');

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [tRes, tkRes, fRes, dlRes, cRes] = await Promise.all([
        documentService.getTemplate(templateId, token),
        documentService.listTokens(templateId, token),
        fieldDefinitionService.getAll('entity=station_proposals&status=active&limit=200', token),
        documentService.listDatalists(token),
        documentService.listConstants(token),
      ]);
      if (!tRes.success) throw new Error(tRes.message || 'Lỗi tải template');
      setTpl(tRes.data);
      setMapping(normalizeMapping(tRes.data.mapping));
      if (tkRes.success) setTokens(tkRes.data || []);
      if (fRes.success) setFields(fRes.data || []);
      if (dlRes.success) setDatalists(dlRes.data || []);
      if (cRes.success) setConstants(cRes.data || []);
    } catch {
      setToast({ message: 'Lỗi tải dữ liệu editor', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [templateId, token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const tableFields = useMemo(() => fields.filter((f) => f.type === 'table'), [fields]);
  const scalarFields = useMemo(() => fields.filter((f) => f.type !== 'table' && f.type !== 'file' && f.type !== 'password'), [fields]);

  const getTableColumns = (fieldKey) => {
    const f = fields.find((x) => x.key === fieldKey);
    const sc = parseSourceConfig(f && f.source_config);
    return (sc.columns || []).map((c) => ({ key: c.key, label: c.label || c.key, footer_formula: c.footer_formula || null }));
  };

  const datalistColumns = (listId) => {
    const dl = datalists.find((d) => d.id === listId);
    return ((dl && dl.columns) || []).map((c) => ({ key: c.key, label: c.label || c.key }));
  };

  const makePart = (partId) => (partId.startsWith('dl:')
    ? { kind: 'datalist', listId: Number(partId.slice(3)), columns: {} }
    : { kind: 'table', table: partId.slice(2), columns: {} });

  const addPartColumn = (loop, partId, tokenName, column) => {
    const parts = (loop.parts || []).map((p) => ({ ...p, columns: { ...(p.columns || {}) } }));
    let pi = parts.findIndex((p) => partIdOf(p) === partId);
    if (pi < 0) { parts.push(makePart(partId)); pi = parts.length - 1; }
    parts[pi].columns[tokenName] = column;
    return { ...loop, parts };
  };

  const onDragStart = (item) => (e) => {
    setDragItem(item);
    try {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify(item));
    } catch {}
  };

  const loopColumnTokens = (loopKey) => {
    const out = [];
    let inside = false;
    for (const t of tokens) {
      if (t.token === `{#${loopKey}}`) { inside = true; continue; }
      if (t.token === `{/${loopKey}}`) { inside = false; continue; }
      if (inside && t.kind === 'scalar') out.push(stripToken(t.token));
    }
    return out.filter((n) => n !== 'stt' && !isFooterToken(n));
  };

  const findLoopForToken = (tokenName) => {
    for (const k of Object.keys(mapping.loops || {})) {
      if (loopColumnTokens(k).includes(tokenName)) return k;
    }
    return null;
  };

  const scalarBinding = (item) => {
    if (item.kind === 'field') return { source: 'field', key: item.key };
    if (item.kind === 'const') return { source: 'const', key: item.key };
    if (item.kind === 'datalistCol' || item.kind === 'datalistScalar') {
      return { source: 'datalist', listId: item.listId, column: item.column, match: { column: '', value: '' } };
    }
    return null;
  };

  const dropOnToken = (tokenName, item) => {
    if (!item) return;
    const lk = findLoopForToken(tokenName);
    setMapping((prev) => {
      const next = { tokens: { ...(prev.tokens || {}) }, loops: { ...(prev.loops || {}) } };
      if (item.kind === 'numbering') {
        if (!lk) return prev;
        next.loops[lk] = { ...normalizeLoopForEdit(next.loops[lk]), stt: true };
        return next;
      }
      if (item.kind === 'tableCol' || item.kind === 'computedCol' || item.kind === 'datalistCol') {
        if (!lk) return prev;
        const loop = normalizeLoopForEdit(next.loops[lk]);
        const partId = item.partTable ? `t:${item.partTable}`
          : (item.source === 'datalist' ? `dl:${item.listId}` : `t:${item.table}`);
        next.loops[lk] = addPartColumn(loop, partId, tokenName, item.column);
        return next;
      }
      const binding = scalarBinding(item);
      if (!binding) return prev;
      if (lk) {
        const loop = normalizeLoopForEdit(next.loops[lk]);
        next.loops[lk] = { ...loop, scalars: { ...loop.scalars, [tokenName]: binding } };
      } else {
        next.tokens[tokenName] = binding;
      }
      return next;
    });
    setToast({ message: `Đã gán ${tokenName}`, type: 'success' });
  };

  const dropOnLoop = (loopKey, item) => {
    if (!item) return;
    const colTokens = loopColumnTokens(loopKey);
    setMapping((prev) => {
      const next = { tokens: { ...(prev.tokens || {}) }, loops: { ...(prev.loops || {}) } };
      if (item.kind === 'table' || item.kind === 'datalistLoop') {
        const loop = normalizeLoopForEdit(next.loops[loopKey]);
        const parts = (loop.parts || []).map((p) => ({ ...p, columns: { ...(p.columns || {}) } }));
        const isDl = item.kind === 'datalistLoop';
        const partId = isDl ? `dl:${item.listId}` : `t:${item.key}`;
        let pi = parts.findIndex((p) => partIdOf(p) === partId);
        if (pi < 0) {
          const avail = (isDl ? datalistColumns(item.listId) : getTableColumns(item.key)).map((c) => c.key);
          const cols = {};
          colTokens.forEach((c) => { cols[c] = avail.includes(c) ? c : ''; });
          parts.push(isDl ? { kind: 'datalist', listId: item.listId, columns: cols } : { kind: 'table', table: item.key, columns: cols });
        }
        next.loops[loopKey] = { ...loop, parts };
      }
      return next;
    });
    setToast({ message: `Đã gán loop ${loopKey}`, type: 'success' });
  };

  const bindingLabel = (tokenName) => {
    const b = (mapping.tokens || {})[tokenName];
    if (!b) return null;
    if (b.source === 'field') {
      const f = fields.find((x) => x.key === b.key);
      return `Trường: ${f ? (f.label || f.key) : b.key}`;
    }
    if (b.source === 'const') {
      const c = constants.find((x) => x.key === b.key);
      return `Hằng: ${c ? (c.label || c.key) : b.key}`;
    }
    if (b.source === 'datalist') {
      const dl = datalists.find((d) => d.id === b.listId);
      return `Danh mục: ${dl ? dl.name : b.listId} → ${b.column || '?'}`;
    }
    return JSON.stringify(b);
  };

  const partLabel = (p) => {
    if (p.kind === 'datalist') {
      const dl = datalists.find((d) => d.id === p.listId);
      return `Danh mục ${dl ? dl.name : `#${p.listId}`}`;
    }
    const f = fields.find((x) => x.key === p.table);
    return `Bảng ${f ? (f.label || f.key) : p.table}`;
  };

  const loopBindingLabel = (loopKey) => {
    const cfg = normalizeLoopForEdit((mapping.loops || {})[loopKey] || {});
    const parts = cfg.parts || [];
    if (!parts.length) return null;
    return parts.map(partLabel).join(' + ');
  };

  const loopGroups = (loopKey) => {
    const cfg = normalizeLoopForEdit((mapping.loops || {})[loopKey] || {});
    return (cfg.parts || []).map((p) => ({
      id: partIdOf(p),
      label: partLabel(p),
      columns: p.columns || {},
      options: p.kind === 'datalist' ? datalistColumns(p.listId) : getTableColumns(p.table),
    }));
  };

  const loopScalars = (loopKey) => normalizeLoopForEdit((mapping.loops || {})[loopKey] || {}).scalars || {};

  const freeLoopTokens = (loopKey) => {
    const cfg = normalizeLoopForEdit((mapping.loops || {})[loopKey] || {});
    const used = new Set();
    (cfg.parts || []).forEach((p) => Object.keys(p.columns || {}).forEach((t) => used.add(t)));
    Object.keys(cfg.scalars || {}).forEach((t) => used.add(t));
    return loopColumnTokens(loopKey).filter((t) => !used.has(t));
  };

  const mutateLoop = (loopKey, fn) => {
    setMapping((prev) => {
      const next = { tokens: { ...(prev.tokens || {}) }, loops: { ...(prev.loops || {}) } };
      const loop = normalizeLoopForEdit(next.loops[loopKey] || {});
      next.loops[loopKey] = fn(loop);
      return next;
    });
  };

  const setLoopColumn = (loopKey, partIdx, token, col) => {
    mutateLoop(loopKey, (loop) => {
      const parts = (loop.parts || []).map((p) => ({ ...p, columns: { ...(p.columns || {}) } }));
      if (!parts[partIdx]) return loop;
      parts[partIdx].columns[token] = col;
      return { ...loop, parts };
    });
  };

  const removeLoopColumn = (loopKey, partIdx, token) => {
    mutateLoop(loopKey, (loop) => {
      const parts = (loop.parts || []).map((p) => ({ ...p, columns: { ...(p.columns || {}) } }));
      if (parts[partIdx]) delete parts[partIdx].columns[token];
      return { ...loop, parts };
    });
  };

  const removeLoopGroup = (loopKey, partIdx) => {
    mutateLoop(loopKey, (loop) => ({ ...loop, parts: (loop.parts || []).filter((_, i) => i !== partIdx) }));
  };

  const removeLoopScalar = (loopKey, token) => {
    mutateLoop(loopKey, (loop) => {
      const scalars = { ...(loop.scalars || {}) };
      delete scalars[token];
      return { ...loop, scalars };
    });
  };

  const addFooter = (loopKey) => {
    setMapping((prev) => {
      const next = { tokens: { ...(prev.tokens || {}) }, loops: { ...(prev.loops || {}) } };
      const cur = next.loops[loopKey] || { columns: {} };
      const footers = [...(cur.footers || []), { id: `f${(cur.footers || []).length + 1}`, label: '', formula: '' }];
      next.loops[loopKey] = { ...cur, footers };
      return next;
    });
  };

  const updateFooter = (loopKey, idx, patch) => {
    setMapping((prev) => {
      const next = { tokens: { ...(prev.tokens || {}) }, loops: { ...(prev.loops || {}) } };
      const cur = next.loops[loopKey] || { columns: {} };
      const footers = [...(cur.footers || [])];
      footers[idx] = { ...footers[idx], ...patch };
      next.loops[loopKey] = { ...cur, footers };
      return next;
    });
  };

  const removeFooter = (loopKey, idx) => {
    setMapping((prev) => {
      const next = { tokens: { ...(prev.tokens || {}) }, loops: { ...(prev.loops || {}) } };
      const cur = next.loops[loopKey] || { columns: {} };
      next.loops[loopKey] = { ...cur, footers: (cur.footers || []).filter((_, i) => i !== idx) };
      return next;
    });
  };

  const updateScalarDatalist = (tokenName, patch) => {
    setMapping((prev) => {
      const next = { tokens: { ...(prev.tokens || {}) }, loops: { ...(prev.loops || {}) } };
      next.tokens[tokenName] = { ...(next.tokens[tokenName] || {}), ...patch };
      return next;
    });
  };

  const handleValidate = async () => {
    try {
      const res = await documentService.validateMapping(templateId, mapping, token);
      if (res.success) {
        setErrors(res.data.errors || []);
        setToast({ message: res.data.valid ? 'Mapping hợp lệ' : `Có ${res.data.errors.length} lỗi`, type: res.data.valid ? 'success' : 'error' });
      } else {
        setToast({ message: res.message || 'Validate thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  const handlePreview = async () => {
    try {
      const res = await documentService.previewBlank(templateId, token);
      if (res.success) {
        setPreviewHtml(res.data.html || '');
        setPreviewTab('html');
      } else {
        setToast({ message: res.message || 'Preview thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  const openWordPreview = async () => {
    setPreviewTab('word');
    if (tplBytes || !tpl || !tpl.file_id) return;
    try {
      setTplBytesLoading(true);
      const buf = await documentService.fetchTemplateBytes(tpl.file_id, token);
      setTplBytes(buf);
    } catch (e) {
      setToast({ message: e.message || 'Không tải được file template', type: 'error' });
    } finally {
      setTplBytesLoading(false);
    }
  };

  const fetchRealPreview = async () => {
    const pid = Number(realProposalId);
    if (!Number.isInteger(pid) || pid <= 0) {
      setToast({ message: 'Nhập ID đề xuất hợp lệ', type: 'error' });
      return;
    }
    try {
      setRealLoading(true);
      const buf = await documentService.fetchReportBytes(pid, templateId, token);
      setRealBytes(buf);
      setPreviewTab('data');
    } catch (e) {
      setToast({ message: e.message || 'Xuất báo cáo thất bại', type: 'error' });
    } finally {
      setRealLoading(false);
    }
  };

  const previewDropToken = (name, item) => dropOnToken(name, item);
  const previewDropLoop = (key, item) => dropOnLoop(key, item);
  const previewUnbind = (name) => {
    setMapping((prev) => {
      const nt = { ...(prev.tokens || {}) };
      delete nt[name];
      const loops = { ...(prev.loops || {}) };
      for (const k of Object.keys(loops)) {
        const cfg = normalizeLoopForEdit(loops[k]);
        let changed = false;
        if (name === 'stt' && cfg.stt) { cfg.stt = false; changed = true; }
        const parts = (cfg.parts || []).map((p) => {
          if (p.columns && Object.prototype.hasOwnProperty.call(p.columns, name)) {
            const cols = { ...p.columns };
            delete cols[name];
            changed = true;
            return { ...p, columns: cols };
          }
          return p;
        });
        if (cfg.scalars && Object.prototype.hasOwnProperty.call(cfg.scalars, name)) {
          const sc = { ...cfg.scalars };
          delete sc[name];
          cfg.scalars = sc;
          changed = true;
        }
        if (changed) loops[k] = { ...cfg, parts };
      }
      return { tokens: nt, loops };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await documentService.updateTemplate(templateId, { mapping }, token);
      if (res.success) {
        setToast({ message: 'Đã lưu mapping', type: 'success' });
        if (onSaved) onSaved();
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => {
    const out = [];
    let currentLoop = null;
    tokens.forEach((t, i) => {
      if (t.kind === 'loop_open') {
        currentLoop = stripToken(t.token);
        out.push({ type: 'loop', key: currentLoop, item: t, idx: i });
      } else if (t.kind === 'loop_close') {
        out.push({ type: 'loopclose', key: stripToken(t.token), item: t, idx: i });
        currentLoop = null;
      } else {
        const name = stripToken(t.token);
        const ft = parseFooterToken(name);
        if (ft && (mapping.loops || {})[ft.loop]) {
          out.push({ type: 'footer', key: name, item: t, idx: i, loop: ft.loop, fid: ft.id });
        } else {
          out.push({ type: 'token', key: name, item: t, idx: i, loop: currentLoop });
        }
      }
    });
    return out;
  }, [tokens, mapping.loops]);

  const bindLabel = (b) => {
    if (!b) return null;
    if (b.source === 'field') {
      const f = fields.find((x) => x.key === b.key);
      return { label: f ? (f.label || f.key) : b.key, key: b.key };
    }
    if (b.source === 'const') {
      const c = constants.find((x) => x.key === b.key);
      return { label: c ? (c.label || c.key) : b.key, key: b.key };
    }
    if (b.source === 'datalist') {
      const dl = datalists.find((d) => d.id === b.listId);
      return { label: `${dl ? dl.name : b.listId} → ${b.column || '?'}`, key: b.column || '' };
    }
    return { label: JSON.stringify(b), key: '' };
  };

  const bindingInfo = (tokenName) => bindLabel((mapping.tokens || {})[tokenName]);

  const loopBindingInfo = (loopKey) => {
    const cfg = normalizeLoopForEdit((mapping.loops || {})[loopKey] || {});
    const parts = cfg.parts || [];
    if (!parts.length) return null;
    return { label: parts.map((p) => partLabel(p)).join(' + '), key: '' };
  };

  const previewBindings = useMemo(() => {
    const out = {};
    rows.forEach((r) => {
      if (r.type === 'token') {
        const info = bindingInfo(r.key);
        if (info) out[r.key] = info;
      } else if (r.type === 'loop') {
        const info = loopBindingInfo(r.key);
        if (info) out[r.key] = info;
      }
    });
    for (const [loopKey, cfgRaw] of Object.entries(mapping.loops || {})) {
      if (!cfgRaw) continue;
      const cfg = normalizeLoopForEdit(cfgRaw);
      const lbi = loopBindingInfo(loopKey);
      if (lbi) out[loopKey] = lbi;
      const byTok = {};
      (cfg.parts || []).forEach((part) => {
        const defs = {};
        (part.kind === 'datalist' ? datalistColumns(part.listId) : getTableColumns(part.table)).forEach((c) => { defs[c.key] = c; });
        Object.entries(part.columns || {}).forEach(([tok, src]) => {
          if (!src) return;
          const lbl = defs[src] ? (defs[src].label || src) : src;
          byTok[tok] = byTok[tok] ? `${byTok[tok]} · ${lbl}` : lbl;
        });
      });
      Object.entries(byTok).forEach(([tok, lbl]) => { out[tok] = { label: lbl, key: tok }; });
      Object.entries(cfg.scalars || {}).forEach(([tok, src]) => {
        const info = bindLabel(src);
        out[tok] = info || { label: 'giá trị lặp mọi hàng', key: tok };
      });
      if (cfg.stt) out.stt = { label: 'numbering (STT tự động)', key: 'numbering' };
      (cfg.footers || []).forEach((fde) => {
        if (!fde || !fde.id) return;
        out[`${loopKey}_f_${fde.id}_value`] = { label: fde.label || 'Tổng', key: '' };
      });
    }
    return out;
  }, [rows, mapping, fields, constants, datalists]);

  const previewLoopKeys = useMemo(
    () => rows.filter((r) => r.type === 'loop').map((r) => r.key),
    [rows]
  );

  if (loading) return <Loading />;

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button className="btn btn-ghost btn-sm btn-circle shrink-0" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
          <h3 className="font-bold text-lg truncate">Gán trường — {tpl && tpl.name}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => { setCenterView('word'); openWordPreview(); }}>
            <Eye size={14} /> Xem trước
          </button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={handleValidate}>
            <CheckCircle2 size={14} /> Kiểm tra
          </button>
          <button className="btn btn-primary btn-sm gap-1" onClick={handleSave} disabled={saving}>
            <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu mapping'}
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="alert alert-error mb-3">
          <AlertTriangle size={16} />
          <div className="text-sm">
            {errors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="bg-base-100 rounded-lg border border-base-300 p-3 h-fit lg:sticky lg:top-4">
          <div className="tabs tabs-boxed tabs-xs mb-2 grid grid-cols-4 gap-1 p-1 doc-tabs">
            {PALETTE_TABS.map((t) => (
              <button key={t.id} type="button" title={t.label} className={`tab min-w-0 px-1 text-[11px] whitespace-nowrap truncate ${tab === t.id ? 'tab-active' : ''}`} onClick={() => setTab(t.id)}>
                {t.short}
              </button>
            ))}
          </div>
          <input className="input input-bordered input-xs w-full mb-2" placeholder="Tìm kiếm..."
            value={paletteSearch} onChange={(e) => setPaletteSearch(e.target.value)} />
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {tab === 'fields' && scalarFields.filter((f) => matchSearch(paletteSearch, f.label, f.key)).map((f) => (
              <div key={f.id} draggable onDragStart={onDragStart({ kind: 'field', key: f.key, label: f.label })}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-base-300 bg-base-200/50 cursor-grab text-xs hover:border-primary">
                <GripVertical size={13} className="opacity-50 shrink-0" />
                <span className="truncate" title={`${f.label} (${f.key})`}>{f.label} <span className="opacity-50">({f.key})</span></span>
              </div>
            ))}
            {tab === 'tables' && (
              <>
                {tableFields.filter((f) => matchSearch(paletteSearch, f.label, f.key) || getTableColumns(f.key).some((c) => matchSearch(paletteSearch, c.label, c.key))).map((f) => (
                  <div key={f.id} className="rounded border border-base-300 overflow-hidden">
                    <div draggable onDragStart={onDragStart({ kind: 'table', key: f.key, label: f.label })}
                      onClick={() => setExpandedTable(expandedTable === f.key ? null : f.key)} title="Ấn để xem key và danh sách cột"
                      className="flex items-center gap-2 px-2 py-1.5 bg-base-200/70 cursor-pointer text-xs font-medium hover:border-primary">
                      <GripVertical size={13} className="opacity-50 shrink-0" />
                      <span className="truncate">{f.label}</span>
                      <span className="ml-auto text-base min-w-8 text-center opacity-70 shrink-0">{expandedTable === f.key ? '▾' : '▸'}</span>
                    </div>
                    {expandedTable === f.key && (
                      <div className="p-1 space-y-1 bg-base-100">
                        <div draggable onDragStart={onDragStart({ kind: 'numbering', label: 'numbering' })}
                          className="flex items-center gap-2 px-2 py-1 text-[11px] rounded bg-info/10 cursor-grab hover:border hover:border-primary" title="Kéo vào ô STT — tự đánh số theo số dòng">
                          <GripVertical size={12} className="opacity-50 shrink-0" />
                          <span>numbering <span className="opacity-60">(STT tự động)</span></span>
                        </div>
                        {getTableColumns(f.key).map((c) => (
                          <div key={c.key} draggable onDragStart={onDragStart({ kind: 'tableCol', table: f.key, source: 'field', column: c.key, label: c.label })}
                            className="flex items-center gap-2 px-2 py-1 text-[11px] rounded bg-base-200/50 cursor-grab hover:border hover:border-primary" title={`Kéo cột ${c.key} vào ô trong bảng`}>
                            <GripVertical size={12} className="opacity-50 shrink-0" />
                            <span className="truncate">{c.label} <span className="opacity-50">({c.key})</span></span>
                            {c.footer_formula && <span className="ml-auto text-[10px] px-1 rounded bg-warning/30 font-mono shrink-0">{c.footer_formula}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            {tab === 'datalists' && datalists.filter((d) => matchSearch(paletteSearch, d.name) || (d.columns || []).some((c) => matchSearch(paletteSearch, c.label, c.key))).map((d) => (
              <div key={d.id} className="rounded border border-base-300 overflow-hidden">
                <div draggable onDragStart={onDragStart({ kind: 'datalistLoop', listId: d.id, label: d.name })}
                  onClick={() => setExpandedDl(expandedDl === d.id ? null : d.id)} title="Ấn để xem key và danh sách cột. Kéo để gán cả bảng (loop)"
                  className="flex items-center gap-2 px-2 py-1.5 bg-base-200/70 cursor-pointer text-xs font-medium hover:border-primary">
                  <GripVertical size={13} className="opacity-50 shrink-0" />
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto text-base min-w-8 text-center opacity-70 shrink-0">{expandedDl === d.id ? '▾' : '▸'}</span>
                </div>
                {expandedDl === d.id && (
                  <div className="p-1 space-y-1 bg-base-100">
                    {(d.columns || []).map((c) => (
                      <div key={c.key} draggable onDragStart={onDragStart({ kind: 'datalistCol', listId: d.id, column: c.key, label: `${d.name}.${c.label || c.key}` })}
                        className="px-2 py-1 text-[11px] rounded bg-base-200/50 cursor-grab hover:border hover:border-primary" title="Kéo vào ô bảng (nối hàng) hoặc ô ngoài (giá trị theo khóa)">
                        {c.label || c.key} <span className="opacity-50">({c.key})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {tab === 'consts' && constants.filter((c) => matchSearch(paletteSearch, c.label, c.key, c.value)).map((c) => (
              <div key={c.key} draggable onDragStart={onDragStart({ kind: 'const', key: c.key, label: c.label })}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-base-300 bg-base-200/50 cursor-grab text-xs hover:border-primary">
                <GripVertical size={13} className="opacity-50 shrink-0" />
                <span className="truncate" title={c.key}>{c.label} <span className="opacity-50">({String(c.value || '').slice(0, 20)})</span></span>
              </div>
            ))}
          </div>
          <div className="text-[11px] opacity-60 mt-2">Kéo cột/numbering vào ô bên phải. Thả nhiều nguồn vào cùng 1 bảng để nối hàng (trụ → chi phí khác → …).</div>
        </div>

        <div className="bg-base-100 rounded-lg border border-base-300 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="tabs tabs-boxed tabs-xs doc-tabs">
              <button type="button" title="Danh sách token" className={`tab whitespace-nowrap ${centerView === 'fields' ? 'tab-active' : ''}`} onClick={() => setCenterView('fields')}>Trường</button>
              <button type="button" title="Bố cục Word trực quan" className={`tab whitespace-nowrap ${centerView === 'word' ? 'tab-active' : ''}`} onClick={() => { setCenterView('word'); openWordPreview(); }}>Bố cục word</button>
            </div>
            {centerView === 'word' && (
              <div className="tabs tabs-boxed tabs-xs doc-tabs">
                {[{ id: 'key', label: 'Key' }, { id: 'label', label: 'Nhãn' }].map((m) => (
                  <button key={m.id} type="button" title={m.id === 'key' ? 'Hiện key trường' : 'Hiện nhãn trường'} className={`tab whitespace-nowrap ${chipMode === m.id ? 'tab-active' : ''}`} onClick={() => setChipMode(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {centerView === 'word' ? (
          <div>
            <div className="tabs tabs-boxed tabs-xs mb-2 w-fit doc-tabs">
              <button type="button" className={`tab whitespace-nowrap ${previewTab === 'word' ? 'tab-active' : ''}`} onClick={() => openWordPreview()}>Trống</button>
              <button type="button" className={`tab whitespace-nowrap ${previewTab === 'data' ? 'tab-active' : ''}`} onClick={() => setPreviewTab('data')}>Dữ liệu thật</button>
              <button type="button" className={`tab whitespace-nowrap ${previewTab === 'html' ? 'tab-active' : ''}`} onClick={() => { setPreviewTab('html'); if (!previewHtml) handlePreview(); }}>HTML</button>
            </div>
            {previewTab === 'word' && (
              tplBytesLoading ? <Loading /> : (
                tplBytes
                  ? <DocxPreviewPane docxBytes={tplBytes} bindings={previewBindings} loopKeys={previewLoopKeys} dragPayload={dragItem} onDropToken={previewDropToken} onDropLoop={previewDropLoop} onUnbind={previewUnbind} chipMode={chipMode} />
                  : <div className="alert text-sm">Template chưa gắn file .docx — hãy upload file ở trang danh sách trước.</div>
              )
            )}
            {previewTab === 'data' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <input className="input input-bordered input-sm w-40" placeholder="ID đề xuất (vd 596)"
                    value={realProposalId} onChange={(e) => setRealProposalId(e.target.value)} inputMode="numeric" />
                  <button type="button" className="btn btn-primary btn-sm" onClick={fetchRealPreview} disabled={realLoading}>
                    {realLoading ? 'Đang render...' : 'Xem với dữ liệu'}
                  </button>
                  <span className="text-[11px] opacity-60">Render theo mapping đã lưu trong DB</span>
                </div>
                {realBytes && (
                  <DocxPreviewPane docxBytes={realBytes} bindings={previewBindings} loopKeys={previewLoopKeys} dragPayload={dragItem} onDropToken={previewDropToken} onDropLoop={previewDropLoop} onUnbind={previewUnbind} chipMode={chipMode} />
                )}
              </div>
            )}
            {previewTab === 'html' && (
              <div className="border rounded p-3 max-h-[65vh] overflow-auto text-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            )}
          </div>
          ) : (
          <>
          <div className="text-sm font-semibold mb-2">Token trong tài liệu ({tokens.length}) — thả field vào từng dòng</div>
          <div className="max-h-[65vh] overflow-y-auto space-y-1">
            {rows.map((r) => {
              if (r.type === 'loop') {
                const label = loopBindingLabel(r.key);
                return (
                  <div key={r.idx}
                    onDragOver={(e) => { e.preventDefault(); setDropTarget(`loop:${r.key}`); }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => { e.preventDefault(); setDropTarget(null); dropOnLoop(r.key, dragItem); }}
                    className={`rounded border p-2 ${dropTarget === `loop:${r.key}` ? 'border-primary bg-primary/5' : 'border-info/40 bg-info/5'}`}>
                    <div className="flex items-center gap-2 text-xs font-bold text-info">
                      <span className="font-mono">{r.item.token}</span>
                      <span className="opacity-70 font-normal truncate">{label || '— chưa gán bảng —'}</span>
                    </div>
                    <div className="text-[11px] opacity-70 truncate mt-0.5">{r.item.context}</div>
                    {label && (
                        <LoopColumns loopKey={r.key} groups={loopGroups(r.key)} scalars={loopScalars(r.key)} freeTokens={freeLoopTokens(r.key)} footers={(mapping.loops[r.key] || {}).footers || []} onSetColumn={setLoopColumn} onRemoveColumn={removeLoopColumn} onRemoveGroup={removeLoopGroup} onRemoveScalar={removeLoopScalar} onAddFooter={() => addFooter(r.key)} onUpdateFooter={(i, p) => updateFooter(r.key, i, p)} onRemoveFooter={(i) => removeFooter(r.key, i)} />
                    )}
                  </div>
                );
              }
              if (r.type === 'loopclose') return null;
              if (r.type === 'footer') {
                return (
                  <div key={r.idx} className="flex items-center gap-2 px-2 py-1 rounded bg-warning/10 text-[11px]">
                    <span className="font-mono font-bold">{r.item.token}</span>
                    <span className="opacity-70 truncate">= footer của loop {r.loop} (sửa ở mục footer phía trên)</span>
                  </div>
                );
              }
              const inLoop = r.loop ? (previewBindings[r.key] ? previewBindings[r.key].label : null) : null;
              const bound = inLoop || bindingLabel(r.key);
              const b = (mapping.tokens || {})[r.key];
              return (
                <div key={r.idx}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget(`tok:${r.key}`); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => { e.preventDefault(); setDropTarget(null); dropOnToken(r.key, dragItem); }}
                  className={`rounded border px-2 py-1.5 ${dropTarget === `tok:${r.key}` ? 'border-primary bg-primary/5' : 'border-base-300'}`}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold shrink-0">{r.item.token}</span>
                    <span className={`${bound ? 'text-success' : 'opacity-50'} truncate`}>{bound || '— chưa gán —'}</span>
                    {bound && (
                      <button type="button" className="ml-auto text-[11px] opacity-60 hover:opacity-100 hover:text-error shrink-0"
                        title="Gỡ gán"
                        onClick={() => previewUnbind(r.key)}>
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] opacity-60 truncate">{r.item.context}</div>
                  {b && b.source === 'datalist' && (
                    <div className="flex items-center gap-2 mt-1">
                      <input className="input input-bordered input-xs flex-1 min-w-0" placeholder="Cột khóa (vd loai_hinh)"
                        value={(b.match || {}).column || ''} onChange={(e) => updateScalarDatalist(r.key, { match: { ...(b.match || {}), column: e.target.value } })} />
                      <input className="input input-bordered input-xs flex-1 min-w-0" placeholder="Giá trị khóa"
                        value={(b.match || {}).value || ''} onChange={(e) => updateScalarDatalist(r.key, { match: { ...(b.match || {}), value: e.target.value } })} />
                    </div>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && <div className="opacity-60 text-sm py-4 text-center">Không phát hiện token nào trong file</div>}
          </div>
          </>
          )}
        </div>
      </div>

    </div>
  );
};

const LoopColumns = ({ groups, scalars, freeTokens, footers, onSetColumn, onRemoveColumn, onRemoveGroup, onRemoveScalar, onAddFooter, onUpdateFooter, onRemoveFooter }) => {
  return (
    <div className="mt-2 space-y-2">
      {(groups || []).map((g, gi) => (
        <div key={g.id} className="rounded border border-base-200 overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-base-200/60 text-[11px] font-semibold">
            <span className="truncate">Nhóm {gi + 1} — {g.label}</span>
            <button type="button" className="ml-auto text-error shrink-0" onClick={() => onRemoveGroup(gi)} title="Xóa nhóm nguồn">
              <Trash2 size={12} />
            </button>
          </div>
          <div className="p-1 space-y-1">
            {Object.entries(g.columns || {}).map(([tok, col]) => (
              <div key={tok} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono w-28 shrink-0 truncate">{`{${tok}}`}</span>
                <span className="opacity-50">←</span>
                <select className="select select-bordered select-xs flex-1 min-w-0" value={col || ''}
                  onChange={(e) => onSetColumn(gi, tok, e.target.value)}>
                  <option value="">— Chọn cột —</option>
                  {(g.options || []).map((o) => (<option key={o.key} value={o.key}>{o.label} ({o.key})</option>))}
                </select>
                <button type="button" className="text-error shrink-0" onClick={() => onRemoveColumn(gi, tok)} title="Bỏ ô">
                  <X size={12} />
                </button>
              </div>
            ))}
            {(freeTokens || []).length > 0 && (
              <select className="select select-bordered select-xs w-full" value=""
                onChange={(e) => { if (e.target.value) onSetColumn(gi, e.target.value, ''); }}>
                <option value="">+ Thêm ô vào nhóm này...</option>
                {freeTokens.map((t) => (<option key={t} value={t}>{`{${t}}`}</option>))}
              </select>
            )}
          </div>
        </div>
      ))}
      {Object.keys(scalars || {}).length > 0 && (
        <div className="rounded border border-info/40 overflow-hidden">
          <div className="px-2 py-0.5 bg-info/10 text-[11px] font-semibold">Giá trị lặp mọi hàng</div>
          <div className="p-1 space-y-1">
            {Object.entries(scalars).map(([tok, src]) => (
              <div key={tok} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono w-28 shrink-0 truncate">{`{${tok}}`}</span>
                <span className="opacity-70 truncate flex-1">
                  {src.source === 'const' ? `hằng: ${src.key}` : src.source === 'datalist' ? `danh mục #${src.listId}.${src.column}` : `trường: ${src.key}`}
                </span>
                <button type="button" className="text-error shrink-0" onClick={() => onRemoveScalar(tok)} title="Bỏ">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="pt-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold opacity-70">Footer (Tên + công thức)</span>
          <button type="button" className="btn btn-xs btn-ghost gap-1" onClick={onAddFooter}>
            <Plus size={12} /> Thêm
          </button>
        </div>
        {(footers || []).map((f, i) => (
          <div key={i} className="flex items-center gap-1 mt-1">
            <input className="input input-bordered input-xs w-28 shrink-0" placeholder="Tên (vd Tổng cộng)"
              value={f.label || ''} onChange={(e) => onUpdateFooter(i, { label: e.target.value })} />
            <input className="input input-bordered input-xs flex-1 min-w-0 font-mono" placeholder="SUM(cot)"
              value={f.formula || ''} onChange={(e) => onUpdateFooter(i, { formula: e.target.value })} />
            <input className="input input-bordered input-xs w-16 shrink-0 font-mono" placeholder="id"
              value={f.id || ''} onChange={(e) => onUpdateFooter(i, { id: e.target.value.replace(/[^a-z0-9_]/gi, '') })} title="ID dùng trong token {loop_f_id_value}" />
            <button type="button" className="btn btn-xs btn-ghost text-error shrink-0" onClick={() => onRemoveFooter(i)} title="Xóa">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentTemplateEditor;
