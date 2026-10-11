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
  const [controlValues, setControlValues] = useState({});
  const [catalog, setCatalog] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const past = useRef([]);
  const future = useRef([]);

  const markDirty = useCallback(() => setSaveState('dirty'), []);

  const pushHistory = useCallback((snapshot) => {
    past.current.push(snapshot);
    if (past.current.length > 80) past.current.shift();
    future.current = [];
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await builderService.getDatasets(token);
      if (res.success) setCatalog(res.data || {});
    } catch { /* ignore */ }
  }, [token]);

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
        if (res2.success) {
          const rep = normalizeReport(res2.data);
          setActiveId(rep.id);
          setName(rep.name);
          setWidgets(rep.widgets);
          setPage(rep.page);
        }
      }
    } catch (e) {
      setError(e.message || 'Lỗi tải báo cáo');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) { loadReports(); loadCatalog(); } }, [token, loadReports, loadCatalog]);

  const snapshot = useCallback(() => clone({ name, widgets, page, controlValues }), [name, widgets, page, controlValues]);

  const commit = useCallback(() => {
    pushHistory(snapshot());
    markDirty();
  }, [pushHistory, snapshot, markDirty]);

  const restore = (snap) => {
    setName(snap.name);
    setWidgets(snap.widgets);
    setPage(snap.page);
    setControlValues(snap.controlValues || {});
  };

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    future.current.push(snapshot());
    restore(past.current.pop());
    setSelectedId(null);
    markDirty();
  }, [snapshot, markDirty]);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    past.current.push(snapshot());
    restore(future.current.pop());
    setSelectedId(null);
    markDirty();
  }, [snapshot, markDirty]);

  const openReport = useCallback(async (id) => {
    try {
      const res = await builderService.getDashboard(id, token);
      if (!res.success) throw new Error(res.message || 'Lỗi mở báo cáo');
      const rep = normalizeReport(res.data);
      setActiveId(rep.id);
      setName(rep.name);
      setWidgets(rep.widgets);
      setPage(rep.page);
      setSelectedId(null);
      setSaveState('saved');
      past.current = [];
      future.current = [];
    } catch (e) {
      setError(e.message || 'Lỗi mở báo cáo');
    }
  }, [token]);

  const addWidget = useCallback((type) => {
    const w = defaultWidget(type);
    setWidgets((prev) => {
      w.layout = { ...w.layout, y: nextLayoutY(prev) };
      pushHistory(clone({ name, widgets: prev, page, controlValues }));
      return [...prev, w];
    });
    setSelectedId(w.id);
    markDirty();
  }, [name, page, controlValues, pushHistory, markDirty]);

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
    setWidgets((prev) => {
      pushHistory(clone({ name, widgets: prev, page, controlValues }));
      return prev.filter((w) => w.id !== id);
    });
    setSelectedId(null);
    markDirty();
  }, [name, page, controlValues, pushHistory, markDirty]);

  const duplicateWidget = useCallback((id) => {
    setWidgets((prev) => {
      const src = prev.find((w) => w.id === id);
      if (!src) return prev;
      pushHistory(clone({ name, widgets: prev, page, controlValues }));
      const copy = clone(src);
      copy.id = defaultWidget('chart').id;
      copy.layout = { ...copy.layout, y: nextLayoutY(prev) };
      return [...prev, copy];
    });
    markDirty();
  }, [name, page, controlValues, pushHistory, markDirty]);

  const setLayout = useCallback((grid) => {
    setWidgets((prev) => applyGridLayout(prev, grid));
  }, []);

  const setControlValue = useCallback((id, val) => {
    setControlValues((prev) => ({ ...prev, [id]: val }));
  }, []);

  const renameActive = useCallback((v) => { setName(v); markDirty(); }, [markDirty]);

  const commitLayout = useCallback(() => { pushHistory(snapshot()); }, [pushHistory, snapshot]);

  const restoreLayout = useCallback(() => {
    setWidgets((prev) => {
      pushHistory(clone({ name, widgets: prev, page, controlValues }));
      return packLayout(prev);
    });
    markDirty();
  }, [name, page, controlValues, pushHistory, markDirty]);

  return {
    reports, activeId, name, widgets, page, selectedId, viewMode, saveState, controlValues, catalog, loading, error,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
    setActiveId, setViewMode, setSelectedId, setPage, setSaveState,
    setName: renameActive, openReport, addWidget, updateWidget, updateWidgetData, updateVisual,
    deleteWidget, duplicateWidget, setLayout, setControlValue, undo, redo, commit, commitLayout,
    restoreLayout, reload: loadReports,
  };
}
