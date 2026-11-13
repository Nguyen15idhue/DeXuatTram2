import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog, Input } from '../ui';
import { requestKeyForIntent } from '../../utils/chargingFulfillment';

export const INSTALLATION_LABELS = { NOT: 'Chưa lắp trụ', DOING: 'Đang lắp trụ', DONE: 'Đã lắp xong' };
const RANKS = ['NOT', 'DOING', 'DONE'];

const ChargingStationInstallationModal = ({ station, onClose, onChanged }) => {
  const { user, token } = useAuth();
  const [rows, setRows] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [overridden, setOverridden] = useState(false);
  const saving = useRef(false);
  const request = useRef(null);
  useEffect(() => {
    let active = true;
    Promise.all([chargingStationService.getDeployments(station.id, token), chargingStationService.getDetail(station.id, token)])
      .then(([deployments, detail]) => {
        if (!active) return;
        if (!deployments.success || !detail.success) throw new Error(deployments.message || detail.message || 'Không tải được trạng thái lắp trụ');
        setPermissions(detail.data.permissions || {});
        setOverridden(Boolean(detail.data.workflow_override?.completed));
        setRows((deployments.data || []).map(row => ({ ...row, status: row.installation_status,
          initialStatus: row.installation_status, note: row.installation_note || '' })));
      }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [station.id, token]);
  const canEdit = user?.role === 'SUPER_ADMIN' || (user?.role !== 'ADMIN' && permissions.setup && !overridden);
  const patch = (id, values) => setRows(current => current.map(row => row.id === id ? { ...row, ...values } : row));
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const items = rows.filter(row => row.status !== row.initialStatus || row.note !== (row.installation_note || ''))
        .map(row => ({ id: Number(row.id), status: row.status, note: row.note, expected_version: row.installation_version }));
      if (!items.length) { onClose(); return; }
      request.current = requestKeyForIntent(request.current, items);
      const response = await chargingStationService.updateInstallation(station.id, { items, request_id: request.current.request_id }, token);
      if (!response.success) throw new Error(response.message || 'Không lưu được trạng thái lắp trụ');
      await onChanged?.();
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); saving.current = false; }
  };
  return <Dialog isOpen onClose={() => !busy && onClose()} title={`Lắp trụ · ${station.ma_tram || station.id}`} size="lg" portal>
    <div className="space-y-4">
      {loading && <span className="loading loading-spinner" />}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {overridden && <div className="alert alert-info">Trạm đã hoàn tất bằng ghi đè; số liệu kho vẫn giữ nguyên.</div>}
      {!loading && !rows.length && <p>Chưa có phần trụ đã nhận để lắp đặt.</p>}
      {rows.map(row => <section key={row.id} className="rounded-lg border border-base-300 p-3 space-y-2">
        <h3 className="font-semibold">Phiếu #{row.export_id} · Phần #{row.id} · {row.pole_name} · {row.supplier_name || '—'} · {row.quantity} trụ</h3>
        {row.stage !== 'INSTALLING' && row.status !== 'DONE' && <p className="text-xs text-warning">Lắp đặt đã điều chỉnh; kết quả nghiệm thu/cấu hình/ON vẫn giữ nguyên.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Trạng thái lắp trụ<select aria-label={`Trạng thái phần ${row.id}`} className="select select-bordered w-full mt-1"
            disabled={!canEdit || busy} value={row.status} onChange={event => patch(row.id, { status: event.target.value })}>
            {RANKS.map(status => <option key={status} value={status}
              disabled={user?.role !== 'SUPER_ADMIN' && (RANKS.indexOf(status) < RANKS.indexOf(row.initialStatus)
                || RANKS.indexOf(status) > RANKS.indexOf(row.initialStatus) + 1)}>{INSTALLATION_LABELS[status]}</option>)}
          </select></label>
          <Input label="Ghi chú" disabled={!canEdit || busy} maxLength={5000} value={row.note}
            onChange={event => patch(row.id, { note: event.target.value })} />
        </div>
      </section>)}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button>
        {canEdit && <Button loading={busy} disabled={loading || busy || !rows.length} onClick={save}>Lưu</Button>}
      </div>
    </div>
  </Dialog>;
};

export default ChargingStationInstallationModal;
