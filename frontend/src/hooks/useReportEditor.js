import { useCallback, useEffect, useRef, useState } from 'react';
import { builderService } from '../services/api';
import { normalizeReport, defaultWidget, applyGridLayout, nextLayoutY, packLayout } from '../utils/reportModel';

const clone = (v) => JSON.parse(JSON.stringify(v));

export default function useReportEditor(token) {
  const [reports, setReports] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [name, setName] = useState('Báo cáo');
  const [widgets, setWidgets] = useState([]);
  const [page, setPage] = useState({ title: 'Báo cáo', columns: 12, rowHeight: 80 });
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('edit');
  const [saveState, setSaveState] = useState('saved');
  const [saveError, setSaveError] = useState('');
  const [controlValues, setControlValues] = useState({});
  const [catalog, setCatalog] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const saveReq = useRef(0);

  const markDirty = useCallback(() => setSaveState((s) => (s === 'saving' ? s : 'dirty')), []);
  const snapshot = useCallback(() => clone({ name, widgets, page, controlValues }), [name, widgets, page, controlValues]);
  const pushHistory = useCallback((snap) => {
    setPast((p) => [...p.slice(-79), snap]);
    setFuture([]);
  }, []);

  const restore = (snap) => {
    setName(snap.name);
    setWidgets(snap.widgets);
    setPage(snap.page);
    setControlValues(snap.controlValues || {});
    setSelectedId(null);
  };

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const snap = p[p.length - 1];
      setFuture((f) => [snapshot(), ...f]);
      restore(snap);
      markDirty();
      return p.slice(0, -1);
    });
  }, [snapshot, markDirty]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const snap = f[0];
      setPast((p) => [...p, snapshot()]);
      restore(snap);
      markDirty();
      return f.slice(1);
    });
  }, [snapshot, markDirty]);

  const commitLayout = useCallback(() => { pushHistory(snapshot()); markDirty(); }, [pushHistory, snapshot, markDirty]);
  const commit = useCallback(() => { pushHistory(snapshot()); }, [pushHistory, snapshot]);

  const refreshList = useCallback(async () => {
    try {
      const res = await builderService.listDashboards(token);
      if (res.success) setReports(res.data || []);
    } catch { /* ignore */ }
  }, [token]);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await builderService.getDatasets(token);
      if (res.success) setCatalog(res.data || {});
    } catch { /* ignore */ }
  }, [token]);

  const applyReport = useCallback((rep) => {
    setActiveId(rep.id);
    setName(rep.name);
    setWidgets(rep.widgets);
    setPage(rep.page);
    setSelectedId(null);
    setSaveState('saved');
    setSaveError('');
    setPast([]);
    setFuture([]);
  }, []);

  const openReport = useCallback(async (id) => {
    try {
      const res = await builderService.getDashboard(id, token);
      if (!res.success) throw new Error(res.message || 'Lỗi mở báo cáo');
      applyReport(normalizeReport(res.data));
    } catch (e) {
      setError(e.message || 'Lỗi mở báo cáo');
    }
  }, [token, applyReport]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await builderService.listDashboards(token);
      if (!res.success) throw new Error(res.message || 'Lỗi tải danh sách báo cáo');
      const list = res.data || [];
      setReports(list);
      if (list.length > 0) {
        const res2 = await builderService.getDashboard(list[0].id, token);
        if (res2.success) applyReport(normalizeReport(res2.data));
      } else {
        setLoading(false);
      }
    } catch (e) {
      setError(e.message || 'Lỗi tải báo cáo');
    } finally {
      setLoading(false);
    }
  }, [token, applyReport]);

  useEffect(() => { if (token) { loadReports(); loadCatalog(); } }, [token, loadReports, loadCatalog]);

  const addWidget = useCallback((type) => {
    const w = defaultWidget(type);
    const next = [...widgets, { ...w, layout: { ...w.layout, y: nextLayoutY(widgets) } }];
    pushHistory(snapshot());
    setWidgets(next);
    setSelectedId(w.id);
    markDirty();
  }, [widgets, snapshot, pushHistory, markDirty]);

  const updateWidget = useCallback((id, patch) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    markDirty();
  }, [markDirty]);

  const updateWidgetData = useCallback((id, patch) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, dataConfig: { ...w.dataConfig, ...patch } } : w)));
    markDirty();
  }, [markDirty]);

  const updateVisual = useCallback((id, patch) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, visualConfig: { ...w.visualConfig, ...patch } } : w)));
    markDirty();
  }, [markDirty]);

  const deleteWidget = useCallback((id) => {
    pushHistory(snapshot());
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setSelectedId(null);
    markDirty();
  }, [snapshot, pushHistory, markDirty]);

  const duplicateWidget = useCallback((id) => {
    const src = widgets.find((w) => w.id === id);
    if (!src) return;
    pushHistory(snapshot());
    const copy = clone(src);
    copy.id = defaultWidget('chart').id;
    copy.layout = { ...copy.layout, y: nextLayoutY(widgets) };
    setWidgets((prev) => [...prev, copy]);
    markDirty();
  }, [widgets, snapshot, pushHistory, markDirty]);

  const setLayout = useCallback((grid) => {
    setWidgets((prev) => applyGridLayout(prev, grid));
  }, []);

  const restoreLayout = useCallback(() => {
    pushHistory(snapshot());
    setWidgets((prev) => packLayout(prev));
    markDirty();
  }, [snapshot, pushHistory, markDirty]);

  const setControlValue = useCallback((id, val) => {
    setControlValues((prev) => ({ ...prev, [id]: val }));
  }, []);

  const renameActive = useCallback((v) => { setName(v); markDirty(); }, [markDirty]);

  const save = useCallback(async () => {
    const rid = ++saveReq.current;
    setSaveState('saving');
    setSaveError('');
    const payload = { name, version: 2, page, widgets };
    try {
      const res = activeId
        ? await builderService.updateDashboard(activeId, payload, token)
        : await builderService.createDashboard(payload, token);
      if (rid !== saveReq.current) return { stale: true };
      if (!res.success) throw new Error(res.message || 'Lưu thất bại');
      if (!activeId) setActiveId(res.data.id);
      setSaveState('saved');
      await refreshList();
      return { ok: true };
    } catch (e) {
      if (rid !== saveReq.current) return { stale: true };
      setSaveState('error');
      setSaveError(e.message || 'Lỗi lưu');
      return { ok: false, error: e.message || 'Lỗi lưu' };
    }
  }, [activeId, name, page, widgets, token, refreshList]);

  const createReport = useCallback(async (reportName) => {
    const w = defaultWidget('chart');
    const payload = { name: reportName || 'Báo cáo mới', version: 2, page: { title: reportName || 'Báo cáo mới', rowHeight: 80 }, widgets: [{ ...w, title: 'Lead theo stage' }] };
    const res = await builderService.createDashboard(payload, token);
    if (!res.success) throw new Error(res.message || 'Tạo báo cáo thất bại');
    await refreshList();
    await openReport(res.data.id);
    return res.data.id;
  }, [token, refreshList, openReport]);

  return {
    reports, activeId, name, widgets, page, selectedId, viewMode, saveState, saveError, controlValues, catalog, loading, error,
    canUndo: past.length > 0, canRedo: future.length > 0,
    setActiveId, setViewMode, setSelectedId, setPage, setSaveState,
    setName: renameActive, openReport, addWidget, updateWidget, updateWidgetData, updateVisual,
    deleteWidget, duplicateWidget, setLayout, setControlValue, undo, redo, commit, commitLayout,
    restoreLayout, reload: loadReports, refreshList, save, createReport,
  };
}
