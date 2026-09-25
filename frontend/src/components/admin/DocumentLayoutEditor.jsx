import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { documentService } from '../../services/api';
import { X, Plus, Trash2, AlignLeft, AlignCenter, AlignRight, AlignJustify, IndentIncrease, History, Undo2 } from 'lucide-react';
import Toast from '../Toast';
import Loading from '../Loading';

const flattenParas = (tree) => {
  const out = [];
  const walk = (nodes) => nodes.forEach((n) => {
    if (n.type === 'p') out.push(n);
    else if (n.type === 'tbl') n.rows.forEach((r) => r.cells.forEach((c) => walk(c.blocks)));
  });
  walk(tree || []);
  return out;
};

const DocumentLayoutEditor = ({ templateId, templateName, onClose, onSaved }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [slotName, setSlotName] = useState('');
  const [tokenToRemove, setTokenToRemove] = useState('');
  const [indentCm, setIndentCm] = useState('');
  const [tabCm, setTabCm] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [previewError, setPreviewError] = useState('');
  const boxRef = useRef(null);

  const paras = useMemo(() => flattenParas(tree), [tree]);
  const selected = useMemo(() => paras.find((p) => p.id === selectedId) || null, [paras, selectedId]);
  const prevPara = useMemo(() => {
    const i = paras.findIndex((p) => p.id === selectedId);
    return i > 0 ? paras[i - 1] : null;
  }, [paras, selectedId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, v] = await Promise.all([
        documentService.getLayout(templateId, token),
        documentService.listLayoutVersions(templateId, token),
      ]);
      if (l.success) setTree(l.data.tree || []);
      if (v.success) setVersions(v.data || []);
      setSelectedId(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setToast({ message: e.message || 'Lỗi tải bố cục', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [templateId, token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const box = boxRef.current;
      if (!box) return;
      setPreviewError('');
      try {
        const bytes = await documentService.fetchLayoutPreview(templateId, token);
        if (cancelled) return;
        box.innerHTML = '';
        const { renderAsync } = await import('docx-preview');
        await renderAsync(bytes, box, null, { className: 'dxp', breakPages: true });
        if (cancelled) return;
        const spans = [...box.querySelectorAll('span, a')].filter((s) => /display\s*:\s*none/.test(s.getAttribute('style') || '') && /@\{\d+\}@/.test(s.textContent || ''));
        spans.forEach((s) => {
          const m = (s.textContent || '').match(/@\{(\d+)\}@/);
          const host = s.closest('p') || s.closest('td');
          if (m && host) {
            host.setAttribute('data-oom-id', m[1]);
            host.classList.add('dxp-oom-block');
          }
        });
      } catch {
        if (!cancelled) setPreviewError('Không render được bố cục');
      }
    })();
    return () => { cancelled = true; };
  }, [templateId, token, reloadKey]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.querySelectorAll('.dxp-oom-selected').forEach((e) => e.classList.remove('dxp-oom-selected'));
    if (selectedId) {
      const el = box.querySelector(`[data-oom-id="${selectedId}"]`);
      if (el) el.classList.add('dxp-oom-selected');
    }
  }, [selectedId, reloadKey]);

  const onClickBox = (e) => {
    const host = e.target.closest ? e.target.closest('[data-oom-id]') : null;
    if (host) setSelectedId(Number(host.getAttribute('data-oom-id')));
  };

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && res.success === false) throw new Error(res.message || 'Thao tác thất bại');
      setToast({ message: okMsg, type: 'success' });
      if (onSaved) onSaved();
      await load();
    } catch (err) {
      setToast({ message: err.message || 'Thao tác thất bại', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const doInsert = () => {
    if (!selectedId) { setToast({ message: 'Chọn một vị trí trong tài liệu trước', type: 'error' }); return; }
    if (!slotName.trim()) { setToast({ message: 'Nhập tên trường/vị trí', type: 'error' }); return; }
    run(() => documentService.insertLayoutToken(templateId, selectedId, slotName.trim(), token), `Đã chèn {${slotName.trim()}}`);
    setSlotName('');
  };

  const doRemove = () => {
    if (!selectedId || !tokenToRemove) { setToast({ message: 'Chọn đoạn và token cần xóa', type: 'error' }); return; }
    run(() => documentService.removeLayoutToken(templateId, selectedId, tokenToRemove, token), `Đã xóa {${tokenToRemove}}`);
    setTokenToRemove('');
  };

  const doAlign = (opts, msg) => {
    if (!selectedId) { setToast({ message: 'Chọn một đoạn trước', type: 'error' }); return; }
    run(() => documentService.alignLayout(templateId, selectedId, opts, token), msg);
  };

  const alignAbove = () => {
    if (!selectedId || !prevPara) { setToast({ message: 'Không có đoạn phía trên', type: 'error' }); return; }
    doAlign({ copyFromId: prevPara.id }, 'Đã căn theo đoạn trên');
  };

  const restore = (v) => {
    run(() => documentService.restoreLayoutVersion(templateId, v.id, token), 'Đã khôi phục phiên bản');
  };

  return (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-2">
      <div className="bg-base-100 rounded-lg shadow-xl w-full max-w-[1400px] h-[94vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-300">
          <div className="flex items-center gap-3 min-w-0">
            <button className="btn btn-ghost btn-sm btn-circle shrink-0" onClick={onClose} title="Đóng">
              <X size={18} />
            </button>
            <h3 className="font-bold text-lg truncate">Bố cục Word — {templateName}</h3>
          </div>
          <div className="text-xs opacity-60 hidden md:block">Click vào dòng trong tài liệu để chọn vị trí</div>
        </div>

        <div className="flex-1 min-h-0 grid md:grid-cols-[320px_1fr]">
          <div className="border-r border-base-300 p-3 overflow-y-auto space-y-4">
            <div className="text-xs rounded bg-base-200/60 p-2">
              {selected ? (
                <div className="space-y-1">
                  <div className="font-semibold text-success">Đã chọn đoạn #{selected.id}</div>
                  <div className="opacity-80 break-words">{selected.text ? selected.text.slice(0, 160) : '(đoạn trống)'}</div>
                  <div className="opacity-60">Canh: {selected.jc || 'left'} · Thụt: {selected.indentLeft || 0} twip</div>
                </div>
              ) : (
                <span className="opacity-70">Chưa chọn vị trí — click vào dòng trong tài liệu bên phải.</span>
              )}
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-sm">Thêm vị trí</div>
              <div className="flex gap-2">
                <input className="input input-bordered input-sm flex-1 min-w-0" placeholder="Tên trường (vd ghi_chu_vt)"
                  value={slotName} onChange={(e) => setSlotName(e.target.value)} />
                <button className="btn btn-primary btn-sm gap-1 shrink-0" onClick={doInsert} disabled={busy}>
                  <Plus size={14} /> Chèn
                </button>
              </div>
              <div className="text-[11px] opacity-60">Chèn token rỗng, sau đó sang tab "Gán trường" kéo field vào.</div>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-sm">Xóa trường</div>
              <div className="flex gap-2">
                <select className="select select-bordered select-sm flex-1 min-w-0" value={tokenToRemove}
                  onChange={(e) => setTokenToRemove(e.target.value)} disabled={!selected}>
                  <option value="">— chọn token trong đoạn —</option>
                  {(selected ? selected.tokens : []).map((t) => (
                    <option key={t} value={t.replace(/[{}#/]/g, '')}>{t}</option>
                  ))}
                </select>
                <button className="btn btn-error btn-sm gap-1 shrink-0" onClick={doRemove} disabled={busy || !tokenToRemove}>
                  <Trash2 size={14} /> Xóa
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-sm">Căn chỉnh</div>
              <div className="flex gap-1">
                <button className="btn btn-ghost btn-sm flex-1" title="Trái" onClick={() => doAlign({ jc: 'left' }, 'Căn trái')} disabled={busy || !selected}><AlignLeft size={15} /></button>
                <button className="btn btn-ghost btn-sm flex-1" title="Giữa" onClick={() => doAlign({ jc: 'center' }, 'Căn giữa')} disabled={busy || !selected}><AlignCenter size={15} /></button>
                <button className="btn btn-ghost btn-sm flex-1" title="Phải" onClick={() => doAlign({ jc: 'right' }, 'Căn phải')} disabled={busy || !selected}><AlignRight size={15} /></button>
                <button className="btn btn-ghost btn-sm flex-1" title="Đều" onClick={() => doAlign({ jc: 'both' }, 'Căn đều')} disabled={busy || !selected}><AlignJustify size={15} /></button>
              </div>
              <button className="btn btn-outline btn-sm w-full gap-1" onClick={alignAbove} disabled={busy || !selected || !prevPara}>
                <IndentIncrease size={14} /> Thẳng hàng theo dòng trên
              </button>
              <div className="flex gap-2 items-center">
                <input className="input input-bordered input-sm w-20" placeholder="Thụt (cm)" value={indentCm} onChange={(e) => setIndentCm(e.target.value)} />
                <button className="btn btn-ghost btn-sm" disabled={busy || !selected || indentCm === ''}
                  onClick={() => doAlign({ indentLeftCm: Number(indentCm) }, 'Đã đặt thụt lề')}>Áp dụng</button>
              </div>
              <div className="flex gap-2 items-center">
                <input className="input input-bordered input-sm w-20" placeholder="Tab (cm)" value={tabCm} onChange={(e) => setTabCm(e.target.value)} />
                <button className="btn btn-ghost btn-sm" disabled={busy || !selected || tabCm === ''}
                  onClick={() => doAlign({ tabPosCm: Number(tabCm) }, 'Đã thêm tab')}>Thêm tab</button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-sm flex items-center gap-1"><History size={14} /> Lịch sử ({versions.length})</div>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 text-[11px] border border-base-200 rounded px-2 py-1">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{v.label || 'Bản lưu'}</div>
                      <div className="opacity-60">{new Date(v.created_at).toLocaleString('vi-VN')}</div>
                    </div>
                    <button className="btn btn-ghost btn-xs gap-1 shrink-0" onClick={() => restore(v)} disabled={busy} title="Khôi phục">
                      <Undo2 size={12} /> Khôi phục
                    </button>
                  </div>
                ))}
                {versions.length === 0 && <div className="opacity-60 text-[11px]">Chưa có phiên bản</div>}
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-hidden relative">
            {loading && <div className="absolute inset-0 flex items-center justify-center"><Loading /></div>}
            {previewError && <div className="alert alert-error m-3 text-sm">{previewError}</div>}
            <div className="h-full overflow-y-auto p-3" onClick={onClickBox}>
              <div ref={boxRef} className="dxp-doc dxp-doc-clickable" />
            </div>
          </div>
        </div>
      </div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
};

export default DocumentLayoutEditor;
