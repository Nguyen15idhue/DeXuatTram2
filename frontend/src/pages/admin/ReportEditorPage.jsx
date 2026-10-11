import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { builderService } from '../../services/api';
import useReportEditor from '../../hooks/useReportEditor';
import ReportToolbar from '../../components/report/ReportToolbar';
import ReportTabs from '../../components/report/ReportTabs';
import ReportCanvas from '../../components/report/ReportCanvas';
import ReportDataSourcePanel from '../../components/report/ReportDataSourcePanel';
import ReportConfigPanel from '../../components/report/ReportConfigPanel';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import Toast from '../../components/Toast';

export default function ReportEditorPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = (user && user.role) === 'SUPER_ADMIN';
  const ed = useReportEditor(token);
  const [panelTab, setPanelTab] = useState('config');
  const [showGrid, setShowGrid] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    if (user && !isSuperAdmin && ed.viewMode !== 'view') ed.setViewMode('view');
  }, [user, isSuperAdmin, ed]);

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

  const onSave = () => setToast({ message: 'Lưu báo cáo hoàn thiện ở bước E4', type: 'success' });
  const onAddReport = () => setToast({ message: 'Thêm báo cáo hoàn thiện ở bước E4', type: 'success' });

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

  return (
    <div className="re-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <ReportToolbar
        name={ed.name}
        viewMode={ed.viewMode}
        saveState={ed.saveState}
        canUndo={ed.canUndo}
        canRedo={ed.canRedo}
        canEdit={isSuperAdmin}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((v) => !v)}
        onToggleView={() => ed.setViewMode(ed.viewMode === 'edit' ? 'view' : 'edit')}
        onUndo={ed.undo}
        onRedo={ed.redo}
        onAdd={ed.addWidget}
        onSave={onSave}
        onRename={ed.setName}
        onBack={() => navigate('/admin')}
      />

      {edit && (
        <ReportTabs
          reports={ed.reports}
          activeId={ed.activeId}
          onOpen={openReport}
          onAdd={onAddReport}
          onRemove={onRemoveReport}
        />
      )}

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
        />

        {edit && (
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
    </div>
  );
}
