import { useEffect, useState } from 'react';
import { Settings, Database, PanelRightOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { builderService } from '../../services/api';
import useReportEditor from '../../hooks/useReportEditor';
import useReportPreviews from '../../hooks/useReportPreviews';
import PageHeader from '../../components/ui/PageHeader';
import ReportToolbar from '../../components/report/ReportToolbar';
import ReportTabs from '../../components/report/ReportTabs';
import ReportCanvas from '../../components/report/ReportCanvas';
import ReportDataSourcePanel from '../../components/report/ReportDataSourcePanel';
import ReportConfigPanel from '../../components/report/ReportConfigPanel';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function ReportEditorPage() {
  const { token, user } = useAuth();
  const isSuperAdmin = (user && user.role) === 'SUPER_ADMIN';
  const ed = useReportEditor(token);
  const previews = useReportPreviews(ed.widgets, ed.controlValues, token);
  const [panelTab, setPanelTab] = useState('config');
  const [showGrid, setShowGrid] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [confirmDeleteReport, setConfirmDeleteReport] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    if (user && !isSuperAdmin && ed.viewMode !== 'view') ed.setViewMode('view');
  }, [user, isSuperAdmin, ed]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const on = () => setPanelCollapsed(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (ed.saveState === 'dirty' || ed.saveState === 'error') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [ed.saveState]);

  const edit = ed.viewMode === 'edit' && isSuperAdmin;
  const selected = ed.widgets.find((w) => w.id === ed.selectedId) || null;

  const onPickField = (ds, key, type) => {
    if (!selected) { setToast({ message: 'Chọn một widget trên canvas trước', type: 'error' }); return; }
    if (selected.type === 'control') {
      ed.updateWidget(selected.id, { dataSourceId: ds, field: key });
    } else {
      ed.updateWidget(selected.id, { dataSourceId: ds });
      ed.updateWidgetData(selected.id, type === 'metric' ? { metric: key } : { dimension: key });
    }
    setToast({ message: `Đã gán ${type === 'metric' ? 'chỉ số' : 'chiều'}: ${key}`, type: 'success' });
  };

  const onSave = async () => {
    const r = await ed.save();
    if (r.stale) return;
    setToast(r.ok ? { message: 'Đã lưu báo cáo', type: 'success' } : { message: r.error || 'Lưu thất bại', type: 'error' });
  };

  const onAddReport = async () => {
    try {
      await ed.createReport('Báo cáo mới');
      setPanelTab('config');
      setToast({ message: 'Đã tạo báo cáo mới', type: 'success' });
    } catch (e) {
      setToast({ message: e.message || 'Tạo báo cáo thất bại', type: 'error' });
    }
  };

  const onRemoveReport = async (id) => {
    try {
      const res = await builderService.deleteDashboard(id, token);
      if (res.success) { setToast({ message: 'Đã xóa báo cáo', type: 'success' }); ed.reload(); }
      else setToast({ message: res.message || 'Xóa thất bại', type: 'error' });
    } catch {
      setToast({ message: 'Lỗi xóa báo cáo', type: 'error' });
    }
  };

  const openReport = (id) => {
    if (id !== ed.activeId) ed.openReport(id);
    setPanelTab('config');
  };

  if (ed.loading) return <Loading message="Đang tải báo cáo…" />;
  if (ed.error) return <ErrorMessage message={ed.error} onRetry={ed.reload} />;

  const actions = !isSuperAdmin ? null : (edit ? (
    <ReportToolbar
      saveState={ed.saveState}
      canUndo={ed.canUndo}
      canRedo={ed.canRedo}
      showGrid={showGrid}
      canDeleteReport={ed.reports.length > 1}
      onUndo={ed.undo}
      onRedo={ed.redo}
      onAdd={ed.addWidget}
      onAutoArrange={ed.autoArrange}
      onDeleteReport={() => setConfirmDeleteReport(true)}
      onSave={onSave}
      onToggleGrid={() => setShowGrid((v) => !v)}
      onTogglePanel={() => setPanelCollapsed((v) => !v)}
      onToggleView={() => ed.setViewMode('view')}
    />
  ) : (
    <button type="button" className="btn btn-sm btn-outline gap-1" onClick={() => ed.setViewMode('edit')}>
      <Settings size={15} /> Cài đặt
    </button>
  ));

  return (
    <div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <PageHeader title={ed.name} subtitle="Báo cáo" actions={actions} />

      <ReportTabs
        reports={ed.reports}
        activeId={ed.activeId}
        canEdit={edit}
        onOpen={openReport}
        onAdd={onAddReport}
      />

      <div className="re-body">
        <ReportCanvas
          widgets={ed.widgets}
          selectedId={ed.selectedId}
          viewMode={ed.viewMode}
          showGrid={showGrid}
          onSelect={ed.setSelectedId}
          onLayoutChange={ed.setLayout}
          onLayoutCommit={ed.commitLayout}
          onDelete={(id) => ed.deleteWidget(id)}
          controls={ed.controlValues}
          onControlChange={ed.setControlValue}
          previews={previews}
          token={token}
        />

        {edit && panelCollapsed && (
          <button type="button" className="re-panel-open" title="Mở bảng cấu hình" onClick={() => setPanelCollapsed(false)}>
            <PanelRightOpen size={16} />
          </button>
        )}

        {edit && !panelCollapsed && (
          <div className="re-panel">
            <div className="re-ptabs">
              <button type="button" className={`re-ptab ${panelTab === 'data' ? 'active' : ''}`} onClick={() => setPanelTab('data')}>
                <Database size={18} /> Nguồn dữ liệu
              </button>
              <button type="button" className={`re-ptab ${panelTab === 'config' ? 'active' : ''}`} onClick={() => setPanelTab('config')}>
                <Settings size={18} /> Cấu hình
              </button>
            </div>
            <div className="re-pcontent">
              <div className="re-phead">{panelTab === 'data' ? 'Nguồn dữ liệu' : (selected ? `Cấu hình — ${selected.title || selected.type}` : 'Cấu hình trang')}</div>
              <div className="re-pbody">
                {panelTab === 'data'
                  ? <ReportDataSourcePanel catalog={ed.catalog} onPickField={onPickField} />
                  : (
                    <ReportConfigPanel
                      widget={selected}
                      name={ed.name}
                      page={ed.page}
                      catalog={ed.catalog}
                      onRename={ed.setName}
                      onUpdateData={(patch) => selected && ed.updateWidgetData(selected.id, patch)}
                      onUpdateVisual={(patch) => selected && ed.updateVisual(selected.id, patch)}
                      onUpdateWidget={(patch) => selected && patch && ed.updateWidget(selected.id, patch)}
                      onDelete={() => selected && ed.deleteWidget(selected.id)}
                      onDuplicate={() => selected && ed.duplicateWidget(selected.id)}
                      onRestoreLayout={ed.restoreLayout}
                    />
                  )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteReport}
        title="Xóa báo cáo"
        message={`Bạn có chắc chắn muốn xóa báo cáo "${ed.name}"? Thao tác này không thể hoàn tác.`}
        onConfirm={async () => { setConfirmDeleteReport(false); await onRemoveReport(ed.activeId); }}
        onCancel={() => setConfirmDeleteReport(false)}
      />
    </div>
  );
}
