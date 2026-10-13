import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiConfigService } from '../../services/api';
import Toast from '../Toast';
import { RefreshCw, X, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const CRON_PRESETS = [
  { label: 'Mỗi 30 phút', value: '*/30 * * * *' },
  { label: 'Mỗi giờ', value: '0 * * * *' },
  { label: 'Mỗi ngày 08:00', value: '0 8 * * *' },
  { label: 'Mỗi ngày 00:00', value: '0 0 * * *' }
];

const PersonnelSyncPanel = ({ config, onClose, onUpdated }) => {
  const { token } = useAuth();
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState(config);
  const [syncEnabled, setSyncEnabled] = useState(!!config.sync_enabled);
  const [syncCron, setSyncCron] = useState(config.sync_cron || '');

  useEffect(() => {
    setInfo(config);
    setSyncEnabled(!!config.sync_enabled);
    setSyncCron(config.sync_cron || '');
  }, [config]);

  const reload = async () => {
    try {
      const res = await apiConfigService.getById(config.id, token);
      if (res.success) {
        setInfo(res.data);
        setSyncEnabled(!!res.data.sync_enabled);
        setSyncCron(res.data.sync_cron || '');
      }
    } catch { /* silent */ }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await apiConfigService.syncPersonnel(config.id, token);
      if (res.success) {
        const d = res.data || {};
        setToast({ message: `Đồng bộ xong: thêm ${d.inserted}, cập nhật ${d.updated}, khóa ${d.deactivated}`, type: 'success' });
        await reload();
      } else {
        setToast({ message: res.message || 'Đồng bộ thất bại', type: 'error' });
      }
    } catch (e) {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (syncEnabled && !syncCron.trim()) {
      setToast({ message: 'Nhập cron expression khi bật đồng bộ tự động', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await apiConfigService.update(config.id, {
        sync_enabled: syncEnabled,
        sync_cron: syncCron.trim() || null
      }, token);
      if (res.success) {
        setToast({ message: 'Đã lưu lịch đồng bộ', type: 'success' });
        await reload();
        if (onUpdated) onUpdated();
      } else {
        setToast({ message: res.message || 'Lưu thất bại', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const lastStatus = info?.last_sync_status;

  return (
    <div className="border border-base-300 rounded-lg p-4 bg-base-200/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RefreshCw size={18} className="text-primary" />
          <h3 className="font-bold">Đồng bộ nhân sự</h3>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="bg-base-100 border border-base-300 rounded p-3 mb-4 text-sm space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-base-content/60">Lần đồng bộ cuối:</span>
          <span className="font-medium">{info?.last_sync_at ? new Date(info.last_sync_at).toLocaleString('vi-VN') : 'Chưa đồng bộ'}</span>
        </div>
        {lastStatus && (
          <div className="flex items-center gap-2">
            <span className="text-base-content/60">Trạng thái:</span>
            {lastStatus === 'success' ? (
              <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 size={14} /> Thành công</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-error"><XCircle size={14} /> Thất bại</span>
            )}
          </div>
        )}
        {info?.last_sync_message && <div className="text-xs text-base-content/60">{info.last_sync_message}</div>}
      </div>

      <div className="mb-4">
        <button className="btn btn-primary btn-sm gap-1" onClick={handleSyncNow} disabled={syncing}>
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Đồng bộ ngay
        </button>
      </div>

      <div className="border-t border-base-300 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={14} className="text-primary" />
          <span className="font-medium text-sm">Đồng bộ tự động (cron)</span>
        </div>
        <label className="label cursor-pointer justify-start gap-3 py-1">
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={syncEnabled}
            onChange={(e) => setSyncEnabled(e.target.checked)}
          />
          <span className="label-text text-sm">Bật</span>
        </label>

        <div className="flex flex-wrap gap-1 my-2">
          {CRON_PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => setSyncCron(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <input
            type="text"
            className="input input-bordered input-sm flex-1 font-mono"
            placeholder="VD: 0 8 * * *  (phút giờ ngày tháng thứ)"
            value={syncCron}
            onChange={(e) => setSyncCron(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={handleSaveSchedule} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Lưu'}
          </button>
        </div>
        <div className="text-xs text-base-content/50 mt-1">
          Cron 5 trường: phút(0-59) giờ(0-23) ngày(1-31) tháng(1-12) thứ(0-6, CN=0). Múi giờ Asia/Ho_Chi_Minh.
        </div>
      </div>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
};

export default PersonnelSyncPanel;
